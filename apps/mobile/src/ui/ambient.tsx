// The TV picture and the brand mark. A TV in the app stands in a small dark room lit by its picture's colour; the
// colour follows the design the person is looking at, so a new design re-lights it.
import { DEFAULT_THEME, wallpaperSvg, type ThemeSpec } from "@kantv/core";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import Animated, { FadeIn, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import { CSS_EASE_OUT, EASE_OUT, duration } from "../motion";
import { SAMPLES } from "../platform/demo/designs";
import { color, defaultGlow } from "../theme";
import { ThemePreview } from "./ThemePreview";

let current: ThemeSpec = SAMPLES[0]!;
const listeners = new Set<() => void>();

/** The design lighting the app: the last one the person saw or put on their TV. */
export function setAmbient(spec: ThemeSpec) {
  if (spec === current) return;
  current = spec;
  listeners.forEach((l) => l());
}

export function useAmbient(): ThemeSpec {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => current,
  );
}

export function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(255,154,77,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** The light a design throws: its accent, unless that's too dark to glow. */
export function glowOf(spec?: ThemeSpec) {
  return spec?.palette.accent ?? defaultGlow;
}

/** The design colour's hue at a given saturation and lightness (0-1): deep, rich grounds from a pale glow. */
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

/** Flowing silk in a design's colour, from the same generator as the TV's silk wallpaper. */
export function silkXml(glow: string, w: number, h: number, id: string) {
  const spec: ThemeSpec = {
    ...DEFAULT_THEME,
    wallpaper: { kind: "pattern", colors: [shade(glow, 0.7, 0.03), shade(glow, 0.8, 0.21), shade(glow, 0.7, 0.35), glow], pattern: "silk", photoTag: null, dim: 0 },
  };
  return wallpaperSvg(spec, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), id);
}

// The light changing colour: the old light fades out while the new one fades in, so the room never goes dark.
const LIGHT_IN = FadeIn.duration(duration.light).easing(EASE_OUT);
const LIGHT_OUT = FadeOut.duration(duration.light).easing(EASE_OUT);
// A new picture on the same TV: a quick crossfade, no movement.
const PICTURE_IN = FadeIn.duration(duration.enter).easing(EASE_OUT);

// The TV switching on, once per app launch: the picture opens from a bright line across the middle of the
// screen, the way a set warms up, and only then does its light reach the wall. The one orchestrated moment in
// the app; with Reduce Motion it is a plain fade.
// A CSS animation, not a layout animation: whatever the browser does, it always ends on the whole picture.
const POWER_ON = {
  animationName: {
    "0%": { opacity: 0, transform: [{ scaleX: 0.5 }, { scaleY: 0.012 }] },
    "35%": { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 0.012 }] },
    "100%": { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  },
  animationDuration: 460,
  animationTimingFunction: CSS_EASE_OUT,
  animationFillMode: "both",
} as object;
const POWER_ON_REDUCED = { animationName: { from: { opacity: 0 }, to: { opacity: 1 } }, animationDuration: duration.enter, animationFillMode: "both" } as object;
const LIGHT_AFTER_POWER = FadeIn.duration(duration.light).delay(320).easing(EASE_OUT);
let poweredOn = false;

/**
 * The TV picture on its stage: a dark room inside a rounded frame, lit by the picture's own colour, as on the
 * website's first screen. The one dark, colourful thing on a white screen.
 */
export function LitTv({ spec, children, style, bare }: { spec?: ThemeSpec; children?: ReactNode; style?: ViewStyle; intensity?: number; bare?: boolean }) {
  const ambient = useAmbient();
  const shown = spec ?? ambient;
  const glow = glowOf(shown);
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Only the first TV the app draws powers on; every later one is simply there.
  const first = useRef(!poweredOn);
  poweredOn = true;
  const backdrop = useMemo(() => (size.w && !bare ? silkXml(glow, size.w, size.h, `silk${Math.round(size.w)}`) : ""), [glow, size.w, size.h, bare]);
  return (
    <View style={[s.stage, bare && s.bare, style]} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* Flowing silk in the picture's colour behind the TV. Keyed by colour, so a new design crossfades it. */}
      {backdrop ? (
        <Animated.View key={glow} entering={first.current ? LIGHT_AFTER_POWER : LIGHT_IN} exiting={LIGHT_OUT} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SvgXml xml={backdrop} width={size.w} height={size.h} />
        </Animated.View>
      ) : null}
      <View style={s.tv}>
        <View style={s.bezel}>
          <Animated.View style={first.current ? (reduced ? POWER_ON_REDUCED : POWER_ON) : undefined}>
            {children ?? (
              <Animated.View key={shown.name} entering={first.current ? undefined : PICTURE_IN}>
                <ThemePreview spec={shown} />
              </Animated.View>
            )}
          </Animated.View>
        </View>
        <View style={s.stand} />
      </View>
    </View>
  );
}

/** Silk filling its parent, in a design's colour: the page behind the app on wide screens. */
export function SilkBackdrop({ glow }: { glow: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const xml = useMemo(() => (size.w ? silkXml(glow, size.w, size.h, "pagesilk") : ""), [glow, size.w, size.h]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: shade(glow, 0.7, 0.05) }]} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {xml ? (
        <Animated.View key={glow} entering={LIGHT_IN} exiting={LIGHT_OUT} style={StyleSheet.absoluteFill}>
          <SvgXml xml={xml} width={size.w} height={size.h} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The KanTV mark, as on the website: three bars of falling length. */
export function BrandMark({ size = 22 }: { size?: number }) {
  const h = size * 0.23;
  return (
    <View style={{ width: size, gap: size * 0.06 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 0.7, 0.4].map((w) => (
        <View key={w} style={{ width: size * w, height: h, borderRadius: h / 2, backgroundColor: color.mint }} />
      ))}
    </View>
  );
}

export function Brand({ size = 22, light }: { size?: number; light?: boolean }) {
  return (
    <View style={s.brand} accessibilityRole="header" accessibilityLabel="KanTV">
      <BrandMark size={size} />
      <Text style={[s.brandName, { fontSize: size * 0.86 }, light && { color: "#FFFFFF" }]}>KanTV</Text>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { width: "100%", borderRadius: 22, overflow: "hidden", backgroundColor: "#04060C", paddingHorizontal: "9%", paddingTop: "9%", paddingBottom: "7%", alignItems: "center" },
  bare: { backgroundColor: "transparent", borderRadius: 0, padding: 0, overflow: "visible" },
  tv: { width: "100%", alignItems: "center" },
  bezel: { width: "100%", borderRadius: 10, backgroundColor: color.tvBezel, boxShadow: "0 18px 40px -12px rgba(0,0,0,0.7)" } as ViewStyle,
  stand: { width: "24%", height: 5, backgroundColor: "#1A1A1A", borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandName: { fontFamily: "FamiljenGrotesk_500Medium", color: color.text, letterSpacing: -0.3 },
});

// Finishing setup: the KanTV mark's three bars slide in one after another, 60ms apart. A rare, earned moment;
// with Reduce Motion the mark is simply there.
const BAR_IN = (i: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateX: -16 }] },
    100: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE_OUT },
  })
    .delay(120 + i * 60)
    .duration(280);
const BARS_IN = [0, 1, 2].map(BAR_IN);

export function Celebrate({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  const h = size * 0.23;
  return (
    <View style={{ width: size, gap: size * 0.07 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 0.7, 0.4].map((w, i) => (
        <Animated.View key={w} entering={reduced ? undefined : BARS_IN[i]} style={{ width: size * w, height: h, borderRadius: h / 2, backgroundColor: color.ok }} />
      ))}
    </View>
  );
}

// Waiting for a design: a soft band of light rolls down the dark screen, like a set tuning in. Constant motion,
// so linear; it runs only while the person is waiting on the result. Off with Reduce Motion.
const SWEEP = { from: { transform: [{ translateY: "-100%" }] }, to: { transform: [{ translateY: "340%" }] } };

export function Tuning({ glow }: { glow: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: "30%",
        experimental_backgroundImage: `linear-gradient(180deg, transparent, ${rgba(glow, 0.16)}, transparent)`,
        animationName: SWEEP,
        animationDuration: 1800,
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
      } as object}
    />
  );
}
