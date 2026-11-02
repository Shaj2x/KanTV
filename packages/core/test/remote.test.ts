// The phone remote's protocol, byte for byte against androidtvremote2 (the implementation Home Assistant uses
// with real Android TVs): what the phone sends, how it reads what the TV sends, and the pairing secret over
// real certificates. The TLS itself is the native layer's. Needs testing/venv; skipped without it.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FrameReader,
  PairingError,
  TvRemote,
  appLinkMessage,
  configureReply,
  frame,
  keyMessage,
  pairingConfiguration,
  pairingOptions,
  pairingRequest,
  pairingSecret,
  pairingSecretFor,
  pingResponse,
  rsaKeyFromCertificate,
  setActiveReply,
  startPairing,
  textMessage,
  type TlsTransport,
} from "../src/index.ts";
import { VENV_PYTHON, hasVenv } from "../../../testing/fake-tv/node-adb.ts";

const fx = hasVenv
  ? JSON.parse(execFileSync(VENV_PYTHON, [join(import.meta.dirname, "../../../testing/fake-tv/remote_fixtures.py")], { encoding: "utf8" }))
  : null;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

/** A transport fed by a script: each write the phone makes is answered with the next TV message, if any. */
function scripted(answers: Record<number, string[]>) {
  const written: Uint8Array[] = [];
  const inbox: (Uint8Array | null)[] = [];
  let wake: (() => void) | null = null;
  const t = {
    written,
    feed(h: string | null) {
      inbox.push(h === null ? null : frame(bytes(h)));
      wake?.();
    },
    async write(b: Uint8Array) {
      written.push(b);
      for (const a of answers[written.length] ?? []) t.feed(a);
    },
    async read() {
      while (!inbox.length) await new Promise<void>((r) => (wake = r));
      return inbox.shift()!;
    },
    close() {},
  };
  return t;
}
const unframe = (b: Uint8Array) => hex(new FrameReader().push(b)[0]!);

describe.skipIf(!hasVenv)("what the phone sends", () => {
  it("pairing messages match", () => {
    expect(hex(pairingRequest("KanTV"))).toBe(fx.phone.pairingRequest);
    expect(hex(pairingOptions())).toBe(fx.phone.options);
    expect(hex(pairingConfiguration())).toBe(fx.phone.configuration);
    expect(hex(pairingSecret(new Uint8Array(32).map((_, i) => i)))).toBe(fx.phone.secret);
  });

  it("remote messages match, zero values left out as proto3 does", () => {
    expect(hex(configureReply(615))).toBe(fx.phone.configure615);
    expect(hex(setActiveReply(615))).toBe(fx.phone.setActive615);
    expect(hex(pingResponse(7))).toBe(fx.phone.pong7);
    expect(hex(pingResponse(0))).toBe(fx.phone.pong0);
    expect(hex(keyMessage(19, 3))).toBe(fx.phone.keyUp);
    expect(hex(appLinkMessage("https://www.netflix.com/title"))).toBe(fx.phone.appLink);
    expect(hex(textMessage("hello", 3, 7))).toBe(fx.phone.textHello);
    expect(hex(textMessage("x", 0, 0))).toBe(fx.phone.textXZero);
  });
});

describe.skipIf(!hasVenv)("pairing", () => {
  it("reads the RSA keys out of real certificates", () => {
    const p = fx.pairing;
    expect(rsaKeyFromCertificate(bytes(p.clientCertDer))).toEqual({ modulus: BigInt("0x" + p.clientModulus), exponent: BigInt(p.clientExponent) });
    expect(rsaKeyFromCertificate(bytes(p.serverCertDer))).toEqual({ modulus: BigInt("0x" + p.serverModulus), exponent: BigInt(p.serverExponent) });
  });

  it("computes the same secret, and catches a mistyped code before sending it", async () => {
    const p = fx.pairing;
    const client = rsaKeyFromCertificate(bytes(p.clientCertDer));
    const server = rsaKeyFromCertificate(bytes(p.serverCertDer));
    expect(hex(await pairingSecretFor(client, server, p.code))).toBe(p.secret);
    expect(hex(await pairingSecretFor(client, server, p.code.toLowerCase()))).toBe(p.secret);
    const wrongFirst = ((parseInt(p.code.slice(0, 2), 16) + 1) % 256).toString(16).padStart(2, "0") + p.code.slice(2);
    await expect(pairingSecretFor(client, server, wrongFirst)).rejects.toMatchObject({ kind: "wrong-code" });
    await expect(pairingSecretFor(client, server, "12345")).rejects.toBeInstanceOf(PairingError);
  });

  function pairingTv(secretAnswer: string) {
    const p = fx.pairing;
    const t = scripted({ 1: [fx.tv.pairingRequestAck], 2: [fx.tv.options], 3: [fx.tv.configurationAck], 4: [secretAnswer] });
    const tls: TlsTransport = {
      ...t,
      clientKey: rsaKeyFromCertificate(bytes(p.clientCertDer)),
      serverKey: () => rsaKeyFromCertificate(bytes(p.serverCertDer)),
    };
    return { t, tls };
  }

  it("walks request, options, configuration, then the code", async () => {
    const { t, tls } = pairingTv(fx.tv.secretAck);
    const pairing = await startPairing(tls, "KanTV");
    expect(t.written.map(unframe)).toEqual([fx.phone.pairingRequest, fx.phone.options, fx.phone.configuration]);
    await pairing.finish(fx.pairing.code);
    expect(unframe(t.written[3]!)).toContain(fx.pairing.secret);
  });

  it("says so when the TV refuses the code", async () => {
    const { tls } = pairingTv(fx.tv.badSecret);
    const pairing = await startPairing(tls, "KanTV");
    await expect(pairing.finish(fx.pairing.code)).rejects.toMatchObject({ kind: "wrong-code" });
  });
});

describe.skipIf(!hasVenv)("the remote session", () => {
  it("answers the TV's handshake and pings, then follows its state", async () => {
    const t = scripted({});
    const remote = new TvRemote(t);
    const done = remote.run();
    for (const m of [fx.tv.configure, fx.tv.setActive, fx.tv.ping7, fx.tv.start, fx.tv.imeCounters, fx.tv.currentApp, fx.tv.volume]) t.feed(m);
    t.feed(null);
    await done;
    // The TV offered 1023; we keep what we use: ping, key, IME, power, volume, app links = 615.
    expect(t.written.map(unframe)).toEqual([fx.phone.configure615, fx.phone.setActive615, fx.phone.pong7]);
    expect(remote.state).toEqual({
      started: true,
      on: true,
      features: 615,
      device: { model: "Chromecast", vendor: "Google" },
      volume: { level: 23, max: 100, muted: false },
      currentApp: "com.netflix.ninja",
    });
    await remote.text("hello");
    expect(unframe(t.written[3]!)).toBe(fx.phone.textHello);
    await remote.key("UP");
    expect(unframe(t.written[4]!)).toBe(fx.phone.keyUp);
  });

  it("reassembles messages split anywhere, even inside the length", () => {
    const all = new Uint8Array([...frame(bytes(fx.tv.configure)), ...frame(bytes(fx.tv.ping7))]);
    const r = new FrameReader();
    const got: string[] = [];
    for (const b of all) for (const m of r.push(new Uint8Array([b]))) got.push(hex(m));
    expect(got).toEqual([fx.tv.configure, fx.tv.ping7]);
  });
});
