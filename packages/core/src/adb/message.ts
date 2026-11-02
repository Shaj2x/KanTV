// ADB wire messages: a 24-byte little-endian header (command, arg0, arg1, data length, data checksum, magic)
// followed by the data. See AOSP packages/modules/adb/protocol.txt.

export const A_SYNC = 0x434e5953;
export const A_CNXN = 0x4e584e43;
export const A_AUTH = 0x48545541;
export const A_OPEN = 0x4e45504f;
export const A_OKAY = 0x59414b4f;
export const A_CLSE = 0x45534c43;
export const A_WRTE = 0x45545257;
export const A_STLS = 0x534c5453;

export const AUTH_TOKEN = 1;
export const AUTH_SIGNATURE = 2;
export const AUTH_RSAPUBLICKEY = 3;

/** The version we announce. 0x01000001 lets the device skip the checksum; older devices answer 0x01000000. */
export const A_VERSION = 0x01000001;
export const A_VERSION_MIN = 0x01000000;
export const A_STLS_VERSION = 0x01000000;
/** What we accept per message. Devices answer with their own limit (4096 on old ones). */
export const MAX_PAYLOAD = 256 * 1024;

export interface AdbMessage {
  command: number;
  arg0: number;
  arg1: number;
  data: Uint8Array;
}

export function commandName(c: number): string {
  return String.fromCharCode(c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, (c >>> 24) & 0xff);
}

/** Sum of the data bytes, which version 0x01000000 devices check. */
export function checksum(data: Uint8Array): number {
  let sum = 0;
  for (const b of data) sum = (sum + b) >>> 0;
  return sum;
}

export function encodeMessage(command: number, arg0: number, arg1: number, data: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(24 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, command >>> 0, true);
  v.setUint32(4, arg0 >>> 0, true);
  v.setUint32(8, arg1 >>> 0, true);
  v.setUint32(12, data.length, true);
  v.setUint32(16, checksum(data), true);
  v.setUint32(20, (command ^ 0xffffffff) >>> 0, true);
  out.set(data, 24);
  return out;
}

export class AdbProtocolError extends Error {}

/** Collects bytes from the transport and hands out whole messages. */
export class MessageReader {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): void {
    const next = new Uint8Array(this.buf.length + chunk.length);
    next.set(this.buf);
    next.set(chunk, this.buf.length);
    this.buf = next;
  }

  /** The next complete message, or null if more bytes are needed. */
  next(): AdbMessage | null {
    if (this.buf.length < 24) return null;
    const v = new DataView(this.buf.buffer, this.buf.byteOffset, 24);
    const command = v.getUint32(0, true);
    const length = v.getUint32(12, true);
    const magic = v.getUint32(20, true);
    if (magic !== (command ^ 0xffffffff) >>> 0) throw new AdbProtocolError(`bad magic for ${commandName(command)}`);
    if (length > 16 * 1024 * 1024) throw new AdbProtocolError(`message too large (${length} bytes)`);
    if (this.buf.length < 24 + length) return null;
    const msg = {
      command,
      arg0: v.getUint32(4, true),
      arg1: v.getUint32(8, true),
      data: this.buf.slice(24, 24 + length),
    };
    this.buf = this.buf.slice(24 + length);
    return msg;
  }
}

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);
