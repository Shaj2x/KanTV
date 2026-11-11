// Writes the subscription-pass test vectors the launcher's Java tests check (LeaseTest), signed by the same
// library the backend signs real passes with, so Java and TypeScript are held to one format.
//   npx tsx scripts/lease-vectors.ts
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const NOW = 1_850_000_000;
const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const other = await generateKeyPair("ES256");
const jwk = await exportJWK(publicKey);

async function pass(o: { key?: CryptoKey; typ?: string; iss?: string; ent?: string; inst?: string; exp?: number } = {}) {
  return new SignJWT({ tv: "household-1", inst: o.inst ?? "inst-1", ent: o.ent ?? "full" })
    .setProtectedHeader({ alg: "ES256", kid: "lease-test", typ: o.typ ?? "kantv-lease" })
    .setIssuer(o.iss ?? "kantv")
    .setSubject("account-1")
    .setIssuedAt(NOW - 3600)
    .setExpirationTime(o.exp ?? NOW + 86400)
    .sign(o.key ?? privateKey);
}

const valid = await pass();
const [h, p, s] = valid.split(".");
const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, exp: NOW + 10 * 365 * 86400 })).toString("base64url");

const vectors = {
  now: NOW,
  instance: "inst-1",
  x: jwk.x,
  y: jwk.y,
  valid,
  invalid: {
    expired: await pass({ exp: NOW - 1 }),
    otherInstance: await pass({ inst: "inst-2" }),
    tampered: `${h}.${tamperedPayload}.${s}`,
    otherKey: await pass({ key: other.privateKey }),
    wrongType: await pass({ typ: "JWT" }),
    wrongIssuer: await pass({ iss: "someone-else" }),
    notFull: await pass({ ent: "basic" }),
    garbage: "not.a.pass",
  },
  // Many valid passes: ECDSA signatures vary, so these cover r and s with leading zeros and with the high bit set.
  manyValid: await Promise.all(Array.from({ length: 64 }, () => pass())),
};
const out = join(resolve(import.meta.dirname, ".."), "launcher/app/src/test/resources/lease-vectors.json");
writeFileSync(out, JSON.stringify(vectors, null, 1) + "\n");
console.log(`wrote ${out}`);
