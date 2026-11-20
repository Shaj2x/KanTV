// The real TV, from a browser: when KanTV Connect serves this app (on a computer on the same Wi-Fi), the TV
// parts of the platform go through it over a WebSocket, since a browser cannot open a socket to a TV itself.
// The page it serves carries a marker (window.__KANTV_CONNECT__) so the app knows to use this.
import { AdbError, PairingError, type PortProber, type RecordStore, type ShellResult } from "@kantv/core";
import type { Platform, RemoteKeys } from "./types";
import { installDigestShim } from "./sha256";

export const viaConnect = typeof window !== "undefined" && !!(window as { __KANTV_CONNECT__?: unknown }).__KANTV_CONNECT__;

type Reply = { id: number; ok: boolean; value?: unknown; error?: { name: string; kind: string; message: string } };
type Event = { event: string; req?: number; tv?: unknown };

class Rpc {
  private ws: WebSocket | null = null;
  private next = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private queue: string[] = [];
  private listeners = new Set<(e: Event) => void>();
  private sid: string;
  private retry = 0;

  constructor() {
    let sid: string | null = null;
    try {
      sid = sessionStorage.getItem("kantv-connect-sid");
      if (!sid) sessionStorage.setItem("kantv-connect-sid", (sid = Math.random().toString(36).slice(2) + Date.now().toString(36)));
    } catch {
      sid = Math.random().toString(36).slice(2);
    }
    this.sid = sid;
    this.open();
    // Coming back to Safari: reconnect at once rather than after the backoff.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && !this.ws && this.open());
  }

  private open() {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/rpc?sid=${this.sid}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const m of this.queue.splice(0)) ws.send(m);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Reply & Event;
      if (m.event) return this.listeners.forEach((l) => l(m));
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.value);
      else {
        const err = m.error!;
        p.reject(err.name === "AdbError" ? new AdbError(err.kind as AdbError["kind"], err.message) : err.name === "PairingError" ? new PairingError(err.kind as PairingError["kind"], err.message) : new Error(err.message));
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      // KanTV Connect keeps this phone's TV connection for a while and replays what it missed.
      setTimeout(() => !this.ws && this.open(), Math.min(5000, 300 * 2 ** this.retry++));
    };
  }

  call<T>(op: string, args: Record<string, unknown> = {}): { id: number; done: Promise<T> } {
    const id = this.next++;
    const msg = JSON.stringify({ id, op, ...args });
    const done = new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(msg);
    else this.queue.push(msg);
    return { id, done };
  }

  on(l: (e: Event) => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
}

export function bridgePlatform(): Pick<Platform, "mode" | "discover" | "connect" | "prober" | "records" | "remote" | "settleDelayMs"> {
  installDigestShim();
  const rpc = new Rpc();

  const prober: PortProber = { probe: (host, port, timeoutMs) => rpc.call<Awaited<ReturnType<PortProber["probe"]>>>("probe", { host, port, timeoutMs }).done };
  const records: RecordStore = {
    get: (t, l) => rpc.call<Awaited<ReturnType<RecordStore["get"]>>>("records.get", { t, l }).done,
    put: (t, l, record) => rpc.call<void>("records.put", { t, l, record }).done,
  };

  return {
    mode: "native",
    discover(onFound) {
      const off = rpc.on((e) => e.event === "found" && onFound(e.tv as Parameters<typeof onFound>[0]));
      void rpc.call("discover.start").done.catch(() => undefined);
      return () => {
        off();
        void rpc.call("discover.stop").done.catch(() => undefined);
      };
    },
    async connect(tv, hooks) {
      const { id, done } = rpc.call<{ cid: number; banner: Record<string, string> }>("adb.connect", { host: tv.host, port: 5555 });
      const off = rpc.on((e) => e.event === "allow-prompt" && e.req === id && hooks.onAllowPrompt());
      try {
        const { cid, banner } = await done;
        return {
          shell: { run: (command: string) => rpc.call<ShellResult>("adb.shell", { cid, command }).done },
          banner,
          close: () => void rpc.call("adb.close", { cid }).done.catch(() => undefined),
        };
      } finally {
        off();
      }
    },
    prober,
    records,
    async remote(tv, askCode): Promise<RemoteKeys> {
      const { id, done } = rpc.call<{ rid: number }>("remote.open", { host: tv.host });
      const off = rpc.on((e) => {
        if (e.event === "code-needed" && e.req === id) void askCode().then((code) => rpc.call("remote.code", { req: id, code }));
      });
      try {
        const { rid } = await done;
        return {
          key: (name) => rpc.call<void>("remote.key", { rid, name }).done,
          text: (text) => rpc.call<void>("remote.text", { rid, text }).done,
          close: () => void rpc.call("remote.close", { rid }).done.catch(() => undefined),
        };
      } finally {
        off();
      }
    },
    // The TV needs time to write package state to disk before a reboot.
    settleDelayMs: 15_000,
  };
}
