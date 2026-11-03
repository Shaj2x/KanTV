// The account, designer and list feed of the real app, for phones and the web: all through KanTV's backend.
// The native TV parts (sockets, keystore, discovery) join these in the native platform once it can be built.
import { fetchFeed } from "@kantv/core";
import Constants from "expo-constants";
import { backendAccount, backendDesigner } from "../api";

interface LiveConfig {
  /** e.g. https://api.kantv.tv; from app.json "extra.kantvApi" or EXPO_PUBLIC_KANTV_API. */
  api: string;
  /** The list feed's Ed25519 public key, base64 (public.json from scripts/gen-secrets.ts). */
  feedPublicKey: string;
}

export function liveConfig(): LiveConfig | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<LiveConfig & { kantvApi: string; kantvFeedPublicKey: string }>;
  const api = process.env.EXPO_PUBLIC_KANTV_API ?? extra.kantvApi;
  const feedPublicKey = extra.kantvFeedPublicKey;
  return api && feedPublicKey ? { api, feedPublicKey } : null;
}

/** The backend parts, given the login provider's token. */
export function liveServices(cfg: LiveConfig, token: () => Promise<string>) {
  const key = Uint8Array.from(atob(cfg.feedPublicKey), (c) => c.charCodeAt(0));
  return {
    designer: backendDesigner(cfg.api, token),
    account: backendAccount(cfg.api, token),
    feed: () => fetchFeed(cfg.api, key),
  };
}
