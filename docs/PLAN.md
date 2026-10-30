# KanTV: architecture and build plan

KanTV lets a non-technical person debloat an Android TV / Google TV, replace its home screen with a clean
launcher, redesign that launcher with AI from a plain-English description, and control the TV from a phone.

It is built on the open-source [cleanyourtv](https://github.com/Gathin23/cleanyourtv) project (MIT). We reuse its
per-model debloat lists, its safety guards and its launcher; see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Decisions

| Topic | Decision |
|---|---|
| Platforms | iOS (App Store), Android (Google Play), and a web app |
| Trial | 7 days, full access, one per TV (hardware ID) plus account |
| After the trial | The AI design tools lock, and the TV falls back to the free KanTV default look. Saved themes stay on the account and come back on subscribing. Monthly plan pushed on the paywall; yearly also offered. |
| Always free | Debloat **Restore**, the launcher's basic function (Home, apps, inputs, settings), and the free default theme |
| Launcher permissions | Whatever it needs: `INTERNET` for the paired LAN link and entitlement refresh |
| Launcher distribution | Google Play for Android TV (discoverability, auto-updates), with the APK bundled in the phone apps as a fallback |
| AI model | Cheapest model that gives good results: start on Claude Haiku 5.5 (`claude-haiku-5-5`), measured against Claude Sonnet 5.5 on a theme eval before launch; move up only if quality falls short |

## What we reuse from cleanyourtv

| Upstream | Use in KanTV |
|---|---|
| `examples/*/debloat.txt`, `tv.json` (380+ models) | Synced nightly, validated, signed, served as data. List-header warnings become structured prompts in the app. |
| `tools/disable.sh` guards | Ported: package-name shape check, core/middleware packages refused with no override (`CORE_RE`), setupwraith Wi-Fi ownership check, Home guard, TV input and handler guards |
| `tools/recovery.py`, `restore.sh` | Ported: first-wins record of prior package states, Home component and animation scales; restore replays it. The record is also backed up to the account. |
| `launcher/build-and-install.sh` | Ported: install, `set-home-activity`, verify `mFocusedApp`, disable only a known stock launcher, automatic `rollback_home` on failure |
| `tools/check.py`, `adb-closed.py` | Ported: firmware re-check, and proof that port 5555 / Wireless debugging is closed |
| `launcher/` | Forked under a new package id; its `config.json` theme keys are the base of our theme spec |

Not reused: the theme wallpapers (CC BY / CC BY-SA, attribution and share-alike) and the CleanYourTV name.

## Architecture

```
Phone app (iOS/Android) ──ADB (setup + restore only)──▶ TV: debloat, install launcher, Home handover
      │                ──Android TV Remote v2 (TLS)───▶ TV: d-pad, volume, text input
      │                ──KanTV link (LAN, paired)─────▶ KanTV launcher: themes, live preview, open apps
      └──HTTPS──▶ Backend ◀──HTTPS── Web app (design studio, account, billing)
                     ▲
                     └── KanTV launcher: theme sync, entitlement lease refresh
```

### Why ADB is only for setup

The repo's rule is to close network ADB at the end (port 5555 is plaintext). After that:

- **Remote:** Google's Android TV Remote protocol v2 (`com.google.android.tv.remote.service`), paired with a
  code on the TV. 22 upstream lists disable that service, so KanTV keeps a *must-keep overlay* that strips it from
  every list. TVs without it (non-certified sets, Fire TV) get a reduced remote through the launcher: Home, Back,
  open app, and d-pad through accessibility actions on Android 13+.
- **Themes and preview:** the launcher's paired LAN link, or the backend when the phone is not on the same network
  (this is what lets the web app apply themes).

### Phone and web apps

- **Expo (React Native) + react-native-web**, TypeScript end to end, so iOS, Android and the web share one UI and
  one theme-preview renderer.
- **Shared TypeScript core:** guard engine, restore record, list matching, theme-spec schema (Zod, also used by the
  backend). Pure logic, tested against upstream's fake-TV scenarios.
- **Thin native modules** (Kotlin on Android, Swift on iOS): TCP/TLS sockets, ADB RSA auth, Wireless-debugging
  pairing (SPAKE2 + TLS, BoringSSL on iOS), mDNS discovery (`_adb-tls-connect._tcp`, `_androidtvremote2._tcp`).
  iOS needs the Local Network permission and these Bonjour types declared.
- **The web app cannot do setup or debloat:** browsers cannot open raw TCP/TLS sockets to the TV, and WebUSB ADB
  needs a USB device port most TVs do not have. The web app is the design studio, account and billing; setup,
  restore and the remote need the phone app.

### TV launcher (fork of `launcher/`)

- New package id (e.g. `tv.kantv.home`); recovery logic knows both it and `com.gathin.tvhome`.
- Adds: paired LAN link, theme spec v2 (fonts, layouts, widgets) mapped onto the existing keys, bundled OFL fonts,
  preview mode (auto-revert after 30 s unless kept), entitlement lease.
- **Entitlement lease:** the backend issues a signed (Ed25519) lease with an expiry; the phone or the launcher
  refreshes it. The launcher verifies it offline. When it expires, the launcher switches to the free default theme
  and keeps the custom one on disk, so subscribing restores it instantly. It never blocks Home, apps, inputs or
  settings, and never shows a full-screen nag.

### Backend

- TypeScript (Hono) + Postgres, on Cloud Run or Fly.
- Auth: email, Google, Sign in with Apple.
- Billing: RevenueCat over StoreKit and Play Billing; Stripe for the web; webhooks into our DB, which is the source
  of truth for entitlements.
- **Trial registry:** `HMAC(server_pepper, model | ro.serialno | android_id)` read over ADB during setup, stored
  with the account. Known junk serials (`0123456789ABCDEF`, empty) count as weak signals. Server-side trial, not a
  store introductory offer (store trial eligibility is per Apple ID / Google account, so a new account would
  reset it).
- **AI proxy:** auth → entitlement or trial → per-user rate limit, daily cap and global spend breaker → Claude with
  structured outputs (`output_config.format`, our JSON Schema) → server validation → client validation before apply.
  The system prompt and schema are prompt-cached.
- **No repeats:** each saved design keeps a compact vector (OKLab palette, layout, font, wallpaper style). The last
  10–15 go into the request as summaries with an instruction to vary; a random design-direction seed per request;
  regenerate once if too close to a recent design. Skipped when the user asks for a specific design. Regenerate
  button in the UI.
- **Dock apps:** only packages installed on that TV (the phone sends the list); anything else fails validation.
- **Wallpapers:** procedural plus a curated library we own; AI picks by tags. AI image generation later.

## Risks

- **Bricking:** boot loops from core packages (#884, #1578), setupwraith deleting saved Wi-Fi, CVTE factory mode,
  Chromecast casting, key-repeat loss, USB power cut while debugging. Mitigated by the ported guards, small batches
  with health checks, the 15 s write delay before reboot, and list-header warnings shown as questions.
- **Unknown models:** debloat only for matched, tested lists plus a small conservative generic list; unknown TVs
  get the launcher only.
- **App stores:** Play's Device and Network Abuse policy (control only the user's own device, with consent);
  moderate App Review risk on iOS for an ADB client; store billing required in-app, Stripe on the web.
- **Security:** the launcher's LAN link and the stored ADB key need a security review.
- **Liability:** terms of use and warranty notes; consumer law limits disclaimers in the EU, UK and Australia.

## Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0. Foundations | TS guard engine + restore record; conformance harness diffing upstream scripts and our engine on the same fake TVs; list sync/validate/sign pipeline; model-matching index | Engine matches upstream on every fake-TV scenario |
| 1. MVP (Android phone + launcher) | Guided setup, discovery, pairing, backup, debloat of tested lists, launcher install with rollback, Restore, ADB close + check, preset themes, Remote v2, accounts, trial registry; field test on 10–15 TVs | No unrecoverable TV; Restore works on every one |
| 2. AI + billing + web | Theme spec v2, AI proxy, novelty, previews, entitlement lease, RevenueCat/Stripe, paywall, web design studio | End-to-end paywall tests; AI cost per user measured |
| 3. iOS | Native ADB/pairing module in Swift, Local Network, App Review | Approved on the App Store |
| 4. Later | Firmware re-check, privacy audit, AI wallpapers, more widgets, Fire TV debloat-only | |
