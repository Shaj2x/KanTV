// What upstream has no counterpart for, or what is easier to pin down directly: list parsing, KanTV's
// must-keep overlay, the read-back, first-record-wins, the launcher handover and its rollback, the feed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KANTV_LAUNCHER,
  applyDisable,
  findStockLauncher,
  handOverHome,
  parseList,
  restoreCommands,
  runDebloat,
  validateList,
  verifyFeed,
  type RecordStore,
  type RecoveryRecord,
} from "../src/index.ts";
import { FakeTvShell, type FakeTvState } from "../../../testing/fake-tv/shell.ts";

const TVL = "com.google.android.tvlauncher";
const GTV = "com.google.android.apps.tv.launcherx";
const SETUP = "com.google.android.tungsten.setupwraith";

function tv(state: Partial<FakeTvState>): FakeTvShell {
  const dir = mkdtempSync(join(tmpdir(), "kantv-test-"));
  return FakeTvShell.create(join(dir, "tv.json"), {
    installed: [TVL, "com.android.tv.settings", "com.vendor.ads", "com.vendor.telemetry"],
    claims: [`${TVL}/.MainActivity`],
    settings_activity: ["com.android.tv.settings/.MainSettings"],
    wifi: "cname=android.uid.system:1000 ",
    ...state,
  });
}

function memoryStore(): RecordStore & { records: Map<string, RecoveryRecord> } {
  const records = new Map<string, RecoveryRecord>();
  return {
    records,
    get: async (t, l) => records.get(`${t}|${l}`) ?? null,
    put: async (t, l, r) => void records.set(`${t}|${l}`, structuredClone(r)),
  };
}

describe("lists", () => {
  it("reads BOM, CRLF, comments and the header the way disable.sh does", () => {
    const parsed = parseList("﻿# Model X\r\n# Undo: restore\r\n\r\ncom.vendor.ads   # ad service\r\n  com.vendor.telemetry\r\n# later comment\r\n");
    expect(parsed.header).toEqual(["Model X", "Undo: restore"]);
    expect(parsed.entries.map((e) => [e.name, e.comment])).toEqual([
      ["com.vendor.ads", "ad service"],
      ["com.vendor.telemetry", ""],
    ]);
  });

  it("refuses a whole list over one bad name or one core package", () => {
    const bad = validateList(parseList("com.vendor.ads\ncom.x;reboot\n"));
    expect(bad).toEqual({ ok: false, refusal: { kind: "not-a-package", names: ["com.x;reboot"] } });
    const core = validateList(parseList("com.vendor.ads\nandroid.ext.services\n"));
    expect(core).toEqual({ ok: false, refusal: { kind: "core", names: ["android.ext.services"] } });
    expect(validateList(parseList("# only comments\n"))).toEqual({ ok: false, refusal: { kind: "empty" } });
  });

  it("keeps the phone-remote service whatever the list says", () => {
    const v = validateList(parseList("com.google.android.tv.remote.service\ncom.vendor.ads\n"));
    expect(v.ok && v.packages).toEqual(["com.vendor.ads"]);
    expect(v.ok && v.kept.map((k) => k.name)).toEqual(["com.google.android.tv.remote.service"]);
  });
});

describe("debloat run", () => {
  it("stores the record before the first change, and a retry keeps the first one", async () => {
    const shell = tv({ disabled: ["com.vendor.telemetry"] });
    const store = memoryStore();
    const first = await runDebloat(shell, store, { tvId: "t", listId: "l", packages: ["com.vendor.ads", "com.vendor.telemetry"] });
    expect(first.ok).toBe(true);
    const record = store.records.get("t|l")!;
    expect(record.packages).toEqual({ "com.vendor.ads": "enabled", "com.vendor.telemetry": "disabled", [TVL]: "enabled" });
    // The second run sees a cleaned TV; the record must still describe the TV before cleanup.
    await runDebloat(shell, store, { tvId: "t", listId: "l", packages: ["com.vendor.ads"] });
    expect(store.records.get("t|l")!.packages["com.vendor.ads"]).toBe("enabled");
    // Restore enables only what was on before: the factory-disabled package stays off.
    const cmds = restoreCommands(store.records.get("t|l")!, ["com.vendor.ads", "com.vendor.telemetry"], TVL);
    expect(cmds).toContain("pm enable com.vendor.ads");
    expect(cmds).not.toContain("pm enable com.vendor.telemetry");
  });

  it("stops with the TV untouched when the record cannot be stored", async () => {
    const shell = tv({});
    const store = memoryStore();
    store.put = async () => {
      throw new Error("disk full");
    };
    await expect(runDebloat(shell, store, { tvId: "t", listId: "l", packages: ["com.vendor.ads"] })).rejects.toThrow("disk full");
    expect(shell.state().disabled ?? []).toEqual([]);
  });

  it("reads the TV back and reports a package the firmware refused", async () => {
    const shell = tv({ refuse_disable: ["com.vendor.telemetry"] });
    const r = await applyDisable(shell, ["com.vendor.ads", "com.vendor.telemetry"]);
    expect(r).toEqual({ disabled: ["com.vendor.ads"], stillOn: ["com.vendor.telemetry"], notSent: [], unverified: false });
  });

  it("sends one pm command per shell call", async () => {
    const shell = tv({});
    await applyDisable(shell, ["com.vendor.ads", "com.vendor.telemetry"]);
    expect(shell.sent.filter((c) => c.startsWith("pm disable-user"))).toEqual([
      "pm disable-user --user 0 com.vendor.ads",
      "pm disable-user --user 0 com.vendor.telemetry",
    ]);
  });
});

describe("launcher handover", () => {
  const kantv = {
    install_package: KANTV_LAUNCHER,
    install_claims: [`${KANTV_LAUNCHER}/.MainActivity`],
  };
  const options = (stock: string | null) => ({
    launcher: KANTV_LAUNCHER,
    activity: `${KANTV_LAUNCHER}/.MainActivity`,
    apkOnTv: "/data/local/tmp/kantv.apk",
    stock,
  });

  it("makes KanTV Home and disables the stock launcher", async () => {
    const shell = tv({ ...kantv, home_default: `${TVL}/.MainActivity` });
    expect(await findStockLauncher(shell, KANTV_LAUNCHER)).toEqual({ kind: "stock", package: TVL });
    const r = await handOverHome(shell, options(TVL));
    expect(r.ok).toBe(true);
    expect(shell.state().disabled).toContain(TVL);
  });

  it("leaves the stock launcher alone when the install fails", async () => {
    const shell = tv({ ...kantv, install_result: "Failure [INSTALL_FAILED_OLDER_SDK]" });
    const r = await handOverHome(shell, options(TVL));
    expect(r).toMatchObject({ ok: false, stage: "older-sdk" });
    expect(shell.state().disabled ?? []).not.toContain(TVL);
  });

  it("leaves the stock launcher alone when KanTV does not start", async () => {
    const shell = tv({ ...kantv, start_fails: true });
    const r = await handOverHome(shell, options(TVL));
    expect(r).toMatchObject({ ok: false, stage: "start" });
    expect(shell.state().disabled ?? []).not.toContain(TVL);
  });

  it("rolls back when Google TV's setupwraith takes Home", async () => {
    const shell = tv({
      ...kantv,
      installed: [GTV, SETUP, "com.android.tv.settings"],
      claims: [`${GTV}/.MainActivity`, `${SETUP}/.RecoveryActivity`],
      priority: { [`${SETUP}/.RecoveryActivity`]: 1 },
      home_default: `${GTV}/.MainActivity`,
      set_home_lies: true,
    });
    const r = await handOverHome(shell, options(GTV));
    expect(r).toMatchObject({ ok: false, stage: "home-not-ours", rolledBack: true });
    expect(shell.state().disabled ?? []).not.toContain(GTV);
  });

  it("rolls back when Home resolves to KanTV but something else has focus", async () => {
    const shell = tv({ ...kantv, focused_override: SETUP });
    const r = await handOverHome(shell, options(TVL));
    expect(r).toMatchObject({ ok: false, stage: "focus-not-ours", rolledBack: true });
    expect(shell.state().disabled ?? []).not.toContain(TVL);
  });

  it("refuses to guess when Home belongs to an unknown launcher", async () => {
    const shell = tv({ installed: ["com.other.launcher"], claims: ["com.other.launcher/.Main"] });
    expect(await findStockLauncher(shell, KANTV_LAUNCHER)).toMatchObject({ kind: "error", why: "unknown-home" });
  });
});

describe("restore", () => {
  it("treats KanTV's launcher like upstream's own when the stock launcher was off", () => {
    const record: RecoveryRecord = {
      version: 1,
      created: "",
      host: "t",
      list: "l",
      home: `${KANTV_LAUNCHER}/.MainActivity`,
      settings: {},
      packages: { [KANTV_LAUNCHER]: "enabled", [TVL]: "disabled" },
    };
    expect(restoreCommands(record, [], TVL)).toContain(`cmd package set-home-activity --user 0 ${KANTV_LAUNCHER}/.MainActivity`);
  });
});

describe("list feed", () => {
  it("accepts the exact signed bytes and nothing else", async () => {
    const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, upstream: {}, generated: "", models: [], rejected: [] }));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, bytes));
    await expect(verifyFeed(bytes, sig, pub)).resolves.toMatchObject({ version: 1 });
    const tampered = bytes.slice();
    tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 1;
    await expect(verifyFeed(tampered, sig, pub)).rejects.toThrow("does not verify");
  });
});
