// Package names and the protected sets. Ported from cleanyourtv tools/disable.sh and tools/recovery.py
// (MIT, see THIRD_PARTY_NOTICES.md); the issue numbers refer to github.com/Gathin23/cleanyourtv.

/** A bare package name. Anything else could carry shell syntax into a command on the TV (#165). */
export const PACKAGE_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
/** A component as package/activity. */
export const HOME_RE = /^[A-Za-z_][\w.]*\/[\w.$]+$/;
export const SCALE_RE = /^-?\d+(\.\d+)?$/;

/**
 * Core Android and TV middleware: with one of these disabled the TV may not boot again (#884, #1578, #1711,
 * #2557). No option overrides this.
 */
export const CORE_RE =
  /^(android|android\.ext\.(services|shared)|com\.android\.sdksandbox|com\.android\.systemui|com\.android\.shell|com\.android\.phone|com\.android\.settings|com\.android\.tv\.settings|com\.(google\.)?android\.(permissioncontroller|packageinstaller|ext\.services|ext\.shared|modulemetadata)|com\.google\.android\.overlay\.modules.*|com\.android\.providers\..*|com\.cltv\.mal|com\.mediatek\.(tis|tv\.service|tv\.agent))$/;
/** Content providers tested lists turn off and no TV feature uses. */
export const CORE_OK = /^com\.android\.providers\.(calendar|contacts|userdictionary|blockednumber)$/;

export function isCore(name: string): boolean {
  return CORE_RE.test(name) && !CORE_OK.test(name);
}

/** Stock launchers the install script recognises, and the only ones it will disable. */
export const KNOWN_STOCK_LAUNCHERS = [
  "com.google.android.tvlauncher",
  "com.google.android.apps.tv.launcherx",
  "com.google.android.leanbacklauncher",
  "com.mitv.tvhome",
] as const;

export const SETUPWRAITH = "com.google.android.tungsten.setupwraith";

/** Answer HOME without being a launcher: the setup wizards and the settings apps. */
export const NOT_LAUNCHERS = new Set([
  SETUPWRAITH,
  "com.android.tv.settings",
  "com.android.settings",
  "com.android.provision",
]);
export const FALLBACK_HOME_RE = /\/\S*FallbackHome$/;
export const FACTORY_RE = /factorytest|factory_test|factorymode/i;

/** The upstream reference launcher. Restore treats it like KanTV's own launcher. */
export const UPSTREAM_LAUNCHER = "com.gathin.tvhome";
/** KanTV's launcher package. */
export const KANTV_LAUNCHER = "tv.kantv.home";
export const CUSTOM_LAUNCHERS = new Set([UPSTREAM_LAUNCHER, KANTV_LAUNCHER]);

/**
 * Packages KanTV keeps enabled whatever a list says, because KanTV's own features need them after ADB is
 * closed. Upstream lists may disable these; KanTV strips them before planning.
 */
export const KANTV_MUST_KEEP: ReadonlyMap<string, string> = new Map([
  [
    "com.google.android.tv.remote.service",
    "KanTV's phone remote uses it (Android TV Remote protocol) once ADB is closed",
  ],
]);

export const ANIMATION_SCALES = [
  "window_animation_scale",
  "transition_animation_scale",
  "animator_duration_scale",
] as const;

export const HOME_QUERY =
  "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME";
export const CLAIM_QUERY =
  "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME";

export function packageOf(component: string): string {
  return component.split("/", 1)[0] ?? "";
}
