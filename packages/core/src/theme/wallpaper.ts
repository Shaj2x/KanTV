// A design's wallpaper as SVG: the gradient and the pattern, nothing else (the launcher adds the dim, the glow
// and the sky itself). The phone preview draws from this, and the backend renders it to the 1920x1080
// wallpaper.jpg the launcher shows, so what the person approves is what the TV gets. Deterministic: the same
// spec always gives the same picture.
import type { ThemeSpec } from "./spec.ts";

/** Whether a design has a wallpaper picture to render (none and sky are the launcher's; photo comes from the library). */
export function hasRenderedWallpaper(spec: ThemeSpec): boolean {
  return spec.wallpaper.kind === "gradient" || spec.wallpaper.kind === "pattern";
}

const n = (x: number) => Math.round(x * 100) / 100;

// Silk: one ribbon of light flowing in from the top, folding back across the screen and out at the bottom,
// drawn three times (a wide soft glow, a brighter body, a thin bright core), with a broad band of light low on
// the right and the left edge falling into shadow. The glow takes the design's last (light) colour.
const SILK_MAIN = "M 0.68 -0.03 C 0.6 0.12 0.57 0.21 0.72 0.26 C 0.88 0.31 0.85 0.36 0.6 0.345 C 0.36 0.335 0.22 0.42 0.285 0.58 C 0.34 0.72 0.46 0.86 0.56 1.03";
const SILK_ECHO = "M 0.9 -0.03 C 0.78 0.1 0.76 0.18 0.9 0.24 C 1.02 0.29 1.02 0.33 0.8 0.37 C 0.55 0.41 0.42 0.5 0.47 0.66 C 0.51 0.8 0.62 0.92 0.7 1.03";

function scalePath(d: string, w: number, h: number): string {
  let i = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (v) => String(n(Number(v) * (i++ % 2 === 0 ? w : h))));
}

function silk(w: number, h: number, colours: string[], id: string): string[] {
  const glow = colours[colours.length - 1]!;
  const main = scalePath(SILK_MAIN, w, h);
  const echo = scalePath(SILK_ECHO, w, h);
  // Blur regions cover the whole picture, so no soft edge is ever cut straight.
  const blur = (name: string, sd: number) => `<filter id="${id}-${name}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${n(sd)}"/></filter>`;
  return [
    `<defs>${blur("wide", w * 0.03)}${blur("soft", w * 0.006)}${blur("band", w * 0.06)}<linearGradient id="${id}-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000000" stop-opacity="0.65"/><stop offset="0.45" stop-color="#000000" stop-opacity="0"/></linearGradient></defs>`,
    `<ellipse cx="${n(w * 0.78)}" cy="${n(h * 0.66)}" rx="${n(w * 0.34)}" ry="${n(h * 0.09)}" fill="${glow}" opacity="0.32" filter="url(#${id}-band)"/>`,
    `<path d="${echo}" stroke="${glow}" stroke-width="${n(h * 0.05)}" fill="none" opacity="0.12" filter="url(#${id}-wide)"/>`,
    `<path d="${echo}" stroke="${glow}" stroke-width="${n(h * 0.0025)}" fill="none" opacity="0.35" filter="url(#${id}-soft)"/>`,
    `<path d="${main}" stroke="${glow}" stroke-width="${n(h * 0.09)}" fill="none" opacity="0.3" filter="url(#${id}-wide)"/>`,
    `<path d="${main}" stroke="${glow}" stroke-width="${n(h * 0.018)}" fill="none" opacity="0.8" filter="url(#${id}-soft)"/>`,
    `<path d="${main}" stroke="#FFFFFF" stroke-width="${n(h * 0.0028)}" fill="none" opacity="0.9"/>`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}-shade)"/>`,
  ];
}

export function wallpaperSvg(spec: ThemeSpec, w = 1920, h = 1080, idPrefix = "kw"): string {
  const wp = spec.wallpaper;
  const colours = wp.kind === "gradient" || wp.kind === "pattern" ? wp.colors : [spec.palette.background, spec.palette.background];
  const ink = colours[colours.length - 1]!;
  const step = w / 24;
  // Line widths and dot sizes are the preview's, scaled: the preview draws about 360 px wide.
  const k = w / 360;
  const ground = wp.kind === "pattern" && wp.pattern === "silk" && colours.length > 2 ? colours.slice(0, -1) : colours;
  const stops = ground.map((c, i) => `<stop offset="${n(i / (ground.length - 1))}" stop-color="${c}"/>`).join("");
  const parts: string[] = [
    `<defs><linearGradient id="${idPrefix}-bg" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${idPrefix}-bg)"/>`,
  ];
  if (wp.kind === "pattern") {
    const p = wp.pattern;
    if (p === "dots" || p === "grain") {
      const gap = p === "grain" ? step / 2 : step;
      const r = n((p === "grain" ? 0.6 : 1.4) * k);
      for (let x = gap / 2; x < w; x += gap) for (let y = gap / 2; y < h; y += gap) parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${ink}" opacity="0.7"/>`);
    }
    if (p === "grid") {
      const sw = n(0.6 * k);
      for (let x = 0; x < w; x += step * 2) parts.push(`<line x1="${n(x)}" y1="0" x2="${n(x)}" y2="${h}" stroke="${ink}" stroke-width="${sw}"/>`);
      for (let y = 0; y < h; y += step * 2) parts.push(`<line x1="0" y1="${n(y)}" x2="${w}" y2="${n(y)}" stroke="${ink}" stroke-width="${sw}"/>`);
    }
    if (p === "stripes") for (let x = -h; x < w; x += step * 1.5) parts.push(`<line x1="${n(x)}" y1="${h}" x2="${n(x + h)}" y2="0" stroke="${ink}" stroke-width="${n(step * 0.4)}" opacity="0.6"/>`);
    if (p === "waves")
      for (let y = h * 0.15; y < h * 1.1; y += step * 1.4) {
        let d = `M 0 ${n(y)}`;
        for (let x = 0; x <= w; x += step) d += ` Q ${n(x + step / 2)} ${n(y + (Math.round(x / step) % 2 ? -step / 2 : step / 2))} ${n(x + step)} ${n(y)}`;
        parts.push(`<path d="${d}" stroke="${ink}" stroke-width="${n(1 * k)}" fill="none" opacity="0.8"/>`);
      }
    if (p === "topography")
      for (let i = 1; i < 9; i++) parts.push(`<ellipse cx="${n(w * 0.72)}" cy="${n(h * 0.35)}" rx="${n(i * step * 1.6)}" ry="${n(i * step)}" stroke="${ink}" stroke-width="${n(0.8 * k)}" fill="none"/>`);
    if (p === "stars")
      for (let i = 0; i < 70; i++) {
        const x = ((i * 9301 + 49297) % 233280) / 233280;
        const y = ((i * 4567 + 1237) % 7919) / 7919;
        parts.push(`<circle cx="${n(x * w)}" cy="${n(y * h * 0.7)}" r="${n((i % 7 === 0 ? 1.3 : 0.6) * k)}" fill="#FFFFFF" opacity="0.75"/>`);
      }
    if (p === "silk") parts.push(...silk(w, h, colours, idPrefix));
    if (p === "bokeh")
      for (let i = 0; i < 9; i++) parts.push(`<circle cx="${n((((i * 37) % 100) / 100) * w)}" cy="${n((((i * 53) % 70) / 100) * h)}" r="${n(step * (1 + (i % 3)))}" fill="${ink}" opacity="0.35"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}
