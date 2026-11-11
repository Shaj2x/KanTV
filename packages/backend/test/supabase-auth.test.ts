// Supabase Auth tokens: the shapes a Supabase project issues, accepted; everything else, refused.
import { PGlite } from "@electric-sql/pglite";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { authFromEnv, createApp, supabaseIdentityDeleter, withLegacySecret } from "../src/app.ts";
import { migrate, type Db } from "../src/db.ts";
import { generateLeaseKeys } from "../src/leases.ts";

const ISS = "https://abcd.supabase.co/auth/v1";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
let app: ReturnType<typeof createApp>;
let es: CryptoKey;

function pgliteDb(pg: PGlite): Db {
  const wrap = (q: Pick<PGlite, "query">): Db => ({
    query: async (sql, params = []) => (await q.query(sql, params)).rows as never,
    transaction: (f) => pg.transaction((tx) => f(wrap(tx))) as never,
  });
  return wrap(pg);
}

beforeAll(async () => {
  const db = pgliteDb(new PGlite());
  await migrate(db);
  const pair = await generateKeyPair("ES256");
  es = pair.privateKey;
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "sb1", alg: "ES256" }] });
  app = createApp({
    db,
    pepper: "p".repeat(32),
    leaseKeys: await generateLeaseKeys(),
    auth: { jwks: withLegacySecret(jwks, new TextEncoder().encode(SECRET)), issuer: ISS, audience: "authenticated" },
    revenueCatWebhookAuth: "Bearer x",
  });
});

const claims = (extra: object = {}) => ({ role: "authenticated", email: "a@example.com", is_anonymous: false, ...extra });
const es256 = (extra?: object, iss = ISS, aud = "authenticated") =>
  new SignJWT(claims(extra)).setProtectedHeader({ alg: "ES256", kid: "sb1" }).setIssuer(iss).setAudience(aud).setSubject("3f1c5d2e-0000-4000-8000-000000000001").setExpirationTime("1h").sign(es);
const hs256 = (secret = SECRET) =>
  new SignJWT(claims()).setProtectedHeader({ alg: "HS256" }).setIssuer(ISS).setAudience("authenticated").setSubject("3f1c5d2e-0000-4000-8000-000000000002").setExpirationTime("1h").sign(new TextEncoder().encode(secret));
const me = async (t: string) => (await app.request("/v1/me", { headers: { authorization: `Bearer ${t}` } })).status;

describe("Supabase sign-in", () => {
  it("accepts a token signed with the project's signing key", async () => {
    expect(await me(await es256())).toBe(200);
  });
  it("accepts a token signed with the legacy secret, when configured", async () => {
    expect(await me(await hs256())).toBe(200);
    expect(await me(await hs256("another-secret-another-secret-another-secret!"))).toBe(401);
  });
  it("refuses anonymous sign-ins, other projects and other audiences", async () => {
    expect(await me(await es256({ is_anonymous: true }))).toBe(401);
    expect(await me(await es256({}, "https://other.supabase.co/auth/v1"))).toBe(401);
    expect(await me(await es256({}, ISS, "anon"))).toBe(401);
  });
  it("derives the keys, issuer and audience from the project URL", () => {
    const a = authFromEnv({ SUPABASE_URL: "https://abcd.supabase.co/" });
    expect(a.issuer).toBe(ISS);
    expect(a.audience).toBe("authenticated");
    expect(() => authFromEnv({})).toThrow(/SUPABASE_URL/);
  });
});

describe("the web app", () => {
  it("is let in from its own origin only", async () => {
    const db = pgliteDb(new PGlite());
    await migrate(db);
    const web = createApp({
      db,
      pepper: "p".repeat(32),
      leaseKeys: await generateLeaseKeys(),
      auth: { jwks: async () => { throw new Error("unused"); }, issuer: ISS, audience: "authenticated" },
      revenueCatWebhookAuth: "Bearer x",
      webOrigins: ["https://app.kantv.tv"],
    });
    const pre = (origin: string) =>
      web.request("/v1/me", { method: "OPTIONS", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    expect((await pre("https://app.kantv.tv")).headers.get("access-control-allow-origin")).toBe("https://app.kantv.tv");
    expect((await pre("https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("deleting an account", () => {
  it("also deletes the Supabase login, with the secret key", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const del = supabaseIdentityDeleter("https://abcd.supabase.co/", "sb_secret_x", (async (u: string, i?: RequestInit) => (calls.push([u, i]), new Response(null, { status: 404 }))) as never);
    await del("3f1c5d2e-0000-4000-8000-000000000001");
    expect(calls[0]![0]).toBe("https://abcd.supabase.co/auth/v1/admin/users/3f1c5d2e-0000-4000-8000-000000000001");
    expect(calls[0]![1]!.method).toBe("DELETE");
    const failing = supabaseIdentityDeleter("https://abcd.supabase.co", "k", (async () => new Response(null, { status: 500 })) as never);
    await expect(failing("x")).rejects.toThrow();
  });
});
