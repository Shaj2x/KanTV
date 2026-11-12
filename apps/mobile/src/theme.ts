// KanTV's look: teletext. The app borrows the one interface every TV has always had: black pages, seven bright
// broadcast colours, chunky pixel type, page numbers, and the four coloured Fastext keys. Each part of the app is
// a "page" with its own colour and number, so you always know where you are (setup is cyan, P200; design is
// magenta, P300; and so on). Pixel type (VT323) is for headlines, page numbers and keys; Hanken Grotesk is for
// anything you actually read. Every screen takes its colours, type and spacing from here.
import { Platform } from "react-native";

/** The teletext colours, tuned for a phone screen: every one passes 4.5:1 against black. */
export const tt = {
  white: "#FFFFFF",
  yellow: "#FFD400",
  cyan: "#00D8E0",
  green: "#3DDC6B",
  magenta: "#FF5BDB",
  red: "#FF4B3E",
  blue: "#4C7DFF",
};

export const color = {
  bg: "#000000",
  panel: "#000000",
  surface: "#101010",
  surfaceRaised: "#1A1A1A",
  surfacePressed: "#262626",
  line: "#2B2B2B",
  lineStrong: "#5C5C5C",
  text: "#FFFFFF",
  muted: "#BDBDBD",
  faint: "#8F8F8F",
  // Checks, radios and focus: white, like a teletext cursor. (Named accent so screens read the same.)
  accent: "#FFFFFF",
  accentPressed: "#D6D6D6",
  accentInk: "#000000",
  accentSoft: "rgba(255,255,255,0.08)",
  accentLine: "rgba(255,255,255,0.6)",
  // States: always with a marker or words, never colour alone.
  ok: tt.green,
  okSoft: "rgba(61,220,107,0.12)",
  warn: tt.yellow,
  warnSoft: "rgba(255,212,0,0.12)",
  danger: tt.red,
  dangerSoft: "rgba(255,75,62,0.14)",
  // The TV drawings.
  tvScreen: "#05060C",
  tvPanel: "#1B1F33",
  tvBezel: "#0B0B0B",
  chrome: "rgba(0,0,0,0.9)",
};

/** The test-card bars: the brand mark and the setup celebration. */
export const bars = [tt.white, tt.yellow, tt.cyan, tt.green, tt.magenta, tt.red, tt.blue];

/** The light a TV casts when nothing else says otherwise. */
export const defaultGlow = "#FF9A4D";

/** Each part of the app is a teletext page: its number and its colour. */
export interface Page {
  number: number;
  name: string;
  tone: string;
}
const PAGES: [prefix: string, page: Page][] = [
  ["/setup", { number: 200, name: "Setup", tone: tt.cyan }],
  ["/design/saved", { number: 302, name: "My designs", tone: tt.magenta }],
  ["/design", { number: 300, name: "Design", tone: tt.magenta }],
  ["/paywall", { number: 310, name: "Plans", tone: tt.magenta }],
  ["/remote", { number: 400, name: "Remote", tone: tt.blue }],
  ["/restore", { number: 500, name: "Restore", tone: tt.green }],
  ["/signin", { number: 600, name: "Sign in", tone: tt.white }],
  ["/account", { number: 610, name: "Account", tone: tt.white }],
];
export const HOME: Page = { number: 100, name: "Home", tone: tt.yellow };
export function pageFor(path: string): Page {
  return PAGES.find(([p]) => path.startsWith(p))?.[1] ?? HOME;
}

export const space = (n: number) => n * 4;
// Teletext is square: corners are barely softened, only enough to stop them looking broken on a phone.
export const radius = { sm: 2, md: 3, lg: 4, xl: 6, pill: 3 };

// A comfortable phone column everywhere; wide screens put the TV beside it instead of stretching.
export const layout = { column: 560, wide: 980, stage: 520 };

/** Font files, loaded once in the root layout. */
export const fontFiles = {
  pixel: "VT323_400Regular",
  regular: "HankenGrotesk_400Regular",
  medium: "HankenGrotesk_500Medium",
  semibold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
};
const f = (name: keyof typeof fontFiles) => fontFiles[name];

/**
 * The type scale. VT323 is drawn small for its size, so its sizes look large on paper; it has one weight and
 * needs no tracking. Hanken carries the reading text at comfortable sizes.
 */
export const type = {
  hero: { fontFamily: f("pixel"), fontSize: 58, lineHeight: 54, color: color.text },
  display: { fontFamily: f("pixel"), fontSize: 44, lineHeight: 42, color: color.text },
  title: { fontFamily: f("pixel"), fontSize: 32, lineHeight: 32, color: color.text },
  heading: { fontFamily: f("semibold"), fontSize: 17, lineHeight: 22, letterSpacing: -0.1, color: color.text },
  body: { fontFamily: f("regular"), fontSize: 16, lineHeight: 24, color: color.text },
  small: { fontFamily: f("regular"), fontSize: 14, lineHeight: 20, color: color.muted },
  tiny: { fontFamily: f("medium"), fontSize: 12.5, lineHeight: 17, color: color.faint },
  // Group names and page furniture: the pixel face, like teletext's own labels.
  label: { fontFamily: f("pixel"), fontSize: 24, lineHeight: 24, color: color.text },
  pixel: { fontFamily: f("pixel"), fontSize: 22, lineHeight: 22, color: color.text },
  button: { fontFamily: f("pixel"), fontSize: 28, lineHeight: 28 },
  mono: { fontSize: 12, lineHeight: 16, color: color.faint, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }) },
};

/** Web-only style extras React Native ignores elsewhere. */
export const web = {
  material: {},
};
