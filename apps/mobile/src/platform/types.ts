// What the app needs from the phone it runs on. The native build (Android first, then iOS) implements these
// with a TCP/TLS socket, the platform keystore and mDNS; the demo implements them with a simulated TV so the
// screens can be tried in a browser. Everything above this line is shared core code.
import type { Feed, PortProber, RecordStore, TvShell } from "@kantv/core";

export interface FoundTv {
  id: string;
  /** What the TV calls itself on the network, e.g. "Living room TV". */
  name: string;
  host: string;
  /** How it can be reached: network ADB on 5555, or Wireless debugging (pairing code first). */
  via: "adb-5555" | "wireless-debugging";
  /** Wireless debugging's own port, noted so it can be checked after it is switched off. */
  wirelessPort?: number;
}

export interface TvConnection {
  shell: TvShell;
  /** What the TV announced: ro.product.* and its features. */
  banner: Record<string, string>;
  close(): void;
}

export interface ConnectHooks {
  /** The TV is showing "Allow USB debugging?". */
  onAllowPrompt(): void;
}

export interface RemoteKeys {
  key(name: "UP" | "DOWN" | "LEFT" | "RIGHT" | "OK" | "BACK" | "HOME" | "VOLUME_UP" | "VOLUME_DOWN" | "MUTE" | "POWER" | "PLAY_PAUSE"): Promise<void>;
  text(text: string): Promise<void>;
  close(): void;
}

export interface Platform {
  mode: "native" | "demo";
  /** Finds Android TVs on this Wi-Fi; calls back as they turn up. */
  discover(onFound: (tv: FoundTv) => void): () => void;
  connect(tv: FoundTv, hooks: ConnectHooks): Promise<TvConnection>;
  prober: PortProber;
  records: RecordStore;
  /** The verified list feed. */
  feed(): Promise<Feed>;
  /** Pairs if needed (the TV shows a code), then opens the remote. */
  remote(tv: FoundTv, askCode: () => Promise<string>): Promise<RemoteKeys>;
  /** Seconds to wait so the TV writes package state to disk before a reboot (upstream: about 15 s). */
  settleDelayMs: number;
}
