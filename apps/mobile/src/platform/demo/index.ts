// The preview platform: one simulated TV on a pretend network. Clearly a demo in the UI (see DemoBanner); it
// exists so the setup flow, review, restore and remote can be tried before the native build exists.
import type { Feed, RecordStore, RecoveryRecord } from "@kantv/core";
import type { Platform, RemoteKeys } from "../types";
import { DemoTvShell, newDemoTv, type DemoTvState } from "./demoTv";
import feed from "./feed.json";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoTv: DemoTvState = newDemoTv();

/** The demo stands in for the user at the TV: the Allow screen offers a button that resolves this. */
let allow: (() => void) | null = null;
export function demoTapAllow() {
  allow?.();
}

/** What the demo remote "sent", for the remote screen to show. */
export const demoRemoteLog: string[] = [];

const records = new Map<string, RecoveryRecord>();
const store: RecordStore = {
  get: async (t, l) => records.get(`${t}|${l}`) ?? null,
  put: async (t, l, r) => void records.set(`${t}|${l}`, structuredClone(r)),
};

export const demoPlatform: Platform = {
  mode: "demo",
  discover(onFound) {
    const t = setTimeout(
      () => onFound({ id: "demo-living-room", name: "Living room TV", host: "192.168.1.42", via: "adb-5555" }),
      1400,
    );
    return () => clearTimeout(t);
  },
  async connect(_tv, hooks) {
    demoTv.settings.adb_enabled = "1";
    await wait(700);
    hooks.onAllowPrompt();
    await new Promise<void>((r) => (allow = r));
    allow = null;
    await wait(400);
    return {
      shell: new DemoTvShell(demoTv),
      banner: { "ro.product.model": "Chromecast", "ro.product.device": "sabrina" },
      close() {},
    };
  },
  prober: {
    async probe() {
      await wait(500);
      return demoTv.settings.adb_enabled === "0" ? "refused" : "open";
    },
  },
  records: store,
  feed: async () => feed as unknown as Feed,
  async remote(): Promise<RemoteKeys> {
    await wait(300);
    return {
      async key(name) {
        demoRemoteLog.unshift(name);
      },
      async text(text) {
        demoRemoteLog.unshift(`“${text}”`);
      },
      close() {},
    };
  },
  settleDelayMs: 1500,
};
