// The theme spec: what the AI designer produces, what the phone and web preview, and what the compiler turns
// into the launcher's config. Data only, never code: every field is a choice from a closed set or a colour,
// and dock apps must be apps the TV actually has. One schema for the model's structured output, the backend's
// check and the app's check.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "a colour as #RRGGBB");

/** Open-licence (SIL OFL) typefaces the KanTV launcher bundles. */
export const FONTS = ["outfit", "inter", "manrope", "space-grotesk", "fraunces", "playfair-display", "dm-serif-display", "jetbrains-mono", "nunito", "bebas-neue"] as const;
/** Tags for the licensed wallpaper library; the app picks an image that carries the tag. */
export const PHOTO_TAGS = ["mountains", "ocean", "forest", "desert", "city-night", "aurora", "space", "autumn", "snow", "abstract-paint", "architecture", "flowers"] as const;
export const PATTERNS = ["grain", "dots", "waves", "grid", "stars", "bokeh", "stripes", "topography"] as const;

export const ThemeSpecSchema = z.object({
  name: z.string().min(1).max(40).describe("A short, evocative name for this design, 1-4 words"),
  summary: z.string().min(1).max(160).describe("One sentence describing the look, shown to the user"),
  palette: z
    .object({
      background: hex.describe("Screen background; behind the wallpaper"),
      surface: hex.describe("Dock band, pills and panels"),
      text: hex.describe("Clock, app names, titles; must be easy to read on background"),
      textMuted: hex.describe("Date, secondary labels"),
      accent: hex.describe("Focus highlight, glow and small details"),
    })
    .strict(),
  font: z.enum(FONTS).describe("Typeface for the clock and labels"),
  wallpaper: z
    .object({
      kind: z.enum(["none", "gradient", "sky", "pattern", "photo"]).describe("none: flat background; sky: a dark gradient that follows the time of day"),
      colors: z.array(hex).min(2).max(4).describe("Gradient or pattern colours, dark enough for white text on top"),
      pattern: z.enum(PATTERNS).nullable().describe("For kind=pattern, otherwise null"),
      photoTag: z.enum(PHOTO_TAGS).nullable().describe("For kind=photo, otherwise null"),
      dim: z.number().int().min(0).max(90).describe("Black overlay over the wallpaper, percent"),
    })
    .strict(),
  layout: z
    .object({
      style: z.enum(["classic", "cinematic", "single-row", "minimal"]).describe("cinematic: the focused dock app's artwork fills the top; single-row: all apps in one sideways row; minimal: no big title, no glow"),
      columns: z.number().int().min(4).max(8).describe("Apps per row in the grid"),
      dockSize: z.number().int().min(4).max(7).describe("Apps in the dock"),
      rowsBelowDock: z.number().int().min(0).max(3),
      dockStyle: z.enum(["band", "glass", "floating"]).describe("band: solid strip; glass: frosted; floating: no strip"),
      focusStyle: z.enum(["glass", "rim", "halo"]).describe("How the selected tile is highlighted"),
      glow: z.enum(["radial", "horizon", "none"]).describe("Colour glow behind the focused app"),
      appNames: z.enum(["focused", "always"]),
      tiles: z.enum(["banner", "icon"]).describe("banner: each app's own artwork; icon: its icon on a card tinted from it"),
    })
    .strict(),
  clock: z
    .object({
      size: z.enum(["small", "medium", "large", "huge"]),
      position: z.enum(["top-left", "top-center", "top-right"]),
      format: z.enum(["12", "24", "system"]),
      showDate: z.boolean(),
      showGreeting: z.boolean(),
    })
    .strict(),
  topBar: z.enum(["pills", "icons", "menu"]).describe("pills: labelled buttons; icons: round icon buttons; menu: one gear"),
  motion: z.enum(["lively", "calm", "still"]),
  widgets: z.array(z.enum(["stats", "idle-clock"])).max(2).describe("stats: CPU and memory line under the clock; idle-clock: clock screensaver after 10 idle minutes"),
  dockApps: z.array(z.string()).max(7).describe("Package names of apps for the dock, in order, only from the TV's installed apps"),
}).strict();

export type ThemeSpec = z.infer<typeof ThemeSpecSchema>;

/** The built-in look, also what the launcher falls back to when the subscription pass runs out. */
export const DEFAULT_THEME: ThemeSpec = {
  name: "KanTV",
  summary: "Pitch black with a warm amber focus, a thin clock and a five-app dock.",
  palette: { background: "#000000", surface: "#16181D", text: "#F5F2EC", textMuted: "#A3A3AD", accent: "#FFB547" },
  font: "outfit",
  wallpaper: { kind: "none", colors: ["#000000", "#0D0E12"], pattern: null, photoTag: null, dim: 0 },
  layout: { style: "classic", columns: 5, dockSize: 5, rowsBelowDock: 1, dockStyle: "band", focusStyle: "glass", glow: "radial", appNames: "focused", tiles: "banner" },
  clock: { size: "large", position: "top-left", format: "system", showDate: true, showGreeting: true },
  topBar: "pills",
  motion: "lively",
  widgets: [],
  dockApps: [],
};
