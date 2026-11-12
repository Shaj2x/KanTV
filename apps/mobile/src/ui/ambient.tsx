// Screen light: a TV in the app casts its picture's colour onto the page around it, like a real screen in a dark
// room. The colour follows the design the person is looking at, so a new design re-lights the whole app.
import type { ThemeSpec } from "@kantv/core";
import { useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { SAMPLES } from "../platform/demo/designs";
import { bars, color, defaultGlow, web } from "../theme";
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

/**
 * A TV on a stand, lit: the picture's light spills onto the wall behind it (bias light) and onto the floor.
 * This is the one bold element in the app; everything around it stays quiet.
 */
export function LitTv({ spec, children, style, intensity = 1 }: { spec?: ThemeSpec; children?: ReactNode; style?: ViewStyle; intensity?: number }) {
  const ambient = useAmbient();
  const shown = spec ?? ambient;
  const glow = glowOf(shown);
  return (
    <View style={[s.wrap, style]}>
      {/* Wall light: two soft layers, the picture's accent close in and its background colour further out. */}
      <View
        pointerEvents="none"
        style={[
          s.spill,
          web.glow,
          {
            boxShadow: `0 0 70px 24px ${rgba(glow, 0.34 * intensity)}, 0 20px 220px 90px ${rgba(glow, 0.14 * intensity)}`,
          } as ViewStyle,
        ]}
      />
      <View style={s.bezel}>{children ?? <ThemePreview spec={shown} />}</View>
      <View style={s.stand} />
      {/* Floor light: a faint pool under the stand. */}
      <View pointerEvents="none" style={[s.floor, { boxShadow: `0 0 40px 14px ${rgba(glow, 0.22 * intensity)}` } as ViewStyle]} />
    </View>
  );
}

/** The KanTV mark: a screen showing test-card bars. */
export function BrandMark({ size = 30 }: { size?: number }) {
  const h = size * 0.74;
  return (
    <View style={{ width: size, height: h, borderRadius: size * 0.2, overflow: "hidden", flexDirection: "row", borderWidth: 2, borderColor: color.text }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
      <Text style={[s.brandName, { fontSize: size * 0.64 }]}>KanTV</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },
  spill: { position: "absolute", left: "8%", right: "8%", top: "10%", bottom: "22%", borderRadius: 999 },
  bezel: { width: "100%", borderRadius: 12, backgroundColor: color.tvBezel },
  stand: { width: "22%", height: 6, backgroundColor: color.tvBezel, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  floor: { width: "40%", height: 2, borderRadius: 2, marginTop: 4, opacity: 0.9 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontFamily: "Unbounded_600SemiBold", color: color.text, letterSpacing: -0.4 },
});
