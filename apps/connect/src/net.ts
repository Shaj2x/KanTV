// The computer's side of the TV connection: a TCP transport, the RSA key the TV remembers, and the port check.
// On the phones these are the native socket and a key in the Keystore / Keychain; here they are Node's.
import { createPrivateKey, generateKeyPairSync, privateEncrypt, constants, type KeyObject } from "node:crypto";
import { connect, type Socket } from "node:net";
import { networkInterfaces } from "node:os";
import { SHA1_DIGEST_INFO, type AdbKey, type ByteTransport, type PortProbe, type PortProber } from "@kantv/core";

const b64urlToBigint = (s: string) => BigInt("0x" + Buffer.from(s, "base64url").toString("hex"));

export function nodeKey(privateKey: KeyObject = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey): AdbKey & { pem: string } {
  const jwk = privateKey.export({ format: "jwk" });
  return {
    modulus: b64urlToBigint(jwk.n!),
    exponent: b64urlToBigint(jwk.e!),
    pem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    sign: async (token) =>
      new Uint8Array(privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.concat([SHA1_DIGEST_INFO, token]))),
  };
}

export const keyFromPem = (pem: string) => nodeKey(createPrivateKey(pem));

/** A queue over a socket: `read` hands out chunks in order and null once the socket has closed. */
export function socketTransport(socket: Socket | import("node:tls").TLSSocket): ByteTransport {
  const queue: (Uint8Array | null)[] = [];
  let waiting: ((v: Uint8Array | null) => void) | null = null;
  const push = (v: Uint8Array | null) => {
    if (waiting) {
      const w = waiting;
      waiting = null;
      w(v);
    } else queue.push(v);
  };
  socket.on("data", (d: Buffer) => push(new Uint8Array(d)));
  socket.on("close", () => push(null));
  socket.on("error", () => undefined);
  return {
    write: (b) => new Promise((res, rej) => socket.write(b, (e) => (e ? rej(e) : res()))),
    read: () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise((r) => (waiting = r))),
    close: () => socket.destroy(),
  };
}

export function tcpTransport(port: number, host = "127.0.0.1", timeoutMs = 6000): Promise<ByteTransport & { socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host);
    const t = socketTransport(socket);
    socket.setTimeout(timeoutMs, () => socket.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    socket.once("connect", () => (socket.setTimeout(0), resolve({ ...t, socket })));
    socket.once("error", reject);
  });
}

/** This computer's addresses on the home network (IPv4, not loopback). */
export function lanAddresses(): { address: string; netmask: string }[] {
  const out: { address: string; netmask: string }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    // Virtual adapters (Docker, VPNs, VirtualBox) are never where the TV is.
    if (/^(docker|br-|veth|vboxnet|vmnet|utun|tun|tap|zt|tailscale|wg)/i.test(name)) continue;
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) out.push(a);
  }
  return out;
}

/** The port check: a refusal is the only "closed". */
export const nodeProber: PortProber = {
  probe: (host, port, timeoutMs) =>
    new Promise((resolve) => {
      const s = connect({ host, port });
      const done = (r: PortProbe) => (s.destroy(), resolve(r));
      s.setTimeout(timeoutMs, () => done("no-answer"));
      s.once("connect", () => done("open"));
      s.once("error", (e: NodeJS.ErrnoException) => done(e.code === "ECONNREFUSED" ? "refused" : "unreachable"));
    }),
};
