// The trial, lease and billing rules, through the HTTP API, on a real Postgres (PGlite).
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { migrate, type Db } from "../src/db.ts";
import { generateLeaseKeys, verifyLease } from "../src/leases.ts";

function pgliteDb(pg: PGlite): Db {
  const wrap = (q: Pick<PGlite, "query">): Db => ({
    query: async (sql, params = []) => (await q.query(sql, params)).rows as never,
    transaction: (f) => pg.transaction((tx) => f(wrap(tx))) as never,
  });
  return wrap(pg);
}

const DAY = 24 * 60 * 60 * 1000;
const h = (s: string) => createHash("sha256").update(s).digest("hex");
const TV1 = { serial: h("tv1-serial"), androidId: h("tv1-aid"), model: "Chromecast" };

let app: ReturnType<typeof createApp>;
let token: (sub: string) => Promise<string>;
let clock: Date;
let leaseKeys: Awaited<ReturnType<typeof generateLeaseKeys>>;

beforeEach(async () => {
  const pg = new PGlite();
  const db = pgliteDb(pg);
  await migrate(db);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
  token = (sub) =>
    new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("https://auth.test").setAudience("kantv").setSubject(sub).setExpirationTime("1h").sign(privateKey);
  clock = new Date("2026-11-02T12:00:00Z");
  leaseKeys = await generateLeaseKeys();
  app = createApp({
    db,
    pepper: "p".repeat(32),
    leaseKeys,
    auth: { jwks, issuer: "https://auth.test", audience: "kantv" },
    revenueCatWebhookAuth: "Bearer rc-secret",
    now: () => clock,
  });
});

async function call(method: string, path: string, sub: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(sub ? { authorization: `Bearer ${await token(sub)}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}
const register = (sub: string, tv: object) => call("POST", "/v1/me/tvs", sub, tv);
const later = (days: number) => (clock = new Date(clock.getTime() + days * DAY));

describe("the free trial", () => {
  it("starts on a new TV for a new account, for seven days", async () => {
    const r = await register("alice", TV1);
    expect(r.status).toBe(200);
    expect(r.json.trial).toBe("started");
    expect(r.json.entitlement).toMatchObject({ entitled: true, plan: "trial", trialEndsAt: "2026-11-09T12:00:00.000Z" });
  });

  it("is not given again to a new account on the same TV", async () => {
    await register("alice", TV1);
    const r = await register("bob", TV1);
    expect(r.json.trial).toBe("used-on-this-tv");
    expect(r.json.entitlement.entitled).toBe(false);
  });

  it("survives a factory reset: same serial, new Android ID", async () => {
    await register("alice", TV1);
    const r = await register("bob", { ...TV1, androidId: h("tv1-aid-after-reset") });
    expect(r.json.trial).toBe("used-on-this-tv");
  });

  it("recognises a TV with a junk serial by its Android ID", async () => {
    await register("alice", { androidId: TV1.androidId, model: "Cheap TV" });
    expect((await register("bob", { androidId: TV1.androidId, model: "Cheap TV" })).json.trial).toBe("used-on-this-tv");
  });

  it("joins two records of one TV and keeps the earlier trial", async () => {
    await register("alice", { serial: TV1.serial, model: "X" }); // trial on the serial alone
    await register("bob", { androidId: TV1.androidId, model: "X" }); // looked like another TV: bob's trial
    const r = await register("carol", TV1); // both identifiers together: the same TV
    expect(r.json.trial).toBe("used-on-this-tv");
    expect((await register("alice", TV1)).json.household).toBe(r.json.household);
  });

  it("is one per account: a second TV shares the first one's window", async () => {
    await register("alice", TV1);
    later(3);
    const second = await register("alice", { serial: h("tv2"), model: "Other" });
    expect(second.json.trial).toBe("active");
    expect(second.json.entitlement.trialEndsAt).toBe("2026-11-09T12:00:00.000Z");
    later(5);
    expect((await register("alice", { serial: h("tv3"), model: "Third" })).json.trial).toBe("used-by-account");
  });

  it("ends after seven days", async () => {
    await register("alice", TV1);
    later(7.01);
    const r = await register("alice", TV1);
    expect(r.json.trial).toBe("expired");
    expect((await call("GET", "/v1/me", "alice")).json).toMatchObject({ entitled: false, plan: "none" });
  });
});

describe("the TV's pass", () => {
  it("runs to the trial's end, is bound to the launcher install, and is refused after", async () => {
    const { json } = await register("alice", TV1);
    const r = await call("POST", "/v1/me/leases", "alice", { household: json.household, instance: "inst-1234" });
    expect(r.status).toBe(200);
    expect(r.json.expiresAt).toBe("2026-11-09T12:00:00.000Z");
    expect(await verifyLease(leaseKeys.publicJwk, r.json.lease, "inst-1234", clock)).toMatchObject({ sub: expect.any(String), tv: json.household, ent: "full" });
    expect(await verifyLease(leaseKeys.publicJwk, r.json.lease, "another-launcher", clock)).toBeNull();
    expect(await verifyLease(leaseKeys.publicJwk, r.json.lease, "inst-1234", new Date("2026-11-09T12:00:01Z"))).toBeNull();
    later(8);
    const after = await call("POST", "/v1/me/leases", "alice", { household: json.household, instance: "inst-1234" });
    expect(after.status).toBe(402);
    expect(after.json.error).toBe("subscription-required");
  });

  it("is only for a TV the account registered", async () => {
    const { json } = await register("alice", TV1);
    expect((await call("POST", "/v1/me/leases", "bob", { household: json.household, instance: "inst-1234" })).status).toBe(404);
  });

  it("publishes the public key the launcher verifies with, and only that", async () => {
    const r = await call("GET", "/v1/lease-key", null);
    expect(r.json.keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256" });
    expect(r.json.keys[0].d).toBeUndefined();
  });
});

describe("subscriptions from RevenueCat", () => {
  const event = (id: string, type: string, extra: object = {}) => ({
    event: { id, type, app_user_id: "alice", product_id: "kantv_yearly", store: "PLAY_STORE", ...extra },
  });
  const hook = (body: unknown, auth = "Bearer rc-secret") => call("POST", "/v1/webhooks/revenuecat", null, body, { authorization: auth });

  it("refuses a webhook without the shared secret", async () => {
    expect((await hook(event("e1", "INITIAL_PURCHASE"), "Bearer wrong")).status).toBe(403);
  });

  it("unlocks on purchase after the trial, keeps access through a cancellation's paid period, and ends on expiry", async () => {
    await register("alice", TV1);
    later(10);
    const periodEnd = clock.getTime() + 365 * DAY;
    await hook(event("e1", "INITIAL_PURCHASE", { expiration_at_ms: periodEnd }));
    expect((await call("GET", "/v1/me", "alice")).json).toMatchObject({ entitled: true, plan: "subscription" });
    await hook(event("e2", "CANCELLATION", { expiration_at_ms: periodEnd }));
    expect((await call("GET", "/v1/me", "alice")).json.entitled).toBe(true);
    await hook(event("e3", "EXPIRATION", { expiration_at_ms: periodEnd }));
    expect((await call("GET", "/v1/me", "alice")).json.entitled).toBe(false);
  });

  it("applies a retried event once", async () => {
    await hook(event("e1", "INITIAL_PURCHASE", { expiration_at_ms: clock.getTime() + 30 * DAY }));
    await hook(event("e2", "EXPIRATION", { expiration_at_ms: clock.getTime() + 30 * DAY }));
    await hook(event("e1", "INITIAL_PURCHASE", { expiration_at_ms: clock.getTime() + 30 * DAY })); // retry of e1
    expect((await call("GET", "/v1/me", "alice")).json.entitled).toBe(false);
  });

  it("gives a subscriber a pass capped at 14 days, renewed as they go", async () => {
    const { json } = await register("alice", TV1);
    later(10);
    await hook(event("e1", "INITIAL_PURCHASE", { expiration_at_ms: clock.getTime() + 365 * DAY }));
    const r = await call("POST", "/v1/me/leases", "alice", { household: json.household, instance: "inst-1234" });
    expect(new Date(r.json.expiresAt).getTime() - clock.getTime()).toBe(14 * DAY);
  });
});

describe("requests", () => {
  it("need a valid sign-in and a well-formed body", async () => {
    expect((await call("GET", "/v1/me", null)).status).toBe(401);
    expect((await app.request("/v1/me", { headers: { authorization: "Bearer not-a-token" } })).status).toBe(401);
    expect((await register("alice", { serial: "not-a-hash", model: "x" })).status).toBe(400);
  });

  it("never store the phone's hashes as sent", async () => {
    const pg = new PGlite();
    const db = pgliteDb(pg);
    await migrate(db);
    const { registerTv } = await import("../src/trials.ts");
    await registerTv(db, "p".repeat(32), "alice", TV1, clock);
    const stored = (await db.query<{ hmac: string }>("select hmac from tv_identifiers")).map((r) => r.hmac);
    expect(stored).toHaveLength(2);
    expect(stored).not.toContain(TV1.serial);
    expect(stored).not.toContain(TV1.androidId);
  });
});
