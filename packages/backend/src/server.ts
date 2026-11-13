// Production entry point. Configuration comes from the environment (secrets from the host's secret store):
//   DATABASE_URL, KANTV_PEPPER, KANTV_LEASE_JWK (private EC P-256 JWK as JSON), REVENUECAT_WEBHOOK_AUTH, PORT
// Sign-in: SUPABASE_URL (and SUPABASE_JWT_SECRET for a project still on the legacy HS256 secret), plus
//   SUPABASE_SECRET_KEY so deleting an account also deletes its Supabase login; or
//   AUTH_JWKS_URL, AUTH_ISSUER and AUTH_AUDIENCE for another OpenID provider
// The AI designer (optional; without it the design routes answer 503): ANTHROPIC_API_KEY, KANTV_THEME_MODEL
//   (default claude-haiku-5-5), KANTV_THEME_EFFORT (low, medium, high; default low), KANTV_AI_DAILY_BUDGET_USD
//   (default 50)
// The list feed (optional): KANTV_FEED_DIR, a folder holding feed.json and feed.json.sig
// The web app (optional): KANTV_WEB_ORIGINS, comma-separated origins allowed to call from a browser
import { serve } from "@hono/node-server";
import { createApp, authFromEnv, supabaseIdentityDeleter } from "./app.ts";
import { migrate, postgresDb } from "./db.ts";
import { leaseKeysFromJwk } from "./leases.ts";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_DESIGN_LIMITS } from "./app.ts";
import { claudeThemeModel } from "./designer.ts";

/** The global AI budget a day, in dollars. A typo must stop the server, not silently switch the cap off. */
function budgetUsd(): number {
  const raw = process.env.KANTV_AI_DAILY_BUDGET_USD ?? "50";
  const usd = Number(raw);
  if (!Number.isFinite(usd) || usd <= 0) {
    console.error(`KANTV_AI_DAILY_BUDGET_USD must be a positive number of dollars, such as 50 (got "${raw}")`);
    process.exit(1);
  }
  return usd;
}

const required = ["DATABASE_URL", "KANTV_PEPPER", "KANTV_LEASE_JWK", "REVENUECAT_WEBHOOK_AUTH"];
const missing = required.filter((k) => !process.env[k]);
if (!process.env.SUPABASE_URL && !(process.env.AUTH_JWKS_URL && process.env.AUTH_ISSUER && process.env.AUTH_AUDIENCE)) {
  missing.push("SUPABASE_URL (or AUTH_JWKS_URL, AUTH_ISSUER, AUTH_AUDIENCE)");
}
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
  feedDir: process.env.KANTV_FEED_DIR,
  deleteIdentity:
    process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? supabaseIdentityDeleter(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY) : undefined,
  webOrigins: process.env.KANTV_WEB_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
  designer: process.env.ANTHROPIC_API_KEY
    ? {
        model: claudeThemeModel(
          new Anthropic(),
          process.env.KANTV_THEME_MODEL ?? "claude-haiku-5-5",
          (process.env.KANTV_THEME_EFFORT as "low" | "medium" | "high" | undefined) ?? "low",
        ),
        limits: { ...DEFAULT_DESIGN_LIMITS, dailyBudgetMicroUsd: budgetUsd() * 1_000_000 },
      }
    : undefined,
});
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) }, (info) => console.log(`listening on ${info.port}`));
