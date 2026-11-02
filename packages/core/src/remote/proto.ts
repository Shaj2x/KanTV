// Just enough protobuf for the Android TV Remote protocol: varints, length-delimited fields, nested messages,
// and messages framed by a varint length on the wire. Fields are written in the order given, which callers keep
// in field-number order so the bytes match the reference implementation's.

export class ProtoWriter {
  private parts: number[] = [];

  private varint(v: number | bigint): void {
    let n = BigInt.asUintN(64, BigInt(v));
    while (n >= 0x80n) {
      this.parts.push(Number((n & 0x7fn) | 0x80n));
      n >>= 7n;
    }
    this.parts.push(Number(n));
  }

  /** A varint field. proto3 scalars at their default (0, false) are left out, as the encoders do. */
  uint(field: number, value: number | bigint | boolean, { keepZero = false } = {}): this {
    const v = typeof value === "boolean" ? (value ? 1 : 0) : value;
    if (!keepZero && (v === 0 || v === 0n)) return this;
    this.varint((field << 3) | 0);
    this.varint(v);
    return this;
  }

  bytes(field: number, value: Uint8Array, { keepEmpty = false } = {}): this {
    if (!keepEmpty && !value.length) return this;
    this.varint((field << 3) | 2);
    this.varint(value.length);
    for (const b of value) this.parts.push(b);
    return this;
  }

  string(field: number, value: string, opts?: { keepEmpty?: boolean }): this {
    return this.bytes(field, new TextEncoder().encode(value), opts);
  }

  /** A nested message; present even when empty, as a set sub-message is. */
  message(field: number, build: (w: ProtoWriter) => void): this {
    const w = new ProtoWriter();
    build(w);
    return this.bytes(field, w.finish(), { keepEmpty: true });
  }

  finish(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

export interface ProtoField {
  field: number;
  /** varint value, or bytes for a length-delimited field. */
  value: bigint | Uint8Array;
}

export class ProtoDecodeError extends Error {}

function readVarint(buf: Uint8Array, at: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  for (let i = at; i < buf.length && i < at + 10; i++) {
    const b = buf[i]!;
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, i + 1];
    shift += 7n;
  }
  throw new ProtoDecodeError("truncated varint");
}

/** The top-level fields of a message. Unknown wire types end the parse with an error. */
export function decode(buf: Uint8Array): ProtoField[] {
  const out: ProtoField[] = [];
  let at = 0;
  while (at < buf.length) {
    const [key, next] = readVarint(buf, at);
    at = next;
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (wire === 0) {
      const [v, n] = readVarint(buf, at);
      out.push({ field, value: v });
      at = n;
    } else if (wire === 2) {
      const [len, n] = readVarint(buf, at);
      const end = n + Number(len);
      if (end > buf.length) throw new ProtoDecodeError("truncated field");
      out.push({ field, value: buf.slice(n, end) });
      at = end;
    } else if (wire === 5) {
      out.push({ field, value: buf.slice(at, at + 4) });
      at += 4;
    } else if (wire === 1) {
      out.push({ field, value: buf.slice(at, at + 8) });
      at += 8;
    } else {
      throw new ProtoDecodeError(`unsupported wire type ${wire}`);
    }
  }
  return out;
}

export const get = (fields: ProtoField[], n: number) => fields.find((f) => f.field === n)?.value;
export const getNum = (fields: ProtoField[], n: number): number => {
  const v = get(fields, n);
  return typeof v === "bigint" ? Number(BigInt.asIntN(32, v)) : 0;
};
export const getBytes = (fields: ProtoField[], n: number): Uint8Array | undefined => {
  const v = get(fields, n);
  return v instanceof Uint8Array ? v : undefined;
};
export const getMsg = (fields: ProtoField[], n: number): ProtoField[] | undefined => {
  const b = getBytes(fields, n);
  return b ? decode(b) : undefined;
};
export const getString = (fields: ProtoField[], n: number): string => new TextDecoder().decode(getBytes(fields, n) ?? new Uint8Array());

/** A message as it goes on the wire: its length as a varint, then the bytes. */
export function frame(message: Uint8Array): Uint8Array {
  const len: number[] = [];
  let n = message.length;
  while (n >= 0x80) {
    len.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  len.push(n);
  const out = new Uint8Array(len.length + message.length);
  out.set(len);
  out.set(message, len.length);
  return out;
}

/** Splits a byte stream into length-delimited messages; keeps a partial one for the next push. */
export class FrameReader {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const next = new Uint8Array(this.buf.length + chunk.length);
    next.set(this.buf);
    next.set(chunk, this.buf.length);
    this.buf = next;
    const out: Uint8Array[] = [];
    for (;;) {
      let len = 0;
      let shift = 0;
      let i = 0;
      for (; i < this.buf.length && i < 5; i++) {
        const b = this.buf[i]!;
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      if (i >= this.buf.length) return out; // the length itself is not complete yet
      if (i >= 5) throw new ProtoDecodeError("bad frame length");
      const start = i + 1;
      if (this.buf.length < start + len) return out;
      out.push(this.buf.slice(start, start + len));
      this.buf = this.buf.slice(start + len);
    }
  }
}
