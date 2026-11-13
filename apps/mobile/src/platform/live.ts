// The signed list feed of the real app, from KanTV's backend. The account and designer parts are in ../api;
// the native TV parts (sockets, keystore, discovery) join these in the native platform once it can be built.
import { fetchFeed, type Feed } from "@kantv/core";

/**
 * The verified feed, when the build has the feed's public key (EXPO_PUBLIC_KANTV_FEED_KEY: the Ed25519 public key,
 * base64, from public.json made by scripts/gen-secrets.ts). fetchFeed checks the signature before anything is used.
 */
export function liveFeed(apiUrl: string | undefined): (() => Promise<Feed>) | null {
  const b64 = process.env.EXPO_PUBLIC_KANTV_FEED_KEY;
  if (!apiUrl || !b64) return null;
  const key = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return () => fetchFeed(apiUrl, key);
}
