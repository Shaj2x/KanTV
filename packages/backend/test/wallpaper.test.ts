// The wallpaper the TV gets: a real 1920x1080 JPEG of the same picture the phone previews.
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, parseHex, type ThemeSpec } from "@kantv/core";
import { renderWallpaperJpeg } from "../src/wallpaper.ts";

const spec = (wallpaper: ThemeSpec["wallpaper"]): ThemeSpec => ({ ...structuredClone(DEFAULT_THEME), wallpaper });
const pixel = (img: { data: Uint8Array; width: number }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
};
const close = (a: number[], hex: string, tol = 12) => parseHex(hex).every((c, i) => Math.abs(c - a[i]!) <= tol);

describe("wallpaper.jpg", () => {
  it("is a 1920x1080 JPEG running from the first gradient colour to the last", () => {
    const jpg = renderWallpaperJpeg(spec({ kind: "gradient", colors: ["#102040", "#803010"], pattern: null, photoTag: null, dim: 0 }))!;
    expect([...jpg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const img = jpeg.decode(jpg, { useTArray: true });
    expect([img.width, img.height]).toEqual([1920, 1080]);
    expect(close(pixel(img, 2, 2), "#102040")).toBe(true);
    expect(close(pixel(img, 1917, 1077), "#803010")).toBe(true);
  });

  it("draws the pattern (stars are bright points on a dark sky)", () => {
    const img = jpeg.decode(renderWallpaperJpeg(spec({ kind: "pattern", colors: ["#05060C", "#0A0C18"], pattern: "stars", photoTag: null, dim: 0 }))!, { useTArray: true });
    let bright = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! > 150 && img.data[i + 1]! > 150 && img.data[i + 2]! > 150) bright++;
    expect(bright).toBeGreaterThan(200);
  });

  it("is the same picture every time for the same design", () => {
    const s = spec({ kind: "pattern", colors: ["#0E1A14", "#1C3325"], pattern: "topography", photoTag: null, dim: 20 });
    expect(Buffer.compare(renderWallpaperJpeg(s)!, renderWallpaperJpeg(s)!)).toBe(0);
  });

  it("has nothing to render for a flat background, the launcher's sky, or a library photo", () => {
    for (const kind of ["none", "sky", "photo"] as const) expect(renderWallpaperJpeg(spec({ ...DEFAULT_THEME.wallpaper, kind }))).toBeNull();
  });
});
