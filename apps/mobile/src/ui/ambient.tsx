// The TV picture and the brand mark. A TV in the app stands in a small dark room lit by its picture's colour; the
// colour follows the design the person is looking at, so a new design re-lights it.
import type { ThemeSpec } from "@kantv/core";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import { EASE_OUT, duration } from "../motion";
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

// The light changing colour: the old light fades out while the new one fades in, so the room never goes dark.
const LIGHT_IN = FadeIn.duration(duration.light).easing(EASE_OUT);
const LIGHT_OUT = FadeOut.duration(duration.light).easing(EASE_OUT);
// A new picture on the same TV: a quick crossfade, no movement.
const PICTURE_IN = FadeIn.duration(duration.enter).easing(EASE_OUT);

// The TV switching on, once per app launch: the picture opens from a bright line across the middle of the
// screen, the way a set warms up, and only then does its light reach the wall. The one orchestrated moment in
// the app; with Reduce Motion it is a plain fade.
const POWER_ON = new Keyframe({
  0: { opacity: 0, transform: [{ scaleX: 0.5 }, { scaleY: 0.012 }] },
  35: { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 0.012 }], easing: EASE_OUT },
  100: { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 1 }], easing: EASE_OUT },
}).duration(460);
const POWER_ON_REDUCED = FadeIn.duration(duration.enter);
const LIGHT_AFTER_POWER = FadeIn.duration(duration.light).delay(320).easing(EASE_OUT);
let poweredOn = false;

/**
 * The TV picture on its stage: a dark room inside a rounded frame, lit by the picture's own colour, as on the
 * website's first screen. The one dark, colourful thing on a white screen.
 */
export function LitTv({ spec, children, style, intensity = 1 }: { spec?: ThemeSpec; children?: ReactNode; style?: ViewStyle; intensity?: number }) {
  const ambient = useAmbient();
  const shown = spec ?? ambient;
  const glow = glowOf(shown);
  const reduced = useReducedMotion();
  // Only the first TV the app draws powers on; every later one is simply there.
  const first = useRef(!poweredOn);
  poweredOn = true;
  const lightKey = `${glow}-${intensity}`;
  return (
    <View style={[s.stage, style]}>
      {/* The picture's light on the room behind it. Keyed by colour, so a new design crossfades the light. */}
      <Animated.View
        key={lightKey}
        entering={first.current ? LIGHT_AFTER_POWER : LIGHT_IN}
        exiting={LIGHT_OUT}
        pointerEvents="none"
        style={[s.spill, { boxShadow: `0 0 80px 40px ${rgba(glow, 0.42 * intensity)}, 0 0 220px 120px ${rgba(glow, 0.16 * intensity)}` } as ViewStyle]}
      />
      <View style={s.tv}>
        <View style={s.bezel}>
          <Animated.View entering={first.current ? (reduced ? POWER_ON_REDUCED : POWER_ON) : undefined}>
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

export function Brand({ size = 22 }: { size?: number }) {
  return (
    <View style={s.brand} accessibilityRole="header" accessibilityLabel="KanTV">
      <BrandMark size={size} />
      <Text style={[s.brandName, { fontSize: size * 0.86 }]}>KanTV</Text>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { width: "100%", borderRadius: 22, overflow: "hidden", backgroundColor: "#0D0D0D", paddingHorizontal: "7%", paddingTop: "7%", paddingBottom: "5%", alignItems: "center" },
  spill: { position: "absolute", left: "25%", right: "25%", top: "25%", bottom: "35%", borderRadius: 999 },
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
