// The preview's designer: hand-made sample designs, not AI output (the real ones come from the backend), so the
// design studio, saved designs, applying and the paywall can be tried in a browser. The trial and the store are
// pretend too; the sample prices are placeholders until the real ones are set in the stores.
import { DEFAULT_THEME, checkTheme, compileTheme, type ThemeSpec } from "@kantv/core";
import type { Design, Designer, Entitlement, Plan, Purchases } from "../types";

const DAY = 24 * 3600_000;
const s = (patch: Partial<ThemeSpec> & Pick<ThemeSpec, "name" | "summary" | "palette">): ThemeSpec => ({
  ...structuredClone(DEFAULT_THEME),
  ...patch,
  dockApps: ["com.netflix.ninja", "com.google.android.youtube.tv"],
});

export const SAMPLES: ThemeSpec[] = [
  s({
    name: "Ember Lounge",
    summary: "Warm charcoal with an ember-orange glow, a huge thin clock and a floating dock.",
    palette: { background: "#120C0A", surface: "#221815", text: "#FFF3EA", textMuted: "#CDB4A4", accent: "#FF7A2F" },
    font: "manrope",
    wallpaper: { kind: "gradient", colors: ["#120C0A", "#3A1A0E"], pattern: null, photoTag: null, dim: 10 },
    layout: { ...DEFAULT_THEME.layout, dockStyle: "floating", glow: "horizon" },
    clock: { ...DEFAULT_THEME.clock, size: "huge" },
    motion: "calm",
  }),
  s({
    name: "Deep Ocean",
    summary: "Inky navy waves with a teal focus glow and the cinematic artwork shelf.",
    palette: { background: "#06121F", surface: "#0E2236", text: "#EAF6FF", textMuted: "#9DB8CF", accent: "#3FE0C5" },
    font: "fraunces",
    wallpaper: { kind: "pattern", colors: ["#06121F", "#0B2A44"], pattern: "waves", photoTag: null, dim: 15 },
    layout: { ...DEFAULT_THEME.layout, style: "cinematic", dockStyle: "glass", focusStyle: "halo" },
  }),
  s({
    name: "Swiss Grid",
    summary: "Flat black, a strict grid, a single red accent and monospaced type.",
    palette: { background: "#0A0A0A", surface: "#1A1A1A", text: "#FFFFFF", textMuted: "#B5B5B5", accent: "#FF3B30" },
    font: "jetbrains-mono",
    wallpaper: { kind: "pattern", colors: ["#0A0A0A", "#1F1F1F"], pattern: "grid", photoTag: null, dim: 0 },
    layout: { ...DEFAULT_THEME.layout, columns: 6, focusStyle: "rim", glow: "none", appNames: "always" },
    topBar: "icons",
    motion: "still",
  }),
  s({
    name: "Botanical",
    summary: "Deep forest green and cream with a sage glow, rounded type and a soft dock.",
    palette: { background: "#0E1A14", surface: "#18291F", text: "#F4F1E6", textMuted: "#B8C4B0", accent: "#9BD48A" },
    font: "nunito",
    wallpaper: { kind: "pattern", colors: ["#0E1A14", "#1C3325"], pattern: "topography", photoTag: null, dim: 20 },
    layout: { ...DEFAULT_THEME.layout, dockStyle: "glass" },
    clock: { ...DEFAULT_THEME.clock, position: "top-center" },
  }),
  s({
    name: "Neon Noir",
    summary: "Near-black with a hot magenta edge, starry backdrop and lively motion.",
    palette: { background: "#07060C", surface: "#15121F", text: "#F6F0FF", textMuted: "#B7A9D6", accent: "#FF3CAC" },
    font: "space-grotesk",
    wallpaper: { kind: "pattern", colors: ["#07060C", "#24113A"], pattern: "stars", photoTag: null, dim: 0 },
    layout: { ...DEFAULT_THEME.layout, focusStyle: "halo", glow: "radial", tiles: "icon" },
    motion: "lively",
  }),
  s({
    name: "Art Deco",
    summary: "Gold on midnight blue with an elegant serif clock and striped wallpaper.",
    palette: { background: "#0A1024", surface: "#141C38", text: "#FBF5E4", textMuted: "#CFC4A2", accent: "#E6B85C" },
    font: "playfair-display",
    wallpaper: { kind: "pattern", colors: ["#0A1024", "#17204A"], pattern: "stripes", photoTag: null, dim: 25 },
    layout: { ...DEFAULT_THEME.layout, rowsBelowDock: 2 },
  }),
];

let trialEndsAt = Date.now() + 5 * DAY;
let subscribed = false;
let next = 0;
const saved: Design[] = [];

/** Preview control: see the app as it is once the trial is over. */
export function demoEndTrial() {
  trialEndsAt = Date.now() - 1;
  subscribed = false;
}

const entitlement = (): Entitlement => {
  const inTrial = trialEndsAt > Date.now();
  return {
    entitled: subscribed || inTrial,
    plan: subscribed ? "subscription" : inTrial ? "trial" : "none",
    trialEndsAt: new Date(trialEndsAt).toISOString(),
    subscriptionEndsAt: subscribed ? new Date(Date.now() + 30 * DAY).toISOString() : null,
  };
};

function make(request: string, installed: { package: string }[], spec: ThemeSpec): Design {
  const check = checkTheme(spec, new Set(installed.map((a) => a.package)));
  const d: Design = {
    id: `demo-${saved.length + 1}`,
    name: check.spec!.name,
    summary: check.spec!.summary,
    request,
    spec: check.spec!,
    fixes: check.fixes,
    createdAt: new Date().toISOString(),
    locked: false,
  };
  saved.unshift(d);
  return d;
}

export const demoDesigner: Designer = {
  live: false,
  entitlement: async () => entitlement(),
  async design(request, installedApps, exact) {
    await new Promise((r) => setTimeout(r, 1200));
    if (!entitlement().entitled) return "subscription-required";
    const spec = exact && saved[0] ? saved[0].spec : SAMPLES[next++ % SAMPLES.length]!;
    return make(request, installedApps, spec);
  },
  async regenerate(id, installedApps) {
    await new Promise((r) => setTimeout(r, 1200));
    if (!entitlement().entitled) return "subscription-required";
    const prev = saved.find((d) => d.id === id);
    return make(prev?.request ?? "", installedApps, SAMPLES[next++ % SAMPLES.length]!);
  },
  list: async () => saved.map((d) => ({ ...d, locked: !entitlement().entitled })),
  async apply(id) {
    const d = saved.find((x) => x.id === id);
    if (!d) return "offline";
    if (!entitlement().entitled) return "subscription-required";
    return { config: compileTheme(d.spec), lease: "preview", expiresAt: new Date(trialEndsAt).toISOString() };
  },
};

/** Placeholder prices for the preview only; the stores show the real, local ones. */
const PLANS: Plan[] = [
  { id: "monthly", price: "$4.99 / month", perMonth: "$4.99" },
  { id: "yearly", price: "$34.99 / year", perMonth: "$2.92", note: "Save 42%" },
];

export const demoPurchases: Purchases = {
  plans: async () => PLANS,
  async buy() {
    await new Promise((r) => setTimeout(r, 800));
    subscribed = true;
    return "bought";
  },
  restore: async () => subscribed,
};
