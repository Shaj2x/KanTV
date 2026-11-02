// The theme spec: what the schema refuses, what the checks fix, that compiled configs are ones the upstream
// launcher accepts (checked by upstream's own tools/manage.py), and that the variety measure sees what a
// person would see.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  FONTS,
  PATTERNS,
  PHOTO_TAGS,
  TOO_SIMILAR,
  checkTheme,
  compileTheme,
  contrast,
  designPrint,
  similarity,
  MIN_TEXT_CONTRAST,
  type ThemeSpec,
} from "../src/index.ts";

const upstream = resolve(import.meta.dirname, "../../../../cleanyourtv");
const variant = (patch: (s: ThemeSpec) => void): ThemeSpec => {
  const s = structuredClone(DEFAULT_THEME);
  patch(s);
  return s;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random specs across every choice, for the compiler checks. */
function randomSpecs(n: number): ThemeSpec[] {
  const r = rng(7);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const colour = () => "#" + Math.floor(r() * 0xffffff).toString(16).padStart(6, "0").toUpperCase();
  return Array.from({ length: n }, () =>
    variant((s) => {
      s.palette = { background: colour(), surface: colour(), text: colour(), textMuted: colour(), accent: colour() };
      s.font = pick(FONTS);
      s.wallpaper = { kind: pick(["none", "gradient", "sky", "pattern", "photo"] as const), colors: [colour(), colour()], pattern: pick(PATTERNS), photoTag: pick(PHOTO_TAGS), dim: Math.floor(r() * 91) };
      s.layout = {
        style: pick(["classic", "cinematic", "single-row", "minimal"] as const),
        columns: 4 + Math.floor(r() * 5),
        dockSize: 4 + Math.floor(r() * 4),
        rowsBelowDock: Math.floor(r() * 4),
        dockStyle: pick(["band", "glass", "floating"] as const),
        focusStyle: pick(["glass", "rim", "halo"] as const),
        glow: pick(["radial", "horizon", "none"] as const),
        appNames: pick(["focused", "always"] as const),
        tiles: pick(["banner", "icon"] as const),
      };
      s.clock = { size: pick(["small", "medium", "large", "huge"] as const), position: pick(["top-left", "top-center", "top-right"] as const), format: pick(["12", "24", "system"] as const), showDate: r() < 0.5, showGreeting: r() < 0.5 };
      s.topBar = pick(["pills", "icons", "menu"] as const);
      s.motion = pick(["lively", "calm", "still"] as const);
      s.widgets = r() < 0.5 ? ["stats", "idle-clock"] : [];
      s.dockApps = ["com.netflix.ninja", "com.google.android.youtube.tv"];
    }),
  );
}

describe("the schema", () => {
  it("accepts the default and refuses anything that is not data", () => {
    expect(checkTheme(DEFAULT_THEME, null).ok).toBe(true);
    expect(checkTheme({ ...DEFAULT_THEME, script: "alert(1)" }, null).ok).toBe(false);
    expect(checkTheme(variant((s) => (s.palette.accent = "red")), null).errors[0]).toMatch(/palette.accent/);
    expect(checkTheme(variant((s) => ((s.layout as { columns: number }).columns = 12)), null).ok).toBe(false);
    expect(checkTheme(variant((s) => ((s as { font: string }).font = "Comic Sans")), null).ok).toBe(false);
  });
});

describe("the checks", () => {
  it("makes unreadable text readable", () => {
    const r = checkTheme(variant((s) => ((s.palette.background = "#101010"), (s.palette.text = "#202020"))), null);
    expect(r.ok).toBe(true);
    expect(contrast(r.spec!.palette.text, "#101010")).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(r.fixes).toHaveLength(1);
  });

  it("darkens a bright wallpaper rather than changing a good text colour", () => {
    const r = checkTheme(variant((s) => (s.wallpaper = { kind: "gradient", colors: ["#FFE7A0", "#FFB547"], pattern: null, photoTag: null, dim: 10 })), null);
    expect(r.spec!.wallpaper.dim).toBeGreaterThanOrEqual(45);
    expect(r.spec!.palette.text).toBe(DEFAULT_THEME.palette.text);
  });

  it("keeps only dock apps this TV has, each once, as many as the dock holds", () => {
    const installed = new Set(["com.netflix.ninja", "com.google.android.youtube.tv", "a.b.c", "d.e.f", "g.h.i", "j.k.l"]);
    const r = checkTheme(variant((s) => ((s.layout.dockSize = 4), (s.dockApps = ["com.netflix.ninja", "com.netflix.ninja", "com.made.up", "com.google.android.youtube.tv", "a.b.c", "d.e.f", "g.h.i"]))), installed);
    expect(r.spec!.dockApps).toEqual(["com.netflix.ninja", "com.google.android.youtube.tv", "a.b.c", "d.e.f"]);
    expect(r.fixes.join()).toMatch(/1 app this TV doesn't have/);
  });

  it("every checked random spec reads well", () => {
    for (const s of randomSpecs(300)) {
      const r = checkTheme(s, null);
      expect(r.ok).toBe(true);
      expect(contrast(r.spec!.palette.text, r.spec!.palette.background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(contrast(r.spec!.palette.accent, r.spec!.palette.background)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.skipIf(!existsSync(join(upstream, "tools/manage.py")))("compiled configs", () => {
  it("are accepted key by key by upstream's own tools/manage.py", () => {
    const configs = [DEFAULT_THEME, ...randomSpecs(200)].map((s) => compileTheme(checkTheme(s, null).spec!));
    const out = execFileSync("python3", [join(import.meta.dirname, "../../../testing/upstream_theme_check.py"), upstream], {
      input: JSON.stringify(configs),
      encoding: "utf8",
    });
    const errors = (JSON.parse(out) as string[][]).flat();
    expect([...new Set(errors)]).toEqual([]);
  });

  it("use only the values upstream documents for its style keys", () => {
    for (const s of randomSpecs(200)) {
      const c = compileTheme(checkTheme(s, null).spec!);
      expect(["glass", "rim", "halo"]).toContain(c.glass_style);
      if ("glow_style" in c) expect(["radial", "horizon"]).toContain(c.glow_style);
      expect(["12", "24", "system"]).toContain(c.clock_format);
    }
  });
});

describe("variety", () => {
  it("calls a recolour of the same accent the same look, and a new direction a different one", () => {
    const base = designPrint(DEFAULT_THEME);
    expect(similarity(base, base)).toBeCloseTo(1, 5);
    const nudged = designPrint(variant((s) => (s.palette.accent = "#FFB040")));
    expect(similarity(base, nudged)).toBeGreaterThan(TOO_SIMILAR);
    const other = designPrint(
      variant((s) => {
        s.palette = { background: "#0B1D3A", surface: "#13294F", text: "#F2F6FF", textMuted: "#A9B8D6", accent: "#5EE6D0" };
        s.font = "fraunces";
        s.layout.style = "cinematic";
        s.wallpaper = { kind: "pattern", colors: ["#0B1D3A", "#123B5E"], pattern: "waves", photoTag: null, dim: 20 };
      }),
    );
    expect(similarity(base, other)).toBeLessThan(0.5);
  });
});
