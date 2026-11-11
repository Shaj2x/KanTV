// Generates the secrets the backend and the list feed are signed with, once, into a folder outside the repo:
//
//   npx tsx scripts/gen-secrets.ts ~/kantv-secrets
//
//   backend.env     KANTV_PEPPER, KANTV_LEASE_JWK, REVENUECAT_WEBHOOK_AUTH (paste into the host's secret store)
//   feed.key.pem    the list feed's signing key (for scripts/lists/build.ts --key)
//   public.json     the two public keys the apps and the launcher ship with (safe to commit)
//
// Files are written owner-only and never overwritten: a new pepper forgets every TV's trial history, and a new
// lease or feed key locks out every app and launcher already shipped with the old public key.
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateLeaseKeys } from "../packages/backend/src/leases.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: gen-secrets.ts <folder outside the repo>");
  process.exit(2);
}
const dir = resolve(out);
const repo = resolve(import.meta.dirname, "..");
if (dir === repo || dir.startsWith(repo + "/")) {
  console.error("refusing: that folder is inside the repository, where a secret could be committed");
  process.exit(2);
}
const files = ["backend.env", "feed.key.pem", "public.json"].map((f) => join(dir, f));
const existing = files.filter((f) => existsSync(f));
if (existing.length) {
  console.error(`refusing to overwrite ${existing.join(", ")}: replacing these breaks every TV and app already set up`);
  process.exit(2);
}
mkdirSync(dir, { recursive: true, mode: 0o700 });

const lease = await generateLeaseKeys(`lease-${new Date().toISOString().slice(0, 10)}`);
const feed = generateKeyPairSync("ed25519");
const feedPublic = createPublicKey(feed.privateKey).export({ format: "der", type: "spki" });

const env = [
  "# KanTV backend secrets. Keep them in the host's secret store; never commit them.",
  `KANTV_PEPPER=${randomBytes(48).toString("base64url")}`,
  `KANTV_LEASE_JWK=${JSON.stringify(lease.privateJwk)}`,
  `REVENUECAT_WEBHOOK_AUTH=Bearer ${randomBytes(32).toString("base64url")}`,
  "# Still to fill in: DATABASE_URL, SUPABASE_URL, ANTHROPIC_API_KEY",
  "",
].join("\n");

writeFileSync(files[0]!, env, { mode: 0o600 });
writeFileSync(files[1]!, feed.privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
writeFileSync(
  files[2]!,
  JSON.stringify({ leasePublicJwk: lease.publicJwk, feedPublicKey: feedPublic.subarray(feedPublic.length - 32).toString("base64") }, null, 2) + "\n",
  { mode: 0o644 },
);
console.log(`wrote ${files.join(", ")}`);
console.log("backend.env and feed.key.pem are secrets: store them in your host's secret manager and keep a backup.");
