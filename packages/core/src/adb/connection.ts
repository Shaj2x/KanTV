// An ADB connection over a byte transport (TCP on port 5555, or the TLS socket Wireless debugging uses), and
// a TvShell on top of it, so the safety engine runs over ADB unchanged. The transport and the key are the
// only platform parts; everything here is shared by the Android, iOS and test builds.
import type { ShellResult, TvShell } from "../shell.ts";
import { publicKeyLine, type AdbKey } from "./key.ts";
import {
  A_AUTH,
  A_CLSE,
  A_CNXN,
  A_OKAY,
  A_OPEN,
  A_STLS,
  A_STLS_VERSION,
  A_VERSION,
  A_WRTE,
  AUTH_RSAPUBLICKEY,
  AUTH_SIGNATURE,
  AUTH_TOKEN,
  AdbProtocolError,
  MAX_PAYLOAD,
  MessageReader,
  commandName,
  encodeMessage,
  fromUtf8,
  utf8,
  type AdbMessage,
} from "./message.ts";

/** A bidirectional byte stream. `read` resolves null once the peer has closed. */
export interface ByteTransport {
  write(bytes: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array | null>;
  close(): void;
  /** Wireless debugging: upgrade this socket to TLS with the phone's paired certificate. */
  startTls?(): Promise<void>;
}

export type AdbErrorKind =
  | "closed" // the TV closed the connection (debugging switched off, Wi-Fi dropped)
  | "auth-timeout" // nobody tapped Allow on the TV in time
  | "auth-rejected" // the TV asked again after our key was offered: Deny, or "always allow" was revoked
  | "tls-required" // the TV wants TLS (Wireless debugging) and this transport has none
  | "protocol" // the TV sent something we do not understand
  | "command-too-long"; // a command longer than the TV accepts in one message

export class AdbError extends Error {
  constructor(
    readonly kind: AdbErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface ConnectOptions {
  /** Shown on the TV next to the key: "KanTV on Pixel 8". */
  keyName: string;
  /** Called when the TV is showing "Allow USB debugging?", so the app can tell the user to look at the TV. */
  onAuthPrompt?: () => void;
  /** How long to wait for the user to tap Allow. */
  authTimeoutMs?: number;
  /** For each message read; tests use it to inject delays. */
  timeoutMs?: number;
}

/** What the TV says about itself in its CNXN banner: "device::ro.product.name=...;ro.product.model=...;features=...". */
export interface DeviceBanner {
  raw: string;
  props: Record<string, string>;
  features: string[];
}

export function parseBanner(raw: string): DeviceBanner {
  const body = raw.replace(/\0+$/, "").split("::")[1] ?? "";
  const props: Record<string, string> = {};
  let features: string[] = [];
  for (const part of body.split(";")) {
    const [k, v = ""] = part.split("=");
    if (!k) continue;
    if (k === "features") features = v.split(",").filter(Boolean);
    else props[k] = v;
  }
  return { raw, props, features };
}

function withTimeout<T>(p: Promise<T>, ms: number | undefined, onTimeout: () => Error): Promise<T> {
  if (!ms) return p;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export class AdbConnection {
  private reader = new MessageReader();
  private nextLocalId = 1;
  private busy: Promise<unknown> = Promise.resolve();
  private dead: AdbError | null = null;

  private constructor(
    private transport: ByteTransport,
    readonly banner: DeviceBanner,
    readonly maxPayload: number,
    private timeoutMs: number | undefined,
  ) {}

  private static async readMessage(t: ByteTransport, reader: MessageReader, timeoutMs?: number): Promise<AdbMessage> {
    for (;;) {
      const msg = reader.next();
      if (msg) return msg;
      const chunk = await withTimeout(t.read(), timeoutMs, () => new AdbError("closed", "the TV stopped answering"));
      if (chunk === null) throw new AdbError("closed", "the TV closed the connection");
      reader.push(chunk);
    }
  }

  /**
   * Connects and authenticates: sign the TV's token with our key; if the TV does not know the key, offer it
   * and wait for the user to tap Allow on the TV.
   */
  static async connect(transport: ByteTransport, key: AdbKey, o: ConnectOptions): Promise<AdbConnection> {
    const reader = new MessageReader();
    const read = (timeout = o.timeoutMs) => AdbConnection.readMessage(transport, reader, timeout);
    await transport.write(encodeMessage(A_CNXN, A_VERSION, MAX_PAYLOAD, utf8("host::kantv\0")));
    let signed = false;
    let offered = false;
    for (;;) {
      let msg: AdbMessage;
      try {
        msg = await read(offered ? (o.authTimeoutMs ?? 60_000) : o.timeoutMs);
      } catch (e) {
        if (offered && e instanceof AdbError && e.message === "the TV stopped answering")
          throw new AdbError("auth-timeout", "nobody allowed debugging on the TV in time");
        throw e;
      }
      if (msg.command === A_CNXN) {
        const conn = new AdbConnection(transport, parseBanner(fromUtf8(msg.data)), Math.min(msg.arg1, MAX_PAYLOAD), o.timeoutMs);
        conn.reader = reader;
        return conn;
      }
      if (msg.command === A_STLS) {
        if (!transport.startTls) throw new AdbError("tls-required", "the TV only accepts Wireless debugging (TLS)");
        await transport.write(encodeMessage(A_STLS, A_STLS_VERSION, 0));
        await transport.startTls();
        continue;
      }
      if (msg.command !== A_AUTH || msg.arg0 !== AUTH_TOKEN)
        throw new AdbError("protocol", `unexpected ${commandName(msg.command)} while connecting`);
      if (!signed) {
        signed = true;
        await transport.write(encodeMessage(A_AUTH, AUTH_SIGNATURE, 0, await key.sign(msg.data)));
      } else if (!offered) {
        offered = true;
        await transport.write(encodeMessage(A_AUTH, AUTH_RSAPUBLICKEY, 0, utf8(`${publicKeyLine(key, o.keyName)}\0`)));
        o.onAuthPrompt?.();
      } else {
        throw new AdbError("auth-rejected", "the TV did not accept this phone's key");
      }
    }
  }

  private async exclusive<T>(f: () => Promise<T>): Promise<T> {
    const run = this.busy.then(f, f);
    this.busy = run.catch(() => undefined);
    return run;
  }

  private fail(e: unknown): never {
    if (e instanceof AdbError && (e.kind === "closed" || e.kind === "protocol")) this.dead = e;
    if (e instanceof AdbProtocolError) this.dead = new AdbError("protocol", e.message);
    throw this.dead ?? e;
  }

  /** Runs one shell command (the legacy "shell:" service: stdout and stderr together, as adb shell shows). */
  shell(command: string): Promise<string> {
    return this.exclusive(async () => {
      if (this.dead) throw this.dead;
      const service = utf8(`shell:${command}\0`);
      if (service.length > this.maxPayload)
        throw new AdbError("command-too-long", `command is ${service.length} bytes; this TV takes ${this.maxPayload}`);
      const local = this.nextLocalId++;
      let remote = 0;
      const chunks: Uint8Array[] = [];
      try {
        await this.transport.write(encodeMessage(A_OPEN, local, 0, service));
        for (;;) {
          const msg = await AdbConnection.readMessage(this.transport, this.reader, this.timeoutMs);
          if (msg.arg1 !== local) continue; // a late message for a stream we already closed
          if (msg.command === A_OKAY) {
            remote = msg.arg0;
          } else if (msg.command === A_WRTE) {
            remote = msg.arg0;
            chunks.push(msg.data);
            await this.transport.write(encodeMessage(A_OKAY, local, remote));
          } else if (msg.command === A_CLSE) {
            if (remote) await this.transport.write(encodeMessage(A_CLSE, local, remote));
            break;
          } else {
            throw new AdbError("protocol", `unexpected ${commandName(msg.command)} on a shell stream`);
          }
        }
      } catch (e) {
        this.fail(e);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) all.set(c, (at += c.length) - c.length);
      return fromUtf8(all);
    });
  }

  get closed(): boolean {
    return this.dead !== null;
  }

  close(): void {
    this.dead ??= new AdbError("closed", "closed by the app");
    this.transport.close();
  }
}

/** The safety engine's view of the TV: a transport failure is `ok: false`, the TV's own errors are output. */
export class AdbTvShell implements TvShell {
  constructor(readonly connection: AdbConnection) {}

  async run(command: string): Promise<ShellResult> {
    try {
      return { ok: true, out: await this.connection.shell(command) };
    } catch (e) {
      if (e instanceof AdbError && e.kind !== "command-too-long") return { ok: false, out: "" };
      throw e;
    }
  }
}
