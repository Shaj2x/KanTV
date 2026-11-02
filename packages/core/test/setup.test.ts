// Setup's first and last steps: who the TV is, what to ask before cleaning it, and closing ADB with proof.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdbConnection,
  AdbTvShell,
  applyAnswers,
  householdIds,
  isThisDevice,
  questionsFor,
  readIdentity,
  switchDebuggingOff,
  verifyAdbClosed,
  type Feed,
  type PortProber,
} from "../src/index.ts";
import { FakeTvShell } from "../../../testing/fake-tv/shell.ts";
import { hasVenv, lanAddress, nodeKey, nodeProber, startAdbd, tcpTransport } from "../../../testing/fake-tv/node-adb.ts";
import { buildFeed } from "../../../scripts/lists/build.ts";

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((s) => s()));

const dir = () => mkdtempSync(join(tmpdir(), "kantv-setup-"));
const chromecast = {
  installed: ["com.google.android.apps.tv.launcherx"],
  props: {
    "ro.product.model": "Chromecast",
    "ro.product.device": "sabrina",
    "ro.product.manufacturer": "Google",
    "ro.serialno": "16301HFDD2V7XQ",
  },
  sdk: 34,
  adb_secure: "1",
  settings: {},
};

describe("identity", () => {
  it("reads the props and the identifiers in one round trip", async () => {
    const shell = FakeTvShell.create(join(dir(), "tv.json"), chromecast);
    const id = await readIdentity(shell);
    expect(shell.sent).toHaveLength(1);
    expect(id.props).toMatchObject({ model: "Chromecast", device: "sabrina", manufacturer: "Google" });
    expect(id).toMatchObject({ serial: "16301HFDD2V7XQ", sdk: 34, adbSecure: "1" });
  });

  it("sends hashes, never the serial, and leans on the Android ID when the serial is junk", async () => {
    const base = { props: { model: "X1", manufacturer: "Acme" }, sdk: 30, adbSecure: "1" };
    const strong = await householdIds({ ...base, serial: "16301HFDD2V7XQ", androidId: "4f2a9c01b7e3d562" });
    expect(strong.strength).toBe("strong");
    expect(strong.serial).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(strong)).not.toContain("16301");
    const junk = await householdIds({ ...base, serial: "0123456789ABCDEF", androidId: "4f2a9c01b7e3d562" });
    expect(junk).toEqual({ androidId: strong.androidId, strength: "partial" });
    // The same serial on another model is another household.
    const other = await householdIds({ ...base, props: { model: "X2", manufacturer: "Acme" }, serial: "16301HFDD2V7XQ", androidId: "" });
    expect(other.serial).not.toBe(strong.serial);
  });
});

const upstream = resolve(import.meta.dirname, "../../../../cleanyourtv");
describe.skipIf(!existsSync(join(upstream, "examples")))("questions from the list", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const feed: Feed = buildFeed(
    upstream,
    JSON.parse(readFileSync(join(root, "upstream.lock.json"), "utf8")),
    JSON.parse(readFileSync(join(root, "lists/overrides.json"), "utf8")),
  );
  const model = (folder: string) => feed.models.find((m) => m.folder === folder)!;

  it("asks a Chromecast owner about casting, and keeping it means the cast-keeping list and the stock home", () => {
    const cc = model("google-chromecast-gtv-4k");
    const main = cc.lists.find((l) => l.file === "debloat.txt")!;
    expect(questionsFor(cc, main).map((q) => q.id)).toContain("casting");
    const kept = applyAnswers(cc, main, { casting: true });
    expect(kept).toMatchObject({ launcher: "none", useList: "google-chromecast-gtv-4k/debloat-keep-cast.txt" });
    expect(kept.packages).not.toContain("com.google.android.tungsten.setupwraith");
    expect(applyAnswers(cc, main, { casting: false }).launcher).toBe("replace-stock");
  });

  it("keeps a CVTE board's stock launcher enabled, and never offers a launcher on Fire OS", () => {
    const cvte = feed.models.find((m) => m.lists.some((l) => l.flags.includes("cvte-keep-stock-launcher")) && m.launcher === "supported")!;
    const list = cvte.lists.find((l) => l.flags.includes("cvte-keep-stock-launcher"))!;
    expect(applyAnswers(cvte, list, {}).launcher).toBe("keep-stock-enabled");
    const fire = model("amazon-fire-tv-stick-4k-2023");
    expect(applyAnswers(fire, fire.lists[0]!, {}).launcher).toBe("none");
  });

  it("drops what the user unticks", () => {
    const cc = model("google-chromecast-gtv-4k");
    const main = cc.lists.find((l) => l.file === "debloat.txt")!;
    const first = main.packages[0]!.name;
    expect(applyAnswers(cc, main, { casting: false }, [first]).packages).not.toContain(first);
  });
});

describe("is ADB closed?", () => {
  const prober = (answers: Record<number, Awaited<ReturnType<PortProber["probe"]>>>): PortProber => ({
    probe: async (_h, port) => answers[port] ?? "no-answer",
  });

  it("says closed only when every port refuses", async () => {
    expect((await verifyAdbClosed(prober({ 5555: "refused", 37121: "refused" }), "192.168.1.50", [5555, 37121])).verdict).toBe("closed");
    expect((await verifyAdbClosed(prober({ 5555: "refused", 37121: "open" }), "192.168.1.50", [5555, 37121])).verdict).toBe("open");
    expect((await verifyAdbClosed(prober({ 5555: "refused" }), "192.168.1.50", [5555, 37121])).verdict).toBe("unknown");
    expect((await verifyAdbClosed(prober({ 5555: "unreachable" }), "192.168.1.50", [5555])).verdict).toBe("unknown");
  });

  it("never trusts a refusal from this device", async () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "0.0.0.0", "127.1.2.3"]) expect(isThisDevice(h)).toBe(true);
    expect((await verifyAdbClosed(prober({ 5555: "refused" }), "127.0.0.1", [5555])).verdict).toBe("unknown");
  });

  const host = lanAddress();
  it.skipIf(!hasVenv || !host)("switches debugging off from the shell and proves the port refuses", async () => {
    const d = dir();
    const statePath = join(d, "tv.json");
    writeFileSync(statePath, JSON.stringify(chromecast));
    const adbd = await startAdbd(statePath, join(d, "adb_keys"), { host });
    stops.push(adbd.stop);
    expect((await verifyAdbClosed(nodeProber, host!, [adbd.port])).verdict).toBe("open");
    const t = await tcpTransport(adbd.port, host);
    stops.push(t.close);
    const shell = new AdbTvShell(await AdbConnection.connect(t, nodeKey(), { keyName: "test", timeoutMs: 5000 }));
    await switchDebuggingOff(shell);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.settings).toMatchObject({ adb_wifi_enabled: "0", adb_enabled: "0" });
    // adbd may answer the last command before it stops; either way nothing gets through after it.
    expect(await shell.run("echo still here")).toEqual({ ok: false, out: "" });
    expect((await verifyAdbClosed(nodeProber, host!, [adbd.port])).verdict).toBe("closed");
  });
});
