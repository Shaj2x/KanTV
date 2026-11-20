// KanTV Connect's own parts: the remote from the computer (TLS, pairing with the code on the TV, then keys)
// against a fake TV speaking the protocol's real bytes, and the SHA-256 the app uses on plain-http pages.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type TLSSocket } from "node:tls";
import { describe, expect, it } from "vitest";
import { FrameReader, KEY, frame, keyMessage, pairingSecretFor, rsaKeyFromCertificate } from "@kantv/core";
import { sha256 } from "../../mobile/src/platform/sha256.ts";
import { openRemote, remoteIdentity } from "../src/remote.ts";
import { VENV_PYTHON, hasVenv } from "../../../testing/fake-tv/node-adb.ts";

const fx = hasVenv
  ? JSON.parse(execFileSync(VENV_PYTHON, [join(import.meta.dirname, "../../../testing/fake-tv/remote_fixtures.py")], { encoding: "utf8" }))
  : null;
const bytes = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("sha256 for plain-http pages", () => {
  it("matches Node's for empty, short, block-edge and long input", () => {
    for (const n of [0, 3, 55, 56, 63, 64, 65, 1000]) {
      const data = new Uint8Array(n).map((_, i) => (i * 7 + 3) & 255);
      expect(hex(sha256(data))).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});

/** A TV: pairing on one port, the remote on another; it only opens the remote for a certificate it paired. */
async function fakeTv() {
  const tvId = remoteIdentity(join(mkdtempSync(join(tmpdir(), "kantv-tv-")), "tv.json"));
  const paired = new Set<string>();
  const received: string[] = [];
  let shownCode = "";
  const opts = { key: tvId.keyPem, cert: tvId.certPem, requestCert: true, rejectUnauthorized: false };
  const fingerprint = (s: TLSSocket) => s.getPeerCertificate().fingerprint256;

  const pairing = createServer(opts, (s) => {
    const reader = new FrameReader();
    let n = 0;
    s.on("data", async (d: Buffer) => {
      for (const m of reader.push(new Uint8Array(d))) {
        n++;
        if (n === 1) s.write(frame(bytes(fx.tv.pairingRequestAck)));
        if (n === 2) s.write(frame(bytes(fx.tv.options)));
        if (n === 3) {
          // The TV shows a code whose first byte checks the rest against both certificates.
          const client = rsaKeyFromCertificate(new Uint8Array(s.getPeerCertificate().raw));
          const server = tvId.publicKey;
          for (let b = 0; b < 256 && !shownCode; b++) {
            const code = b.toString(16).padStart(2, "0").toUpperCase() + "A1B2";
            await pairingSecretFor(client, server, code).then(() => (shownCode = code), () => undefined);
          }
          s.write(frame(bytes(fx.tv.configurationAck)));
        }
        if (n === 4) {
          const client = rsaKeyFromCertificate(new Uint8Array(s.getPeerCertificate().raw));
          const secret = await pairingSecretFor(client, tvId.publicKey, shownCode);
          if (hex(m).includes(hex(secret))) {
            paired.add(fingerprint(s));
            s.write(frame(bytes(fx.tv.secretAck)));
          } else s.write(frame(bytes(fx.tv.badSecret)));
        }
      }
    });
    s.on("error", () => undefined);
  });

  const remote = createServer(opts, (s) => {
    s.on("error", () => undefined);
    if (!paired.has(fingerprint(s))) return void s.end();
    const reader = new FrameReader();
    s.on("data", (d: Buffer) => reader.push(new Uint8Array(d)).forEach((m) => received.push(hex(m))));
    s.write(frame(bytes(fx.tv.configure)));
  });

  const listen = (srv: ReturnType<typeof createServer>) => new Promise<number>((r) => srv.listen(0, "127.0.0.1", () => r((srv.address() as { port: number }).port)));
  const ports = { pairing: await listen(pairing), remote: await listen(remote) };
  return { ports, received, code: () => shownCode, close: () => (pairing.close(), remote.close()) };
}

describe.skipIf(!hasVenv)("the remote from KanTV Connect", () => {
  it("pairs with the code on the TV, then sends keys; the second time needs no code", async () => {
    const tv = await fakeTv();
    const me = remoteIdentity(join(mkdtempSync(join(tmpdir(), "kantv-me-")), "remote.json"));
    let asked = 0;
    const r = await openRemote("127.0.0.1", me, async () => (asked++, tv.code()), tv.ports);
    expect(asked).toBe(1);
    await r.key("UP");
    await new Promise((res) => setTimeout(res, 200));
    expect(tv.received).toContain(hex(keyMessage(KEY.UP)));
    r.close();

    const again = await openRemote("127.0.0.1", me, async () => (asked++, tv.code()), tv.ports);
    expect(asked).toBe(1);
    again.close();
    tv.close();
  });

  it("says so when the code is wrong", async () => {
    const tv = await fakeTv();
    const me = remoteIdentity(join(mkdtempSync(join(tmpdir(), "kantv-me-")), "remote.json"));
    const wrong = async () => {
      const c = tv.code();
      return ((parseInt(c.slice(0, 2), 16) + 1) % 256).toString(16).padStart(2, "0") + c.slice(2);
    };
    await expect(openRemote("127.0.0.1", me, wrong, tv.ports)).rejects.toMatchObject({ kind: "wrong-code" });
    tv.close();
  });
});
