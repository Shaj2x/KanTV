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

export function wallpaperSvg(spec: ThemeSpec, w = 1920, h = 1080, idPrefix = "kw"): string {
  const wp = spec.wallpaper;
  const colours = wp.kind === "gradient" || wp.kind === "pattern" ? wp.colors : [spec.palette.background, spec.palette.background];
  const ink = colours[colours.length - 1]!;
  const step = w / 24;
  // Line widths and dot sizes are the preview's, scaled: the preview draws about 360 px wide.
  const k = w / 360;
  const stops = colours.map((c, i) => `<stop offset="${n(i / (colours.length - 1))}" stop-color="${c}"/>`).join("");
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
    if (p === "bokeh")
      for (let i = 0; i < 9; i++) parts.push(`<circle cx="${n((((i * 37) % 100) / 100) * w)}" cy="${n((((i * 53) % 70) / 100) * h)}" r="${n(step * (1 + (i % 3)))}" fill="${ink}" opacity="0.35"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}
