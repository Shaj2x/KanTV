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
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API (`https://<ref>.supabase.co`). Tokens are checked against the project's JWT signing keys; set `SUPABASE_JWT_SECRET` too only if the project still uses the legacy secret |
| `SUPABASE_SECRET_KEY` | Supabase dashboard → Project Settings → API Keys → a secret key (`sb_secret_…`). Lets account deletion remove the login too. Server only, never in an app |
| `ANTHROPIC_API_KEY` | Anthropic Console; without it the designer answers 503 and everything else works |
| `KANTV_FEED_DIR` | a folder holding `feed.json` and `feed.json.sig`, readable by the container's `node` user |
| `KANTV_WEB_ORIGINS` | the web app's address, e.g. `https://app.kantv.tv` (comma-separate several); lets the browser app call the API |
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

## Supabase (sign-in)

People sign in with their email and a 6-digit code; no passwords. In the Supabase dashboard:

1. **Create the project** (any region near your backend). Note the **Project URL** and, under Project Settings →
   API Keys, the **publishable key** (`sb_publishable_…`, goes in the apps) and a **secret key** (`sb_secret_…`,
   backend only, `SUPABASE_SECRET_KEY`).
2. **JWT signing keys** (Project Settings → JWT Keys): make sure the current key is an asymmetric one (ECC P-256).
   New projects already are; the backend then needs no shared secret.
3. **Authentication → Sign In / Providers → Email**: enabled; "Confirm email" on; email OTP length **6**, expiry
   **600** seconds.
4. **Authentication → Emails → Templates**: paste `supabase/templates/sign-in-code.html` into both **Magic link**
   and **Confirm signup** (subject: "Your KanTV sign-in code"). Without this the emails carry a link, not a code.
5. **Authentication → Emails → SMTP**: set up your own sender (Resend, Postmark, SES…). Supabase's built-in
   sender is limited to a few emails an hour and is not for production.
6. **Authentication → URL Configuration**: Site URL = the web app's address.

The apps are built with:

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | the Project URL |
| `EXPO_PUBLIC_SUPABASE_KEY` | the publishable key (made to be public; never the secret key) |
| `EXPO_PUBLIC_KANTV_API_URL` | the backend's address |
| `EXPO_PUBLIC_KANTV_FEED_KEY` | the list feed's public key (base64, from `public.json` made by `scripts/gen-secrets.ts`); with it the app uses the signed feed from the backend instead of the bundled demo lists |

Without the three, the app builds as the offline preview.

## Locally, everything

`npm run dev:stack` starts a stand-in for a Supabase project in Docker (Postgres, Supabase's own auth server, a
mail catcher at http://localhost:54324 and a gateway at http://localhost:54321) and writes development keys to
`dev/.env`, `dev/backend.env` and `apps/mobile/.env.local`. Then `npm run dev:api` runs the backend, and the web
app (`cd apps/mobile && npx expo start --web`) signs in against it. The browser test of the whole path:

```bash
npm run dev:stack
npm run dev:api &
(cd apps/mobile && npx expo export --platform web && node e2e/live.cjs)
```

`npx tsx scripts/dev-stack.ts --down` stops it and wipes its data.

## Check it

`scripts/smoke-backend.ts` runs the built image against a real Postgres with throwaway secrets and checks
start-up, the signed feed, trials, TV passes, billing and that it runs as a non-root user. CI runs it on every
push.
