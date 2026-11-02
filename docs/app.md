# The phone app (Phase 1)

`apps/mobile`: Expo (React Native) with Expo Router, one codebase for Android, iOS and the web. Every screen
runs the shared core (`packages/core`): the same guards, recovery record and restore that are checked against
upstream.

## Screens

| Screen | What it does |
|---|---|
| Home | Set up a TV; then the remote and Restore (always free) |
| Setup 1 | Turn on developer mode and debugging, with pictures, for Google TV and Android TV menus |
| Setup 2 | Find the TV on the Wi-Fi (or type its address); the "Allow USB debugging?" walkthrough; identify the TV |
| Setup 3 | "Is this your TV?" from the tested lists, with a shortlist for shared boards |
| Setup 4 | The list's questions, what gets turned off in plain words with untick boxes, the TV's safety checks, then the cleanup with a restore point first |
| Setup 5 | Switch debugging off and prove it (only a refused connection counts), then revoke the authorisation on the TV |
| Remote | D-pad, OK, Back, Home, power, volume, typing; pairs with the code the TV shows |
| Restore | Debugging back on, replay the restore point, switch debugging off again |
| Design | Describe a look, see it on a TV-shaped preview, try another take, put it on the TV; "Exactly as I describe" |
| My designs | Every design made; after the trial they stay, marked locked |
| Paywall | Monthly (pre-selected) and yearly; says the designs are kept and that Restore is always free |

## Native and demo

`src/platform/types.ts` is everything the app needs from the phone: discovery (mDNS), a TCP/TLS socket, the
ADB key in the keystore, the remote's TLS. The native module that provides them needs the Android SDK.
Until it exists, and always on the web (a browser cannot open a socket to a TV), the app runs a clearly
labelled preview against a simulated Chromecast with Google TV (`src/platform/demo`), which answers the same
commands a real TV gets.

## Checks

```bash
cd apps/mobile
npx tsc -p tsconfig.json
EXPO_OFFLINE=1 npx expo export --platform web --output-dir dist
node e2e/walk.cjs /tmp/shots     # the whole flow in Chromium at phone size; fails on any console error
```
