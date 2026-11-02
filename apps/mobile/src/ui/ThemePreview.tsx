// A theme spec drawn as the TV's home screen, small: wallpaper, clock, top bar, focus glow, dock and grid. The
// phone and the web studio both use it, so what the person approves is what the launcher shows (fonts are
// close stand-ins until the bundled typefaces load).
import type { ThemeSpec } from "@kantv/core";
import { useId, useState, type ReactNode } from "react";
import { Platform, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Ellipse, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

const BRANDS: Record<string, [string, string, string]> = {
  "com.netflix.ninja": ["Netflix", "#E50914", "N"],
  "com.google.android.youtube.tv": ["YouTube", "#FF0000", "▶"],
  "com.disney.disneyplus": ["Disney+", "#0E2C9A", "D+"],
  "com.amazon.amazonvideo.livingroom": ["Prime Video", "#00A8E1", "p"],
  "com.spotify.tv.android": ["Spotify", "#1DB954", "S"],
  "com.plexapp.android": ["Plex", "#1F1F1F", "›"],
  "com.apple.atve.androidtv.appletv": ["Apple TV", "#111111", "tv"],
};
const FILLER: [string, string, string][] = [
  ["Prime Video", "#00A8E1", "p"],
  ["Spotify", "#1DB954", "S"],
  ["Disney+", "#0E2C9A", "D+"],
  ["Plex", "#1F1F1F", "›"],
  ["Twitch", "#9146FF", "t"],
  ["Live TV", "#3A3F4B", "◉"],
  ["Photos", "#E8A33D", "✿"],
  ["Music", "#E94B6A", "♪"],
];

const SERIF = Platform.select({ web: "Georgia, 'Times New Roman', serif", default: "serif" });
const MONO = Platform.select({ web: "ui-monospace, Menlo, monospace", default: "monospace" });
const SANS = Platform.select({ web: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif", default: undefined });
const NARROW = Platform.select({ web: "'Arial Narrow', Impact, sans-serif", default: undefined });
export function fontFor(font: ThemeSpec["font"]) {
  if (font === "fraunces" || font === "playfair-display" || font === "dm-serif-display") return SERIF;
  if (font === "jetbrains-mono") return MONO;
  if (font === "bebas-neue") return NARROW;
  return SANS;
}

function Pattern({ spec, w, h }: { spec: ThemeSpec; w: number; h: number }) {
  const wp = spec.wallpaper;
  const ink = wp.colors[wp.colors.length - 1]!;
  const out: ReactNode[] = [];
  const step = w / 24;
  if (wp.kind !== "pattern") return null;
  if (wp.pattern === "dots" || wp.pattern === "grain")
    for (let x = step / 2; x < w; x += wp.pattern === "grain" ? step / 2 : step)
      for (let y = step / 2; y < h; y += wp.pattern === "grain" ? step / 2 : step)
        out.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={wp.pattern === "grain" ? 0.6 : 1.4} fill={ink} opacity={0.7} />);
  if (wp.pattern === "grid") {
    for (let x = 0; x < w; x += step * 2) out.push(<Line key={`x${x}`} x1={x} y1={0} x2={x} y2={h} stroke={ink} strokeWidth={0.6} />);
    for (let y = 0; y < h; y += step * 2) out.push(<Line key={`y${y}`} x1={0} y1={y} x2={w} y2={y} stroke={ink} strokeWidth={0.6} />);
  }
  if (wp.pattern === "stripes") for (let x = -h; x < w; x += step * 1.5) out.push(<Line key={x} x1={x} y1={h} x2={x + h} y2={0} stroke={ink} strokeWidth={step * 0.4} opacity={0.6} />);
  if (wp.pattern === "waves")
    for (let y = h * 0.15; y < h * 1.1; y += step * 1.4) {
      let d = `M 0 ${y}`;
      for (let x = 0; x <= w; x += step) d += ` Q ${x + step / 2} ${y + (Math.round(x / step) % 2 ? -step / 2 : step / 2)} ${x + step} ${y}`;
      out.push(<Path key={y} d={d} stroke={ink} strokeWidth={1} fill="none" opacity={0.8} />);
    }
  if (wp.pattern === "topography") for (let i = 1; i < 9; i++) out.push(<Ellipse key={i} cx={w * 0.72} cy={h * 0.35} rx={i * step * 1.6} ry={i * step} stroke={ink} strokeWidth={0.8} fill="none" />);
  if (wp.pattern === "stars")
    for (let i = 0; i < 70; i++) {
      const x = ((i * 9301 + 49297) % 233280) / 233280;
      const y = ((i * 4567 + 1237) % 7919) / 7919;
      out.push(<Circle key={i} cx={x * w} cy={y * h * 0.7} r={i % 7 === 0 ? 1.3 : 0.6} fill="#FFFFFF" opacity={0.75} />);
    }
  if (wp.pattern === "bokeh") for (let i = 0; i < 9; i++) out.push(<Circle key={i} cx={((i * 37) % 100) / 100 * w} cy={((i * 53) % 70) / 100 * h} r={step * (1 + (i % 3))} fill={ink} opacity={0.35} />);
  return <>{out}</>;
}

function Tile({ app, u, spec, focused, showName, wide }: { app: [string, string, string]; u: number; spec: ThemeSpec; focused: boolean; showName: boolean; wide: number }) {
  const [name, colour, mark] = app;
  const icon = spec.layout.tiles === "icon";
  const focus =
    focused && spec.layout.focusStyle === "glass"
      ? { borderWidth: u * 0.25, borderColor: "rgba(255,255,255,0.85)" }
      : focused && spec.layout.focusStyle === "rim"
        ? { borderWidth: u * 0.25, borderColor: spec.palette.text }
        : focused
          ? { borderWidth: u * 0.25, borderColor: spec.palette.accent, shadowColor: spec.palette.accent, shadowOpacity: 0.9, shadowRadius: u * 2 }
          : {};
  return (
    <View style={{ width: wide, alignItems: "center", transform: [{ scale: focused ? 1.08 : 1 }] }}>
      <View
        style={{
          width: wide,
          aspectRatio: 16 / 9,
          borderRadius: u * 1.2,
          backgroundColor: icon ? spec.palette.surface : colour,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          ...focus,
        }}
      >
        <Text style={{ color: icon ? colour : "#FFFFFF", fontSize: u * 3, fontWeight: "800" }}>{mark}</Text>
      </View>
      {showName ? (
        <Text numberOfLines={1} style={{ color: focused ? spec.palette.text : spec.palette.textMuted, fontSize: u * 1.5, marginTop: u * 0.7, fontFamily: fontFor(spec.font) }}>
          {name}
        </Text>
      ) : null}
    </View>
  );
}

export function ThemePreview({ spec }: { spec: ThemeSpec }) {
  const [w, setW] = useState(0);
  // SVG ids are page-wide on the web: each preview needs its own, or a second preview borrows the first's colours.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const id = (name: string) => `${name}-${uid}`;
  const h = (w * 9) / 16;
  const u = w / 100;
  const p = spec.palette;
  const l = spec.layout;
  const wp = spec.wallpaper;
  const apps = [...spec.dockApps.map((pk) => BRANDS[pk] ?? ([pk.split(".").pop()!, "#3A3F4B", pk.split(".").pop()![0]!.toUpperCase()] as [string, string, string])), ...FILLER];
  const dock = apps.slice(0, l.dockSize);
  const rest = apps.slice(l.dockSize);
  const cols = l.style === "single-row" ? Math.min(apps.length, 7) : l.columns;
  const tileW = (u * 86 - (cols - 1) * u * 1.6) / cols;
  const clockSize = { small: 6, medium: 8, large: 10.5, huge: 14 }[spec.clock.size] * u;
  const align = { "top-left": "flex-start", "top-center": "center", "top-right": "flex-end" }[spec.clock.position] as "flex-start";
  const font = fontFor(spec.font);
  const glowY = l.style === "cinematic" ? 0.18 : 0.72;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Preview of ${spec.name}: ${spec.summary}`}
      style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 10, overflow: "hidden", backgroundColor: p.background, borderWidth: 5, borderColor: "#050506" }}
    >
      {w > 0 ? (
        <>
          <Svg width={w} height={h} style={{ position: "absolute" }}>
            <Defs>
              <LinearGradient id={id("wp")} x1="0" y1="0" x2="1" y2="1">
                {(wp.kind === "sky" ? ["#0B1530", "#14254A", p.background] : wp.kind === "none" ? [p.background, p.background] : wp.colors).map((c, i, a) => (
                  <Stop key={i} offset={i / (a.length - 1)} stopColor={c} />
                ))}
              </LinearGradient>
              <RadialGradient id={id("glow")} cx="50%" cy={`${glowY * 100}%`} rx="45%" ry="40%">
                <Stop offset="0" stopColor={p.accent} stopOpacity={0.38} />
                <Stop offset="1" stopColor={p.accent} stopOpacity={0} />
              </RadialGradient>
              <LinearGradient id={id("horizon")} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={p.accent} stopOpacity={0.35} />
                <Stop offset="0.6" stopColor={p.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={h} fill={`url(#${id("wp")})`} />
            <Pattern spec={spec} w={w} h={h} />
            {l.style === "cinematic" ? <Rect x={0} y={0} width={w} height={h * 0.52} fill={apps[0]![1]} opacity={0.35} /> : null}
            {wp.dim ? <Rect x={0} y={0} width={w} height={h} fill="#000000" opacity={wp.dim / 100} /> : null}
            {l.glow === "radial" && l.style !== "minimal" ? <Rect x={0} y={0} width={w} height={h} fill={`url(#${id("glow")})`} /> : null}
            {l.glow === "horizon" && l.style !== "minimal" ? <Rect x={0} y={0} width={w} height={h} fill={`url(#${id("horizon")})`} /> : null}
          </Svg>

          {/* Clock, date, greeting; buttons on the right */}
          <View style={{ position: "absolute", top: u * 3.5, left: u * 5, right: u * 5, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, alignItems: align }}>
              {spec.clock.showGreeting ? <Text style={{ color: p.textMuted, fontSize: u * 1.6, letterSpacing: u * 0.2, fontFamily: font }}>GOOD EVENING</Text> : null}
              <Text style={{ color: p.text, fontSize: clockSize, lineHeight: clockSize * 1.05, fontWeight: "300", fontFamily: font, letterSpacing: -u * 0.2 }}>
                {spec.clock.format === "24" ? "21:41" : "9:41"}
              </Text>
              {spec.clock.showDate ? <Text style={{ color: p.textMuted, fontSize: u * 1.8, fontFamily: font }}>Monday, 2 November</Text> : null}
              {spec.widgets.includes("stats") ? <Text style={{ color: p.textMuted, fontSize: u * 1.3, marginTop: u * 0.5 }}>CPU 12% · 640 MB free</Text> : null}
            </View>
            {spec.clock.position !== "top-right" ? (
              <View style={{ flexDirection: "row", gap: u * 1 }}>
                {(spec.topBar === "menu" ? ["⚙"] : spec.topBar === "icons" ? ["⇄", "◠", "⚙"] : ["Inputs", "Wi-Fi", "⚙"]).map((b) => (
                  <View key={b} style={{ backgroundColor: p.surface, borderRadius: 99, paddingHorizontal: b.length > 1 ? u * 1.6 : u * 1, height: u * 3.6, minWidth: u * 3.6, alignItems: "center", justifyContent: "center", opacity: 0.92 }}>
                    <Text style={{ color: p.text, fontSize: u * 1.5 }}>{b}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* The focused app's name, then the dock, then the grid */}
          <View style={{ position: "absolute", left: u * 5, right: u * 5, bottom: l.rowsBelowDock && l.style !== "single-row" ? u * 1 : u * 6 }}>
            {l.style !== "minimal" ? (
              <Text style={{ color: p.text, fontSize: u * (l.style === "cinematic" ? 5.5 : 4), fontWeight: "600", fontFamily: font, marginBottom: u * 2 }}>{dock[0]![0]}</Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                gap: u * 1.6,
                padding: l.dockStyle === "floating" ? 0 : u * 1.6,
                borderRadius: u * 2.4,
                backgroundColor: l.dockStyle === "band" ? p.surface : l.dockStyle === "glass" ? "rgba(255,255,255,0.09)" : "transparent",
                borderWidth: l.dockStyle === "glass" ? 1 : 0,
                borderColor: "rgba(255,255,255,0.18)",
                marginLeft: l.dockStyle === "floating" ? 0 : -u * 1.6,
                marginRight: l.dockStyle === "floating" ? 0 : -u * 1.6,
              }}
            >
              {(l.style === "single-row" ? apps.slice(0, cols) : dock).map((a, i) => (
                <Tile key={i} app={a} u={u} spec={spec} focused={i === 0} showName={l.appNames === "always" || i === 0} wide={l.style === "single-row" ? tileW : (u * 86 - (l.dockSize - 1) * u * 1.6) / l.dockSize} />
              ))}
            </View>
            {l.style !== "single-row" && l.rowsBelowDock > 0 ? (
              <View style={{ flexDirection: "row", gap: u * 1.6, marginTop: u * 2.4, opacity: 0.85 }}>
                {rest.slice(0, cols).map((a, i) => (
                  <Tile key={i} app={a} u={u} spec={spec} focused={false} showName={l.appNames === "always"} wide={tileW} />
                ))}
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}
