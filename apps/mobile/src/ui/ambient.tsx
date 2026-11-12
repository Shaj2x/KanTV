// Screen light: a TV in the app casts its picture's colour onto the page around it, like a real screen in a dark
// room. The colour follows the design the person is looking at, so a new design re-lights the whole app.
import type { ThemeSpec } from "@kantv/core";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import { EASE_OUT, duration } from "../motion";
import { SAMPLES } from "../platform/demo/designs";
import { bars, color, defaultGlow } from "../theme";
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
 * A TV on a stand, lit: the picture's light spills onto the wall behind it (bias light) and onto the floor.
 * This is the one bold element in the app; everything around it stays quiet.
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
    <View style={[s.wrap, style]}>
      {/* Wall light: the picture's accent close in, and a wide faint wash further out. Keyed by colour, so a new
          design crossfades the light instead of switching it. */}
      <Animated.View
        key={lightKey}
        entering={first.current ? LIGHT_AFTER_POWER : LIGHT_IN}
        exiting={LIGHT_OUT}
        pointerEvents="none"
        style={[s.spill, { boxShadow: `0 0 70px 24px ${rgba(glow, 0.34 * intensity)}, 0 20px 220px 90px ${rgba(glow, 0.14 * intensity)}` } as ViewStyle]}
      />
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
      {/* Floor light: a faint pool under the stand. */}
      <Animated.View key={`f-${lightKey}`} entering={first.current ? LIGHT_AFTER_POWER : LIGHT_IN} exiting={LIGHT_OUT} pointerEvents="none" style={[s.floor, { boxShadow: `0 0 40px 14px ${rgba(glow, 0.22 * intensity)}` } as ViewStyle]} />
    </View>
  );
}

/** The KanTV mark: a screen showing test-card bars. */
export function BrandMark({ size = 30 }: { size?: number }) {
  const h = size * 0.74;
  return (
    <View style={{ width: size, height: h, borderRadius: 2, overflow: "hidden", flexDirection: "row" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((b) => (
        <View key={b} style={{ flex: 1, backgroundColor: b }} />
      ))}
    </View>
  );
}

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <View style={s.brand} accessibilityRole="header" accessibilityLabel="KanTV">
      <BrandMark size={size} />
      <Text style={[s.brandName, { fontSize: size * 0.95 }]}>KanTV</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", paddingBottom: 6 },
  spill: { position: "absolute", left: "8%", right: "8%", top: "10%", bottom: "22%", borderRadius: 999 },
  bezel: { width: "100%", borderRadius: 12, backgroundColor: color.tvBezel },
  stand: { width: "22%", height: 6, backgroundColor: color.tvBezel, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  floor: { position: "absolute", bottom: 0, left: "30%", right: "30%", height: 2, borderRadius: 2 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontFamily: "VT323_400Regular", color: color.text },
});

// Finishing setup: the test-card bars rise one after another, 40ms apart. A rare, earned moment; with Reduce
// Motion the bars are simply there.
const BAR_RISE = (i: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 10 }, { scaleY: 0.3 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scaleY: 1 }], easing: EASE_OUT },
  })
    .delay(120 + i * 40)
    .duration(260);
const RISES = bars.map((_, i) => BAR_RISE(i));

export function Celebrate({ height = 64 }: { height?: number }) {
  const reduced = useReducedMotion();
  return (
    <View style={{ flexDirection: "row", gap: 3, height, maxWidth: 220 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((b, i) => (
        <Animated.View key={b} entering={reduced ? undefined : RISES[i]} style={{ flex: 1, borderRadius: 3, backgroundColor: b, transformOrigin: "bottom" }} />
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
