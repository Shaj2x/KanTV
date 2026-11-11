// The HTTP API. Every route but the health check, the public lease key and the billing webhook needs the
// identity provider's token. The API holds no model keys yet: the AI proxy arrives in Phase 2.
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { Db } from "./db.ts";
import { issueLease, type LeaseKeys } from "./leases.ts";
import { accountFor, entitlementOf, registerTv } from "./trials.ts";
import { checkTheme, compileTheme, type ThemeSpec } from "@kantv/core";
import { DesignError, designTheme, type ThemeModel } from "./designer.ts";
import { renderWallpaperJpeg } from "./wallpaper.ts";

export interface Config {
  db: Db;
  /** Secret for keying TV identifiers; rotating it forgets every TV's trial history. */
  pepper: string;
  leaseKeys: LeaseKeys;
  auth: { jwks: JWTVerifyGetKey; issuer: string; audience: string };
  /** The Authorization value RevenueCat is configured to send to the webhook. */
  revenueCatWebhookAuth: string;
  /** Folder with feed.json and feed.json.sig from scripts/lists/build.ts; served to the apps, which verify it. */
  feedDir?: string;
  /** The AI designer; without it the design routes answer 503. */
  designer?: { model: ThemeModel; limits: DesignLimits; random?: () => number };
  now?: () => Date;
  /**
   * Deletes the sign-in identity itself when an account is deleted (Supabase: the admin API with the project's
   * secret key). Without it only KanTV's own data is deleted.
   */
  deleteIdentity?: (sub: string) => Promise<void>;
  /** Origins of the KanTV web app allowed to call the API from a browser (the phone apps need none). */
  webOrigins?: string[];
}

export interface DesignLimits {
  perDayTrial: number;
  perDaySubscriber: number;
  /** Between two requests from one account. */
  minIntervalMs: number;
  /** All accounts together, per UTC day. */
  dailyBudgetMicroUsd: number;
}

export const DEFAULT_DESIGN_LIMITS: DesignLimits = { perDayTrial: 25, perDaySubscriber: 80, minIntervalMs: 3000, dailyBudgetMicroUsd: 50_000_000 };

/**
 * Sign-in is Supabase Auth. With SUPABASE_URL set, tokens are checked against the project's published signing
 * keys (asymmetric JWT signing keys, served at /auth/v1/.well-known/jwks.json), its issuer and the "authenticated"
 * audience. SUPABASE_JWT_SECRET additionally accepts tokens signed with a project's legacy HS256 secret, for
 * projects not yet moved to signing keys. AUTH_JWKS_URL, AUTH_ISSUER and AUTH_AUDIENCE stay available for any
 * other OpenID provider.
 */
export function authFromEnv(env: NodeJS.ProcessEnv): Config["auth"] {
  const supabase = env.SUPABASE_URL?.replace(/\/+$/, "");
  const jwksUrl = env.AUTH_JWKS_URL ?? (supabase && `${supabase}/auth/v1/.well-known/jwks.json`);
  const issuer = env.AUTH_ISSUER ?? (supabase && `${supabase}/auth/v1`);
  const audience = env.AUTH_AUDIENCE ?? (supabase ? "authenticated" : undefined);
  if (!jwksUrl || !issuer || !audience) throw new Error("set SUPABASE_URL, or AUTH_JWKS_URL, AUTH_ISSUER and AUTH_AUDIENCE");
  const remote = createRemoteJWKSet(new URL(jwksUrl));
  const secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : undefined;
  return { jwks: withLegacySecret(remote, secret), issuer, audience };
}

/** Deletes a Supabase Auth user with the project's secret (service role) key. A user already gone counts as done. */
export function supabaseIdentityDeleter(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch) {
  const base = supabaseUrl.replace(/\/+$/, "");
  return async (sub: string) => {
    const res = await fetchImpl(`${base}/auth/v1/admin/users/${encodeURIComponent(sub)}`, {
      method: "DELETE",
      headers: { apikey: secretKey, authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`auth admin delete: ${res.status}`);
  };
}

/** HS256 tokens go to the shared secret when there is one; everything else to the published keys. */
export function withLegacySecret(jwks: JWTVerifyGetKey, secret: Uint8Array | undefined): JWTVerifyGetKey {
  if (!secret) return jwks;
  return (header, token) => (header.alg === "HS256" ? secret : jwks(header, token));
}

type Vars = { Variables: { sub: string } };

const sha = z.string().regex(/^[0-9a-f]{64}$/i);
const RegisterTv = z.object({ serial: sha.optional(), androidId: sha.optional(), model: z.string().max(200) });
const LeaseRequest = z.object({ household: z.string().uuid(), instance: z.string().min(8).max(64) });
const pkg = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/);
const DesignBody = z.object({
  request: z.string().trim().min(1).max(500),
  installedApps: z.array(z.object({ package: pkg, label: z.string().max(80) })).max(400),
  exact: z.boolean().optional(),
});
const RegenerateBody = z.object({ installedApps: DesignBody.shape.installedApps });
// The fields of a RevenueCat webhook event this backend uses.
const RevenueCatEvent = z.object({
  event: z.object({
    id: z.string(),
    type: z.string(),
    app_user_id: z.string(),
    product_id: z.string().optional(),
    store: z.string().optional(),
    expiration_at_ms: z.number().nullable().optional(),
  }),
});

const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"]);
const GRACE_EVENTS = new Set(["BILLING_ISSUE", "CANCELLATION"]); // access until the period ends
const ENDED_EVENTS = new Set(["EXPIRATION"]);
const REFUND_EVENTS = new Set(["REFUND"]);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createApp(cfg: Config) {
  const now = cfg.now ?? (() => new Date());
  const app = new Hono<Vars>();
  // The web app calls with a bearer token, never cookies, so only its own origins are let in.
  if (cfg.webOrigins?.length) {
    app.use("*", cors({ origin: cfg.webOrigins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "DELETE"], maxAge: 600 }));
  }

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/v1/lease-key", (c) => c.json({ keys: [cfg.leaseKeys.publicJwk] }));

  // The signed debloat list feed. Public like the upstream lists it is built from; the apps check the signature
  // with the key they ship with, so whoever serves it cannot change it.
  for (const file of ["feed.json", "feed.json.sig"] as const) {
    app.get(`/v1/lists/${file}`, async (c) => {
      if (!cfg.feedDir) return c.json({ error: "no-feed" }, 503);
      const body = await readFile(join(cfg.feedDir, file)).catch(() => null);
      if (!body) return c.json({ error: "no-feed" }, 503);
      return c.body(body, 200, {
        "content-type": file.endsWith(".json") ? "application/json" : "application/octet-stream",
        "cache-control": "public, max-age=3600",
      });
    });
  }

  app.use("/v1/me/*", requireUser);
  app.use("/v1/me", requireUser);
  async function requireUser(c: Context<Vars>, next: () => Promise<void>) {
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return c.json({ error: "sign-in-required" }, 401);
    try {
      const { payload } = await jwtVerify(token, cfg.auth.jwks, { issuer: cfg.auth.issuer, audience: cfg.auth.audience });
      // Supabase's anonymous sign-ins carry the same audience; a trial needs a real account.
      if (!payload.sub || payload.is_anonymous === true) return c.json({ error: "sign-in-required" }, 401);
      c.set("sub", payload.sub);
    } catch {
      return c.json({ error: "sign-in-required" }, 401);
    }
    await next();
  }

  app.get("/v1/me", async (c) => {
    const account = await accountFor(cfg.db, c.get("sub"));
    return c.json(await entitlementOf(cfg.db, account.id, now()));
  });

  app.post("/v1/me/tvs", async (c) => {
    const body = RegisterTv.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad-request" }, 400);
    return c.json(await registerTv(cfg.db, cfg.pepper, c.get("sub"), body.data, now()));
  });

  app.post("/v1/me/leases", async (c) => {
    const body = LeaseRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad-request" }, 400);
    const account = await accountFor(cfg.db, c.get("sub"));
    const linked = await cfg.db.query("select 1 from account_tvs where account = $1 and household = $2", [account.id, body.data.household]);
    if (!linked.length) return c.json({ error: "unknown-tv" }, 404);
    const e = await entitlementOf(cfg.db, account.id, now());
    const lease = await issueLease(cfg.leaseKeys, e, body.data.household, body.data.instance, now());
    if (!lease) return c.json({ error: "subscription-required", entitlement: e }, 402);
    return c.json({ ...lease, entitlement: e });
  });

  type DesignRow = { id: string; request: string; exact: boolean; spec: ThemeSpec; created_at: Date };
  const designOut = (r: DesignRow, locked: boolean, fixes: string[] = []) => ({
    id: r.id,
    name: r.spec.name,
    summary: r.spec.summary,
    request: r.request,
    spec: r.spec,
    fixes,
    createdAt: new Date(r.created_at).toISOString(),
    // After the trial, saved designs stay listed (and come back on subscribing) but cannot be applied.
    locked,
  });

  async function generate(c: Context<Vars>, request: string, exact: boolean, installedApps: z.infer<typeof DesignBody>["installedApps"]) {
    if (!cfg.designer) return c.json({ error: "designer-unavailable" }, 503);
    const { model, limits, random } = cfg.designer;
    const account = await accountFor(cfg.db, c.get("sub"));
    const e = await entitlementOf(cfg.db, account.id, now());
    if (!e.entitled) return c.json({ error: "subscription-required", entitlement: e }, 402);
    const [{ n, last } = { n: 0, last: null }] = await cfg.db.query<{ n: number; last: Date | null }>(
      "select count(*)::int as n, max(created_at) as last from designs where account = $1 and created_at > $2",
      [account.id, new Date(now().getTime() - 24 * 3600_000)],
    );
    const cap = e.plan === "subscription" ? limits.perDaySubscriber : limits.perDayTrial;
    if (n >= cap) return c.json({ error: "daily-limit", limit: cap }, 429);
    if (last && now().getTime() - new Date(last).getTime() < limits.minIntervalMs) return c.json({ error: "too-fast" }, 429);
    const day = now().toISOString().slice(0, 10);
    const [today] = await cfg.db.query<{ cost: string }>("select cost_microusd::text as cost from ai_spend_daily where day = $1", [day]);
    if (today && Number(today.cost) >= limits.dailyBudgetMicroUsd) return c.json({ error: "busy" }, 503);

    const recent = (
      await cfg.db.query<{ spec: ThemeSpec }>("select spec from designs where account = $1 order by created_at desc limit 12", [account.id])
    ).map((r) => r.spec);
    const spend = (micro: number) =>
      cfg.db.query(
        `insert into ai_spend_daily (day, cost_microusd, requests) values ($1, $2, 1)
         on conflict (day) do update set cost_microusd = ai_spend_daily.cost_microusd + excluded.cost_microusd, requests = ai_spend_daily.requests + 1`,
        [day, micro],
      );
    let result;
    try {
      result = await designTheme(model, { request, installedApps, exact }, recent, random);
    } catch (err) {
      if (err instanceof DesignError) {
        await spend(err.costMicroUsd);
        return c.json({ error: `design-${err.kind}` }, 422);
      }
      throw err;
    }
    const [row] = await cfg.db.query<DesignRow>(
      `insert into designs (account, request, exact, spec, print, model, input_tokens, output_tokens, cost_microusd, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, request, exact, spec, created_at`,
      [account.id, request, exact, JSON.stringify(result.spec), JSON.stringify(result.print), result.model, result.usage.inputTokens + result.usage.cacheReadTokens, result.usage.outputTokens, result.costMicroUsd, now()],
    );
    await spend(result.costMicroUsd);
    return c.json({ design: designOut(row!, false, result.fixes) });
  }

  app.post("/v1/me/designs", async (c) => {
    const body = DesignBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad-request" }, 400);
    return generate(c, body.data.request, !!body.data.exact, body.data.installedApps);
  });

  // "Regenerate": the same words, a fresh take (never exact, so it moves away from what came before).
  app.post("/v1/me/designs/:id/regenerate", async (c) => {
    const body = RegenerateBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad-request" }, 400);
    const account = await accountFor(cfg.db, c.get("sub"));
    const [prev] = await cfg.db.query<{ request: string }>("select request from designs where id = $1 and account = $2", [c.req.param("id"), account.id]).catch(() => []);
    if (!prev) return c.json({ error: "not-found" }, 404);
    return generate(c, prev.request, false, body.data.installedApps);
  });

  app.get("/v1/me/designs", async (c) => {
    const account = await accountFor(cfg.db, c.get("sub"));
    const e = await entitlementOf(cfg.db, account.id, now());
    const rows = await cfg.db.query<DesignRow>(
      "select id, request, exact, spec, created_at from designs where account = $1 order by created_at desc limit 100",
      [account.id],
    );
    return c.json({ designs: rows.map((r) => designOut(r, !e.entitled)), entitlement: e });
  });

  // What the phone pushes to the TV: the launcher config for this design, and a pass for that launcher.
  app.post("/v1/me/designs/:id/apply", async (c) => {
    const body = LeaseRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad-request" }, 400);
    const account = await accountFor(cfg.db, c.get("sub"));
    const [row] = await cfg.db.query<DesignRow>("select id, request, exact, spec, created_at from designs where id = $1 and account = $2", [c.req.param("id"), account.id]).catch(() => []);
    if (!row) return c.json({ error: "not-found" }, 404);
    const linked = await cfg.db.query("select 1 from account_tvs where account = $1 and household = $2", [account.id, body.data.household]);
    if (!linked.length) return c.json({ error: "unknown-tv" }, 404);
    const e = await entitlementOf(cfg.db, account.id, now());
    const lease = await issueLease(cfg.leaseKeys, e, body.data.household, body.data.instance, now());
    if (!lease) return c.json({ error: "subscription-required", entitlement: e }, 402);
    const checked = checkTheme(row.spec, null);
    if (!checked.ok) return c.json({ error: "design-invalid" }, 422);
    return c.json({ config: compileTheme(checked.spec!), ...lease });
  });

  // Everything held about the account, for the person to download (privacy law; also linked from the app).
  app.get("/v1/me/export", async (c) => {
    const account = await accountFor(cfg.db, c.get("sub"));
    const q = (sql: string) => cfg.db.query(sql, [account.id]);
    return c.json({
      account: (await q("select id, created_at, trial_started_at from accounts where id = $1"))[0],
      tvs: await q("select household, model, added_at from account_tvs where account = $1"),
      designs: await q("select id, request, exact, spec, model, created_at from designs where account = $1 order by created_at"),
      subscription: (await q("select source, product, status, period_end, updated_at from subscriptions where account = $1"))[0] ?? null,
      note: "TV identifiers are stored only as keyed hashes and are not linked to this account beyond the TV list above.",
    });
  });

  // Deleting the account (App Store rule 5.1.1(v), and privacy law). The keyed TV hashes and the household's
  // trial date stay, unlinked from any account, so deleting and signing up again cannot restart a free trial;
  // the privacy policy says so.
  app.delete("/v1/me", async (c) => {
    const sub = c.get("sub");
    await cfg.db.transaction(async (tx) => {
      const [acc] = await tx.query<{ id: string }>("select id from accounts where auth_sub = $1", [sub]);
      if (!acc) return;
      await tx.query("delete from designs where account = $1", [acc.id]);
      await tx.query("delete from account_tvs where account = $1", [acc.id]);
      await tx.query("delete from subscriptions where account = $1", [acc.id]);
      await tx.query("update households set trial_account = null where trial_account = $1", [acc.id]);
      await tx.query("delete from accounts where id = $1", [acc.id]);
    });
    // After our data is gone, so a failure here can be retried by deleting again.
    if (cfg.deleteIdentity) {
      try {
        await cfg.deleteIdentity(sub);
      } catch {
        return c.json({ error: "identity-delete-failed" }, 502);
      }
    }
    return c.json({ deleted: true });
  });

  // The wallpaper.jpg the phone pushes to the TV with the config from /apply.
  app.get("/v1/me/designs/:id/wallpaper.jpg", async (c) => {
    const account = await accountFor(cfg.db, c.get("sub"));
    const [row] = await cfg.db.query<DesignRow>("select id, request, exact, spec, created_at from designs where id = $1 and account = $2", [c.req.param("id"), account.id]).catch(() => []);
    if (!row) return c.json({ error: "not-found" }, 404);
    if (!(await entitlementOf(cfg.db, account.id, now())).entitled) return c.json({ error: "subscription-required" }, 402);
    const jpg = renderWallpaperJpeg(row.spec);
    if (!jpg) return c.json({ error: "no-wallpaper" }, 404);
    return c.body(new Uint8Array(jpg), 200, { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" });
  });

  app.post("/v1/webhooks/revenuecat", async (c) => {
    if (!safeEqual(c.req.header("authorization") ?? "", cfg.revenueCatWebhookAuth)) return c.json({ error: "forbidden" }, 403);
    const parsed = RevenueCatEvent.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad-request" }, 400);
    const ev = parsed.data.event;
    await cfg.db.transaction(async (tx) => {
      const fresh = await tx.query("insert into webhook_events (id) values ($1) on conflict do nothing returning id", [`rc:${ev.id}`]);
      if (!fresh.length) return; // a retry of an event already applied
      const status = ACTIVE_EVENTS.has(ev.type)
        ? "active"
        : GRACE_EVENTS.has(ev.type)
          ? "grace"
          : ENDED_EVENTS.has(ev.type)
            ? "expired"
            : REFUND_EVENTS.has(ev.type)
              ? "refunded"
              : null;
      if (!status) return;
      // The app logs in to RevenueCat with the identity provider's sub, so app_user_id is the account's auth_sub.
      const account = await accountFor(tx, ev.app_user_id);
      const periodEnd = ev.expiration_at_ms ? new Date(ev.expiration_at_ms) : null;
      await tx.query(
        `insert into subscriptions (account, source, product, status, period_end, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (account) do update set source = excluded.source, product = excluded.product,
           status = excluded.status, period_end = excluded.period_end, updated_at = now()`,
        [account.id, ev.store ?? "unknown", ev.product_id ?? "", status, periodEnd],
      );
    });
    return c.json({ ok: true });
  });

  return app;
}
