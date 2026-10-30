// The feed built from the pinned upstream checkout: every list passes the apps' own validation, no core
// package and no must-keep package can reach a TV, the signature verifies, and real getprop answers find
// the right list. Skipped when there is no upstream checkout next to this repo (set UPSTREAM_DIR).
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KANTV_MUST_KEEP, isCore, matchModels, validateList, verifyFeed } from "../../packages/core/src/index.ts";
import { buildFeed } from "./build.ts";

const root = resolve(import.meta.dirname, "../..");
const upstream = resolve(process.env.UPSTREAM_DIR ?? join(root, "../cleanyourtv"));
const lock = JSON.parse(readFileSync(join(root, "upstream.lock.json"), "utf8"));
const overrides = JSON.parse(readFileSync(join(root, "lists/overrides.json"), "utf8"));

describe.skipIf(!existsSync(join(upstream, "examples")))("list feed from upstream", () => {
  const feed = buildFeed(upstream, lock, overrides);
  const lists = feed.models.flatMap((m) => m.lists);

  it("carries every upstream list, and nothing a TV must keep", () => {
    expect(feed.models.length).toBeGreaterThan(300);
    expect(feed.rejected).toEqual([]);
    for (const l of lists) {
      const names = l.packages.map((p) => p.name);
      expect(names.filter(isCore)).toEqual([]);
      expect(names.filter((n) => KANTV_MUST_KEEP.has(n))).toEqual([]);
      const again = validateList({ entries: names.map((name, i) => ({ name, comment: "", line: i })), header: [] });
      expect(again.ok).toBe(true);
    }
  });

  it("marks Fire OS and the launcher-gated sets as debloat only", () => {
    const debloatOnly = feed.models.filter((m) => m.launcher === "unsupported").map((m) => m.folder);
    expect(debloatOnly).toContain("tcl-q10g-pro");
    expect(debloatOnly).toContain("hisense-fire-tv-55qd6qf");
    expect(feed.models.find((m) => m.folder === "google-chromecast-gtv-4k")!.launcher).toBe("supported");
  });

  it("is accepted with its signature and refused when one byte changes", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const bytes = new Uint8Array(Buffer.from(JSON.stringify(feed)));
    const sig = new Uint8Array(sign(null, bytes, privateKey));
    const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
    const pub = new Uint8Array(spki.subarray(spki.length - 32));
    expect((await verifyFeed(bytes, sig, pub)).models.length).toBe(feed.models.length);
    bytes[100] = bytes[100]! ^ 1;
    await expect(verifyFeed(bytes, sig, pub)).rejects.toThrow();
  });

  it("finds a Chromecast with Google TV 4K from its getprop answers", () => {
    const top = matchModels(
      { model: "Chromecast", device: "sabrina", name: "sabrina", brand: "google", manufacturer: "Google", fingerprint: "google/sabrina/sabrina:14/UTTC.250917.004/14193937:user/release-keys" },
      feed.models,
    );
    expect(top[0]!.item.folder).toBe("google-chromecast-gtv-4k");
  });

  it("finds a Beko by its device codename", () => {
    const top = matchModels({ model: "B43B880B", device: "sinchon", manufacturer: "ARCELIK", brand: "Beko" }, feed.models);
    expect(top[0]!.item.folder).toBe("beko-b43b880b");
  });

  it("offers every list of a shared TCL board instead of guessing", () => {
    const top = matchModels(
      { model: "Smart TV Pro", device: "G08", name: "G08_4K_GB", manufacturer: "TCL", brand: "TCL", fingerprint: "TCL/G08_4K_GB/G08:14/UTT2.250416.001/AU04:user/release-keys" },
      feed.models,
    );
    const folders = top.map((r) => r.item.folder);
    expect(folders.length).toBeGreaterThan(1);
    expect(folders).toContain("tcl-c845x2-google-tv");
  });

  it("finds nothing for a TV no list was made on", () => {
    expect(matchModels({ model: "ZX-9000", device: "nowhere", brand: "acme", fingerprint: "acme/nowhere/nowhere:12/ABCD.000000.000" }, feed.models)).toEqual([]);
  });
});
