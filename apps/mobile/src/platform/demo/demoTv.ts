// A simulated Chromecast with Google TV for the in-browser preview. It answers the commands the core engine
// sends (the same ones a real TV gets), so the preview runs the real guards, recovery record and restore. It
// is a small TypeScript cousin of testing/fake-tv/fakeandroid.py; nothing here is used on a real TV.
import { HANDLERS_QUERY, HOME_QUERY, CLAIM_QUERY, type ShellResult, type TvShell } from "@kantv/core";
import feed from "./feed.json";

const GTV = "com.google.android.apps.tv.launcherx";
const SETUP = "com.google.android.tungsten.setupwraith";
const CHOOSER = "android/com.android.internal.app.ResolverActivity";

const chromecast = (feed.models as { folder: string; lists: { file: string; packages: { name: string }[] }[] }[]).find(
  (m) => m.folder === "google-chromecast-gtv-4k",
)!;

export interface DemoTvState {
  props: Record<string, string>;
  installed: string[];
  disabled: string[];
  claims: string[];
  priority: Record<string, number>;
  homeDefault: string | null;
  settings: Record<string, string>;
  log: string[];
}

export function newDemoTv(): DemoTvState {
  const listed = chromecast.lists.flatMap((l) => l.packages.map((p) => p.name));
  return {
    props: {
      "ro.product.model": "Chromecast",
      "ro.product.device": "sabrina",
      "ro.product.name": "sabrina",
      "ro.build.product": "sabrina",
      "ro.product.board": "sabrina",
      "ro.product.brand": "google",
      "ro.product.manufacturer": "Google",
      "ro.build.fingerprint": "google/sabrina/sabrina:14/UTTC.250917.004/14193937:user/release-keys",
      "ro.serialno": "16301HFDD2V7XQ",
      "ro.build.version.sdk": "34",
      "ro.adb.secure": "1",
    },
    installed: [
      ...new Set([
        ...listed,
        GTV,
        SETUP,
        "com.android.tv.settings",
        "com.google.android.tv.remote.service",
        "com.google.android.apps.mediashell",
        "com.netflix.ninja",
        "com.google.android.youtube.tv",
      ]),
    ],
    disabled: [],
    claims: [`${GTV}/.MainActivity`, `${SETUP}/.RecoveryActivity`],
    priority: { [`${SETUP}/.RecoveryActivity`]: 1 },
    homeDefault: `${GTV}/.MainActivity`,
    settings: { window_animation_scale: "1.0", transition_animation_scale: "1.0", animator_duration_scale: "1.0", adb_enabled: "1", adb_wifi_enabled: "1", android_id: "4f2a9c01b7e3d562" },
    log: [],
  };
}

const pkg = (c: string) => c.split("/")[0]!;
const expand = (c: string) => {
  const [p, a = ""] = c.split("/");
  return a.startsWith(".") ? `${p}/${p}${a}` : c;
};

export class DemoTvShell implements TvShell {
  constructor(
    readonly tv: DemoTvState,
    private delayMs = 120,
  ) {}

  private enabled = (p: string) => this.tv.installed.includes(p) && !this.tv.disabled.includes(p);

  private home(only?: string): string | null {
    const claims = this.tv.claims.filter((c) => this.enabled(pkg(c)) && (!only || pkg(c) === only));
    if (!claims.length) return null;
    if (only) return claims[0]!;
    if (this.tv.homeDefault && claims.map(expand).includes(expand(this.tv.homeDefault))) return this.tv.homeDefault;
    const top = Math.max(...claims.map((c) => this.tv.priority[c] ?? 0));
    const best = claims.filter((c) => (this.tv.priority[c] ?? 0) === top);
    return best.length === 1 ? best[0]! : CHOOSER;
  }

  private answer(cmd: string): string {
    const t = this.tv;
    let m: RegExpMatchArray | null;
    if ((m = cmd.match(/^for p in (.+?); do echo "\$p=\$\(getprop \$p\)"; done; echo "android_id=\$\(settings get secure android_id\)"$/)))
      return m[1]!.split(" ").map((p) => `${p}=${t.props[p] ?? ""}\n`).join("") + `android_id=${t.settings.android_id}\n`;
    if (cmd.startsWith("s=$(getprop ro.build.version.sdk); for p in ")) return ""; // no input drivers on a dongle
    if (cmd === HANDLERS_QUERY) return "No activities found\n==\n  com.android.tv.settings/com.android.tv.settings.MainSettings\n";
    if (cmd === HOME_QUERY) {
      const h = this.home();
      return h ? `priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\n${expand(h)}\n` : "No activity found\n";
    }
    if (cmd === CLAIM_QUERY) return t.claims.filter((c) => this.enabled(pkg(c))).map((c) => `  ${expand(c)}\n`).join("");
    if (cmd === "dumpsys wifi") return "cname=android.uid.system:1000 ";
    if ((m = cmd.match(/^getprop (\S+)$/))) return `${t.props[m[1]!] ?? ""}\n`;
    if ((m = cmd.match(/^pm list packages( -[de])?( --user 0)?$/))) {
      const flag = m[1]?.trim();
      const names = t.installed.filter((p) => (flag === "-d" ? t.disabled.includes(p) : flag === "-e" ? !t.disabled.includes(p) : true));
      return names.map((n) => `package:${n}\n`).join("");
    }
    if ((m = cmd.match(/^pm disable-user --user 0 (\S+)$/))) {
      if (!t.installed.includes(m[1]!)) return `Error: Unknown package: ${m[1]}\n`;
      if (!t.disabled.includes(m[1]!)) t.disabled.push(m[1]!);
      return `Package ${m[1]} new state: disabled-user\n`;
    }
    if ((m = cmd.match(/^pm enable (?:--user 0 )?(\S+)$/))) {
      t.disabled = t.disabled.filter((p) => p !== m![1]);
      return `Package ${m[1]} new state: enabled\n`;
    }
    if ((m = cmd.match(/^cmd package set-home-activity --user 0 (\S+)$/))) {
      t.homeDefault = m[1]!;
      return "Success\n";
    }
    if ((m = cmd.match(/^cmd package set-home-activity --user 0 \$\(cmd package resolve-activity .* (\S+) \| tail -n 1\)$/))) {
      t.homeDefault = this.home(m[1]!) ;
      return "Success\n";
    }
    if ((m = cmd.match(/^settings get global (\S+)$/))) return `${t.settings[m[1]!] ?? "null"}\n`;
    if ((m = cmd.match(/^settings put global (\S+) (\S+)$/))) {
      t.settings[m[1]!] = m[2]!;
      return "";
    }
    if ((m = cmd.match(/^settings delete global (\S+)$/))) {
      delete t.settings[m[1]!];
      return "";
    }
    return "";
  }

  async run(command: string): Promise<ShellResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    // Once debugging is off, adbd is gone: nothing answers.
    if (this.tv.settings.adb_enabled === "0") return { ok: false, out: "" };
    this.tv.log.push(command);
    return { ok: true, out: this.answer(command) };
  }
}
