// KanTV's look on the phone: dark (it is used in a room with the TV on), warm accent, large type, big touch
// targets. Every screen takes its colours and sizes from here.
export const color = {
  bg: "#0D0E12",
  surface: "#17191F",
  surfaceRaised: "#1F222A",
  line: "#2A2E37",
  text: "#F5F2EC",
  muted: "#A3A3AD",
  faint: "#6E7079",
  accent: "#FFB547",
  accentInk: "#1B1305",
  accentSoft: "rgba(255,181,71,0.14)",
  ok: "#57D68D",
  okSoft: "rgba(87,214,141,0.14)",
  warn: "#FFCC66",
  danger: "#FF7062",
  dangerSoft: "rgba(255,112,98,0.14)",
  tvScreen: "#0A0B0E",
  tvPanel: "#22252D",
};

export const space = (n: number) => n * 4;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "700" as const, letterSpacing: -0.4, color: color.text },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.2, color: color.text },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const, color: color.text },
  body: { fontSize: 16, lineHeight: 23, color: color.text },
  small: { fontSize: 14, lineHeight: 20, color: color.muted },
  tiny: { fontSize: 12, lineHeight: 16, color: color.faint },
  mono: { fontSize: 12, lineHeight: 16, color: color.faint, fontFamily: "monospace" },
};
