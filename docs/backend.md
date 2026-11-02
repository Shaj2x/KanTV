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
