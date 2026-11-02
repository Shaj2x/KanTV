# Backend (Phase 1)

`packages/backend`: Hono on Node, Postgres. Accounts come from any OIDC identity provider (Supabase, Clerk,
Firebase, Auth0): the backend only verifies its tokens. No AI keys yet; the AI proxy is Phase 2.

## Endpoints

| Route | Who | What |
|---|---|---|
| `GET /healthz` | anyone | liveness |
| `GET /v1/lease-key` | anyone | the public key the launcher verifies passes with (EC P-256 JWK) |
| `GET /v1/me` | signed in | entitlement: `entitled`, `plan` (`subscription`/`trial`/`none`), end dates |
| `POST /v1/me/tvs` | signed in | `{serial?, androidId?, model}` (SHA-256 hex from the phone): links the TV, decides the trial |
| `POST /v1/me/leases` | signed in | `{household, instance}`: a pass for that launcher install, or 402 once the trial is over |
| `POST /v1/me/designs` | signed in, entitled | `{request, installedApps, exact?}`: a new AI design (402 after the trial) |
| `POST /v1/me/designs/:id/regenerate` | signed in, entitled | a fresh take on the same words |
| `GET /v1/me/designs` | signed in | the history, `locked` once the trial is over |
| `POST /v1/me/designs/:id/apply` | signed in, entitled | `{household, instance}`: the launcher config and a TV pass |
| `POST /v1/webhooks/revenuecat` | RevenueCat | subscription events (App Store, Google Play, Stripe on the web), idempotent |

## The trial rule

7 days, once per account and once per TV. A TV is recognised by any identifier it has shown: the serial hash
(survives a factory reset) or the Android ID hash (junk serials on cheap boards). Two records that turn out to
be one TV are merged and keep the earlier trial. The phone sends SHA-256 hashes only; the backend stores
HMAC(pepper, hash), so the stored values are useless without the pepper. Locks on the account and on each
identifier stop two phones from starting two trials on one TV at the same moment.

Known limit: a TV that reports neither a usable serial nor an Android ID can only be held to the account rule.

## The pass

An ES256 JWS (`typ: kantv-lease`) with the account, the TV, the launcher install it is for, and an expiry: the
trial's end, or the paid period plus 3 days' grace, capped at 14 days so a subscriber's pass is renewed as
they go. The launcher verifies it offline with `java.security` (Android 8 has no Ed25519, hence P-256). When it
expires the launcher shows the free default look and keeps the custom theme on disk.

## Configuration

`DATABASE_URL`, `KANTV_PEPPER` (32+ characters), `KANTV_LEASE_JWK` (private EC P-256 JWK), `AUTH_JWKS_URL`,
`AUTH_ISSUER`, `AUTH_AUDIENCE`, `REVENUECAT_WEBHOOK_AUTH`, `PORT`. All secrets live in the host's secret
store, never in the repo. Migrations in `migrations/` run at start.

## The AI designer (Phase 2)

The model returns a theme spec (`packages/core/src/theme/spec.ts`) as structured output, never code. The
backend checks it again (schema, contrast readable from the sofa, only apps the TV has), fixes what is safe to
fix and says so, and compiles it to the launcher's config: upstream keys are checked against upstream's own
`tools/manage.py` in tests, the rest are `kantv_*` keys for the KanTV launcher fork.

- Model: `claude-haiku-5-5` at low effort by default (`KANTV_THEME_MODEL`, `KANTV_THEME_EFFORT`). Before
  launch, `scripts/theme-eval.ts --yes` (about $0.30) compares it with higher effort and with Sonnet; keep the
  cheapest whose fit and follow-through match the best.
- Variety: the model sees short summaries of the account's last 12 designs and a random design direction (the
  current models take no temperature); a design too close to a recent one is sent back once with the reason.
  "Exactly as I describe" switches both off.
- Limits: 25 designs a day on the trial, 80 subscribed, 3 s apart, and a global daily budget
  (`KANTV_AI_DAILY_BUDGET_USD`, default 50) that counts failed calls too.
