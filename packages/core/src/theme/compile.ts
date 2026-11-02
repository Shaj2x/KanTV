// A checked spec to the launcher's config.json. Every key that the upstream launcher already has uses its
// upstream name and range (themes/README.md in cleanyourtv; the test checks each against that table). What
// upstream cannot show yet (text and accent colours, fonts, clock size and position) goes in kantv_* keys that
// the KanTV launcher fork reads; an upstream launcher ignores them, as it ignores any key it does not know.
import type { ThemeSpec } from "./spec.ts";

export type LauncherConfig = Record<string, string | number | boolean | string[]>;

/** The keys only the KanTV launcher fork reads. */
export const KANTV_KEYS = ["kantv_text_color", "kantv_text_muted_color", "kantv_surface_color", "kantv_accent_color", "kantv_font", "kantv_clock_size", "kantv_clock_position", "kantv_wallpaper_recipe"] as const;

export function compileTheme(spec: ThemeSpec): LauncherConfig {
  const l = spec.layout;
  const w = spec.wallpaper;
  const c: LauncherConfig = {
    background_color: spec.palette.background.toUpperCase(),
    columns: l.columns,
    rows_below_dock: l.rowsBelowDock,
    dock_apps: spec.dockApps,
    fill_dock: true,
    // Layout style
    cinematic_home: l.style === "cinematic",
    single_row: l.style === "single-row",
    dock_row: true,
    dock_title: l.style !== "minimal",
    // Dock
    dock_band: l.dockStyle !== "floating",
    dock_glass: l.dockStyle === "glass",
    // Focus and glow
    glass_style: l.focusStyle,
    ambient_glow: l.glow !== "none" && l.style !== "minimal",
    app_glow: l.glow !== "none",
    always_show_names: l.appNames === "always",
    uniform_tiles: l.tiles === "icon",
    // Clock
    clock_format: spec.clock.format,
    show_greeting: spec.clock.showGreeting,
    header_white: true,
    // Top bar
    icon_only_buttons: spec.topBar === "icons",
    top_menu: spec.topBar === "menu",
    // Motion
    animations: spec.motion !== "still",
    reduced_motion: spec.motion === "still",
    focus_overshoot: spec.motion === "lively",
    advanced_effects: spec.motion === "lively",
    // Widgets
    show_stats: spec.widgets.includes("stats"),
    home_idle_clock_minutes: spec.widgets.includes("idle-clock") ? 10 : 0,
    // Wallpaper: the image itself is rendered on the phone from the recipe and pushed as wallpaper.jpg.
    wallpaper: w.kind === "gradient" || w.kind === "pattern" || w.kind === "photo",
    sky_intensity: w.kind === "sky" ? 60 : 0,
    wallpaper_dim: w.dim,
    // KanTV launcher extensions
    kantv_text_color: spec.palette.text.toUpperCase(),
    kantv_text_muted_color: spec.palette.textMuted.toUpperCase(),
    kantv_surface_color: spec.palette.surface.toUpperCase(),
    kantv_accent_color: spec.palette.accent.toUpperCase(),
    kantv_font: spec.font,
    kantv_clock_size: spec.clock.size,
    kantv_clock_position: spec.clock.position,
    kantv_wallpaper_recipe: [w.kind, ...w.colors.map((x) => x.toUpperCase()), w.pattern ?? w.photoTag ?? ""],
  };
  if (l.glow !== "none") c.glow_style = l.glow;
  return c;
}
