// Silk in a design's colour: the deep, rich grounds and the light come from the design's own glow colour, drawn
// by the same generator as the TV's silk wallpaper.
import { DEFAULT_THEME, wallpaperSvg, type ThemeSpec } from "@kantv/core";

export /** The design colour's hue at a given saturation and lightness (0-1): deep, rich grounds from a pale glow. */
function shade(hex: string, sat: number, light: number) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = light - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/** The four silk colours for a glow: three deep grounds of its hue and the glow itself. */
export function silkColours(glow: string) {
  return [shade(glow, 0.7, 0.03), shade(glow, 0.8, 0.21), shade(glow, 0.7, 0.35), glow];
}

/** Flowing silk in a design's colour, from the same generator as the TV's silk wallpaper. */
export function silkXml(glow: string, w: number, h: number, id: string) {
  const spec: ThemeSpec = {
    ...DEFAULT_THEME,
    wallpaper: { kind: "pattern", colors: silkColours(glow), pattern: "silk", photoTag: null, dim: 0 },
  };
  return wallpaperSvg(spec, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), id);
}

