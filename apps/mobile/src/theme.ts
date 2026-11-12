// KanTV's look: dark, because it is used in a room with the TV on; one warm accent, the colour of a lamp next to
// the screen; large, tightly tracked headings and calm body text. Every screen takes its colours, type and
// spacing from here, so the whole app changes in one place.
import { Platform } from "react-native";

export const color = {
  // Surfaces, from the room to the front: each step a little lighter and a touch cooler.
  bg: "#0A0B0F",
  panel: "#0F1116",
  surface: "#14161C",
  surfaceRaised: "#1C1F27",
  surfacePressed: "#232733",
  line: "#272B35",
  lineStrong: "#363B48",
  // Text. Every pair is at least 4.5:1 on surface; faint is for hints and placeholders only.
  text: "#F4F1EA",
  muted: "#A9AAB4",
  faint: "#80828D",
  // The lamp.
  accent: "#FFB547",
  accentPressed: "#F2A532",
  accentInk: "#1B1305",
  accentSoft: "rgba(255,181,71,0.12)",
  accentLine: "rgba(255,181,71,0.45)",
  // States: never the only signal (each comes with an icon or words).
  ok: "#5AD68F",
  okSoft: "rgba(90,214,143,0.12)",
  warn: "#FFCC66",
  danger: "#FF7466",
  dangerSoft: "rgba(255,116,102,0.12)",
  // The TV drawings.
  tvScreen: "#08090C",
  tvPanel: "#22252D",
  tvBezel: "#1A1C22",
  // Translucent chrome over scrolling content.
  chrome: "rgba(10,11,15,0.78)",
};

export const space = (n: number) => n * 4;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

// Content width: a comfortable phone column on every device; wide screens add a side panel instead of stretching.
export const layout = { column: 560, wide: 980, rail: 400 };

const font = Platform.select({
  web: 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  default: undefined,
});

/**
 * The type scale. Tracking changes with size (large text tighter, small text slightly open) and leading
 * tightens as size grows; hierarchy comes from size, weight and leading together.
 */
export const type = {
  hero: { fontFamily: font, fontSize: 40, lineHeight: 44, fontWeight: "700" as const, letterSpacing: -1.1, color: color.text },
  display: { fontFamily: font, fontSize: 32, lineHeight: 37, fontWeight: "700" as const, letterSpacing: -0.8, color: color.text },
  title: { fontFamily: font, fontSize: 22, lineHeight: 27, fontWeight: "700" as const, letterSpacing: -0.35, color: color.text },
  heading: { fontFamily: font, fontSize: 17, lineHeight: 22, fontWeight: "600" as const, letterSpacing: -0.2, color: color.text },
  body: { fontFamily: font, fontSize: 16, lineHeight: 24, letterSpacing: -0.1, color: color.text },
  small: { fontFamily: font, fontSize: 14, lineHeight: 20, letterSpacing: 0, color: color.muted },
  tiny: { fontFamily: font, fontSize: 12, lineHeight: 16, letterSpacing: 0.1, color: color.faint },
  label: { fontFamily: font, fontSize: 12, lineHeight: 16, fontWeight: "700" as const, letterSpacing: 1.2, textTransform: "uppercase" as const, color: color.muted },
  mono: { fontSize: 12, lineHeight: 16, color: color.faint, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }) },
};

/** Web-only style extras React Native ignores elsewhere (blur behind chrome, smooth press feedback). */
export const web = {
  material: Platform.OS === "web" ? ({ backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)" } as object) : {},
  press: Platform.OS === "web" ? ({ transitionProperty: "transform, background-color, opacity", transitionDuration: "120ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" } as object) : {},
};
