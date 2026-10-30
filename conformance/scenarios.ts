// TVs to run upstream cleanyourtv and the KanTV port against. Hand-written cases cover each incident the
// guards exist for; the generator mixes the same ingredients at random, from a fixed seed so a failure can
// be replayed.
import type { FakeTvState } from "../testing/fake-tv/shell.ts";

export interface Scenario {
  name: string;
  tv: FakeTvState;
  list: string[];
  /** FORCE_SETUPWRAITH, FORCE_HOME, TVINPUT_ALLOW, HANDLERS_ALLOW */
  env: Record<string, string>;
  /** Passed to restore as the stock launcher. */
  stock: string;
}

const TVL = "com.google.android.tvlauncher";
const GTV = "com.google.android.apps.tv.launcherx";
const MITV = "com.mitv.tvhome";
const SETUP = "com.google.android.tungsten.setupwraith";
const SETTINGS = "com.android.tv.settings";
const CUSTOM = "com.gathin.tvhome";
const OTHER_LAUNCHER = "com.spocky.projengmenu";
const FACTORY = "com.duokan.factorytest";
const FALLBACK = "com.tcl.keycustomfunctionservice";
const INPUT_APP = "com.vendor.tvinput";
const VENDOR_SETTINGS = "com.vendor.settings";
const LIVE_TV = "com.vendor.livetv";
const REMOTE = "com.google.android.tv.remote.service";
const VENDORS = Array.from({ length: 8 }, (_, i) => `com.vendor.app${i}`);
const TV_HW = "android.permission.TV_INPUT_HARDWARE";

const base = (extra: Partial<FakeTvState> = {}): FakeTvState => ({
  sdk: 30,
  adb_secure: "1",
  installed: [TVL, SETTINGS, ...VENDORS],
  claims: [`${TVL}/.MainActivity`],
  settings_activity: [`${SETTINGS}/.MainSettings`],
  wifi: "cname=android.uid.system:1000 ",
  settings: { window_animation_scale: "1.0", transition_animation_scale: "0.5", animator_duration_scale: "null" },
  ...extra,
});

const s = (name: string, tv: FakeTvState, list: string[], env: Record<string, string> = {}, stock = TVL): Scenario => ({
  name,
  tv,
  list,
  env,
  stock,
});

export function handwritten(): Scenario[] {
  return [
    s("plain list, nothing protected", base(), VENDORS.slice(0, 4)),
    s("#239 list holds the only launcher", base(), [TVL, ...VENDORS.slice(0, 2)]),
    s(
      "#239 another launcher installed: stock may go",
      base({ installed: [TVL, CUSTOM, SETTINGS, ...VENDORS], claims: [`${TVL}/.MainActivity`, `${CUSTOM}/.MainActivity`], home_default: `${TVL}/.MainActivity` }),
      [TVL, VENDORS[0]!],
    ),
    s(
      "#1573 setupwraith answers Home ahead of an installed launcher",
      base({
        installed: [GTV, CUSTOM, SETUP, SETTINGS, ...VENDORS],
        claims: [`${GTV}/.MainActivity`, `${CUSTOM}/.MainActivity`, `${SETUP}/.RecoveryActivity`],
        priority: { [`${SETUP}/.RecoveryActivity`]: 1 },
        home_default: `${GTV}/.MainActivity`,
      }),
      [GTV, VENDORS[0]!],
      {},
      GTV,
    ),
    s(
      "setupwraith owns the saved Wi-Fi network",
      base({ installed: [GTV, SETUP, SETTINGS, ...VENDORS], claims: [`${GTV}/.MainActivity`], wifi: `cname=${SETUP} cname=android.uid.system:1000 ` }),
      [SETUP, VENDORS[1]!],
      {},
      GTV,
    ),
    s(
      "setupwraith, Wi-Fi owners unreadable",
      base({ installed: [GTV, SETUP, SETTINGS, ...VENDORS], claims: [`${GTV}/.MainActivity`], wifi: "", transport_fail: ["dumpsys wifi"] }),
      [SETUP, VENDORS[1]!],
      {},
      GTV,
    ),
    s(
      "setupwraith, FORCE_SETUPWRAITH on Ethernet",
      base({ installed: [GTV, SETUP, SETTINGS, ...VENDORS], claims: [`${GTV}/.MainActivity`], wifi: `cname=${SETUP} ` }),
      [SETUP],
      { FORCE_SETUPWRAITH: "1" },
      GTV,
    ),
    s("#884 core package refuses the whole list", base(), [VENDORS[0]!, "com.android.permissioncontroller"]),
    s("#1578 TV middleware refuses the whole list", base(), ["com.cltv.mal", VENDORS[0]!]),
    s("core providers that are allowed", base({ installed: [TVL, SETTINGS, "com.android.providers.calendar"] }), ["com.android.providers.calendar"]),
    s("#165 not a package name", base(), [VENDORS[0]!, "com.x;reboot"]),
    s(
      "#321 an input driver asks for TV_INPUT_HARDWARE",
      base({ installed: [TVL, SETTINGS, INPUT_APP, ...VENDORS], perms: { [INPUT_APP]: [TV_HW] } }),
      [INPUT_APP, VENDORS[2]!],
    ),
    s(
      "#1753 Lollipop serves TvInputService",
      base({ sdk: 21, installed: [TVL, SETTINGS, INPUT_APP, ...VENDORS], tvinput_service: [INPUT_APP], perms: { [VENDORS[3]!]: ["android.permission.INTERNET"] } }),
      [INPUT_APP, VENDORS[3]!, VENDORS[4]!],
    ),
    s("watchdog switched dumps off", base({ dumpsys_hung: true }), [VENDORS[0]!, VENDORS[1]!]),
    s(
      "the apps that open inputs and Settings stay",
      base({ installed: [TVL, SETTINGS, LIVE_TV, VENDOR_SETTINGS, ...VENDORS], view_channel: [`${LIVE_TV}/.Player`], settings_activity: [`${VENDOR_SETTINGS}/.Main`, `${SETTINGS}/.MainSettings`] }),
      [LIVE_TV, VENDOR_SETTINGS, VENDORS[0]!],
    ),
    s(
      "a dongle: nothing answers channel VIEW, a vendor settings app does",
      base({ installed: [TVL, SETTINGS, VENDOR_SETTINGS, ...VENDORS], view_channel: [], settings_activity: [`${VENDOR_SETTINGS}/.Main`] }),
      [VENDOR_SETTINGS, VENDORS[0]!],
    ),
    s(
      "a dongle whose query-activities prints nothing when nothing matches",
      base({ installed: [TVL, SETTINGS, VENDOR_SETTINGS, ...VENDORS], view_channel: [], query_silent: true, settings_activity: [`${VENDOR_SETTINGS}/.Main`] }),
      [VENDOR_SETTINGS, VENDORS[0]!],
    ),
    s(
      "#795 no cmd before Nougat, Home from dumpsys activity",
      base({ sdk: 23, cmd_available: false, home_process: "  mHomeProcess: ProcessRecord{52f4a5c8 2f4b:com.google.android.tvlauncher/u0a56}\n" }),
      [TVL, VENDORS[0]!],
    ),
    s("#795 nothing names Home on an old set", base({ sdk: 23, cmd_available: false }), [TVL, MITV, VENDORS[0]!]),
    s(
      "#85 Home is Android's chooser",
      base({ installed: [TVL, MITV, SETTINGS, ...VENDORS], claims: [`${TVL}/.MainActivity`, `${MITV}/.Main`] }),
      [TVL, MITV, VENDORS[0]!],
    ),
    s(
      "FallbackHome and a factory test do not count as launchers",
      base({ installed: [TVL, FALLBACK, FACTORY, SETTINGS, ...VENDORS], claims: [`${TVL}/.MainActivity`, `${FALLBACK}/.FallbackHome`, `${FACTORY}/.FactoryLauncher`], home_default: `${TVL}/.MainActivity` }),
      [TVL, VENDORS[0]!],
    ),
    s("ro.adb.secure=0", base({ adb_secure: "0" }), [VENDORS[0]!]),
    s("ro.adb.secure unset", base({ adb_secure: null }), [VENDORS[0]!]),
    s("#1376 the TV refuses one package", base({ refuse_disable: [VENDORS[1]!] }), VENDORS.slice(0, 3)),
    s("a listed package is not on this TV", base(), [VENDORS[0]!, "com.example.missing"]),
    s("a listed package was already disabled", base({ disabled: [VENDORS[0]!] }), VENDORS.slice(0, 2)),
    s(
      "the phone-remote service is in the list (KanTV keeps it, upstream does not)",
      base({ installed: [TVL, SETTINGS, REMOTE, ...VENDORS] }),
      [REMOTE, VENDORS[0]!],
    ),
    s("FORCE_HOME", base(), [TVL, VENDORS[0]!], { FORCE_HOME: "1" }),
    s("the TV stops answering during the record", base({ transport_fail: ["settings get global"] }), [VENDORS[0]!]),
  ];
}

/** mulberry32: small, fast, and the same sequence everywhere for a seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generated(count: number, seed = 20261030): Scenario[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const some = <T>(xs: readonly T[], p: number): T[] => xs.filter(() => r() < p);
  const out: Scenario[] = [];
  for (let i = 0; i < count; i++) {
    const stock = pick([TVL, GTV, MITV]);
    const launchers = [stock, ...some([CUSTOM, OTHER_LAUNCHER], 0.35)];
    const extras = some([SETUP, FALLBACK, FACTORY, INPUT_APP, VENDOR_SETTINGS, LIVE_TV, REMOTE], 0.4);
    const installed = [...new Set([...launchers, ...extras, SETTINGS, ...some(VENDORS, 0.7)])];
    const claims = [
      ...launchers.map((l) => `${l}/.MainActivity`),
      ...(installed.includes(SETUP) && r() < 0.6 ? [`${SETUP}/.RecoveryActivity`] : []),
      ...(installed.includes(FALLBACK) ? [`${FALLBACK}/.FallbackHome`] : []),
      ...(installed.includes(FACTORY) && r() < 0.7 ? [`${FACTORY}/.FactoryLauncher`] : []),
      ...(r() < 0.1 ? [`${SETTINGS}/.FallbackHome`] : []),
    ];
    const tv: FakeTvState = {
      sdk: pick([21, 22, 23, 28, 30, 34]),
      adb_secure: pick(["1", "1", "1", "0", null]),
      installed,
      disabled: some(installed.filter((p) => p !== SETTINGS), 0.12),
      claims,
      priority: { [`${SETUP}/.RecoveryActivity`]: 1 },
      wifi: pick(["", "cname=android.uid.system:1000 ", `cname=${SETUP} `, `cname=android.uid.system:1000 cname=${SETUP} `]),
      perms: Object.fromEntries(some([INPUT_APP, ...VENDORS], 0.25).map((p) => [p, r() < 0.6 ? [TV_HW] : ["android.permission.INTERNET"]])),
      tvinput_service: some([INPUT_APP, VENDORS[0]!], 0.2),
      no_perm_block: some(VENDORS, 0.1),
      dumpsys_hung: r() < 0.04,
      view_channel: some([`${LIVE_TV}/.Player`, `${INPUT_APP}/.Hdmi`], 0.4).filter((c) => installed.includes(c.split("/")[0]!)),
      settings_activity: [`${SETTINGS}/.MainSettings`, ...(installed.includes(VENDOR_SETTINGS) && r() < 0.5 ? [`${VENDOR_SETTINGS}/.Main`] : [])],
      refuse_disable: some(VENDORS, 0.05),
      settings: { window_animation_scale: pick(["1.0", "0.5", "null"]), transition_animation_scale: pick(["1.0", "0"]), animator_duration_scale: pick(["1.0", "null"]) },
    };
    if (r() < 0.6) tv.home_default = `${pick(launchers)}/.MainActivity`;
    if (r() < 0.12) tv.cmd_available = false;
    if (r() < 0.25) tv.home_process = `  mHomeProcess: ProcessRecord{52f4a5c8 2f4b:${pick(launchers)}/u0a56}\n`;
    if (r() < 0.05) tv.resolve_override = pick(["No activity found", "Error: garbage", ""]);
    if (r() < 0.2) {
      tv.transport_fail = some(
        [
          "dumpsys wifi",
          "query-activities --brief -a android.intent.action.MAIN",
          "dumpsys package",
          "query-activities --brief -a android.intent.action.VIEW",
          "getprop ro.adb.secure",
          "dumpsys activity",
          "pm list packages -e",
        ],
        0.35,
      );
    }
    const pool = [...installed.filter((p) => p !== SETTINGS), "com.example.missing"];
    let list = some(pool, 0.45);
    if (!list.length) list = [pick(pool)];
    if (r() < 0.04) list.push(pick(["com.android.shell", "com.android.providers.media", "android.ext.services"]));
    const env: Record<string, string> = {};
    if (r() < 0.06) env.FORCE_HOME = "1";
    if (r() < 0.06) env.FORCE_SETUPWRAITH = "1";
    if (r() < 0.05) env.TVINPUT_ALLOW = "1";
    if (r() < 0.05) env.HANDLERS_ALLOW = "1";
    out.push(s(`random #${i}`, tv, list, env, stock));
  }
  return out;
}
