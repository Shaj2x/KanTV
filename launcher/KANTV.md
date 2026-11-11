# The KanTV Home launcher

A fork of the cleanyourtv reference launcher (`launcher/` in https://github.com/Gathin23/cleanyourtv, MIT,
see `../THIRD_PARTY_NOTICES.md`), at the upstream commit in `../upstream.lock.json`.

## What KanTV changes

| Change | Where |
|---|---|
| Application ID `tv.kantv.home`, so it installs beside upstream's `com.gathin.tvhome` | `gradle.properties` |
| Name "KanTV Home" in every language (translations of the brand removed) | `res/values*/strings.xml` |

The Java package stays `com.gathin.tvhome` and the module-card intents keep upstream's names, so upstream fixes
merge cleanly and upstream add-ons still work.

## Build

JDK 17 to 22, Android SDK platform 34 and build-tools 34.0.0:

```bash
cd launcher
./gradlew --no-daemon testReleaseUnitTest lintRelease assembleRelease
```

## Taking upstream fixes

1. Bump `upstream.lock.json` (the conformance run must pass first, see `docs/phase0.md`).
2. Replace this folder with upstream's `launcher/` at that commit, then re-apply the changes in the table above.
   Keep the table complete: it is the list of everything to re-apply.
