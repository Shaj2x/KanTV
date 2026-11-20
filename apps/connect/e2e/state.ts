// Writes a fake Chromecast with Google TV for the end-to-end run: every package the tested list knows, plus
// the launcher, setup and a few apps people keep.
import { writeFileSync } from "node:fs";
import feed from "../../mobile/src/platform/demo/feed.json" with { type: "json" };

const chromecast = (feed.models as { folder: string; lists: { packages: { name: string }[] }[] }[]).find((m) => m.folder === "google-chromecast-gtv-4k")!;
const listed = chromecast.lists.flatMap((l) => l.packages.map((p) => p.name));
const GTV = "com.google.android.apps.tv.launcherx";
const SETUP = "com.google.android.tungsten.setupwraith";
writeFileSync(
  process.argv[2]!,
  JSON.stringify({
    installed: [...new Set([...listed, GTV, SETUP, "com.android.tv.settings", "com.netflix.ninja", "com.google.android.youtube.tv"])],
    disabled: [],
    claims: [`${GTV}/.MainActivity`, `${SETUP}/.RecoveryActivity`],
    props: {
      "ro.product.model": "Chromecast",
      "ro.product.device": "sabrina",
      "ro.product.name": "sabrina",
      "ro.product.manufacturer": "Google",
      "ro.product.brand": "google",
      "ro.serialno": "16301HFDD2V7XQ",
    },
    sdk: 34,
    adb_secure: "1",
    settings: { adb_enabled: "1", adb_wifi_enabled: "0" },
  }),
);
console.log(`${listed.length} listed packages`);
