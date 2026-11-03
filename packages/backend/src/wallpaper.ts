// A design's wallpaper as the 1920x1080 wallpaper.jpg the launcher shows: the shared SVG (the same one the
// phone previews) rasterised with resvg and encoded as JPEG.
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import { hasRenderedWallpaper, wallpaperSvg, type ThemeSpec } from "@kantv/core";

export const WALLPAPER_SIZE = { width: 1920, height: 1080 } as const;

/** JPEG bytes, or null when the design has no picture to render (flat colour, the launcher's sky, a library photo). */
export function renderWallpaperJpeg(spec: ThemeSpec, quality = 88): Buffer | null {
  if (!hasRenderedWallpaper(spec)) return null;
  const { width, height } = WALLPAPER_SIZE;
  const image = new Resvg(wallpaperSvg(spec, width, height), { fitTo: { mode: "original" } }).render();
  return jpeg.encode({ data: Buffer.from(image.pixels), width: image.width, height: image.height }, quality).data;
}
