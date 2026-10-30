#!/usr/bin/env python3
"""A fake Android TV userland for tests: pm, cmd, dumpsys, getprop, settings, am, input.

Each stub in bin/ execs this file with its own name. The TV is a JSON file named by FAKE_TV_STATE; commands
read it, and the ones that change the TV (pm disable-user, pm enable, set-home-activity, pm install) write it
back and append to its "log". Commands run through a real `sh`, so a shell loop sent to the TV (the upstream
input-driver check is one) runs exactly as it would on a set, with these stubs in place of Android's tools.

State keys (all optional except installed):
  sdk                  int, ro.build.version.sdk (default 30)
  adb_secure           str or null, ro.adb.secure (null: empty answer)
  cmd_available        bool (default true); false makes `cmd` answer like a pre-Nougat shell
  installed            [package]
  disabled             [package]
  refuse_disable       [package] pm disable-user is refused for these
  claims               [component] activities that answer MAIN/HOME (only enabled packages answer)
  priority             {component: int} higher wins when Home has no default (setupwraith uses 1)
  home_default         component chosen as Home (set-home-activity writes it)
  set_home_lies        bool: set-home-activity prints Success and changes nothing
  resolve_override     str: resolve-activity for HOME prints this verbatim
  home_process         str: what `dumpsys activity` prints
  wifi                 str: what `dumpsys wifi` prints
  perms                {package: [permission]} requested permissions, for dumpsys package
  tvinput_service      [package] packages whose dump names android.media.tv.TvInputService
  dumpsys_hung         bool: every dumpsys package answers with the watchdog message
  no_perm_block        [package] dump shows the package section with no permission block
  view_channel         [component] answers VIEW on vnd.android.cursor.item/channel
  query_silent         bool: query-activities prints nothing when nothing matches (Android prints
                       "No activities found"; some firmware may not)
  settings_activity    [component] answers android.settings.SETTINGS
  settings             {key: value} global settings
  install_result       str printed by pm install (default "Success")
  start_fails          bool: am start -W reports an error
  focused_override     str: package dumpsys activity activities reports focused, regardless of Home
"""
import json
import os
import sys

STATE_PATH = os.environ["FAKE_TV_STATE"]
CHOOSER = "android/com.android.internal.app.ResolverActivity"


def load():
    with open(STATE_PATH) as f:
        return json.load(f)


def save(state):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, STATE_PATH)


def log(state, line):
    state.setdefault("log", []).append(line)


def enabled(state, package):
    return package in state.get("installed", []) and package not in state.get("disabled", [])


def pkg(component):
    return component.split("/", 1)[0]


def expand(component):
    """com.x/.Main -> com.x/com.x.Main, the long form resolve-activity prints."""
    p, _, activity = component.partition("/")
    return f"{p}/{p}{activity}" if activity.startswith(".") else component


def live_claims(state):
    return [c for c in state.get("claims", []) if enabled(state, pkg(c))]


def resolve_home(state, only=None):
    claims = [c for c in live_claims(state) if only is None or pkg(c) == only]
    if not claims:
        return None
    default = state.get("home_default")
    if only is None and default and expand(default) in [expand(c) for c in claims]:
        return default
    if only is not None:
        return claims[0]
    prio = state.get("priority", {})
    top = max(prio.get(c, 0) for c in claims)
    best = [c for c in claims if prio.get(c, 0) == top]
    return best[0] if len(best) == 1 else CHOOSER


def out(text):
    sys.stdout.write(text)


def pm(state, args):
    if args[:2] == ["list", "packages"]:
        rest = [a for a in args[2:] if a not in ("--user", "0")]
        installed = state.get("installed", [])
        if "-d" in rest:
            names = [p for p in installed if p in state.get("disabled", [])]
        elif "-e" in rest:
            names = [p for p in installed if p not in state.get("disabled", [])]
        else:
            names = installed
        out("".join(f"package:{n}\n" for n in names))
        return 0
    if args[:3] == ["disable-user", "--user", "0"] and len(args) == 4:
        name = args[3]
        log(state, f"pm disable-user --user 0 {name}")
        if name not in state.get("installed", []):
            out(f"Error: Unknown package: {name}\n")
            return 1
        if name in state.get("refuse_disable", []):
            sys.stderr.write("java.lang.SecurityException: Shell cannot change component state\n")
            return 255
        if name not in state.setdefault("disabled", []):
            state["disabled"].append(name)
        out(f"Package {name} new state: disabled-user\n")
        return 0
    if args[0] == "enable":
        name = [a for a in args[1:] if a not in ("--user", "0")][-1]
        log(state, f"pm enable {name}")
        if name in state.get("disabled", []):
            state["disabled"].remove(name)
        out(f"Package {name} new state: enabled\n")
        return 0
    if args[0] == "install":
        log(state, "pm install " + " ".join(args[1:]))
        result = state.get("install_result", "Success")
        if result == "Success":
            name = state.get("install_package")
            if name and name not in state.setdefault("installed", []):
                state["installed"].append(name)
            for c in state.get("install_claims", []):
                if c not in state.setdefault("claims", []):
                    state["claims"].append(c)
        out(result + "\n")
        return 0
    if args[0] == "grant":
        log(state, "pm grant " + " ".join(args[1:]))
        return 0
    out(f"Unknown command: {args[0]}\n")
    return 1


def cmd(state, args):
    if not state.get("cmd_available", True):
        sys.stderr.write("/system/bin/sh: cmd: not found\n")
        return 127
    if args[:1] != ["package"]:
        return 0
    sub = args[1] if len(args) > 1 else ""
    rest = args[2:]
    if sub == "resolve-activity" and "android.intent.category.HOME" in rest:
        only = rest[-1] if rest and not rest[-1].startswith("android.") and "." in rest[-1] else None
        if only is None and "resolve_override" in state:
            out(state["resolve_override"] + "\n")
            return 0
        home = resolve_home(state, only)
        if home is None:
            out("No activity found\n")
        else:
            out("priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\n")
            out(expand(home) + "\n")
        return 0
    if sub == "query-activities":
        if "android.intent.category.HOME" in rest:
            comps = live_claims(state)
        elif "vnd.android.cursor.item/channel" in rest:
            comps = [c for c in state.get("view_channel", []) if enabled(state, pkg(c))]
        elif "android.settings.SETTINGS" in rest:
            comps = [c for c in state.get("settings_activity", []) if enabled(state, pkg(c))]
        else:
            comps = []
        if not comps and not state.get("query_silent"):
            out("No activities found\n")
        for c in comps:
            out(f"  priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\n  {expand(c)}\n")
        return 0
    if sub == "set-home-activity":
        component = [a for a in rest if a not in ("--user", "0")]
        component = component[-1] if component else ""
        log(state, f"set-home-activity {component}")
        if "/" not in component:
            out("Error: invalid component\n")
            return 1
        if not state.get("set_home_lies"):
            state["home_default"] = component
        out("Success\n")
        return 0
    if sub == "compile":
        out("Success\n")
        return 0
    return 0


def dumpsys(state, args):
    what = args[0] if args else ""
    if what == "wifi":
        out(state.get("wifi", ""))
        return 0
    if what == "activity" and args[1:2] == ["activities"]:
        focused = state.get("focused_override")
        if focused is None:
            home = resolve_home(state)
            focused = pkg(home) if home and home != CHOOSER else "android"
        out(f"  mFocusedApp=ActivityRecord{{1a2b3c u0 {focused}/.MainActivity t12}}\n")
        return 0
    if what == "activity":
        out(state.get("home_process", ""))
        return 0
    if what == "package" and len(args) > 1:
        name = args[1]
        if state.get("dumpsys_hung"):
            out("Service dumps disabled due to hung system process.\n")
            return 0
        if name not in state.get("installed", []):
            out(f"Unable to find package: {name}\n")
            return 0
        lines = ["Activity Resolver Table:"]
        if name in state.get("tvinput_service", []):
            lines += ["Service Resolver Table:", "  Non-Data Actions:", "      android.media.tv.TvInputService:",
                      f"        1a2b3c {name}/.TvInput filter 4d5e6f"]
        lines += ["Packages:", f"  Package [{name}] (abc123):", "    userId=10042"]
        perms = state.get("perms", {}).get(name, [])
        if name not in state.get("no_perm_block", []) and perms:
            block = "requested permissions:" if state.get("sdk", 30) >= 23 else "grantedPermissions:"
            lines += [f"    {block}"] + [f"      {p}" for p in perms]
            lines += ["    install permissions:", "      android.permission.INTERNET: granted=true"]
        lines += ["    User 0: ceDataInode=1 installed=true hidden=false suspended=false"]
        out("\n".join(lines) + "\n")
        return 0
    return 0


def getprop(state, args):
    if args == ["ro.build.version.sdk"]:
        out(f"{state.get('sdk', 30)}\n")
    elif args == ["ro.adb.secure"]:
        value = state.get("adb_secure", "1")
        out(f"{value if value is not None else ''}\n")
    elif args:
        out(f"{state.get('props', {}).get(args[0], '')}\n")
    return 0


def settings(state, args):
    if args[:2] == ["get", "global"] and len(args) == 3:
        out(f"{state.get('settings', {}).get(args[2], 'null')}\n")
        return 0
    if args[:2] == ["put", "global"] and len(args) == 4:
        log(state, f"settings put global {args[2]} {args[3]}")
        state.setdefault("settings", {})[args[2]] = args[3]
        return 0
    if args[:2] == ["delete", "global"] and len(args) == 3:
        log(state, f"settings delete global {args[2]}")
        state.setdefault("settings", {}).pop(args[2], None)
        return 0
    if args[:2] == ["get", "secure"]:
        out("null\n")
    return 0


def am(state, args):
    if args[:1] == ["force-stop"]:
        return 0
    if args[:1] == ["start"]:
        log(state, "am start " + " ".join(args[1:]))
        if state.get("start_fails"):
            out("Starting: Intent { }\nError: Activity not started, unable to resolve Intent\n")
            return 0
        out("Starting: Intent { }\nStatus: ok\nLaunchState: COLD\nActivity: x\nTotalTime: 812\nComplete\n")
        return 0
    return 0


def main():
    name = os.path.basename(sys.argv[0])
    args = sys.argv[1:]
    state = load()
    handler = {"pm": pm, "cmd": cmd, "dumpsys": dumpsys, "getprop": getprop, "settings": settings,
               "am": am}.get(name)
    if handler is None:
        return 0  # input, rm, sync: nothing to fake
    rc = handler(state, args)
    save(state)
    return rc


if __name__ == "__main__":
    sys.exit(main())
