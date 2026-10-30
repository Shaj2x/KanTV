// Builds the signed list feed from an upstream cleanyourtv checkout at the commit in upstream.lock.json.
//
//   UPSTREAM_DIR=../cleanyourtv npx tsx scripts/lists/build.ts --key feed.key.pem [--out dist]
//   UPSTREAM_DIR=../cleanyourtv npx tsx scripts/lists/build.ts --dev-key          # throwaway key, local only
//
// Every list goes through the same validateList() the apps run, so a list upstream would refuse never reaches
// the feed. Writes <out>/feed.json, <out>/feed.json.sig (raw Ed25519 signature) and <out>/feed.pub (raw key).
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractMatch, parseList, validateList, type Feed, type FeedList, type FeedModel } from "../../packages/core/src/index.ts";

/** Header and list facts the app turns into a question or a warning before it changes anything. */
export function flagsFor(header: string[], packages: string[]): string[] {
  const text = header.join("\n");
  const flags = new Set<string>();
  const has = (re: RegExp) => re.test(text);
  if (packages.includes("com.google.android.tungsten.setupwraith")) flags.add("setupwraith");
  if (flags.has("setupwraith") && has(/\bcast(ing)?\b/i)) flags.add("casting-needs-setupwraith");
  if (packages.some((p) => p.startsWith("com.cvte.")) || has(/\bCVTE\b/)) flags.add("cvte-keep-stock-launcher");
  // Whether the launcher can be installed is not read from prose here (headers often say an error is *not* the
  // block); lists/overrides.json holds those decisions, reviewed by hand.
  if (has(/Wireless debugging|adb pair/i)) flags.add("wireless-debugging");
  if (has(/re-?enabl\w*[^.\n]*(every|each|at) (re)?boot/i)) flags.add("reenabled-at-boot");
  if (has(/USB (Ethernet|power|port|drive|speaker)/i)) flags.add("usb-power");
  if (has(/key.?repeat/i)) flags.add("key-repeat");
  if (has(/factory[- ]mode|factory menu|hkcfac|fac\.menu|factorymenu|factorytest|at\.factory/i)) flags.add("factory-warning");
  if (has(/YouTube button|app buttons?|remap/i)) flags.add("remote-buttons");
  return [...flags].sort();
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

interface Overrides {
  models: Record<string, { launcher?: "unsupported"; source: string }>;
  os: Record<string, { launcher?: "unsupported"; source: string }>;
}

export function buildFeed(upstream: string, lock: { repo: string; commit: string }, overrides: Overrides): Feed {
  const examples = join(upstream, "examples");
  const models: FeedModel[] = [];
  const rejected: Feed["rejected"] = [];
  for (const folder of readdirSync(examples, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const dir = join(examples, folder);
    if (!existsSync(join(dir, "tv.json"))) continue;
    const tv = JSON.parse(readFileSync(join(dir, "tv.json"), "utf8")) as Record<string, string>;
    const lists: FeedList[] = [];
    let firstHeader: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /^debloat.*\.txt$/.test(f)).sort()) {
      const id = `${folder}/${file}`;
      const parsed = parseList(readFileSync(join(dir, file), "utf8"));
      const valid = validateList(parsed);
      if (!valid.ok) {
        const r = valid.refusal;
        rejected.push({ id, reason: r.kind === "empty" ? "empty" : `${r.kind}: ${r.names.join(", ")}` });
        continue;
      }
      if (file === "debloat.txt" || !firstHeader.length) firstHeader = parsed.header;
      const comments = new Map(parsed.entries.map((e) => [e.name, e.comment]));
      lists.push({
        id,
        file,
        packages: valid.packages.map((name) => ({ name, comment: comments.get(name) ?? "" })),
        header: parsed.header,
        flags: flagsFor(parsed.header, valid.packages),
        kept: valid.kept.map((k) => k.name),
      });
    }
    if (!lists.length) continue;
    const override =
      overrides.models[folder] ?? Object.entries(overrides.os).find(([k]) => (tv.os ?? "").includes(k))?.[1];
    models.push({
      launcher: override?.launcher ?? "supported",
      folder,
      tv: tv.tv ?? folder,
      os: tv.os ?? "",
      brand: tv.brand ?? "",
      notes: tv.notes ?? "",
      match: extractMatch(tv.tv ?? "", tv.brand ?? "", firstHeader, folder),
      lists,
    });
  }
  return { version: 1, upstream: lock, generated: new Date().toISOString(), models, rejected };
}

function main() {
  const root = resolve(import.meta.dirname, "../..");
  const upstream = resolve(process.env.UPSTREAM_DIR ?? join(root, "../cleanyourtv"));
  const lock = JSON.parse(readFileSync(join(root, "upstream.lock.json"), "utf8")) as { repo: string; commit: string };
  const head = execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== lock.commit) {
    console.error(`upstream checkout is at ${head}, upstream.lock.json pins ${lock.commit}.`);
    console.error("Check out the pinned commit, or bump the lock after the conformance run passes.");
    process.exit(2);
  }
  let privateKey;
  if (process.argv.includes("--dev-key")) {
    privateKey = generateKeyPairSync("ed25519").privateKey;
    console.error("signing with a throwaway key: the apps will not accept this feed");
  } else {
    const keyPath = arg("--key") ?? process.env.KANTV_FEED_KEY_FILE;
    if (!keyPath) {
      console.error("pass --key <ed25519 private key PEM> (or KANTV_FEED_KEY_FILE), or --dev-key for a local build");
      process.exit(2);
    }
    privateKey = createPrivateKey(readFileSync(keyPath));
  }
  const overrides = JSON.parse(readFileSync(join(root, "lists", "overrides.json"), "utf8")) as Overrides;
  for (const name of Object.keys(overrides.models))
    if (!existsSync(join(upstream, "examples", name))) console.error(`warning: lists/overrides.json names ${name}, which upstream no longer has`);
  const feed = buildFeed(upstream, { repo: lock.repo, commit: lock.commit }, overrides);
  const bytes = Buffer.from(JSON.stringify(feed));
  const out = resolve(arg("--out") ?? join(root, "dist"));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "feed.json"), bytes);
  writeFileSync(join(out, "feed.json.sig"), sign(null, bytes, privateKey));
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  writeFileSync(join(out, "feed.pub"), spki.subarray(spki.length - 32));
  const lists = feed.models.reduce((n, m) => n + m.lists.length, 0);
  const kept = feed.models.flatMap((m) => m.lists).filter((l) => l.kept.length).length;
  console.log(`${feed.models.length} models, ${lists} lists, ${feed.rejected.length} rejected, ${kept} lists had a must-keep entry removed`);
  for (const r of feed.rejected) console.log(`  rejected ${r.id}: ${r.reason}`);
  console.log(`wrote ${out}/feed.json (${bytes.length} bytes), feed.json.sig, feed.pub`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
