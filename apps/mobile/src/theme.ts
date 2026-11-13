// KanTV's look, shared with the website (apps/site): a white page, one near-black ink, one mint accent, and
// Familjen Grotesk throughout. The interface stays almost neutral so the colour comes from the product itself:
// the TV home screens people design. Buttons are the ink; mint marks what is selected or done. Every screen takes
// its colours, type and spacing from here.
import { Platform } from "react-native";

export const color = {
  bg: "#FFFFFF",
  panel: "#FFFFFF",
  // Grouped content and the stage a TV picture stands on.
  surface: "#F4F4F2",
  surfaceRaised: "#FFFFFF",
  surfacePressed: "#E9E9E6",
  line: "#E4E4E0",
  lineStrong: "#C9C9C4",
  // Text: ink and muted pass 7:1 on white; faint is for hints only (4.5:1).
  text: "#1F1F1F",
  muted: "#555555",
  faint: "#737373",
  // The main action: the ink, with white on it.
  accent: "#1F1F1F",
  accentPressed: "#3A3A3A",
  accentInk: "#FFFFFF",
  accentSoft: "rgba(31,31,31,0.06)",
  accentLine: "rgba(31,31,31,0.35)",
  // The brand's mint: selected, done, the one highlight on a screen.
  mint: "#A1FFCB",
  mintSoft: "#E6FFF1",
  mintInk: "#0F5132",
  // States: always with an icon or words, never colour alone.
  ok: "#14804A",
  okSoft: "#E6F6EC",
  warn: "#8A5A00",
  warnSoft: "#FFF4D6",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  // The TV drawings stay dark: they are pictures of a screen.
  tvScreen: "#08090C",
  tvPanel: "#1E2230",
  tvBezel: "#111111",
  chrome: "rgba(255,255,255,0.92)",
};

/** The colours a TV home screen glows with when nothing else says otherwise. */
export const defaultGlow = "#FF9A4D";

export const space = (n: number) => n * 4;
// Soft corners, one family: controls 10, cards 16, big frames 22; buttons 12.
export const radius = { sm: 10, md: 12, lg: 16, xl: 22, pill: 999 };

// A comfortable phone column everywhere; wide screens put the TV beside it instead of stretching.
export const layout = { column: 560, wide: 980, stage: 560 };

/** Font files, loaded once in the root layout. */
export const fontFiles = {
  regular: "FamiljenGrotesk_400Regular",
  medium: "FamiljenGrotesk_500Medium",
  semibold: "FamiljenGrotesk_600SemiBold",
  bold: "FamiljenGrotesk_700Bold",
};
const f = (name: keyof typeof fontFiles) => fontFiles[name];

/**
 * The type scale, as on the website: headlines at regular weight with tight tracking, text people read at 16
 * and up, sentence case everywhere. Weight lives in the font file (custom faces on Android ignore fontWeight).
 */
export const type = {
  hero: { fontFamily: f("regular"), fontSize: 36, lineHeight: 40, letterSpacing: -1.2, color: color.text },
  display: { fontFamily: f("regular"), fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: color.text },
  title: { fontFamily: f("medium"), fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: color.text },
  heading: { fontFamily: f("medium"), fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: color.text },
  body: { fontFamily: f("regular"), fontSize: 16, lineHeight: 24, letterSpacing: -0.05, color: color.text },
  small: { fontFamily: f("regular"), fontSize: 14, lineHeight: 20, color: color.muted },
  tiny: { fontFamily: f("medium"), fontSize: 13, lineHeight: 17, color: color.faint },
  label: { fontFamily: f("medium"), fontSize: 14, lineHeight: 20, color: color.muted },
  button: { fontFamily: f("medium"), fontSize: 16, lineHeight: 20, letterSpacing: -0.1 },
  mono: { fontSize: 12, lineHeight: 16, color: color.faint, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }) },
};

/** Web-only style extras React Native ignores elsewhere. */
export const web = {
  material: Platform.OS === "web" ? ({ backdropFilter: "blur(16px) saturate(160%)", WebkitBackdropFilter: "blur(16px) saturate(160%)" } as object) : {},
};
