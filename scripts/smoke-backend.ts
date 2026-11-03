// End-to-end check of the production backend image: a real Postgres, a stand-in identity provider (a JWKS
// endpoint and signed tokens), the kantv-backend container with fresh throwaway secrets, then the API used
// the way the phone uses it.
//
//   docker build -f packages/backend/Dockerfile -t kantv-backend .
//   npm run lists:build -- --dev-key && npx tsx scripts/smoke-backend.ts
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { verifyFeed } from "../packages/core/src/index.ts";
import { generateLeaseKeys, verifyLease } from "../packages/backend/src/leases.ts";

const root = resolve(import.meta.dirname, "..");
const IMAGE = process.env.IMAGE ?? "kantv-backend";
const PG_PORT = 55432;
const API_PORT = 58080;
const JWKS_PORT = 58081;
const run = (args: string[]) => execFileSync("docker", args, { encoding: "utf8" }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failures.push(what);
};

const names = { pg: `kantv-smoke-pg-${process.pid}`, api: `kantv-smoke-api-${process.pid}` };
const cleanup = () => spawnSync("docker", ["rm", "-f", names.pg, names.api], { stdio: "ignore" });

async function main() {
  // The feed, signed with a throwaway key whose public half we keep for the check.
  const feedDir = mkdtempSync(join(tmpdir(), "kantv-feed-"));
  const feedKey = generateKeyPairSync("ed25519");
  const feedBytes = readFileSync(join(root, "dist/feed.json"));
  writeFileSync(join(feedDir, "feed.json"), feedBytes);
  writeFileSync(join(feedDir, "feed.json.sig"), sign(null, feedBytes, feedKey.privateKey));
  // The container runs as an unprivileged user, so the mounted feed has to be readable by others.
  chmodSync(feedDir, 0o755);
  const spki = createPublicKey(feedKey.privateKey).export({ format: "der", type: "spki" });
  const feedPub = new Uint8Array(spki.subarray(spki.length - 32));

  // A stand-in identity provider.
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "smoke", alg: "RS256", use: "sig" }] };
  const idp = createServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(jwks))).listen(JWKS_PORT, "127.0.0.1");
  const token = (sub: string) =>
    new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "smoke" }).setIssuer("https://idp.smoke").setAudience("kantv").setSubject(sub).setExpirationTime("10m").sign(privateKey);

  const lease = await generateLeaseKeys("smoke");
  const webhook = `Bearer ${randomBytes(16).toString("hex")}`;

  cleanup();
  run(["run", "-d", "--name", names.pg, "--network", "host", "-e", "POSTGRES_PASSWORD=smoke", "postgres:16-alpine", "-p", String(PG_PORT)]);
  for (let i = 0; i < 60 && spawnSync("docker", ["exec", names.pg, "pg_isready", "-p", String(PG_PORT)]).status !== 0; i++) await sleep(500);
  run([
    "run", "-d", "--name", names.api, "--network", "host", "-v", `${feedDir}:/feed:ro`,
    "-e", `PORT=${API_PORT}`,
    "-e", `DATABASE_URL=postgres://postgres:smoke@127.0.0.1:${PG_PORT}/postgres`,
    "-e", `KANTV_PEPPER=${randomBytes(48).toString("base64url")}`,
    "-e", `KANTV_LEASE_JWK=${JSON.stringify(lease.privateJwk)}`,
    "-e", `AUTH_JWKS_URL=http://127.0.0.1:${JWKS_PORT}/jwks`,
    "-e", "AUTH_ISSUER=https://idp.smoke",
    "-e", "AUTH_AUDIENCE=kantv",
    "-e", `REVENUECAT_WEBHOOK_AUTH=${webhook}`,
    "-e", "KANTV_FEED_DIR=/feed",
    IMAGE,
  ]);
  const api = `http://127.0.0.1:${API_PORT}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(`${api}/healthz`).then((r) => r.ok, () => false);
    if (!up) await sleep(500);
  }
  check("the container starts, migrates the database and answers /healthz", up, run(["logs", names.api]).slice(-500));
  if (!up) return;

  const call = async (method: string, path: string, sub?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(`${api}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(sub ? { authorization: `Bearer ${await token(sub)}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };

  const feedRes = await fetch(`${api}/v1/lists/feed.json`);
  const sigRes = await fetch(`${api}/v1/lists/feed.json.sig`);
  const feed = await verifyFeed(new Uint8Array(await feedRes.arrayBuffer()), new Uint8Array(await sigRes.arrayBuffer()), feedPub).catch(() => null);
  check("serves the signed list feed, and the signature verifies", !!feed && feed.models.length > 300);

  check("refuses a request without sign-in", (await call("GET", "/v1/me")).status === 401);
  const h = (s: string) => createHash("sha256").update(s).digest("hex");
  const tv = await call("POST", "/v1/me/tvs", "alice", { serial: h("smoke-tv"), androidId: h("smoke-aid"), model: "Smoke TV" });
  check("a new TV starts the 7-day trial", tv.json?.trial === "started" && tv.json?.entitlement?.entitled === true, JSON.stringify(tv.json));
  const second = await call("POST", "/v1/me/tvs", "bob", { serial: h("smoke-tv"), model: "Smoke TV" });
  check("a second account on the same TV gets no new trial", second.json?.trial === "used-on-this-tv", JSON.stringify(second.json));
  const pass = await call("POST", "/v1/me/leases", "alice", { household: tv.json.household, instance: "smoke-launcher" });
  check("issues a TV pass the launcher can verify", !!(await verifyLease(lease.publicJwk, pass.json?.lease ?? "", "smoke-launcher")));
  check("the designer says it is unavailable without an AI key", (await call("POST", "/v1/me/designs", "alice", { request: "x", installedApps: [] })).status === 503);
  check("the billing webhook refuses a wrong secret", (await call("POST", "/v1/webhooks/revenuecat", undefined, {}, { authorization: "Bearer nope" })).status === 403);
  const ev = { event: { id: "smoke-1", type: "INITIAL_PURCHASE", app_user_id: "bob", product_id: "kantv_monthly", store: "PLAY_STORE", expiration_at_ms: Date.now() + 30 * 86400_000 } };
  await call("POST", "/v1/webhooks/revenuecat", undefined, ev, { authorization: webhook });
  const bob = await call("GET", "/v1/me", "bob");
  check("a purchase unlocks the account", bob.json?.plan === "subscription" && bob.json?.entitled === true, JSON.stringify(bob.json));
  const user = run(["exec", names.api, "id", "-u"]);
  check("the container runs as a non-root user", user !== "0", user);
  idp.close();
}

main()
  .catch((e) => failures.push(String(e)))
  .finally(() => {
    cleanup();
    console.log(failures.length ? `\n${failures.length} failed` : "\nall smoke checks passed");
    process.exit(failures.length ? 1 : 0);
  });
