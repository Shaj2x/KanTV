// Checks a spec before it is shown or applied, wherever it came from (the model, a saved design, a hand edit).
// Structure first (the schema), then what the schema cannot say: text readable from across the room, dock
// apps that exist on this TV, and fields that only make sense together. Problems a fix can't hurt are fixed
// (and reported); the rest are refused.
import { ThemeSpecSchema, type ThemeSpec } from "./spec.ts";
import { contrast, parseHex } from "./color.ts";

/** TV text is read from 2-3 m: stricter than WCAG AA's 4.5 for body text. */
export const MIN_TEXT_CONTRAST = 7;
export const MIN_MUTED_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;

export interface ThemeCheck {
  ok: boolean;
  spec?: ThemeSpec;
  /** What was changed to make it safe, in plain words. */
  fixes: string[];
  /** Why it was refused. */
  errors: string[];
}

function readableOn(bg: string): string {
  return contrast("#FFFFFF", bg) >= contrast("#111111", bg) ? "#FFFFFF" : "#111111";
}

/** Darkest wallpaper colour; text sits on the wallpaper, so it must be readable there too. */
function wallpaperBase(spec: ThemeSpec): string[] {
  const w = spec.wallpaper;
  if (w.kind !== "gradient" && w.kind !== "pattern") return [];
  // Silk's last colour is the thin ribbon of light, not ground the text sits on.
  return w.pattern === "silk" && w.colors.length > 2 ? w.colors.slice(0, -1) : w.colors;
}

export function checkTheme(input: unknown, installed: ReadonlySet<string> | null): ThemeCheck {
  const parsed = ThemeSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fixes: [], errors: parsed.error.issues.map((i) => `${i.path.join(".") || "spec"}: ${i.message}`) };
  }
  const spec: ThemeSpec = structuredClone(parsed.data);
  const fixes: string[] = [];
  const p = spec.palette;

  // A mid-tone background has no readable text colour at all (white and black both stop near 4.5:1), so the
  // background moves first: darker, or lighter if it is a light design, until white or black text reads.
  if (contrast(readableOn(p.background), p.background) < MIN_TEXT_CONTRAST) {
    const toward = contrast("#FFFFFF", p.background) >= contrast("#111111", p.background) ? 0 : 255;
    const [r, g, b] = parseHex(p.background);
    for (let t = 0.1; t <= 1; t += 0.1) {
      const mix = (c: number) => Math.round(c + (toward - c) * t).toString(16).padStart(2, "0");
      const next = `#${mix(r)}${mix(g)}${mix(b)}`.toUpperCase();
      if (contrast(readableOn(next), next) >= MIN_TEXT_CONTRAST) {
        p.background = next;
        break;
      }
    }
    fixes.push(toward === 0 ? "Deepened the background so text stands out" : "Lightened the background so text stands out");
  }

  // Text has to read on the background and on every wallpaper colour it may sit over (after the dim).
  const grounds = [p.background, ...wallpaperBase(spec)];
  const worst = (c: string) => Math.min(...grounds.map((g) => contrast(c, g)));
  if (worst(p.text) < MIN_TEXT_CONTRAST) {
    if (spec.wallpaper.kind !== "none" && spec.wallpaper.kind !== "sky" && spec.wallpaper.dim < 60 && contrast(p.text, p.background) >= MIN_TEXT_CONTRAST) {
      spec.wallpaper.dim = Math.max(spec.wallpaper.dim, 45);
      fixes.push("Darkened the wallpaper so the clock stays readable");
    } else {
      p.text = readableOn(p.background);
      fixes.push("Made the text white or black so it reads from the sofa");
    }
  }
  if (contrast(p.textMuted, p.background) < MIN_MUTED_CONTRAST) {
    p.textMuted = p.text;
    fixes.push("Brightened secondary text");
  }
  if (contrast(p.accent, p.background) < MIN_ACCENT_CONTRAST) {
    p.accent = p.text;
    fixes.push("Made the focus highlight brighter so you can see what's selected");
  }

  // Fields that only make sense together.
  if (spec.wallpaper.kind !== "pattern") spec.wallpaper.pattern = null;
  else if (!spec.wallpaper.pattern) spec.wallpaper.pattern = "grain";
  if (spec.wallpaper.kind !== "photo") spec.wallpaper.photoTag = null;
  else if (!spec.wallpaper.photoTag) spec.wallpaper.photoTag = "abstract-paint";
  if (spec.layout.style === "single-row") spec.layout.rowsBelowDock = 0;
  spec.widgets = [...new Set(spec.widgets)];

  // Dock apps: only apps on this TV, each once, no more than the dock holds.
  if (installed) {
    const missing = spec.dockApps.filter((a) => !installed.has(a));
    if (missing.length) fixes.push(`Left out ${missing.length} app${missing.length > 1 ? "s" : ""} this TV doesn't have`);
    spec.dockApps = spec.dockApps.filter((a) => installed.has(a));
  }
  spec.dockApps = [...new Set(spec.dockApps)].slice(0, spec.layout.dockSize);

  return { ok: true, spec, fixes, errors: [] };
}
