// The signed list feed. The backend publishes the debloat lists as one JSON document plus an Ed25519
// signature over its exact bytes; the apps verify it with the public key they ship with, and check every list
// again on the device (validateList), so a bad feed can never get a core package onto a TV.
import type { ParsedList } from "./list.ts";

export interface FeedList {
  /** e.g. "google-chromecast-gtv-4k/debloat.txt" */
  id: string;
  file: string;
  packages: { name: string; comment: string }[];
  header: string[];
  /** Tags from the header the app turns into questions or warnings. */
  flags: string[];
  /** KanTV must-keep entries the list named. */
  kept: string[];
}

export interface FeedModel {
  folder: string;
  tv: string;
  os: string;
  brand: string;
  notes: string;
  /** Lower-case identifiers to match against the TV's getprop answers. */
  match: string[];
  lists: FeedList[];
}

export interface Feed {
  version: 1;
  upstream: { repo: string; commit: string };
  generated: string;
  models: FeedModel[];
  /** Upstream lists refused by validation, with the reason, for review. */
  rejected: { id: string; reason: string }[];
}

export type { ParsedList };

async function importKey(publicKeyRaw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, ["verify"]);
}

/** Parses the feed only if the signature over its exact bytes verifies. */
export async function verifyFeed(
  bytes: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
  publicKeyRaw: Uint8Array<ArrayBuffer>,
): Promise<Feed> {
  const key = await importKey(publicKeyRaw);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, signature, bytes);
  if (!ok) throw new Error("the list feed's signature does not verify");
  const feed = JSON.parse(new TextDecoder().decode(bytes)) as Feed;
  if (feed.version !== 1) throw new Error("unknown list feed version");
  return feed;
}
