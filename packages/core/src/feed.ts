// The signed list feed. The backend publishes the debloat lists as one JSON document plus an Ed25519
// signature over its exact bytes; the apps verify it with the public key they ship with, and check every list
// again on the device (validateList), so a bad feed can never get a core package onto a TV.
import type { ParsedList } from "./list.ts";
import type { ModelMatch } from "./match.ts";

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
  /** "unsupported": offer the debloat only (Fire OS, sets with a launcher signature gate). */
  launcher: "supported" | "unsupported";
  tv: string;
  os: string;
  brand: string;
  notes: string;
  /** What identifies the hardware, for matchModels(). */
  match: ModelMatch;
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

/**
 * Downloads the feed and its signature and returns the feed only if the signature verifies with the key the app
 * ships with. Anything else (network failure, wrong signature, wrong version) throws: the app then keeps the
 * last verified feed it has.
 */
export async function fetchFeed(
  baseUrl: string,
  publicKeyRaw: Uint8Array<ArrayBuffer>,
  fetchImpl: (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }> = fetch,
): Promise<Feed> {
  const [feed, sig] = await Promise.all([fetchImpl(`${baseUrl}/v1/lists/feed.json`), fetchImpl(`${baseUrl}/v1/lists/feed.json.sig`)]);
  if (!feed.ok || !sig.ok) throw new Error("the list feed could not be downloaded");
  return verifyFeed(new Uint8Array(await feed.arrayBuffer()), new Uint8Array(await sig.arrayBuffer()), publicKeyRaw);
}
