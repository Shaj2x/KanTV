# Deploying the backend

The backend is one container (`packages/backend/Dockerfile`) and one Postgres database. Any host that runs a
container works: Fly.io, Render, Railway, Google Cloud Run, a small VM.

## 1. Generate the secrets, once

On your own computer, outside the repository:

```bash
npx tsx scripts/gen-secrets.ts ~/kantv-secrets
```

| File | What it is | Where it goes |
|---|---|---|
| `backend.env` | `KANTV_PEPPER`, `KANTV_LEASE_JWK`, `REVENUECAT_WEBHOOK_AUTH` | the host's secret store |
| `feed.key.pem` | signs the list feed | wherever you build the feed (`npm run lists:build -- --key feed.key.pem`) |
| `public.json` | the public halves | built into the apps and the launcher |

Back these up somewhere safe. They are never regenerated: a new pepper forgets every TV's trial history, and a
new lease or feed key locks out every app and TV already set up.

## 2. Fill in the rest

| Variable | From |
|---|---|
| `DATABASE_URL` | your Postgres (Neon, Supabase, the host's own) |
| `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE` | your login provider's project settings |
| `ANTHROPIC_API_KEY` | Anthropic Console; without it the designer answers 503 and everything else works |
| `KANTV_FEED_DIR` | a folder holding `feed.json` and `feed.json.sig`, readable by the container's `node` user |
| `KANTV_THEME_MODEL`, `KANTV_THEME_EFFORT`, `KANTV_AI_DAILY_BUDGET_USD` | optional; defaults `claude-haiku-5-5`, `low`, `50` |

## 3. Build and run

```bash
docker build -f packages/backend/Dockerfile -t kantv-backend .
docker run --env-file ~/kantv-secrets/backend.env -e DATABASE_URL=... -p 8080:8080 kantv-backend
```

Migrations run on start. `GET /healthz` answers when it is ready.

## 4. Point RevenueCat at it

In RevenueCat, add a webhook to `https://<your api>/v1/webhooks/revenuecat` with the Authorization header set
to the `REVENUECAT_WEBHOOK_AUTH` value from `backend.env`. The app logs in to RevenueCat with the login
provider's user ID, which is how purchases find their account.

## Check it

`scripts/smoke-backend.ts` runs the built image against a real Postgres with throwaway secrets and checks
start-up, the signed feed, trials, TV passes, billing and that it runs as a non-root user. CI runs it on every
push.
