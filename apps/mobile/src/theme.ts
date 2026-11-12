// KanTV's look, "screen light". The app lives in a living room with the lights off: everything sits in the deep
// blue of a room lit only by a TV, and the colour comes from the TV itself. Wherever a TV appears it casts its
// picture's light onto the page, and the interface around it stays quiet. Controls are the cool white of a
// screen's highlight. The only other colours are the test-card bars of the brand mark (which also show setup
// progress) and the status colours.
// Type: Unbounded, a wide geometric face that reads like a channel ident, for headings only; Hanken Grotesk for
// everything you read. Every screen takes its colours, type and spacing from here.
import { Platform } from "react-native";

export const color = {
  // The room, from the back wall to what's nearest you.
  bg: "#10132A",
  panel: "#13172F",
  surface: "#181C38",
  surfaceRaised: "#20254A",
  surfacePressed: "#2A3058",
  line: "rgba(164,169,207,0.16)",
  lineStrong: "rgba(164,169,207,0.34)",
  // Text: every pair passes 4.5:1 on every surface above.
  text: "#ECEEFF",
  muted: "#A4A9CF",
  faint: "#8A90B8",
  // Controls: the white of a screen's highlight, with dark ink on it. (Named accent so screens read the same.)
  accent: "#ECEEFF",
  accentPressed: "#CDD2F4",
  accentInk: "#10132A",
  accentSoft: "rgba(236,238,255,0.08)",
  accentLine: "rgba(236,238,255,0.5)",
  // States: always with an icon or words, never colour alone.
  ok: "#6FE3B4",
  okSoft: "rgba(111,227,180,0.12)",
  warn: "#FFD36E",
  warnSoft: "rgba(255,211,110,0.12)",
  danger: "#FF8A80",
  dangerSoft: "rgba(255,138,128,0.12)",
  // The TV drawings.
  tvScreen: "#07081A",
  tvPanel: "#1E2242",
  tvBezel: "#0A0C1C",
  // Translucent chrome over scrolling content.
  chrome: "rgba(16,19,42,0.8)",
};

/** The test-card bars: the brand mark, and setup progress (each finished step lights its bar). */
export const bars = ["#ECEEFF", "#FFD36E", "#5EE6D8", "#7BE38E", "#E68AF2", "#FF7F7A", "#7F8CFF"];

/** The light a TV casts when nothing else says otherwise: warm, like a picture at night. */
export const defaultGlow = "#FF9A4D";

export const space = (n: number) => n * 4;
// Radius follows size: small controls are tighter, the big surfaces softer, buttons fully round.
export const radius = { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 };

// A comfortable phone column everywhere; wide screens put the TV beside it instead of stretching.
export const layout = { column: 560, wide: 980, stage: 520 };

/** Font files, loaded once in the root layout. */
export const fontFiles = {
  display: "Unbounded_500Medium",
  displayBold: "Unbounded_600SemiBold",
  regular: "HankenGrotesk_400Regular",
  medium: "HankenGrotesk_500Medium",
  semibold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
};
const f = (name: keyof typeof fontFiles) => fontFiles[name];

/**
 * The type scale. Large text is set tight and small text slightly open; leading tightens as size grows.
 * Weight is in the font file (custom faces on Android ignore fontWeight).
 */
export const type = {
  hero: { fontFamily: f("display"), fontSize: 34, lineHeight: 40, letterSpacing: -0.7, color: color.text },
  display: { fontFamily: f("display"), fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: color.text },
  title: { fontFamily: f("display"), fontSize: 19, lineHeight: 25, letterSpacing: -0.25, color: color.text },
  heading: { fontFamily: f("semibold"), fontSize: 17, lineHeight: 22, letterSpacing: -0.15, color: color.text },
  body: { fontFamily: f("regular"), fontSize: 16, lineHeight: 24, letterSpacing: 0, color: color.text },
  small: { fontFamily: f("regular"), fontSize: 14, lineHeight: 20, letterSpacing: 0.05, color: color.muted },
  tiny: { fontFamily: f("medium"), fontSize: 12.5, lineHeight: 17, letterSpacing: 0.15, color: color.faint },
  // Group names: sentence case, quiet weight, no tracking tricks.
  label: { fontFamily: f("semibold"), fontSize: 14, lineHeight: 20, letterSpacing: 0, color: color.muted },
  button: { fontFamily: f("bold"), fontSize: 16.5, letterSpacing: -0.1 },
  mono: { fontSize: 12, lineHeight: 16, color: color.faint, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }) },
};

/** Web-only style extras React Native ignores elsewhere (blur behind chrome, smooth press feedback). */
export const web = {
  material: Platform.OS === "web" ? ({ backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)" } as object) : {},
  press: Platform.OS === "web" ? ({ transitionProperty: "transform, background-color, border-color, opacity", transitionDuration: "140ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" } as object) : {},
  // The glow changes colour when a new design arrives: a slow crossfade, like a picture changing.
  glow: Platform.OS === "web" ? ({ transitionProperty: "opacity", transitionDuration: "600ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" } as object) : {},
};
