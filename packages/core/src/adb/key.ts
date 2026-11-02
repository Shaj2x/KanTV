// The phone's ADB key. The private key never leaves the platform keystore (Android Keystore, iOS Keychain);
// this file only encodes the public half in Android's format and defines what a signer must do.

/**
 * What the platform provides. `sign` must produce an RSA PKCS#1 v1.5 signature over the 20-byte token AS IF
 * it were a SHA-1 digest: adbd checks it with RSA_verify(NID_sha1, token, ...). That is
 * NONEwithRSA over SHA1_DIGEST_INFO + token on Android, and .rsaSignatureDigestPKCS1v15SHA1 on iOS.
 */
export interface AdbKey {
  /** RSA-2048 modulus and public exponent. */
  modulus: bigint;
  exponent: bigint;
  sign(token: Uint8Array): Promise<Uint8Array>;
}

/** ASN.1 DigestInfo prefix for SHA-1, which goes in front of the token for a raw PKCS#1 v1.5 signature. */
export const SHA1_DIGEST_INFO = new Uint8Array([
  0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14,
]);

const MODULUS_BYTES = 256;

function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error("not invertible");
  return ((oldS % m) + m) % m;
}

function littleEndian(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

/**
 * The public key as AOSP's RSAPublicKey struct (libcrypto_utils/android_pubkey.c): modulus size in words,
 * -1/n[0] mod 2^32, the modulus and R^2 mod n little-endian, then the exponent.
 */
export function androidPublicKey(modulus: bigint, exponent: bigint): Uint8Array {
  if (modulus >> BigInt(MODULUS_BYTES * 8 - 1) !== 1n) throw new Error("ADB needs an RSA-2048 key");
  const out = new Uint8Array(4 + 4 + MODULUS_BYTES * 2 + 4);
  const v = new DataView(out.buffer);
  const r32 = 1n << 32n;
  const n0inv = r32 - modInverse(modulus % r32, r32);
  const rr = (1n << BigInt(MODULUS_BYTES * 8 * 2)) % modulus;
  v.setUint32(0, MODULUS_BYTES / 4, true);
  v.setUint32(4, Number(n0inv), true);
  out.set(littleEndian(modulus, MODULUS_BYTES), 8);
  out.set(littleEndian(rr, MODULUS_BYTES), 8 + MODULUS_BYTES);
  v.setUint32(8 + MODULUS_BYTES * 2, Number(exponent), true);
  return out;
}

function base64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]! + (b === undefined ? "=" : chars[(n >> 6) & 63]!) + (c === undefined ? "=" : chars[n & 63]!);
  }
  return out;
}

/** What AUTH RSAPUBLICKEY carries, and what the TV lists under "Revoke USB debugging authorisations". */
export function publicKeyLine(key: Pick<AdbKey, "modulus" | "exponent">, name: string): string {
  return `${base64(androidPublicKey(key.modulus, key.exponent))} ${name}`;
}
