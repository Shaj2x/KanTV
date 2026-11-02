// Keeping the designer from handing back the same look twice. Each design gets a compact fingerprint; a new
// one too close to a recent one (unless the user asked for exactly that) is sent back once with the reason.
// The model also sees short summaries of recent designs and a random design direction to start from, since the
// current Claude models take no temperature: variety has to come from the prompt.
import { mixHex, oklabDistance } from "./color.ts";
import type { ThemeSpec } from "./spec.ts";

export interface DesignPrint {
  background: string;
  accent: string;
  wallpaper: string;
  font: string;
  style: string;
  dock: string;
  focus: string;
  wallpaperKind: string;
  clock: string;
  motion: string;
}

export function designPrint(s: ThemeSpec): DesignPrint {
  return {
    background: s.palette.background,
    accent: s.palette.accent,
    wallpaper: s.wallpaper.kind === "none" ? s.palette.background : mixHex(s.wallpaper.colors),
    font: s.font,
    style: s.layout.style,
    dock: s.layout.dockStyle,
    focus: s.layout.focusStyle,
    wallpaperKind: `${s.wallpaper.kind}:${s.wallpaper.pattern ?? s.wallpaper.photoTag ?? ""}`,
    clock: `${s.clock.size}:${s.clock.position}`,
    motion: s.motion,
  };
}

/**
 * 1 for the same look, 0 for nothing in common. Colour carries half the weight (OKLab distance, where 0.3 is
 * already very different), the choices the other half.
 */
export function similarity(a: DesignPrint, b: DesignPrint): number {
  const colour = (x: string, y: string) => Math.max(0, 1 - oklabDistance(x, y) / 0.3);
  const colourSim = 0.2 * colour(a.background, b.background) + 0.15 * colour(a.accent, b.accent) + 0.15 * colour(a.wallpaper, b.wallpaper);
  const same = (k: keyof DesignPrint, wgt: number) => (a[k] === b[k] ? wgt : 0);
  return colourSim + same("font", 0.12) + same("style", 0.1) + same("wallpaperKind", 0.1) + same("dock", 0.06) + same("focus", 0.04) + same("clock", 0.05) + same("motion", 0.03);
}

/** Above this, two designs read as the same look to a person. */
export const TOO_SIMILAR = 0.82;

export function closestRecent(print: DesignPrint, recent: DesignPrint[]): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null;
  recent.forEach((r, index) => {
    const score = similarity(print, r);
    if (!best || score > best.score) best = { index, score };
  });
  return best;
}

/** One line per recent design, for the prompt: enough for the model to steer away, short enough to be cheap. */
export function describeForPrompt(s: ThemeSpec): string {
  return `"${s.name}": ${s.palette.background} bg, ${s.palette.accent} accent, ${s.font}, ${s.layout.style} layout, ${s.layout.dockStyle} dock, ${s.wallpaper.kind}${s.wallpaper.pattern ? `/${s.wallpaper.pattern}` : ""}${s.wallpaper.photoTag ? `/${s.wallpaper.photoTag}` : ""} wallpaper, ${s.clock.size} clock`;
}

/** Starting points the model is nudged toward when the user's request leaves room. */
export const DIRECTIONS = [
  "Scandinavian calm: muted, airy, soft contrast in the details",
  "1970s warmth: earthy oranges and browns, rounded type",
  "Neo-noir: deep blacks, one sharp neon accent",
  "Japanese minimal: lots of empty space, one quiet accent",
  "Art deco: gold on deep navy or emerald, elegant serif",
  "Brutalist: flat, bold, monospaced, high contrast",
  "Cinema lobby: velvet reds, warm low light",
  "Deep ocean: inky blues and teal glow",
  "Desert dusk: sand, terracotta and violet sky",
  "Arcade: playful, saturated, chunky type",
  "Forest cabin: pine greens, warm wood tones",
  "Swiss poster: strict grid, red accent, grotesque type",
  "Moonlit: silver and slate, soft blue light",
  "Botanical: sage and cream with a deep green accent",
] as const;
