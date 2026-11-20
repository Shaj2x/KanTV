// Finding TVs on this Wi-Fi, two ways at once. mDNS gives each TV's own name ("Living Room TV") from the
// Android TV Remote and Cast services; a sweep of the local network for port 5555 finds any TV that already
// has network debugging switched on, even where the router drops multicast.
import makeMdns from "multicast-dns";
import { lanAddresses, nodeProber } from "./net.ts";

export interface Found {
  id: string;
  name: string;
  host: string;
  via: "adb-5555";
}

const SERVICES = ["_androidtvremote2._tcp.local", "_googlecast._tcp.local"];

function hostsAround(address: string, netmask: string): string[] {
  const n = (s: string) => s.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
  const ip = n(address);
  let mask = n(netmask);
  // Wider than a /24 (some routers hand out /16): sweep only the /24 this computer is in.
  if (mask < 0xffffff00) mask = 0xffffff00;
  const base = (ip & mask) >>> 0;
  const size = (~mask >>> 0) + 1;
  const out: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    const h = base + i;
    if (h !== ip) out.push([h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255].join("."));
  }
  return out;
}

/** Starts looking; `onFound` fires once per TV (again only if its name becomes known later). Returns stop. */
export function discover(onFound: (tv: Found) => void): () => void {
  const named = new Map<string, string>(); // host -> name
  const seen = new Map<string, string>(); // host -> name last reported
  let stopped = false;
  const report = (host: string, name: string) => {
    if (stopped || seen.get(host) === name) return;
    seen.set(host, name);
    onFound({ id: host, name, host, via: "adb-5555" });
  };

  // mDNS
  let mdnsTimer: ReturnType<typeof setInterval> | null = null;
  let mdns: ReturnType<typeof makeMdns> | null = null;
  try {
    mdns = makeMdns();
    mdns.on("error", () => undefined);
    mdns.on("response", (res) => {
      const records = [...res.answers, ...res.additionals];
      const a = new Map<string, string>(); // target hostname -> ip
      for (const r of records) if (r.type === "A") a.set(r.name, r.data as string);
      for (const r of records) {
        if (r.type !== "SRV") continue;
        const service = SERVICES.find((s) => r.name.endsWith(s));
        if (!service) continue;
        const ip = a.get((r.data as { target: string }).target);
        if (!ip) continue;
        let name = r.name.slice(0, -service.length - 1);
        // Cast's instance name is an id; its TXT "fn" is the name the person gave the TV.
        const txt = records.find((t) => t.type === "TXT" && t.name === r.name);
        const fn = txt && ((txt as { data: Buffer[] }).data).map(String).find((s) => s.startsWith("fn="));
        if (fn) name = fn.slice(3);
        if (service === SERVICES[0] || !named.has(ip)) named.set(ip, name.replace(/\\032/g, " "));
        report(ip, named.get(ip)!);
      }
    });
    const ask = () => mdns?.query({ questions: SERVICES.map((name) => ({ name, type: "PTR" as const })) });
    ask();
    mdnsTimer = setInterval(ask, 4000);
  } catch {
    mdns = null;
  }

  // The sweep: every address in this computer's network, 64 at a time, repeated while the screen is open.
  const sweep = async () => {
    const hosts = [...new Set(lanAddresses().flatMap((a) => hostsAround(a.address, a.netmask)))];
    let next = 0;
    const worker = async () => {
      while (!stopped && next < hosts.length) {
        const h = hosts[next++]!;
        if ((await nodeProber.probe(h, 5555, 700)) === "open") report(h, named.get(h) ?? seen.get(h) ?? "Android TV");
      }
    };
    await Promise.all(Array.from({ length: 64 }, worker));
  };
  let sweepTimer: ReturnType<typeof setTimeout> | null = null;
  const loop = () => void sweep().then(() => !stopped && (sweepTimer = setTimeout(loop, 8000)));
  loop();

  return () => {
    stopped = true;
    if (sweepTimer) clearTimeout(sweepTimer);
    if (mdnsTimer) clearInterval(mdnsTimer);
    mdns?.destroy();
  };
}
