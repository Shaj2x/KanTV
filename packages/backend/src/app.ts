// The HTTP API. Every route but the health check, the public lease key and the billing webhook needs the
// identity provider's token. The API holds no model keys yet: the AI proxy arrives in Phase 2.
import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { Db } from "./db.ts";
import { issueLease, type LeaseKeys } from "./leases.ts";
import { accountFor, entitlementOf, registerTv } from "./trials.ts";

export interface Config {
  db: Db;
  /** Secret for keying TV identifiers; rotating it forgets every TV's trial history. */
  pepper: string;
  leaseKeys: LeaseKeys;
  auth: { jwks: JWTVerifyGetKey; issuer: string; audience: string };
  /** The Authorization value RevenueCat is configured to send to the webhook. */
  revenueCatWebhookAuth: string;
  now?: () => Date;
}

export function authFromEnv(env: NodeJS.ProcessEnv): Config["auth"] {
  return {
    jwks: createRemoteJWKSet(new URL(env.AUTH_JWKS_URL!)),
    issuer: env.AUTH_ISSUER!,
    audience: env.AUTH_AUDIENCE!,
  };
}

type Vars = { Variables: { sub: string } };

const sha = z.string().regex(/^[0-9a-f]{64}$/i);
const RegisterTv = z.object({ serial: sha.optional(), androidId: sha.optional(), model: z.string().max(200) });
const LeaseRequest = z.object({ household: z.string().uuid(), instance: z.string().min(8).max(64) });
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

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/v1/lease-key", (c) => c.json({ keys: [cfg.leaseKeys.publicJwk] }));

  app.use("/v1/me/*", requireUser);
  app.use("/v1/me", requireUser);
  async function requireUser(c: Context<Vars>, next: () => Promise<void>) {
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return c.json({ error: "sign-in-required" }, 401);
    try {
      const { payload } = await jwtVerify(token, cfg.auth.jwks, { issuer: cfg.auth.issuer, audience: cfg.auth.audience });
      if (!payload.sub) return c.json({ error: "sign-in-required" }, 401);
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
