// What the app needs from the phone it runs on. The native build (Android first, then iOS) implements these
// with a TCP/TLS socket, the platform keystore and mDNS; the demo implements them with a simulated TV so the
// screens can be tried in a browser. Everything above this line is shared core code.
import type { Feed, LauncherConfig, PortProber, RecordStore, ThemeSpec, TvShell } from "@kantv/core";

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

export interface Entitlement {
  entitled: boolean;
  plan: "subscription" | "trial" | "none";
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
}

export interface Design {
  id: string;
  name: string;
  summary: string;
  request: string;
  spec: ThemeSpec;
  /** What the checks changed to make it safe. */
  fixes: string[];
  createdAt: string;
  /** Saved, but the trial is over: shown, not applicable. */
  locked: boolean;
}

export type DesignFailure = "subscription-required" | "daily-limit" | "too-fast" | "busy" | "design-refused" | "design-invalid" | "design-truncated" | "offline";

/** The AI designer and the account, through KanTV's backend (the model key never leaves the server). */
export interface Designer {
  /** True when designs come from the real AI designer, false for the preview's samples. */
  live: boolean;
  entitlement(): Promise<Entitlement>;
  design(request: string, installedApps: { package: string; label: string }[], exact: boolean): Promise<Design | DesignFailure>;
  regenerate(id: string, installedApps: { package: string; label: string }[]): Promise<Design | DesignFailure>;
  list(): Promise<Design[]>;
  /** The launcher config for this design, and the TV pass that lets the launcher show it. */
  apply(id: string, household: string, instance: string): Promise<{ config: LauncherConfig; lease: string; expiresAt: string } | DesignFailure>;
}

export type TrialStatus = "started" | "active" | "expired" | "used-on-this-tv" | "used-by-account";

/** The account side of a TV: registering it (which decides the free trial) and its pass for the launcher. */
export interface Account {
  registerTv(ids: { serial?: string; androidId?: string }, model: string): Promise<{ household: string; trial: TrialStatus; entitlement: Entitlement } | "offline">;
  lease(household: string, instance: string): Promise<{ lease: string; expiresAt: string } | "subscription-required" | "offline">;
  /** Everything the backend holds about this account, as JSON. */
  exportData(): Promise<unknown | "offline">;
  /** Deletes the account and its designs (the store rules require this in the app). */
  deleteAccount(): Promise<boolean>;
}

export interface Plan {
  id: "monthly" | "yearly";
  /** As the store shows it, in the user's currency. */
  price: string;
  perMonth: string;
  note?: string;
}

export interface Purchases {
  plans(): Promise<Plan[]>;
  buy(id: Plan["id"]): Promise<"bought" | "cancelled" | "failed">;
  restore(): Promise<boolean>;
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
  designer: Designer;
  purchases: Purchases;
  account: Account;
}
