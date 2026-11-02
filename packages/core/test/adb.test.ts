// The ADB client: byte-for-byte against adb-shell 0.4.4 (the client upstream cleanyourtv drives real TVs with),
// every way connecting can go, and the Phase 0 safety engine running over ADB with the same decisions as on
// the direct fake. Needs testing/venv (see testing/README.md); skipped without it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  A_CNXN,
  A_VERSION_MIN,
  AdbConnection,
  AdbError,
  AdbTvShell,
  encodeMessage,
  planDisable,
  publicKeyLine,
  utf8,
} from "../src/index.ts";
import { handwritten } from "../../../conformance/scenarios.ts";
import { FakeTvShell, type FakeTvState } from "../../../testing/fake-tv/shell.ts";
import { VENV_PYTHON, hasVenv, keyFromPem, nodeKey, startAdbd, tcpTransport, type FakeAdbd } from "../../../testing/fake-tv/node-adb.ts";

const py = (script: string, ...args: string[]) => execFileSync(VENV_PYTHON, ["-c", script, ...args], { encoding: "utf8" });

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((s) => s()));

function tvState(state: FakeTvState): { dir: string; statePath: string } {
  const dir = mkdtempSync(join(tmpdir(), "kantv-adb-"));
  const statePath = join(dir, "tv.json");
  writeFileSync(statePath, JSON.stringify(state));
  return { dir, statePath };
}

async function adbd(state: FakeTvState, o: Parameters<typeof startAdbd>[2] = {}): Promise<FakeAdbd & { statePath: string }> {
  const { dir, statePath } = tvState(state);
  const d = await startAdbd(statePath, join(dir, "adb_keys"), o);
  stops.push(d.stop);
  return { ...d, statePath };
}

async function open(port: number, key = nodeKey(), extra: Partial<Parameters<typeof AdbConnection.connect>[2]> = {}) {
  const t = await tcpTransport(port);
  stops.push(t.close);
  return AdbConnection.connect(t, key, { keyName: "KanTV test", timeoutMs: 5000, ...extra });
}

const TV: FakeTvState = { installed: ["com.google.android.tvlauncher", "com.vendor.ads"], props: { "ro.product.model": "Chromecast", "ro.product.device": "sabrina" } };

describe.skipIf(!hasVenv)("ADB, byte for byte with adb-shell", () => {
  it("encodes the public key the way adb-shell writes adbkey.pub", () => {
    const dir = mkdtempSync(join(tmpdir(), "kantv-key-"));
    py("import sys; from adb_shell.auth.keygen import keygen; keygen(sys.argv[1])", join(dir, "adbkey"));
    const theirs = readFileSync(join(dir, "adbkey.pub"), "utf8").split(" ")[0];
    const ours = publicKeyLine(keyFromPem(readFileSync(join(dir, "adbkey"), "utf8")), "x").split(" ")[0];
    expect(ours).toBe(theirs);
  });

  it("signs a token exactly as adb-shell's signer does", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kantv-key-"));
    py("import sys; from adb_shell.auth.keygen import keygen; keygen(sys.argv[1])", join(dir, "adbkey"));
    const token = new Uint8Array(20).map((_, i) => (i * 37 + 11) & 0xff);
    const theirs = py(
      "import sys; from adb_shell.auth.sign_pythonrsa import PythonRSASigner as S; k=sys.argv[1];" +
        "print(S(open(k+'.pub').read(), open(k).read()).Sign(bytes.fromhex(sys.argv[2])).hex())",
      join(dir, "adbkey"),
      Buffer.from(token).toString("hex"),
    ).trim();
    const ours = Buffer.from(await keyFromPem(readFileSync(join(dir, "adbkey"), "utf8")).sign(token)).toString("hex");
    expect(ours).toBe(theirs);
  });

  it("packs messages exactly as adb-shell does", () => {
    const theirs = py(
      "from adb_shell.adb_message import AdbMessage; from adb_shell import constants as c;" +
        "m=AdbMessage(c.CNXN, c.VERSION, c.MAX_ADB_DATA, b'host::kantv\\0'); print((m.pack()+m.data).hex())",
    ).trim();
    expect(Buffer.from(encodeMessage(A_CNXN, A_VERSION_MIN, 1024 * 1024, utf8("host::kantv\0"))).toString("hex")).toBe(theirs);
  });
});

describe.skipIf(!hasVenv)("connecting", () => {
  it("offers the key once, says the TV is asking, and works after Allow", async () => {
    const d = await adbd(TV, { prompt: "accept" });
    let prompts = 0;
    const key = nodeKey();
    const conn = await open(d.port, key, { onAuthPrompt: () => prompts++ });
    expect(prompts).toBe(1);
    expect(conn.banner.props["ro.product.device"]).toBe("sabrina");
    expect(await conn.shell("pm list packages -e --user 0")).toBe("package:com.google.android.tvlauncher\npackage:com.vendor.ads\n");
    // "Always allow": the next connection signs in without asking.
    let again = 0;
    await open(d.port, key, { onAuthPrompt: () => again++ });
    expect(again).toBe(0);
  });

  it("gives up with auth-timeout when nobody taps Allow", async () => {
    const d = await adbd(TV, { prompt: "ignore" });
    await expect(open(d.port, nodeKey(), { authTimeoutMs: 800 })).rejects.toMatchObject({ kind: "auth-timeout" });
  });

  it("says auth-rejected when the TV asks again after the key was offered", async () => {
    const d = await adbd(TV, { prompt: "reject" });
    await expect(open(d.port)).rejects.toMatchObject({ kind: "auth-rejected" });
  });

  it("works with an old TV's 4 KB messages and checksums", async () => {
    const installed = Array.from({ length: 3000 }, (_, i) => `com.vendor.app${i}`);
    const d = await adbd({ installed }, { version: "0x01000000", maxdata: 4096 });
    const conn = await open(d.port);
    expect(conn.maxPayload).toBe(4096);
    expect((await conn.shell("pm list packages")).split("\n").filter(Boolean)).toHaveLength(3000);
    await expect(conn.shell(`echo ${"x".repeat(5000)}`)).rejects.toMatchObject({ kind: "command-too-long" });
  });

  it("reports a dropped connection as a failed transport, for this and every later command", async () => {
    const d = await adbd({ ...TV, transport_fail: ["dumpsys wifi"] });
    const shell = new AdbTvShell(await open(d.port));
    expect(await shell.run("getprop ro.adb.secure")).toEqual({ ok: true, out: "1\n" });
    expect(await shell.run("dumpsys wifi")).toEqual({ ok: false, out: "" });
    expect(await shell.run("getprop ro.adb.secure")).toEqual({ ok: false, out: "" });
    expect(shell.connection.closed).toBe(true);
  });

  it("throws on a command too long to send, rather than calling it a transport failure", async () => {
    const d = await adbd(TV, { maxdata: 4096 });
    const shell = new AdbTvShell(await open(d.port));
    await expect(shell.run(`echo ${"x".repeat(5000)}`)).rejects.toBeInstanceOf(AdbError);
  });
});

describe.skipIf(!hasVenv)("the safety engine over ADB", () => {
  // Every hand-written incident scenario: the plan over ADB must equal the plan on the direct fake.
  for (const sc of handwritten().filter((s) => !s.list.some((p) => /;/.test(p)))) {
    it(sc.name, async () => {
      const direct = FakeTvShell.create(tvState(sc.tv).statePath, sc.tv);
      const options = {
        forceHome: !!sc.env.FORCE_HOME,
        forceSetupwraith: !!sc.env.FORCE_SETUPWRAITH,
        tvInputAllow: !!sc.env.TVINPUT_ALLOW,
        handlersAllow: !!sc.env.HANDLERS_ALLOW,
      };
      const expected = await planDisable(direct, sc.list, options);
      const d = await adbd(sc.tv, { version: "0x01000000", maxdata: 4096 });
      const actual = await planDisable(new AdbTvShell(await open(d.port)), sc.list, options);
      if (sc.tv.transport_fail) {
        // Over ADB a dropped command takes the connection with it, so later checks fail too: never fewer
        // packages protected than on the direct fake.
        expect(actual.disable.every((p) => expected.disable.includes(p))).toBe(true);
      } else {
        expect(actual).toEqual(expected);
      }
    });
  }
});
