// KanTV Connect: double-click it on a computer on the same Wi-Fi as the TV. It opens a page on this computer
// with a QR code; scanning it on the iPhone opens KanTV in Safari, connected to the real TV through here.
import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import QRCode from "qrcode";
import { lanAddresses } from "./net.ts";
import { startServer, type Files } from "./server.ts";
import { welcomePage } from "./welcome.ts";

async function appFiles(): Promise<Files> {
  // The packaged program carries the app inside itself; from source it reads the web export from disk.
  try {
    const sea = await import("node:sea");
    if (sea.isSea()) {
      const list = new Set(JSON.parse(sea.getAsset("manifest.json", "utf8")) as string[]);
      return { get: (p) => (list.has(p) ? Buffer.from(sea.getAsset(p)) : null) };
    }
  } catch {
    // not packaged
  }
  const dir = resolve(process.env.KANTV_APP_DIR ?? join(import.meta.dirname ?? ".", "..", "dist", "app"));
  if (!existsSync(join(dir, "index.html"))) {
    console.error(`The web app isn't built yet. Run: npm run build -w @kantv/connect   (looked in ${dir})`);
    process.exit(1);
  }
  return { get: (p) => (existsSync(join(dir, p)) && !p.endsWith("/") ? readFileSync(join(dir, p)) : null) };
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? `open "${url}"` : process.platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

async function main() {
  const stateDir = process.env.KANTV_CONNECT_HOME ?? join(homedir(), ".kantv-connect");
  mkdirSync(stateDir, { recursive: true });
  const keyPath = join(stateDir, "link-key");
  // The same link every time, so a bookmark on the phone keeps working.
  const key = existsSync(keyPath) ? readFileSync(keyPath, "utf8").trim() : randomBytes(5).toString("hex");
  if (!existsSync(keyPath)) writeFileSync(keyPath, key, { mode: 0o600 });

  const files = await appFiles();
  let port = Number(process.env.PORT ?? 7700);
  const address = () => lanAddresses()[0]?.address ?? "127.0.0.1";
  const phoneUrl = () => `http://${address()}:${port}/?key=${key}`;
  for (let tries = 0; ; tries++) {
    try {
      await startServer({ port, stateDir, files, key, phoneUrl, welcome: welcomePage, log: (l) => console.log(`  ${l}`) });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || tries > 20) throw e;
      port++;
    }
  }

  const url = phoneUrl();
  console.log(`\n  KanTV Connect is running.\n`);
  console.log(await QRCode.toString(url, { type: "terminal", small: true }));
  console.log(`  On your iPhone (same Wi-Fi as this computer and the TV), scan the code above`);
  console.log(`  with the Camera, or open Safari and type:\n\n    ${url}\n`);
  console.log(`  Keep this window open while you use KanTV. Close it when you're done.\n`);
  if (!lanAddresses().length) console.log("  This computer doesn't seem to be on a Wi-Fi or wired network. Connect it to the same Wi-Fi as the TV.\n");
  if (!process.env.KANTV_NO_BROWSER) openBrowser(`http://localhost:${port}/`);
}

main().catch((e) => {
  console.error(`KanTV Connect couldn't start: ${e?.message ?? e}`);
  process.exit(1);
});
