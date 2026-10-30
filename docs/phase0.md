# Phase 0: the safety core

What exists now, how it is checked, and what it found. Everything here is TypeScript in `packages/core`, shared
later by the iOS, Android and web apps; nothing in it talks to a real TV yet.

## What was ported

| KanTV | From upstream cleanyourtv | What it does |
|---|---|---|
| `list.ts` | `tools/disable.sh` (top) | Reads a list (BOM, CRLF, comments, header). Refuses the whole list over one bad name (#165) or one core/middleware package (#884, #1578). Applies KanTV's must-keep overlay. |
| `guards.ts` | `tools/disable.sh` | The setupwraith Wi-Fi guard, the Home guard (#239, #795, #1573), the input-driver guard (#321), the input/Settings handler guard, the `ro.adb.secure` note. Same order, same fail-closed choices. |
| `recovery.ts` | `tools/recovery.py` | The record of the TV before cleanup (same format, version 1), first record wins, extending it when a list grows, and the restore commands. |
| `apply.ts`, `session.ts` | `tools/disable.sh` (bottom) | One `pm` command per shell call, the read-back (#1376), and the order: plan, store the record, then change the TV. |
| `handover.ts` | `launcher/build-and-install.sh` | Install, start, disable only a known stock launcher, set Home, verify, roll back. KanTV adds the `mFocusedApp` check PROMPT.md asks for. |
| `match.ts`, `feed.ts` | (new) | Matching a TV's `getprop` answers to the tested lists; verifying the signed list feed. |

## How it is checked

- **Conformance** (`npm run conformance`, also in CI): upstream's own `disable.sh` and `recovery.py`, unmodified,
  and the KanTV port run against the same fake Android TV (`testing/fake-tv/`: fake `pm`, `cmd`, `dumpsys`,
  `getprop`, `settings`, `am`, run by a real `sh`, so the shell loops upstream sends to the TV run as written).
  Each run compares the packages actually disabled, the packages a guard skipped, the recovery record, the
  restore commands and the `ro.adb.secure` warning. 29 hand-written scenarios (one per incident the guards
  exist for) plus seeded random TVs: **529/529 match** at the pinned commit (`upstream.lock.json`).
- **The harness catches regressions:** with the setupwraith-Home guard, the Wi-Fi guard or the
  unknown-stock-launcher guard switched off in the port, it reports differences straight away.
- **Unit tests** (`npm test`): list parsing, the must-keep overlay, first-record-wins, a record that cannot be
  stored stopping the run with the TV untouched, the read-back, every handover failure path and its rollback,
  feed signatures, and model matching against the real upstream lists.

## Where KanTV deliberately differs

1. **Must-keep overlay.** `com.google.android.tv.remote.service` is removed from every list (22 upstream lists
   disable it): the phone remote needs it once ADB is closed.
2. **Handler guard split.** Upstream splits its handler answer with `sed '1,/^==$/d'`, which looks for the
   end marker only after line 1. If the first query printed nothing, `==` is line 1 and the Settings handlers
   are all dropped, so a vendor Settings app goes unprotected. Real Android prints "No activities found", so
   this needs firmware that prints nothing; KanTV splits at the marker wherever it is. Scenario: "a dongle
   whose query-activities prints nothing when nothing matches".
3. **Focus check after the handover**, and KanTV's own launcher id treated like upstream's in restore.
4. **A failed read while taking the record stops the run** (upstream's real `tv.py` raises and the script
   stops the same way; KanTV makes it explicit).

## The list feed

`npm run lists:build -- --key <ed25519 PEM>` (or `--dev-key` locally) builds `dist/feed.json` from the pinned
upstream checkout: **380 models, 383 lists, 0 rejected**, 22 lists with the must-keep entry removed, signed
with Ed25519. Each list carries its header and flags the app turns into questions (`setupwraith`,
`casting-needs-setupwraith`, `cvte-keep-stock-launcher`, `wireless-debugging`, `reenabled-at-boot`,
`key-repeat`, `remote-buttons`, `factory-warning`, `usb-power`).

Whether a launcher can be installed is not read from prose: `lists/overrides.json` holds those decisions,
reviewed by hand with the upstream line they rest on. Today: every Fire OS device (17) and four China-market
sets with a launcher signature gate are debloat only.

Matching: an exact device or model gives one candidate; boards shared by many sets (TCL's G08 has 18 lists)
give a ranked shortlist, and the app asks the user to pick their TV by name.

## Bumping upstream

1. Check out the new upstream commit next to this repo.
2. `npm run conformance` and `npm test` must pass; read any new guard in `tools/disable.sh` and port it.
3. Re-check `lists/overrides.json` against the new headers, then update `upstream.lock.json`.
