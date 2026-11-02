// The safety checks that decide which listed packages may be disabled on this TV. A port of the guards in
// cleanyourtv tools/disable.sh (MIT, see THIRD_PARTY_NOTICES.md), in the same order and with the same
// fail-closed choices; conformance/ runs both against the same fake TVs and compares the decisions.
import {
  CLAIM_QUERY,
  FACTORY_RE,
  FALLBACK_HOME_RE,
  HOME_QUERY,
  KNOWN_STOCK_LAUNCHERS,
  NOT_LAUNCHERS,
  PACKAGE_RE,
  SETUPWRAITH,
  packageOf,
} from "./packages.ts";
import { lastLine, linesOf, type TvShell } from "./shell.ts";

export interface GuardOptions {
  /** Disable setupwraith even if it owns a saved Wi-Fi network (a TV on Ethernet). */
  forceSetupwraith?: boolean;
  /** Disable the app that owns Home even if nothing else can answer Home. */
  forceHome?: boolean;
  /** Disable packages that ask for TV_INPUT_HARDWARE. */
  tvInputAllow?: boolean;
  /** Disable the apps that open HDMI inputs and Settings. */
  handlersAllow?: boolean;
}

export type SkipReason =
  | "setupwraith-wifi-unknown" // could not read which app owns the saved Wi-Fi networks
  | "setupwraith-owns-wifi" // disabling it would delete the network the TV is on
  | "home-only-launcher" // owns Home and nothing else could answer Home
  | "home-setupwraith" // owns Home and setupwraith would take Home instead (#1573)
  | "home-no-default" // Home has no default and no other launcher would be left
  | "home-unknown-stock" // could not ask who answers Home, and it is a stock launcher
  | "tvinput-hung" // dumpsys is switched off by the watchdog; reboot first
  | "tvinput-unreadable" // the dump cannot be read for the input-driver check (Android 5.x)
  | "tvinput-hardware" // asks for TV_INPUT_HARDWARE: the layer under HDMI/AV/tuner (#321)
  | "handler-inputs" // opens the TV's HDMI/AV inputs
  | "handler-settings"; // opens Settings, and with it the way back to Developer options

export type NoteKind =
  | "home-chooser" // Home has no default; the guard went by the apps that answer Home
  | "home-unknown" // neither query named Home; check the list by hand (#795)
  | "tvinput-unchecked" // the input-driver check did not run
  | "handlers-unchecked" // the input/Settings handler check did not run
  | "adb-insecure"; // ro.adb.secure is 0 or unset: port 5555 accepts anyone on the LAN

export interface Skip {
  name: string;
  reason: SkipReason;
}

export interface DisablePlan {
  /** What may be disabled, in list order. */
  disable: string[];
  skipped: Skip[];
  notes: NoteKind[];
  /** The Home owner the guard found, if any. */
  homePackage: string | null;
}

/**
 * The upstream input-driver check, run on the TV in one round trip. Prints a name per package that asks
 * for TV_INPUT_HARDWARE (or serves TvInputService on Lollipop), "HUNG name" when dumps are switched off,
 * and "NOCHK name" for a dump the check cannot read. Names are checked as bare package names first.
 */
export function tvInputCheckCommand(names: string[]): string {
  const list = names.map((n) => `${n} `).join("");
  return (
    `s=$(getprop ro.build.version.sdk); for p in ${list}; do d=$(dumpsys package $p 2>/dev/null); case $d in ` +
    `*'requested permissions:'*) printf '%s\\n' "$d" | sed -n -E '/requested permissions:/,/(install|runtime) permissions:|User [0-9]+:/p' | grep -q TV_INPUT_HARDWARE && echo $p;; ` +
    `*'grantedPermissions:'*) printf '%s\\n' "$d" | sed -n -E '/grantedPermissions:/,/(install|runtime) permissions:|User [0-9]+:/p' | grep -q TV_INPUT_HARDWARE && echo $p;; ` +
    `*'Service Resolver Table:'*) printf '%s\\n' "$d" | grep -q 'android.media.tv.TvInputService' && echo $p;; ` +
    `*'Unable to find'*) :;; *'hung system process'*) echo "HUNG $p";; ` +
    `*"Package [$p]"*) [ "\${s:-0}" -ge 23 ] 2>/dev/null || echo "NOCHK $p";; *) echo "NOCHK $p";; esac; done; true`
  );
}

/** Packages per input-driver command: about 2 KB, well under the 4 KB message limit of older TVs. */
export const TVINPUT_CHUNK = 20;

export const HANDLERS_QUERY =
  "cmd package query-activities --brief -a android.intent.action.VIEW -t vnd.android.cursor.item/channel 2>/dev/null; echo ==; " +
  "cmd package query-activities --brief -a android.settings.SETTINGS 2>/dev/null; true";

/** Every HOME component the TV lists, or null when it answers nothing usable. */
export function parseHomeClaims(out: string): string[] | null {
  const claims = new Set<string>();
  for (const line of linesOf(out)) {
    const m = /^ *([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/.exec(line);
    if (m) claims.add(m[1]!);
  }
  return claims.size ? [...claims].sort() : null;
}

/** The packages among HOME claims that are launchers a viewer can use. */
export function launchersIn(claims: string[]): string[] {
  const packages = new Set(
    claims.filter((c) => !FALLBACK_HOME_RE.test(c)).map(packageOf),
  );
  return [...packages].filter((p) => !FACTORY_RE.test(p) && !NOT_LAUNCHERS.has(p)).sort();
}

function namesFrom(out: string): string[] {
  const names = new Set<string>();
  for (const line of linesOf(out)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+)\//.exec(line);
    if (m) names.add(m[1]!);
  }
  return [...names];
}

/** Decides what may be disabled. Sends only read-only queries to the TV. */
export async function planDisable(
  shell: TvShell,
  listPackages: string[],
  options: GuardOptions = {},
): Promise<DisablePlan> {
  let pkgs = [...listPackages];
  const skipped: Skip[] = [];
  const notes: NoteKind[] = [];
  const skip = (name: string, reason: SkipReason) => {
    if (!pkgs.includes(name)) return;
    pkgs = pkgs.filter((p) => p !== name);
    skipped.push({ name, reason });
  };

  // setupwraith owns the Wi-Fi network saved during first setup; Android deletes that network when it is
  // disabled, and the TV drops off Wi-Fi with ADB and the phone remote. Unreadable counts as owned.
  if (pkgs.includes(SETUPWRAITH) && !options.forceSetupwraith) {
    const wifi = await shell.run("dumpsys wifi");
    const owners = wifi.ok ? (wifi.out.match(/cname=[^ \n]*/g) ?? []) : [];
    if (!owners.length) skip(SETUPWRAITH, "setupwraith-wifi-unknown");
    else if (owners.some((o) => o.includes("setupwraith"))) skip(SETUPWRAITH, "setupwraith-owns-wifi");
  }

  const secure = await shell.run("getprop ro.adb.secure");
  if (secure.ok) {
    const value = secure.out.replace(/\s/g, "");
    if (value === "0" || value === "") notes.push("adb-insecure");
  }

  // Home guard (#239, #795, #1573): never leave the TV with nothing to start when Home is pressed.
  let homePackage = "";
  let chooser = false;
  if (!options.forceHome && pkgs.length) {
    const home = await shell.run(HOME_QUERY);
    homePackage = home.ok ? packageOf(lastLine(home.out)) : "";
    if (homePackage === "android") chooser = true;
    if (!PACKAGE_RE.test(homePackage)) {
      // Before Android 7 there is no `cmd`; the framework still names the Home process.
      const activity = await shell.run("dumpsys activity");
      homePackage = "";
      if (activity.ok) {
        for (const line of linesOf(activity.out)) {
          const m = /.*mHomeProcess:.*[: ]([A-Za-z0-9_.]+)\/[A-Za-z0-9_.]+.*/.exec(line);
          if (m) {
            homePackage = m[1]!;
            break;
          }
        }
      }
      if (!PACKAGE_RE.test(homePackage)) homePackage = "";
    }
    if (homePackage) {
      if (pkgs.includes(homePackage)) {
        const claimsOut = await shell.run(CLAIM_QUERY);
        const claims = (claimsOut.ok ? parseHomeClaims(claimsOut.out) : null) ?? [];
        const others = launchersIn(claims).filter((p) => p !== homePackage && !pkgs.includes(p));
        // setupwraith's RecoveryActivity answers ahead of a launcher that is merely installed.
        const setupHome =
          claims.some((c) => c.includes(`${SETUPWRAITH}/`)) && !pkgs.includes(SETUPWRAITH);
        if (!others.length) skip(homePackage, "home-only-launcher");
        else if (setupHome) skip(homePackage, "home-setupwraith");
      }
    } else {
      // No single owner: fail closed, by the claimants, or by the known stock launchers.
      const claimsOut = await shell.run(CLAIM_QUERY);
      const claims = claimsOut.ok ? parseHomeClaims(claimsOut.out) : null;
      if (claims) {
        const launchers = launchersIn(claims);
        const listed = launchers.filter((p) => pkgs.includes(p));
        const others = launchers.filter((p) => !pkgs.includes(p));
        if (listed.length && !others.length) for (const p of listed) skip(p, "home-no-default");
      } else {
        for (const p of KNOWN_STOCK_LAUNCHERS) skip(p, "home-unknown-stock");
      }
    }
  }
  if (pkgs.length && !homePackage && !options.forceHome) notes.push(chooser ? "home-chooser" : "home-unknown");

  // Input-driver guard (#321): a package asking for TV_INPUT_HARDWARE is usually the layer under the HDMI,
  // AV and tuner inputs; disabled, the ports stay black until a full restore and a cold boot.
  if (pkgs.length && !options.tvInputAllow) {
    // In groups, so each command fits the 4 KB an older TV accepts per ADB message; all or nothing, like the
    // single command upstream sends.
    const outputs: string[] = [];
    let ok = true;
    for (let i = 0; i < pkgs.length && ok; i += TVINPUT_CHUNK) {
      const r = await shell.run(tvInputCheckCommand(pkgs.slice(i, i + TVINPUT_CHUNK)));
      ok = r.ok;
      outputs.push(r.out);
    }
    const check = { ok, out: outputs.join("\n") };
    if (check.ok) {
      const lines = linesOf(check.out).map((l) => l.trim()).filter(Boolean);
      for (const l of lines) if (l.startsWith("HUNG ")) skip(l.slice(5), "tvinput-hung");
      for (const l of lines) if (l.startsWith("NOCHK ")) skip(l.slice(6), "tvinput-unreadable");
      for (const l of lines) {
        if (l.startsWith("HUNG ") || l.startsWith("NOCHK ")) continue;
        for (const name of l.split(/\s+/)) skip(name, "tvinput-hardware");
      }
    } else {
      notes.push("tvinput-unchecked");
    }
  }

  // Handler guard: whatever opens HDMI inputs and Settings stays, or the launcher's input tiles do nothing
  // and Settings (the way back to Developer options) does not open.
  if (pkgs.length && !options.handlersAllow) {
    const handlers = await shell.run(HANDLERS_QUERY);
    if (handlers.ok) {
      const lines = linesOf(handlers.out);
      const split = lines.indexOf("==");
      const inputApps = namesFrom((split === -1 ? lines : lines.slice(0, split)).join("\n"));
      const settingsApps = split === -1 ? [] : namesFrom(lines.slice(split + 1).join("\n"));
      if (!settingsApps.length) notes.push("handlers-unchecked");
      for (const p of inputApps.sort()) skip(p, "handler-inputs");
      for (const p of settingsApps.sort()) skip(p, "handler-settings");
    } else {
      notes.push("handlers-unchecked");
    }
  }

  return { disable: pkgs, skipped, notes, homePackage: homePackage || null };
}
