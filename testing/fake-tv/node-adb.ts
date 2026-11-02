// Node stand-ins for the platform parts of the ADB client: a TCP transport and an RSA key. On the phones these
// are the native TCP socket and a key in the Android Keystore / iOS Keychain.
import { spawn, type ChildProcess } from "node:child_process";
import { createPrivateKey, generateKeyPairSync, privateEncrypt, constants, type KeyObject } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHA1_DIGEST_INFO, type AdbKey } from "../../packages/core/src/adb/key.ts";
import type { ByteTransport } from "../../packages/core/src/adb/connection.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const VENV_PYTHON = join(HERE, "..", "venv", "bin", "python");
export const hasVenv = existsSync(VENV_PYTHON);

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

export function tcpTransport(port: number, host = "127.0.0.1"): Promise<ByteTransport & { socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host);
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
    socket.once("connect", () =>
      resolve({
        socket,
        write: (b) => new Promise((res, rej) => socket.write(b, (e) => (e ? rej(e) : res()))),
        read: () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise((r) => (waiting = r))),
        close: () => socket.destroy(),
      }),
    );
    socket.once("error", reject);
  });
}

export interface FakeAdbd {
  port: number;
  keysPath: string;
  stop(): void;
}

/** Starts testing/fake-tv/adbd.py on a free port against the TV in `statePath`. */
export function startAdbd(
  statePath: string,
  keysPath: string,
  o: { prompt?: "accept" | "reject" | "ignore"; version?: string; maxdata?: number } = {},
): Promise<FakeAdbd> {
  if (!existsSync(keysPath)) writeFileSync(keysPath, "");
  const args = [join(HERE, "adbd.py"), "--keys", keysPath, "--prompt", o.prompt ?? "accept"];
  if (o.version) args.push("--version", o.version);
  if (o.maxdata) args.push("--maxdata", String(o.maxdata));
  const child: ChildProcess = spawn(VENV_PYTHON, args, { env: { ...process.env, FAKE_TV_STATE: statePath }, stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((resolve, reject) => {
    child.stdout!.once("data", (d: Buffer) => {
      const m = /READY (\d+)/.exec(d.toString());
      if (!m) return reject(new Error(`adbd: ${d}`));
      resolve({ port: Number(m[1]), keysPath, stop: () => child.kill() });
    });
    child.once("exit", (code) => reject(new Error(`adbd exited ${code}`)));
  });
}
