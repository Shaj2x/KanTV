// Plain-English names for what a list turns off, and for why a guard kept something. Upstream lists name
// packages and sometimes add a short comment; the app shows the comment when there is one, a known name when
// we have it, and the package name in small type underneath either way.
import type { NoteKind, SkipReason } from "@kantv/core";

export type Category = "ads" | "tracking" | "apps" | "system";

export const CATEGORY_LABEL: Record<Category, { title: string; hint: string }> = {
  ads: { title: "Ads and sponsored content", hint: "Ad services and the rows that push content at you" },
  tracking: { title: "Tracking and diagnostics", hint: "Usage reports, feedback and data collection" },
  apps: { title: "Preinstalled apps", hint: "Apps that came with the TV. Untick any you use" },
  system: { title: "Background extras", hint: "Services most people never notice. Safe to turn off on this TV" },
};

const KNOWN: Record<string, string> = {
  "com.google.android.feedback": "Google feedback reporter",
  "com.android.tv.feedbackconsent": "Feedback consent prompts",
  "com.google.android.federatedcompute": "Federated learning (on-device data collection)",
  "com.google.android.ondevicepersonalization.services": "On-device ad personalisation",
  "com.google.android.ext.adservices.api": "Privacy Sandbox ad services (extension)",
  "com.google.android.play.games": "Google Play Games",
  "com.android.printspooler": "Printing service",
  "com.google.android.marvin.talkback": "TalkBack screen reader",
  "com.google.android.tungsten.setupwraith": "Google TV setup app",
  "com.google.android.apps.tv.launcherx": "Google TV home screen",
  "com.google.android.tvlauncher": "Android TV home screen",
  "com.google.android.tvrecommendations": "Recommendation rows",
  "com.google.android.katniss": "Google Assistant",
};

export function friendlyName(name: string, comment: string): string {
  if (KNOWN[name]) return KNOWN[name]!;
  if (comment) return comment.charAt(0).toUpperCase() + comment.slice(1);
  const last = name.split(".").pop() ?? name;
  return last.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

export function categoryOf(name: string, comment: string): Category {
  const s = `${name} ${comment}`.toLowerCase();
  if (/\bads?\b|adservice|advert|sponsor|promo|recommend|ambient|content row|privacy sandbox/.test(s)) return "ads";
  if (/feedback|logging|telemetry|analytic|stat|report|diagnos|netoscope|federated|personaliz|track|acr|consent|usage/.test(s)) return "tracking";
  if (/launcher|setup|setupwraith|printspooler|talkback|marvin|service|provider|overlay/.test(s)) return "system";
  return "apps";
}

/** Why a guard kept a listed package, in words a person can act on. */
export const SKIP_REASON: Record<SkipReason, string> = {
  "setupwraith-wifi-unknown": "Kept: we couldn't check whether it owns your saved Wi-Fi, so we played safe.",
  "setupwraith-owns-wifi": "Kept: it owns your saved Wi-Fi network. Turning it off would knock the TV off Wi-Fi.",
  "home-only-launcher": "Kept for now: it's your TV's home screen. It's turned off once the KanTV home screen has taken over.",
  "home-setupwraith": "Kept for now: Google's setup app would grab the home screen. Sorted out during the home screen step.",
  "home-no-default": "Kept: your TV needs a home screen, and this is the only one left.",
  "home-unknown-stock": "Kept: the TV couldn't tell us which home screen it uses, so we kept this one.",
  "tvinput-hung": "Kept: the TV's diagnostics are switched off until it restarts. Restart the TV and run setup again.",
  "tvinput-unreadable": "Kept: we couldn't tell if this runs your HDMI inputs, so we played safe.",
  "tvinput-hardware": "Kept: it looks like part of your HDMI and antenna inputs.",
  "handler-inputs": "Kept: your TV opens its HDMI inputs with it.",
  "handler-settings": "Kept: it opens Settings, which you need to get back to these options.",
};

export const NOTE: Partial<Record<NoteKind, string>> = {
  "home-chooser": "Your TV has no default home screen yet; we checked every app that can be one.",
  "home-unknown": "Your TV couldn't tell us its home screen. Nothing that could be one is turned off.",
  "tvinput-unchecked": "We couldn't check which apps run your HDMI inputs. Try an HDMI input after setup.",
  "handlers-unchecked": "We couldn't check which apps open your inputs and Settings. Open both after setup.",
};
