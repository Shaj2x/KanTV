// Writes the demo feed the phone app's preview uses: a few models from the real feed (npm run lists:build
// first). The real app downloads the whole signed feed instead.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Feed } from "../packages/core/src/index.ts";

const root = resolve(import.meta.dirname, "..");
const feed = JSON.parse(readFileSync(join(root, "dist/feed.json"), "utf8")) as Feed;
const pick = new Set([
  "google-chromecast-gtv-4k", "google-tv-streamer-4k-kirkwood", "tcl-c845x2-google-tv", "tcl-55c745",
  "xiaomi-mitv-afmu0", "beko-b43b880b", "amazon-fire-tv-stick-4k-2023", "hisense-65e5h",
]);
const demo: Feed = { ...feed, models: feed.models.filter((m) => pick.has(m.folder)), rejected: [] };
writeFileSync(join(root, "apps/mobile/src/platform/demo/feed.json"), JSON.stringify(demo));
console.log(`demo feed: ${demo.models.length} models from upstream ${feed.upstream.commit.slice(0, 8)}`);
