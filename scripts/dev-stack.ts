// The whole thing, locally: a Supabase-style auth stack in Docker (dev/compose.yml), and the env files the
// backend and the web app need to use it. Keys are made once, for development only, into dev/*.env (ignored).
//
//   npx tsx scripts/dev-stack.ts          # start auth (http://localhost:54321) and mail (http://localhost:54324)
//   npx tsx scripts/dev-stack.ts --down   # stop it and wipe its data
//
// Then: the backend   npx tsx --env-file=dev/backend.env packages/backend/src/server.ts
//       the web app   (cd apps/mobile && npx expo start --web)   reads apps/mobile/.env.local
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { generateLeaseKeys } from "../packages/backend/src/leases.ts";

const root = resolve(import.meta.dirname, "..");
const dev = resolve(root, "dev");
const compose = (...args: string[]) => execFileSync("docker", ["compose", "-f", resolve(dev, "compose.yml"), ...args], { stdio: "inherit" });

export const SUPABASE_URL = "http://localhost:54321";
export const MAIL_URL = "http://localhost:54324";
export const API_PORT = 8787;

async function writeEnvOnce() {
  if (existsSync(resolve(dev, ".env"))) return;
  // Signing keys as a Supabase project has them: an asymmetric key for tokens, and a legacy secret the auth
  // server still insists on having.
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = { ...(await exportJWK(privateKey)), kid: randomUUID(), alg: "ES256", use: "sig", key_ops: ["sign", "verify"] };
  const secret = randomBytes(32).toString("hex");
  // The dev stand-ins for the project's publishable and secret keys: tokens for the anon and service_role roles.
  const roleKey = (role: string) =>
    new SignJWT({ role }).setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" }).setIssuer(`${SUPABASE_URL}/auth/v1`).setIssuedAt().setExpirationTime("10y").sign(privateKey);
  const anon = await roleKey("anon");
  const secretKey = await roleKey("service_role");
  writeFileSync(resolve(dev, ".env"), `GOTRUE_JWT_SECRET=${secret}\nGOTRUE_JWT_KEYS=${JSON.stringify([jwk])}\n`);

  const lease = await generateLeaseKeys();
  writeFileSync(
    resolve(dev, "backend.env"),
    [
      `DATABASE_URL=postgres://postgres:postgres@localhost:54322/kantv`,
      `SUPABASE_URL=${SUPABASE_URL}`,
      `SUPABASE_SECRET_KEY=${secretKey}`,
      `KANTV_PEPPER=${randomBytes(32).toString("hex")}`,
      `KANTV_LEASE_JWK=${JSON.stringify(lease.privateJwk)}`,
      `REVENUECAT_WEBHOOK_AUTH=Bearer ${randomBytes(16).toString("hex")}`,
      `KANTV_WEB_ORIGINS=http://localhost:8081,http://localhost:8082`,
      `PORT=${API_PORT}`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    resolve(root, "apps/mobile/.env.local"),
    `EXPO_PUBLIC_SUPABASE_URL=${SUPABASE_URL}\nEXPO_PUBLIC_SUPABASE_KEY=${anon}\nEXPO_PUBLIC_KANTV_API_URL=http://localhost:${API_PORT}\n`,
  );
}

if (process.argv.includes("--down")) {
  compose("down", "-v");
} else {
  await writeEnvOnce();
  compose("up", "-d", "--wait");
  console.log(`auth: ${SUPABASE_URL}/auth/v1   mail: ${MAIL_URL}`);
}
