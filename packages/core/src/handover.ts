// Making the new launcher Home without ever leaving the TV with no usable Home. A port of the handover in
// cleanyourtv launcher/build-and-install.sh (MIT, see THIRD_PARTY_NOTICES.md): start the new launcher first,
// disable only a stock launcher we recognise, set Home after, check where Home went, and roll back if it is
// not ours. KanTV adds one check PROMPT.md asks for: after pressing Home, the focused app must be ours,
// because some Google TV builds answer set-home-activity with Success and change nothing.
import { CLAIM_QUERY, HOME_QUERY, KNOWN_STOCK_LAUNCHERS, packageOf } from "./packages.ts";
import { parseHomeClaims } from "./guards.ts";
import { lastLine, type TvShell } from "./shell.ts";

export type StockLauncher =
  | { kind: "stock"; package: string }
  | { kind: "none"; why: "already-ours" }
  | { kind: "error"; why: "no-answer" | "chooser-ambiguous" | "unknown-home"; home: string };

/** Which stock launcher to disable. Only a launcher we recognise is ever accepted. */
export async function findStockLauncher(shell: TvShell, ours: string): Promise<StockLauncher> {
  const r = await shell.run(HOME_QUERY);
  if (!r.ok) return { kind: "error", why: "no-answer", home: "" };
  const home = packageOf(lastLine(r.out));
  if ((KNOWN_STOCK_LAUNCHERS as readonly string[]).includes(home)) return { kind: "stock", package: home };
  if (home === ours) return { kind: "none", why: "already-ours" };
  if (home === "android") {
    // The chooser: take the one known stock launcher among the claimants, if there is exactly one.
    const c = await shell.run(CLAIM_QUERY);
    const claimants = new Set((c.ok ? parseHomeClaims(c.out) : null)?.map(packageOf) ?? []);
    const found = KNOWN_STOCK_LAUNCHERS.filter((k) => claimants.has(k));
    if (found.length === 1) return { kind: "stock", package: found[0]! };
    return { kind: "error", why: "chooser-ambiguous", home };
  }
  return { kind: "error", why: "unknown-home", home };
}

export type HandoverOutcome =
  | { ok: true; home: string }
  | {
      ok: false;
      stage: "install" | "older-sdk" | "start" | "home-not-ours" | "focus-not-ours" | "no-answer";
      /** Where Home ended up after the rollback, and whether the rollback put the stock launcher back. */
      rolledBack: boolean;
      home: string;
      detail?: string;
    };

export interface HandoverOptions {
  /** The launcher's package and its Home activity, e.g. tv.kantv.home and tv.kantv.home/.MainActivity. */
  launcher: string;
  activity: string;
  /** Where the APK already is on the TV. */
  apkOnTv: string;
  /** The stock launcher to disable, or null to leave it alone (CVTE boards, examples that say so). */
  stock: string | null;
  /** Presses Home and waits for the TV to settle before the focus check. */
  settle?: () => Promise<void>;
}

async function home(shell: TvShell): Promise<string> {
  const r = await shell.run(HOME_QUERY);
  return r.ok ? lastLine(r.out) : "";
}

async function rollback(shell: TvShell, stock: string | null): Promise<{ rolledBack: boolean; home: string }> {
  if (!stock) return { rolledBack: false, home: await home(shell) };
  await shell.run(`pm enable --user 0 ${stock}`);
  await shell.run(
    `cmd package set-home-activity --user 0 $(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME ${stock} | tail -n 1)`,
  );
  const back = await home(shell);
  return { rolledBack: back.startsWith(`${stock}/`), home: back };
}

export async function handOverHome(shell: TvShell, o: HandoverOptions): Promise<HandoverOutcome> {
  // Install on its own: a failed install must not be followed by disabling the stock launcher.
  const install = await shell.run(`pm install -r ${o.apkOnTv}; rm -f ${o.apkOnTv}`);
  if (!install.ok) return { ok: false, stage: "no-answer", rolledBack: false, home: "" };
  if (!install.out.includes("Success")) {
    const older = install.out.includes("INSTALL_FAILED_OLDER_SDK");
    return { ok: false, stage: older ? "older-sdk" : "install", rolledBack: false, home: "", detail: install.out.trim() };
  }
  // A fresh instance, not one Android restarted mid-update (#1101).
  await shell.run(`am force-stop ${o.launcher}`);
  // Start it before the stock Home is touched; both halves of the answer matter.
  const startCmd = o.stock
    ? `am start -W -a android.intent.action.MAIN -c android.intent.category.HOME -n ${o.activity}`
    : `am start -W -n ${o.activity}`;
  const start = await shell.run(startCmd);
  if (!start.ok || !start.out.includes("Status: ok") || /^Error/im.test(start.out)) {
    return { ok: false, stage: "start", rolledBack: false, home: await home(shell), detail: start.out.trim() };
  }
  await shell.run(`cmd package compile -m speed -f ${o.launcher}`);
  if (o.stock) await shell.run(`pm disable-user --user 0 ${o.stock}`);
  // After the disable: Android drops the Home preference whenever the set of HOME apps changes.
  await shell.run(`cmd package set-home-activity --user 0 ${o.activity}`);

  const now = await home(shell);
  if (!now.startsWith(`${o.launcher}/`)) {
    const rb = await rollback(shell, o.stock);
    return { ok: false, stage: now ? "home-not-ours" : "no-answer", ...rb, detail: now };
  }
  await shell.run("input keyevent KEYCODE_HOME");
  await o.settle?.();
  const focus = await shell.run("dumpsys activity activities");
  const focused = focus.ok ? /mFocusedApp=.*?\s([A-Za-z0-9_.]+)\//.exec(focus.out)?.[1] : undefined;
  if (focused !== o.launcher) {
    const rb = await rollback(shell, o.stock);
    return { ok: false, stage: "focus-not-ours", ...rb, detail: focused ?? "" };
  }
  return { ok: true, home: now };
}
