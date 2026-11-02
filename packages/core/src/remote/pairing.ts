// Pairing with the TV's remote service (Android TV Remote protocol v2, port 6467), the way Google's own phone
// remote does: over TLS with the phone's self-signed certificate, the TV shows a 6-character code, and the
// phone proves it saw the code with a hash of both certificates' RSA keys and the code. Once paired, the TV
// accepts that certificate on the remote port (6466) from then on. Message layout: polo.proto (proto2).
import type { ByteTransport } from "../adb/connection.ts";
import { FrameReader, ProtoWriter, decode, frame, get, getBytes, getNum, type ProtoField } from "./proto.ts";

export const PAIRING_PORT = 6467;
export const REMOTE_PORT = 6466;

const STATUS_OK = 200;
const STATUS_BAD_SECRET = 402;
const ROLE_INPUT = 1;
const ENCODING_HEX = 3;
const SYMBOLS = 6;

// OuterMessage fields
const F = { version: 1, status: 2, pairingRequest: 10, pairingRequestAck: 11, options: 20, configuration: 30, configurationAck: 31, secret: 40, secretAck: 41 };

function outer(build: (w: ProtoWriter) => void): Uint8Array {
  const w = new ProtoWriter().uint(F.version, 2).uint(F.status, STATUS_OK);
  build(w);
  return w.finish();
}

export const pairingRequest = (clientName: string) =>
  outer((w) => w.message(F.pairingRequest, (m) => m.string(1, "atvremote").string(2, clientName)));
export const pairingOptions = () =>
  outer((w) =>
    w.message(F.options, (m) => m.message(1, (e) => e.uint(1, ENCODING_HEX).uint(2, SYMBOLS)).uint(3, ROLE_INPUT)),
  );
export const pairingConfiguration = () =>
  outer((w) => w.message(F.configuration, (m) => m.message(1, (e) => e.uint(1, ENCODING_HEX).uint(2, SYMBOLS)).uint(2, ROLE_INPUT)));
export const pairingSecret = (secret: Uint8Array) => outer((w) => w.message(F.secret, (m) => m.bytes(1, secret)));

export interface RsaPublic {
  modulus: bigint;
  exponent: bigint;
}

function hexBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("odd-length hex");
  return new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

/**
 * SHA-256 over the client's modulus and exponent, the server's, and the code's last four hex digits. The
 * code's first two digits must equal the hash's first byte, which is how a mistyped code is caught before it
 * is sent. The encoding follows the reference exactly: the modulus as uppercase hex, the exponent with a "0"
 * in front (so 65537 is 01 00 01).
 */
export async function pairingSecretFor(client: RsaPublic, server: RsaPublic, code: string): Promise<Uint8Array> {
  if (!/^[0-9a-f]{6}$/i.test(code)) throw new PairingError("bad-code", "the code is six letters and digits (0-9, A-F)");
  const parts = [
    hexBytes(client.modulus.toString(16).toUpperCase()),
    hexBytes(`0${client.exponent.toString(16).toUpperCase()}`),
    hexBytes(server.modulus.toString(16).toUpperCase()),
    hexBytes(`0${server.exponent.toString(16).toUpperCase()}`),
    hexBytes(code.slice(2)),
  ];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) all.set(p, (at += p.length) - p.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", all));
  if (hash[0] !== parseInt(code.slice(0, 2), 16)) throw new PairingError("wrong-code", "that is not the code on the TV");
  return hash;
}

export type PairingErrorKind = "bad-code" | "wrong-code" | "rejected" | "closed" | "protocol";
export class PairingError extends Error {
  constructor(
    readonly kind: PairingErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** The TLS transport the native layer gives us, with both certificates' public keys. */
export interface TlsTransport extends ByteTransport {
  /** The phone's certificate key (the one the TV will remember). */
  clientKey: RsaPublic;
  /** The TV's certificate key, from the TLS handshake. */
  serverKey(): RsaPublic;
}

/**
 * Starts pairing; resolves once the TV is showing its code. Then call `finish(code)` with what the user typed.
 */
export async function startPairing(t: TlsTransport, clientName: string): Promise<{ finish(code: string): Promise<void> }> {
  const reader = new FrameReader();
  const pending: ProtoField[][] = [];
  const next = async (): Promise<ProtoField[]> => {
    while (!pending.length) {
      const chunk = await t.read();
      if (chunk === null) throw new PairingError("closed", "the TV closed the pairing connection");
      for (const m of reader.push(chunk)) pending.push(decode(m));
    }
    const msg = pending.shift()!;
    const status = getNum(msg, F.status);
    if (status === STATUS_BAD_SECRET) throw new PairingError("wrong-code", "the TV did not accept the code");
    if (status !== STATUS_OK) throw new PairingError("rejected", `the TV answered with status ${status}`);
    return msg;
  };
  const expect = async (field: number) => {
    const msg = await next();
    if (get(msg, field) === undefined) throw new PairingError("protocol", `expected field ${field} from the TV`);
    return msg;
  };

  await t.write(frame(pairingRequest(clientName)));
  await expect(F.pairingRequestAck);
  await t.write(frame(pairingOptions()));
  await expect(F.options);
  await t.write(frame(pairingConfiguration()));
  await expect(F.configurationAck);
  return {
    async finish(code: string) {
      const secret = await pairingSecretFor(t.clientKey, t.serverKey(), code.trim());
      await t.write(frame(pairingSecret(secret)));
      const ack = await expect(F.secretAck);
      void getBytes(ack, F.secretAck);
      t.close();
    },
  };
}

/**
 * The RSA key in an X.509 certificate (DER), for the native layer to hand over the TV's key. Finds the
 * rsaEncryption algorithm identifier and reads the SEQUENCE { modulus, exponent } in the BIT STRING after it.
 */
export function rsaKeyFromCertificate(der: Uint8Array): RsaPublic {
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  let at = -1;
  for (let i = 0; i + oid.length <= der.length && at < 0; i++) if (oid.every((b, j) => der[i + j] === b)) at = i + oid.length;
  if (at < 0) throw new Error("not an RSA certificate");
  const len = (i: number): [number, number] => {
    const first = der[i]!;
    if (first < 0x80) return [first, i + 1];
    const n = first & 0x7f;
    let v = 0;
    for (let k = 1; k <= n; k++) v = (v << 8) | der[i + k]!;
    return [v, i + 1 + n];
  };
  // NULL parameters, then the BIT STRING
  if (der[at] === 0x05) at += 2;
  if (der[at] !== 0x03) throw new Error("no key bit string");
  let [, p] = len(at + 1);
  p += 1; // unused-bits byte
  if (der[p] !== 0x30) throw new Error("no RSA key sequence");
  [, p] = len(p + 1);
  const int = (i: number): [bigint, number] => {
    if (der[i] !== 0x02) throw new Error("expected an INTEGER");
    const [l, s] = len(i + 1);
    let v = 0n;
    for (let k = s; k < s + l; k++) v = (v << 8n) | BigInt(der[k]!);
    return [v, s + l];
  };
  const [modulus, q] = int(p);
  const [exponent] = int(q);
  return { modulus, exponent };
}
