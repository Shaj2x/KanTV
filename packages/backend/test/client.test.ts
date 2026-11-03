// The phone app's own backend clients (apps/mobile/src/api.ts) and the core feed fetcher, against the real
// backend in-process: what the app sees for registration, trials, designing, applying, passes and the feed.
import { PGlite } from "@electric-sql/pglite";
import { createHash, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME, fetchFeed } from "@kantv/core";
import { backendAccount, backendDesigner } from "../../../apps/mobile/src/api.ts";
import { createApp, DEFAULT_DESIGN_LIMITS } from "../src/app.ts";
import { migrate, type Db } from "../src/db.ts";
import type { ThemeModel } from "../src/designer.ts";
import { generateLeaseKeys, verifyLease } from "../src/leases.ts";

const BASE = "https://api.kantv.test";
const h = (s: string) => createHash("sha256").update(s).digest("hex");
const APPS = [{ package: "com.netflix.ninja", label: "Netflix" }];

let clock: Date;
let app: ReturnType<typeof createApp>;
let token: (sub: string) => () => Promise<string>;
let leaseKeys: Awaited<ReturnType<typeof generateLeaseKeys>>;
let feedPub: Uint8Array<ArrayBuffer>;

const fetchVia = async (url: string, init?: RequestInit): Promise<Response> => app.request(url.replace(BASE, ""), init);

beforeEach(async () => {
  const pg = new PGlite();
  const wrap = (q: Pick<PGlite, "query">): Db => ({
    query: async (sql, params = []) => (await q.query(sql, params)).rows as never,
    transaction: (f) => pg.transaction((tx) => f(wrap(tx))) as never,
  });
  const db = wrap(pg);
  await migrate(db);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k", alg: "RS256" }] });
  token = (sub) => () => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k" }).setIssuer("i").setAudience("kantv").setSubject(sub).setExpirationTime("1h").sign(privateKey);
  clock = new Date("2026-11-03T12:00:00Z");
  leaseKeys = await generateLeaseKeys();

  const feedDir = mkdtempSync(join(tmpdir(), "kantv-feed-"));
  const feedKey = generateKeyPairSync("ed25519");
  const bytes = Buffer.from(JSON.stringify({ version: 1, upstream: { repo: "r", commit: "c" }, generated: "", models: [], rejected: [] }));
  writeFileSync(join(feedDir, "feed.json"), bytes);
  writeFileSync(join(feedDir, "feed.json.sig"), sign(null, bytes, feedKey.privateKey));
  const spki = createPublicKey(feedKey.privateKey).export({ format: "der", type: "spki" });
  feedPub = new Uint8Array(spki.subarray(spki.length - 32));

  const model: ThemeModel = {
    model: "claude-haiku-5-5",
    design: async () => ({ output: { ...DEFAULT_THEME, name: "Night", dockApps: ["com.netflix.ninja"] }, stop: "done", model: "claude-haiku-5-5", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
  };
  app = createApp({
    db,
    pepper: "p".repeat(32),
    leaseKeys,
    auth: { jwks, issuer: "i", audience: "kantv" },
    revenueCatWebhookAuth: "Bearer x",
    feedDir,
    designer: { model, limits: { ...DEFAULT_DESIGN_LIMITS, minIntervalMs: 0 } },
    now: () => clock,
  });
});

describe("the app's clients against the backend", () => {
  it("setup registers the TV and starts the trial; a second account on that TV does not get one", async () => {
    const alice = backendAccount(BASE, token("alice"), fetchVia);
    const r = await alice.registerTv({ serial: h("tv"), androidId: h("aid") }, "Google Chromecast");
    expect(r).toMatchObject({ trial: "started", entitlement: { entitled: true, plan: "trial" } });
    const bob = backendAccount(BASE, token("bob"), fetchVia);
    expect(await bob.registerTv({ serial: h("tv") }, "Google Chromecast")).toMatchObject({ trial: "used-on-this-tv", entitlement: { entitled: false } });
  });

  it("designs, lists and applies, with a pass the launcher accepts", async () => {
    const alice = backendAccount(BASE, token("alice"), fetchVia);
    const reg = await alice.registerTv({ serial: h("tv") }, "TV");
    if (reg === "offline") throw new Error("offline");
    const designer = backendDesigner(BASE, token("alice"), fetchVia);
    const d = await designer.design("dark and calm", APPS, false);
    if (typeof d === "string") throw new Error(d);
    expect(d.name).toBe("Night");
    expect((await designer.list()).map((x) => x.id)).toEqual([d.id]);
    const applied = await designer.apply(d.id, reg.household, "inst-1234");
    if (typeof applied === "string") throw new Error(applied);
    expect(applied.config.background_color).toBe("#000000");
    expect(await verifyLease(leaseKeys.publicJwk, applied.lease, "inst-1234", clock)).not.toBeNull();
    const pass = await alice.lease(reg.household, "inst-1234");
    expect(typeof pass === "object" && pass.lease).toBeTruthy();
  });

  it("after the trial the app is told to show the paywall, and saved designs come back locked", async () => {
    const alice = backendAccount(BASE, token("alice"), fetchVia);
    const reg = await alice.registerTv({ serial: h("tv") }, "TV");
    if (reg === "offline") throw new Error("offline");
    const designer = backendDesigner(BASE, token("alice"), fetchVia);
    await designer.design("x", APPS, false);
    clock = new Date(clock.getTime() + 8 * 86_400_000);
    expect(await designer.design("y", APPS, false)).toBe("subscription-required");
    expect((await designer.list())[0]!.locked).toBe(true);
    expect(await alice.lease(reg.household, "inst-1234")).toBe("subscription-required");
    expect(await designer.entitlement()).toMatchObject({ entitled: false, plan: "none" });
  });

  it("reports offline rather than throwing when the backend cannot be reached", async () => {
    const down = (() => Promise.reject(new Error("network"))) as typeof fetch;
    expect(await backendAccount(BASE, token("alice"), down).registerTv({}, "TV")).toBe("offline");
    expect(await backendDesigner(BASE, token("alice"), down).design("x", APPS, false)).toBe("offline");
  });

  it("downloads the signed feed, and refuses a tampered one", async () => {
    const feed = await fetchFeed(BASE, feedPub, fetchVia);
    expect(feed.version).toBe(1);
    const tampering = async (url: string) => {
      const r = await fetchVia(url);
      if (!url.endsWith("feed.json")) return r;
      const body = new Uint8Array(await r.arrayBuffer());
      body[5] = body[5]! ^ 1;
      return new Response(body);
    };
    await expect(fetchFeed(BASE, feedPub, tampering)).rejects.toThrow(/does not verify|JSON/);
  });
});
