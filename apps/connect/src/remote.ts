// The remote, from the computer: Google's Android TV Remote protocol over TLS. The TV remembers this computer's
// certificate after pairing once (it shows a code, the person types it on the phone).
import { PAIRING_PORT, REMOTE_PORT, PairingError, TvRemote, rsaKeyFromCertificate, startPairing, type RsaPublic, type TlsTransport } from "@kantv/core";
import forge from "node-forge";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:tls";
import { socketTransport } from "./net.ts";

export interface Identity {
  keyPem: string;
  certPem: string;
  publicKey: RsaPublic;
}

/** This computer's remote certificate: made once, kept next to the ADB key. */
export function remoteIdentity(path: string): Identity {
  let keyPem: string;
  let certPem: string;
  if (existsSync(path)) ({ keyPem, certPem } = JSON.parse(readFileSync(path, "utf8")));
  else {
    // The key from Node's own crypto (fast); node-forge only writes the certificate around it.
    const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const keys = { privateKey: forge.pki.privateKeyFromPem(pem) as forge.pki.rsa.PrivateKey } as { privateKey: forge.pki.rsa.PrivateKey; publicKey: forge.pki.rsa.PublicKey };
    keys.publicKey = forge.pki.setRsaPublicKey(keys.privateKey.n, keys.privateKey.e);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 86_400_000);
    const attrs = [{ name: "commonName", value: "KanTV Connect" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    certPem = forge.pki.certificateToPem(cert);
    writeFileSync(path, JSON.stringify({ keyPem, certPem }), { mode: 0o600 });
  }
  const pub = forge.pki.certificateFromPem(certPem).publicKey as forge.pki.rsa.PublicKey;
  return { keyPem, certPem, publicKey: { modulus: BigInt("0x" + pub.n.toString(16)), exponent: BigInt("0x" + pub.e.toString(16)) } };
}

function tls(host: string, port: number, id: Identity, timeoutMs = 6000): Promise<TlsTransport> {
  return new Promise((resolve, reject) => {
    // The TV's certificate is self-signed; pairing (the code on screen) is what proves which TV it is.
    const socket = connect({ host, port, key: id.keyPem, cert: id.certPem, rejectUnauthorized: false });
    socket.setTimeout(timeoutMs, () => socket.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    socket.once("secureConnect", () => {
      socket.setTimeout(0);
      const t = socketTransport(socket);
      const raw = socket.getPeerCertificate()?.raw;
      resolve({ ...t, clientKey: id.publicKey, serverKey: () => rsaKeyFromCertificate(new Uint8Array(raw ?? [])) });
    });
    socket.once("error", reject);
  });
}

/** Opens the remote session; resolves once the TV has said hello, or null when it hangs up (not paired). */
async function session(host: string, id: Identity, port: number): Promise<TvRemote | null> {
  let t: TlsTransport;
  try {
    t = await tls(host, port, id);
  } catch (e) {
    // A TV that does not know the certificate may refuse the handshake itself.
    if ((e as NodeJS.ErrnoException).code === "ECONNREFUSED" || (e as NodeJS.ErrnoException).code === "ETIMEDOUT" || (e as NodeJS.ErrnoException).code === "EHOSTUNREACH") throw e;
    return null;
  }
  return new Promise((resolve) => {
    let hello = false;
    const remote = new TvRemote(t, () => {
      if (!hello) (hello = true), resolve(remote);
    });
    void remote.run().catch(() => undefined).then(() => !hello && resolve(null));
    setTimeout(() => !hello && (t.close(), resolve(null)), 5000);
  });
}

/** Pairs if the TV asks for it (`askCode` resolves with what the person typed), then opens the remote. */
export async function openRemote(
  host: string,
  id: Identity,
  askCode: () => Promise<string>,
  ports = { remote: REMOTE_PORT, pairing: PAIRING_PORT },
): Promise<TvRemote> {
  const first = await session(host, id, ports.remote);
  if (first) return first;
  const p = await tls(host, ports.pairing, id);
  try {
    const pairing = await startPairing(p, "KanTV Connect");
    await pairing.finish(await askCode());
  } catch (e) {
    p.close();
    throw e instanceof PairingError ? e : new PairingError("closed", String(e));
  }
  const paired = await session(host, id, ports.remote);
  if (!paired) throw new PairingError("rejected", "the TV did not open the remote after pairing");
  return paired;
}
