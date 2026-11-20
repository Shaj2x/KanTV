// Builds KanTV Connect as one program file for this computer's OS: the web app (exported with Expo), the
// helper bundled into a single script, and both carried inside a copy of Node (a "single executable
// application"). The person downloads one file and double-clicks it; nothing else to install.
//   node apps/connect/build.mjs            -> apps/connect/dist/kantv-connect[.exe]
//   node apps/connect/build.mjs --no-app   -> reuse dist/app from an earlier build
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");
const APP = join(DIST, "app");
const win = process.platform === "win32";
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", shell: win, ...opts });

mkdirSync(DIST, { recursive: true });

if (!process.argv.includes("--no-app")) {
  rmSync(APP, { recursive: true, force: true });
  // Served from the root of the helper; no backend keys (EXPO_NO_DOTENV), so nothing secret is inside.
  run("npx", ["expo", "export", "--platform", "web", "--output-dir", APP], {
    cwd: join(HERE, "..", "mobile"),
    env: { ...process.env, EXPO_NO_DOTENV: "1", EXPO_OFFLINE: "1", CI: "1", KANTV_WEB_BASE: "" },
  });
}

await build({
  entryPoints: [join(HERE, "src", "main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: join(DIST, "kantv-connect.cjs"),
  logLevel: "warning",
  define: { "import.meta.dirname": "__dirname" },
});

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(relative(APP, join(d, f)).split("\\").join("/"))));
walk(APP);
writeFileSync(join(DIST, "manifest.json"), JSON.stringify(files));
const assets = Object.fromEntries([["manifest.json", join(DIST, "manifest.json")], ...files.map((f) => [f, join(APP, f)])]);
writeFileSync(
  join(DIST, "sea-config.json"),
  JSON.stringify({ main: join(DIST, "kantv-connect.cjs"), output: join(DIST, "sea.blob"), disableExperimentalSEAWarning: true, useCodeCache: false, assets }),
);
run(process.execPath, ["--experimental-sea-config", join(DIST, "sea-config.json")]);

const exe = join(DIST, win ? "kantv-connect.exe" : "kantv-connect");
rmSync(exe, { force: true });
copyFileSync(process.execPath, exe);
chmodSync(exe, 0o755);
if (process.platform === "darwin") run("codesign", ["--remove-signature", exe]);
const postject = ["postject", exe, "NODE_SEA_BLOB", join(DIST, "sea.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (process.platform === "darwin") postject.push("--macho-segment-name", "NODE_SEA");
run("npx", ["--yes", "postject@1.0.0-alpha.6", ...postject.slice(1)]);
if (process.platform === "darwin") run("codesign", ["--sign", "-", exe]);
console.log(`Built ${relative(process.cwd(), exe)} (${Math.round(statSync(exe).size / 1e6)} MB)`);
