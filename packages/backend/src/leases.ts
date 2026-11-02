// The pass the KanTV launcher checks offline before showing a custom theme. A JWS signed with ES256 (ECDSA
// P-256), which every Android TV from 8.0 verifies with java.security alone. When it expires, the launcher
// falls back to the free default look and keeps the custom theme on disk; it never blocks the TV.
import { SignJWT, exportJWK, importJWK, jwtVerify, type JWK, type CryptoKey as JoseKey, generateKeyPair } from "jose";
import type { Entitlement } from "./trials.ts";

export const LEASE_ISSUER = "kantv";
/** A subscriber's pass is renewed well before this; a lapsed one survives a short outage. */
export const SUBSCRIPTION_LEASE_DAYS = 14;
export const GRACE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

export interface LeaseKeys {
  privateKey: JoseKey;
  publicJwk: JWK;
  kid: string;
}

export async function leaseKeysFromJwk(privateJwk: JWK): Promise<LeaseKeys> {
  const privateKey = (await importJWK(privateJwk, "ES256")) as JoseKey;
  const { d: _d, ...publicJwk } = privateJwk;
  return { privateKey, publicJwk: { ...publicJwk, alg: "ES256", use: "sig" }, kid: privateJwk.kid ?? "lease-1" };
}

export async function generateLeaseKeys(kid = "lease-dev"): Promise<LeaseKeys & { privateJwk: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = { ...(await exportJWK(privateKey)), kid };
  return { privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" }, kid, privateJwk };
}

export interface LeaseClaims {
  /** Account. */
  sub: string;
  /** Household (the TV). */
  tv: string;
  /** The launcher install the pass is for, so a copied pass does not unlock another TV's launcher. */
  inst: string;
  /** What the launcher may show. */
  ent: "full";
  exp: number;
}

/** When the pass should run out: the trial's end, or the paid period plus grace, capped. Null: no pass. */
export function leaseExpiry(e: Entitlement, now = new Date()): Date | null {
  if (!e.entitled) return null;
  if (e.plan === "trial") return new Date(e.trialEndsAt!);
  const cap = now.getTime() + SUBSCRIPTION_LEASE_DAYS * DAY;
  const end = e.subscriptionEndsAt ? new Date(e.subscriptionEndsAt).getTime() + GRACE_DAYS * DAY : cap;
  return new Date(Math.min(cap, end));
}

export async function issueLease(keys: LeaseKeys, e: Entitlement, tv: string, inst: string, now = new Date()): Promise<{ lease: string; expiresAt: string } | null> {
  const exp = leaseExpiry(e, now);
  if (!exp) return null;
  const lease = await new SignJWT({ tv, inst, ent: "full" })
    .setProtectedHeader({ alg: "ES256", kid: keys.kid, typ: "kantv-lease" })
    .setIssuer(LEASE_ISSUER)
    .setSubject(e.accountId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(exp.getTime() / 1000))
    .sign(keys.privateKey);
  return { lease, expiresAt: exp.toISOString() };
}

/** What the launcher does, here for tests and for the phone's own display. */
export async function verifyLease(publicJwk: JWK, lease: string, inst: string, now = new Date()): Promise<LeaseClaims | null> {
  try {
    const key = await importJWK(publicJwk, "ES256");
    const { payload } = await jwtVerify(lease, key, { issuer: LEASE_ISSUER, currentDate: now, typ: "kantv-lease" });
    return payload.inst === inst ? (payload as unknown as LeaseClaims) : null;
  } catch {
    return null;
  }
}
