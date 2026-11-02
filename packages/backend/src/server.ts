// Production entry point. Configuration comes from the environment (secrets from the host's secret store):
//   DATABASE_URL, KANTV_PEPPER, KANTV_LEASE_JWK (private EC P-256 JWK as JSON), AUTH_JWKS_URL, AUTH_ISSUER,
//   AUTH_AUDIENCE, REVENUECAT_WEBHOOK_AUTH, PORT
import { serve } from "@hono/node-server";
import { createApp, authFromEnv } from "./app.ts";
import { migrate, postgresDb } from "./db.ts";
import { leaseKeysFromJwk } from "./leases.ts";

const required = ["DATABASE_URL", "KANTV_PEPPER", "KANTV_LEASE_JWK", "AUTH_JWKS_URL", "AUTH_ISSUER", "AUTH_AUDIENCE", "REVENUECAT_WEBHOOK_AUTH"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`missing configuration: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.KANTV_PEPPER!.length < 32) {
  console.error("KANTV_PEPPER must be at least 32 characters");
  process.exit(1);
}

const db = await postgresDb(process.env.DATABASE_URL!);
const applied = await migrate(db);
if (applied.length) console.log(`applied migrations: ${applied.join(", ")}`);
const app = createApp({
  db,
  pepper: process.env.KANTV_PEPPER!,
  leaseKeys: await leaseKeysFromJwk(JSON.parse(process.env.KANTV_LEASE_JWK!)),
  auth: authFromEnv(process.env),
  revenueCatWebhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH!,
});
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) }, (info) => console.log(`listening on ${info.port}`));
