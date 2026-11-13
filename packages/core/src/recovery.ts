// The state a debloat list is about to change, recorded before the first change so that undo means undo
// (#239). A port of cleanyourtv tools/recovery.py (MIT, see THIRD_PARTY_NOTICES.md); the record format is
// the same (version 1), so restoreCommands() and recovery.py --commands can be compared line for line.
import {
  ANIMATION_SCALES,
  CUSTOM_LAUNCHERS,
  FACTORY_RE,
  FALLBACK_HOME_RE,
  HOME_QUERY,
  HOME_RE,
  KNOWN_STOCK_LAUNCHERS,
  NOT_LAUNCHERS,
  PACKAGE_RE,
  SCALE_RE,
  packageOf,
} from "./packages.ts";
import { lastLine, packageNames, type TvShell } from "./shell.ts";

export type PackageState = "absent" | "disabled" | "enabled";

export interface RecoveryRecord {
  version: 1;
  created: string;
  /** Who the record is for. KanTV uses the TV's hashed hardware ID; upstream uses the address. */
  host: string;
  /** Which list it was taken for. */
  list: string;
  /** The Home component before cleanup, or null. */
  home: string | null;
  settings: Record<string, string>;
  packages: Record<string, PackageState>;
}

export class RecoveryError extends Error {}

function state(name: string, installed: Set<string>, disabled: Set<string>): PackageState {
  return !installed.has(name) ? "absent" : disabled.has(name) ? "disabled" : "enabled";
}

/** Android's chooser answers HOME when Home has no default; its package, "android", is no launcher. */
export function isChooser(home: string | null): boolean {
  return !!home && !PACKAGE_RE.test(packageOf(home));
}

/** setupwraith's recovery screen, a FallbackHome placeholder, a factory test: Home, but no launcher. */
export function notALauncher(home: string | null): boolean {
  if (!home) return false;
  const p = packageOf(home);
  return NOT_LAUNCHERS.has(p) || FALLBACK_HOME_RE.test(home) || FACTORY_RE.test(p);
}

async function must(shell: TvShell, command: string): Promise<string> {
  const r = await shell.run(command);
  if (!r.ok) throw new RecoveryError(`the TV stopped answering (${command}); nothing was recorded or changed`);
  return r.out.trim();
}

/** Installed and disabled packages for user 0, the user every command here acts on. */
export async function queryPackages(shell: TvShell): Promise<{ installed: Set<string>; disabled: Set<string> }> {
  let scope = " --user 0";
  let installed = packageNames(await must(shell, "pm list packages --user 0"));
  if (!installed.size) {
    // A pm without --user prints its usage instead; only that falls back to the merged answer.
    scope = "";
    installed = packageNames(await must(shell, "pm list packages"));
  }
  if (!installed.size) throw new RecoveryError("the TV returned no packages, so nothing was recorded");
  const disabled = packageNames(await must(shell, `pm list packages -d${scope}`));
  return { installed, disabled };
}

export async function queryHome(shell: TvShell): Promise<string | null> {
  const answer = await must(shell, HOME_QUERY);
  const candidate = answer ? lastLine(answer).trim() : "";
  return HOME_RE.test(candidate) ? candidate : null;
}

/** A new record of the TV before cleanup. Throws (and records nothing) if the TV stops answering. */
export async function takeRecord(
  shell: TvShell,
  listPackages: string[],
  meta: { host: string; list: string; now?: Date },
): Promise<RecoveryRecord> {
  const { installed, disabled } = await queryPackages(shell);
  let home = await queryHome(shell);
  const settings: Record<string, string> = {};
  for (const key of ANIMATION_SCALES) settings[key] = await must(shell, `settings get global ${key}`);

  if (isChooser(home)) home = null;
  // The launcher that owns Home, and any installed stock launcher, are what undo has to put back (#1714).
  const homePackage = home ? packageOf(home) : null;
  const targets = [...listPackages];
  if (homePackage && !targets.includes(homePackage)) targets.push(homePackage);
  for (const s of KNOWN_STOCK_LAUNCHERS) if (installed.has(s) && !targets.includes(s)) targets.push(s);
  if (notALauncher(home)) home = null;

  const packages: Record<string, PackageState> = {};
  for (const name of targets) packages[name] = state(name, installed, disabled);
  return {
    version: 1,
    created: (meta.now ?? new Date()).toISOString(),
    host: meta.host,
    list: meta.list,
    home,
    settings,
    packages,
  };
}

/**
 * Brings an existing record up to date before the list is applied again. Entries are never overwritten (a
 * retry must not record the broken state as the original); names the list gained are added with their
 * state now, and a package recorded absent that is now installed and enabled is recorded as enabled.
 */
export function extendRecord(
  record: RecoveryRecord,
  listPackages: string[],
  installed: Set<string>,
  disabled: Set<string>,
): { record: RecoveryRecord; added: string[]; arrived: string[] } {
  const packages = { ...record.packages };
  const arrived = listPackages.filter(
    (n) => packages[n] === "absent" && state(n, installed, disabled) === "enabled",
  );
  const added = listPackages.filter((n) => !(n in packages));
  for (const n of added) packages[n] = state(n, installed, disabled);
  for (const n of arrived) packages[n] = "enabled";
  return { record: { ...record, packages }, added, arrived };
}

/** Checks a stored record before it is replayed on the TV's shell, the way recovery.py's load does. */
export function checkRecord(raw: unknown): RecoveryRecord {
  const r = raw as RecoveryRecord;
  if (!r || r.version !== 1 || typeof r.packages !== "object" || r.packages === null)
    throw new RecoveryError("unknown recovery record format");
  let home = r.home;
  const packages = { ...r.packages };
  if (typeof home === "string" && HOME_RE.test(home) && isChooser(home)) {
    delete packages[packageOf(home)];
    home = null;
  } else if (typeof home === "string" && HOME_RE.test(home) && notALauncher(home)) {
    home = null;
  }
  for (const [name, s] of Object.entries(packages)) {
    if (!PACKAGE_RE.test(name)) throw new RecoveryError(`not a package name in the record: ${name}`);
    if (!["absent", "disabled", "enabled"].includes(s)) throw new RecoveryError(`unknown state for ${name}`);
  }
  if (home !== null && home !== undefined && !(typeof home === "string" && HOME_RE.test(home)))
    throw new RecoveryError("not a Home component in the record");
  if (r.settings !== undefined && (typeof r.settings !== "object" || r.settings === null || Array.isArray(r.settings)))
    throw new RecoveryError("settings is not a mapping");
  return { ...r, home: home ?? null, packages, settings: r.settings ?? {} };
}

/** Makes the stock home screen the default again (shared by Restore and the handover's rollback). */
export const resolveHome = (stock: string) =>
  `cmd package set-home-activity --user 0 $(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME ${stock} | tail -n 1)`;

/**
 * The commands that put the recorded states back, one per line: what was enabled before cleanup is enabled,
 * nothing else; Home goes back to the recorded launcher; the animation scales get their recorded values.
 * Without a record, every listed package is enabled and Home resolved to the stock launcher.
 */
export function restoreCommands(
  recordOrNull: RecoveryRecord | null,
  listPackages: string[],
  stock: string = "com.google.android.tvlauncher",
): string[] {
  if (stock && !PACKAGE_RE.test(stock)) throw new RecoveryError(`not a package name: ${stock}`);
  const commands: string[] = [];
  if (!recordOrNull) {
    for (const n of listPackages) commands.push(`pm enable ${n}`);
    if (stock) commands.push(`pm enable ${stock}`);
    commands.push(resolveHome(stock || "com.google.android.tvlauncher"));
    for (const key of ANIMATION_SCALES) commands.push(`settings put global ${key} 1.0`);
    commands.push("pm list packages -d");
    return commands;
  }
  const record = checkRecord(recordOrNull);
  for (const [name, s] of Object.entries(record.packages)) if (s === "enabled") commands.push(`pm enable ${name}`);

  const fallback = stock || "com.google.android.tvlauncher";
  const fallbackState = record.packages[fallback];
  const home = record.home;
  if (home && !CUSTOM_LAUNCHERS.has(packageOf(home))) {
    commands.push(`cmd package set-home-activity --user 0 ${home}`);
  } else if (home && fallbackState !== "enabled") {
    // Our launcher owned Home and the stock launcher was not on: Home stays where it was.
    commands.push(`cmd package set-home-activity --user 0 ${home}`);
  } else if (!home && (fallbackState === "disabled" || fallbackState === "absent")) {
    // Nothing to resolve: no Home was recorded and the stock launcher was off or missing.
  } else {
    commands.push(resolveHome(fallback));
  }
  for (const key of ANIMATION_SCALES) {
    const value = String(record.settings[key] ?? "").trim();
    if (value === "null") commands.push(`settings delete global ${key}`);
    else if (SCALE_RE.test(value)) commands.push(`settings put global ${key} ${value}`);
  }
  commands.push("pm list packages -d");
  return commands;
}
