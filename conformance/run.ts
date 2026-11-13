// Runs upstream cleanyourtv (its real tools/disable.sh and tools/recovery.py) and the KanTV port against the
// same fake TVs, and compares what each did: the list refused or not, the packages actually disabled on the
// TV, the packages a guard skipped, the recovery record, and the restore commands.
//
//   UPSTREAM_DIR=../cleanyourtv npx tsx conformance/run.ts [--random N] [--seed S] [--only substring]
//
// Exit status 1 on any difference not listed in KNOWN_DIVERGENCES below.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  RecoveryError,
  restoreCommands,
  runDebloat,
  validateList,
  type RecordStore,
  type RecoveryRecord,
} from "../packages/core/src/index.ts";
import { FAKE_TV_BIN, FAKE_TV_DIR, FakeTvShell } from "../testing/fake-tv/shell.ts";
import { generated, handwritten, type Scenario } from "./scenarios.ts";

const UPSTREAM = resolve(process.env.UPSTREAM_DIR ?? "../cleanyourtv");

/** Differences we chose on purpose, by scenario name and field, with the reason. */
const KNOWN_DIVERGENCES: { scenario: RegExp; field: string; why: string }[] = [
  ...["disabled", "skipped"].map((field) => ({
    scenario: /query-activities prints nothing/,
    field,
    why:
      "upstream splits the handler answer with sed '1,/^==$/d', which looks for the end marker after line 1: " +
      "when the input query printed nothing, \"==\" is line 1 and every Settings handler is dropped, so it " +
      "goes unprotected. KanTV splits at the marker wherever it is and keeps the Settings app.",
  })),
];

interface Outcome {
  refused: boolean;
  aborted: boolean;
  disabledSent: string[];
  skipped: string[];
  record: Pick<RecoveryRecord, "home" | "settings" | "packages"> | null;
  adbInsecure: boolean;
  restore: string[] | null;
  stderr?: string;
  reasons?: string[];
}

function exec(cmd: string, args: string[], env: Record<string, string>, cwd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((res) => {
    const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => res({ code: code ?? -1, out, err }));
  });
}

const sentDisables = (log: string[] = []) =>
  [...new Set(log.filter((l) => l.startsWith("pm disable-user --user 0 ")).map((l) => l.split(" ").pop()!))].sort();

function upstreamSkips(stderr: string): string[] {
  const names = new Set<string>();
  for (const m of stderr.matchAll(/^Skipping (.+?): /gm)) for (const n of m[1]!.split(" ")) names.add(n);
  return [...names].sort();
}

async function runUpstream(sc: Scenario, dir: string): Promise<Outcome> {
  const repo = join(dir, "upstream");
  const tools = join(repo, "tools");
  const home = join(dir, "home");
  mkdirSync(join(tools, "venv", "bin"), { recursive: true });
  mkdirSync(home, { recursive: true });
  for (const f of ["disable.sh", "recovery.py"]) copyFileSync(join(UPSTREAM, "tools", f), join(tools, f));
  copyFileSync(join(FAKE_TV_DIR, "tv.py"), join(tools, "tv.py"));
  writeFileSync(join(tools, "venv", "bin", "python"), `#!/bin/sh\nexec python3 "$@"\n`, { mode: 0o755 });
  const state = join(dir, "upstream-tv.json");
  writeFileSync(state, JSON.stringify(sc.tv));
  const list = join(dir, "debloat.txt");
  writeFileSync(list, sc.list.join("\n") + "\n");
  const env = { HOME: home, TV_HOST: "192.168.1.50", FAKE_TV_STATE: state, FAKE_TV_BIN, ...sc.env };
  const run = await exec("bash", [join(tools, "disable.sh"), list], env, dir);
  const after = JSON.parse(readFileSync(state, "utf8"));
  const recDir = join(home, ".cleanyourtv");
  const recFile = existsSync(recDir) ? readdirSync(recDir).find((f) => f.endsWith(".json")) : undefined;
  const raw = recFile ? JSON.parse(readFileSync(join(recDir, recFile), "utf8")) : null;
  let restore: string[] | null = null;
  if (raw) {
    const r = await exec("python3", ["-I", join(tools, "recovery.py"), "--commands", list, sc.stock], env, dir);
    restore = r.out.split("\n").filter(Boolean);
  }
  const refused = run.code !== 0 && /^refusing /m.test(run.err);
  return {
    refused,
    aborted: !refused && !raw,
    disabledSent: sentDisables(after.log),
    skipped: refused ? [] : upstreamSkips(run.err),
    record: raw ? { home: raw.home, settings: raw.settings, packages: raw.packages } : null,
    adbInsecure: /ro\.adb\.secure/.test(run.err),
    restore,
    stderr: run.err,
  };
}

async function runOurs(sc: Scenario, dir: string, upstreamRecord: unknown): Promise<Outcome> {
  const shell = FakeTvShell.create(join(dir, "ours-tv.json"), sc.tv);
  const parsed = { entries: sc.list.map((name, i) => ({ name, comment: "", line: i + 1 })), header: [] };
  const valid = validateList(parsed, { applyMustKeep: false });
  if (!valid.ok) return { refused: true, aborted: false, disabledSent: [], skipped: [], record: null, adbInsecure: false, restore: null };
  const records = new Map<string, RecoveryRecord>();
  const store: RecordStore = {
    get: async (t, l) => records.get(`${t}|${l}`) ?? null,
    put: async (t, l, r) => void records.set(`${t}|${l}`, r),
  };
  const options = {
    forceHome: !!sc.env.FORCE_HOME,
    forceSetupwraith: !!sc.env.FORCE_SETUPWRAITH,
    tvInputAllow: !!sc.env.TVINPUT_ALLOW,
    handlersAllow: !!sc.env.HANDLERS_ALLOW,
  };
  let skipped: string[] = [];
  let reasons: string[] = [];
  let record: RecoveryRecord | null = null;
  let adbInsecure = false;
  let aborted = false;
  try {
    const result = await runDebloat(shell, store, { tvId: "tv", listId: "list", packages: valid.packages, options, applyMustKeep: false });
    if (result.ok) {
      skipped = result.plan.skipped.map((s) => s.name).sort();
      reasons = [...result.plan.skipped.map((s) => s.reason), ...result.plan.notes];
      record = result.record;
      adbInsecure = result.plan.notes.includes("adb-insecure");
    }
  } catch (e) {
    if (!(e instanceof RecoveryError)) throw e;
    aborted = true;
  }
  // The restore commands are compared on upstream's own record, so only the replay logic differs.
  let restore: string[] | null = null;
  if (upstreamRecord) restore = restoreCommands(upstreamRecord as RecoveryRecord, valid.packages, sc.stock);
  return {
    refused: false,
    aborted,
    disabledSent: sentDisables(shell.state().log),
    skipped,
    record: record ? { home: record.home, settings: record.settings, packages: record.packages } : null,
    adbInsecure,
    restore,
    reasons,
  };
}

const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

function compare(sc: Scenario, up: Outcome, ours: Outcome): { field: string; upstream: unknown; ours: unknown }[] {
  const diffs: { field: string; upstream: unknown; ours: unknown }[] = [];
  const check = (field: string, a: unknown, b: unknown) => {
    if (canon(a) !== canon(b)) diffs.push({ field, upstream: a, ours: b });
  };
  check("refused", up.refused, ours.refused);
  if (up.refused || ours.refused) return diffs;
  check("aborted", up.aborted, ours.aborted);
  check("disabled", up.disabledSent, ours.disabledSent);
  check("skipped", up.skipped, ours.skipped);
  if (!up.aborted && !ours.aborted) {
    check("record", up.record, ours.record);
    check("adb-insecure note", up.adbInsecure, ours.adbInsecure);
    check("restore commands", up.restore, ours.restore);
  }
  return diffs.filter((d) => !KNOWN_DIVERGENCES.some((k) => k.scenario.test(sc.name) && k.field === d.field));
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, dflt: string) => {
    const i = args.indexOf(name);
    return i === -1 ? dflt : args[i + 1]!;
  };
  if (!existsSync(join(UPSTREAM, "tools", "disable.sh"))) {
    console.error(`no upstream checkout at ${UPSTREAM}; set UPSTREAM_DIR`);
    process.exit(2);
  }
  const only = opt("--only", "");
  const scenarios = [...handwritten(), ...generated(Number(opt("--random", "300")), Number(opt("--seed", "20261030")))].filter(
    (s) => s.name.includes(only),
  );
  const root = mkdtempSync(join(tmpdir(), "kantv-conformance-"));
  let failed = 0;
  let next = 0;
  const seen = { refused: 0, aborted: 0, skippedAny: 0, disabledAny: 0, restored: 0 };
  const reasons = new Map<string, number>();
  const worker = async () => {
    while (next < scenarios.length) {
      const i = next++;
      const sc = scenarios[i]!;
      const dir = join(root, String(i));
      mkdirSync(dir, { recursive: true });
      const up = await runUpstream(sc, dir);
      const rawRecordDir = join(dir, "home", ".cleanyourtv");
      const recFile = existsSync(rawRecordDir) ? readdirSync(rawRecordDir).find((f) => f.endsWith(".json")) : undefined;
      const upRecord = recFile ? JSON.parse(readFileSync(join(rawRecordDir, recFile), "utf8")) : null;
      const ours = await runOurs(sc, dir, upRecord);
      const diffs = compare(sc, up, ours);
      if (up.refused) seen.refused++;
      if (up.aborted) seen.aborted++;
      if (up.skipped.length) seen.skippedAny++;
      if (up.disabledSent.length) seen.disabledAny++;
      if (up.restore) seen.restored++;
      for (const r of ours.reasons ?? []) reasons.set(r, (reasons.get(r) ?? 0) + 1);
      if (diffs.length) {
        failed++;
        console.log(`\nDIFF  ${sc.name}`);
        for (const d of diffs) console.log(`  ${d.field}\n    upstream: ${canon(d.upstream)}\n    kantv:    ${canon(d.ours)}`);
        if (process.env.VERBOSE) console.log(`  scenario: ${canon(sc)}\n  upstream stderr:\n${up.stderr}`);
      } else {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  };
  await Promise.all(Array.from({ length: Number(opt("--jobs", "8")) }, worker));
  console.log(`\ncoverage: ${canon(seen)}\nguard decisions: ${canon(Object.fromEntries(reasons))}`);
  console.log(`\n${scenarios.length - failed}/${scenarios.length} scenarios match upstream` + (failed ? `; kept for inspection in ${root}` : ""));
  if (!failed) rmSync(root, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main();
