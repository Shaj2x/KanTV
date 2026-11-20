// The web server the phone talks to. It serves the KanTV web app over the home network, and a WebSocket on
// the same address through which the app asks this computer to do what a browser cannot: find the TV, open
// the ADB connection, run commands, check ports, keep the recovery records, and drive the remote.
//
// Only a phone that opened the link with this run's key gets in (the link sets a cookie; the socket checks it
// and that it comes from this same page), so others on the Wi-Fi cannot use the TV connection.
import { AdbConnection, AdbError, AdbTvShell, PairingError, type RecoveryRecord, type TvRemote } from "@kantv/core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { hostname } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import { discover } from "./discover.ts";
import { keyFromPem, nodeKey, nodeProber, tcpTransport } from "./net.ts";
import { openRemote, remoteIdentity } from "./remote.ts";

export interface Files {
  get(path: string): Buffer | null;
}

export interface Options {
  port: number;
  stateDir: string;
  files: Files;
  /** The key in the link; a fresh one each run unless given (tests). */
  key: string;
  /** The page shown on this computer itself: the QR code and the link. */
  welcome: (url: string) => Promise<string>;
  phoneUrl: () => string;
  log?: (line: string) => void;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
  map: "application/json",
};

const MARKER = `<script>window.__KANTV_CONNECT__={v:1}</script>`;

interface Client {
  ws: WebSocket | null;
  outbox: string[];
  adb: Map<number, AdbConnection>;
  remotes: Map<number, TvRemote>;
  waiting: Map<number, (code: string) => void>;
  stopDiscovery: (() => void) | null;
  expiry: ReturnType<typeof setTimeout> | null;
}

const cookieOf = (req: IncomingMessage, name: string) =>
  (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(name + "="))?.slice(name.length + 1);

export function startServer(o: Options): Promise<Server> {
  const log = o.log ?? (() => {});
  const adbKeyPath = `${o.stateDir}/adbkey.pem`;
  const key = existsSync(adbKeyPath) ? keyFromPem(readFileSync(adbKeyPath, "utf8")) : nodeKey();
  if (!existsSync(adbKeyPath)) writeFileSync(adbKeyPath, key.pem, { mode: 0o600 });
  const remoteId = remoteIdentity(`${o.stateDir}/remote.json`);
  const recordsPath = `${o.stateDir}/records.json`;
  const records: Record<string, RecoveryRecord> = existsSync(recordsPath) ? JSON.parse(readFileSync(recordsPath, "utf8")) : {};
  const keyName = `KanTV Connect on ${hostname().replace(/\.local$/, "")}`;
  const clients = new Map<string, Client>();
  let nextId = 1;

  const index = () => {
    const html = o.files.get("index.html")?.toString("utf8") ?? "<p>The KanTV app is missing from this build.</p>";
    return html.replace("<head>", `<head>${MARKER}`);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const local = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::1" || req.socket.remoteAddress === "::ffff:127.0.0.1";
    // This computer's own browser: the page with the QR code.
    if (url.pathname === "/" && local && !url.searchParams.has("key") && !cookieOf(req, "kantv")) {
      res.writeHead(200, { "content-type": TYPES.html!, "cache-control": "no-store" });
      return res.end(await o.welcome(o.phoneUrl()));
    }
    if (url.searchParams.get("key") === o.key) {
      res.writeHead(302, { location: "/", "set-cookie": `kantv=${o.key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
      return res.end();
    }
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (path.includes("..")) return res.writeHead(400).end();
    const ext = path.split(".").pop()!.toLowerCase();
    const file = path && path.includes(".") ? o.files.get(path) : null;
    if (file) {
      res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": path.startsWith("_expo/") ? "public, max-age=31536000, immutable" : "no-cache" });
      return res.end(file);
    }
    if (path.includes(".") && ext !== "html") return res.writeHead(404).end();
    // Any app screen: the app, which opens that screen. Without the key it explains how to get in.
    if (cookieOf(req, "kantv") !== o.key) {
      res.writeHead(403, { "content-type": TYPES.html! });
      return res.end(
        `<!doctype html><meta name=viewport content="width=device-width"><body style="font:17px system-ui;padding:24px;max-width:30em">` +
          `<h2>Open the link from KanTV Connect</h2><p>Scan the QR code shown on the computer running KanTV Connect, or type the whole link it shows, including the part after <b>?key=</b>.</p>`,
      );
    }
    res.writeHead(200, { "content-type": TYPES.html!, "cache-control": "no-store" });
    res.end(index());
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    const origin = req.headers.origin;
    const sameOrigin = !origin || origin === `http://${req.headers.host}`;
    if (url.pathname !== "/rpc" || cookieOf(req, "kantv") !== o.key || !sameOrigin) {
      if (process.env.KANTV_DEBUG) log(`refused socket: ${JSON.stringify({ path: url.pathname, cookie: !!req.headers.cookie, origin, host: req.headers.host })}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws, url.searchParams.get("sid") ?? "anon"));
  });

  function attach(ws: WebSocket, sid: string) {
    let c = clients.get(sid);
    if (!c) {
      c = { ws: null, outbox: [], adb: new Map(), remotes: new Map(), waiting: new Map(), stopDiscovery: null, expiry: null };
      clients.set(sid, c);
      log("Phone connected.");
    }
    const client = c;
    if (client.expiry) clearTimeout(client.expiry);
    client.ws?.close();
    client.ws = ws;
    for (const m of client.outbox.splice(0)) ws.send(m);
    ws.on("message", (data) => void handle(client, String(data)));
    ws.on("close", () => {
      if (client.ws !== ws) return;
      client.ws = null;
      // Safari drops the socket when the phone locks or switches apps; keep the TV connection a while.
      client.expiry = setTimeout(() => {
        client.stopDiscovery?.();
        client.adb.forEach((a) => a.close());
        client.remotes.forEach((r) => r.close());
        clients.delete(sid);
      }, 15 * 60_000);
    });
  }

  const send = (c: Client, msg: unknown) => {
    const s = JSON.stringify(msg);
    if (c.ws && c.ws.readyState === c.ws.OPEN) c.ws.send(s);
    else c.outbox.push(s);
  };

  const errorOf = (e: unknown) => {
    if (e instanceof AdbError) return { name: "AdbError", kind: e.kind, message: e.message };
    if (e instanceof PairingError) return { name: "PairingError", kind: e.kind, message: e.message };
    const code = (e as NodeJS.ErrnoException)?.code;
    // Could not reach the TV at all: to the app, the same as the TV closing the connection.
    if (code) return { name: "AdbError", kind: "closed", message: `could not reach the TV (${code})` };
    return { name: "Error", kind: "unknown", message: String((e as Error)?.message ?? e) };
  };

  async function handle(c: Client, raw: string) {
    let m: { id: number; op: string; [k: string]: unknown };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const reply = (value: unknown) => send(c, { id: m.id, ok: true, value });
    try {
      switch (m.op) {
        case "discover.start":
          c.stopDiscovery?.();
          c.stopDiscovery = discover((tv) => send(c, { event: "found", tv }));
          return reply(null);
        case "discover.stop":
          c.stopDiscovery?.();
          c.stopDiscovery = null;
          return reply(null);
        case "adb.connect": {
          const host = String(m.host);
          log(`Connecting to the TV at ${host}…`);
          const t = await tcpTransport(Number(m.port ?? 5555), host);
          const conn = await AdbConnection.connect(t, key, {
            keyName,
            authTimeoutMs: 90_000,
            onAuthPrompt: () => (log("The TV is asking to allow this computer. Choose Allow on the TV."), send(c, { event: "allow-prompt", req: m.id })),
          });
          const cid = nextId++;
          c.adb.set(cid, conn);
          log("Connected to the TV.");
          return reply({ cid, banner: conn.banner.props });
        }
        case "adb.shell": {
          const conn = c.adb.get(Number(m.cid));
          if (!conn) return reply({ ok: false, out: "" });
          return reply(await new AdbTvShell(conn).run(String(m.command)));
        }
        case "adb.close":
          c.adb.get(Number(m.cid))?.close();
          c.adb.delete(Number(m.cid));
          return reply(null);
        case "probe":
          return reply(await nodeProber.probe(String(m.host), Number(m.port), Math.min(Number(m.timeoutMs) || 3000, 15_000)));
        case "records.get":
          return reply(records[`${m.t}|${m.l}`] ?? null);
        case "records.put":
          records[`${m.t}|${m.l}`] = m.record as RecoveryRecord;
          writeFileSync(recordsPath, JSON.stringify(records, null, 1));
          return reply(null);
        case "remote.open": {
          const rid = nextId++;
          const remote = await openRemote(String(m.host), remoteId, () => {
            send(c, { event: "code-needed", req: m.id });
            return new Promise<string>((resolve) => c.waiting.set(m.id, resolve));
          });
          c.waiting.delete(m.id);
          c.remotes.set(rid, remote);
          return reply({ rid });
        }
        case "remote.code":
          c.waiting.get(Number(m.req))?.(String(m.code));
          return reply(null);
        case "remote.key":
          await c.remotes.get(Number(m.rid))?.key(m.name as Parameters<TvRemote["key"]>[0]);
          return reply(null);
        case "remote.text":
          await c.remotes.get(Number(m.rid))?.text(String(m.text));
          return reply(null);
        case "remote.close":
          c.remotes.get(Number(m.rid))?.close();
          c.remotes.delete(Number(m.rid));
          return reply(null);
        default:
          throw new Error(`unknown op ${m.op}`);
      }
    } catch (e) {
      send(c, { id: m.id, ok: false, error: errorOf(e) });
    }
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, "0.0.0.0", () => resolve(server));
  });
}
