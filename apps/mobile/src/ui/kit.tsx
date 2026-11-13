// The building blocks every screen uses, in the website's language: a white page, a quiet top bar (back, the
// KanTV name or the setup progress), a plain headline, ink buttons, soft grey groups of rows, mint for what is
// selected or done. One file, so the look stays consistent: a change here reaches every screen.
import { router, useNavigation } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { CSS_EASE_OUT, stateTransition } from "../motion";
import { platform } from "../platform";
import { color, layout, radius, space, type } from "../theme";
import { Brand, LitTv, useAmbient } from "./ambient";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";

// A tick landing: grows from 60% with a fade, 220ms, once when it appears. A CSS animation rather than a layout
// animation, so it always ends fully visible even when many land at once.
const POP = { from: { opacity: 0, transform: [{ scale: 0.6 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };
const TICK = { animationName: POP, animationDuration: 220, animationTimingFunction: CSS_EASE_OUT, animationFillMode: "both" } as const;
const DOT = { ...TICK, animationDuration: 160 } as const;
// Something working: a soft pulse, steady with Reduce Motion.
const PULSE = { "0%": { opacity: 1 }, "50%": { opacity: 0.35 }, "100%": { opacity: 1 } };

/** True on a tablet or a desktop browser: the TV moves beside the column instead of stretching it. */
export function useWide() {
  return useWindowDimensions().width >= layout.wide;
}

/** A small pulsing dot: something is happening. */
export function Cursor({ tint = color.text, size = 14 }: { tint?: string; size?: number }) {
  const reduced = useReducedMotion();
  const d = Math.round(size * 0.7);
  return (
    <Animated.View
      accessibilityLabel="Working"
      style={[
        { width: d, height: d, borderRadius: d / 2, backgroundColor: tint },
        !reduced && ({ animationName: PULSE, animationDuration: 1200, animationIterationCount: "infinite", animationTimingFunction: "ease-in-out" } as object),
      ]}
    />
  );
}

/** The preview build's label: always there, so nobody mistakes the pretend TV for theirs. */
export function DemoBanner() {
  if (platform.mode !== "demo") return null;
  return (
    <View style={s.demo} accessibilityRole="text" accessibilityLabel="Preview mode: a simulated TV. Nothing here talks to a real TV.">
      <View style={s.demoDot} />
      <Text style={s.demoText}>Demo TV</Text>
    </View>
  );
}

/** "Step 2 of 5": a thin bar in five parts and the words, under the top bar. */
function Progress({ step }: { step: string }) {
  const m = step.match(/Step (\d+) of (\d+)/);
  if (!m) return null;
  const at = Number(m[1]);
  const of = Number(m[2]);
  return (
    <View style={s.progress} accessibilityRole="progressbar" accessibilityLabel={`Step ${at} of ${of}`} accessibilityValue={{ min: 0, max: of, now: at }}>
      <View style={s.segments}>
        {Array.from({ length: of }, (_, i) => (
          <Animated.View key={i} style={[s.segment, stateTransition, { transitionDuration: 300 }, i < at && { backgroundColor: color.text }]} />
        ))}
      </View>
      <Text style={s.stepText}>{`Step ${at} of ${of}`}</Text>
    </View>
  );
}

/** Wide screens: the TV picture beside the column, showing whichever design is lighting the app. */
function Stage({ children }: { children?: ReactNode }) {
  const spec = useAmbient();
  return (
    <View style={s.stage}>
      <Brand size={24} />
      <View style={s.stageTv}>
        {children ?? (
          <>
            <LitTv spec={spec} />
            <Text style={[type.small, { textAlign: "center", marginTop: space(5) }]}>
              On your TV: <Text style={{ color: color.text, fontFamily: type.heading.fontFamily }}>{spec.name}</Text>
            </Text>
          </>
        )}
      </View>
      <Text style={type.tiny}>Nothing is uninstalled. Restore puts it all back, free.</Text>
    </View>
  );
}

export function Screen({
  step,
  title,
  subtitle,
  children,
  footer,
  back = true,
  stage,
  hero,
}: {
  step?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
  /** What the wide-screen stage shows instead of the TV. */
  stage?: ReactNode;
  /** Something to show above the headline (the home screen's TV). */
  hero?: ReactNode;
  /** @deprecated the top bar decides on its own. */
  brand?: boolean;
}) {
  // From the navigator, not the imperative router, which isn't up yet when the app opens straight onto a screen.
  const canGoBack = useNavigation().canGoBack();
  const wide = useWide();
  const showBack = back && canGoBack;

  const main = (
    <View style={[s.main, wide && s.mainWide]}>
      <View style={s.topBar}>
        {showBack ? (
          <Press onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: color.surfacePressed }]}>
            <Icon name="back" size={20} />
          </Press>
        ) : !wide ? (
          <Brand />
        ) : null}
        <View style={{ flex: 1 }} />
        <DemoBanner />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {step ? <Progress step={step} /> : null}
        {hero}
        {title ? (
          <Text style={[step || hero ? type.display : type.display, { textWrap: "balance" } as object]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={[type.body, { color: color.muted, marginTop: space(3), maxWidth: 480 }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: title ? space(7) : 0, gap: space(4) }}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={s.footer}>
          <View style={s.footerInner}>{footer}</View>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      {wide ? (
        <View style={s.wide}>
          <Stage>{stage}</Stage>
          {main}
        </View>
      ) : (
        main
      )}
    </SafeAreaView>
  );
}

/** The ink button for the main action, an outlined one for the alternative, plain text for the rest. */
export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
  icon,
}: {
  label: string;
  onPress?: () => void;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
}) {
  const off = !!(disabled || busy);
  const ink = kind === "primary" ? (off && !busy ? color.faint : color.accentInk) : kind === "danger" ? color.danger : kind === "ghost" ? color.text : color.text;
  return (
    <Press
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        kind === "primary" && { backgroundColor: off && !busy ? color.surface : pressed ? color.accentPressed : color.accent },
        kind === "secondary" && { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.surface : color.bg },
        kind === "danger" && { backgroundColor: pressed ? "#F9D9D5" : color.dangerSoft },
        kind === "ghost" && { minHeight: 44, backgroundColor: pressed ? color.surface : "transparent" },
        off && kind !== "primary" && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {busy ? <Cursor tint={ink} size={14} /> : icon && kind !== "ghost" ? <Icon name={icon} tint={ink} size={18} /> : null}
      <Text style={[type.button, { color: ink }, kind === "ghost" && { textDecorationLine: "underline", textDecorationColor: color.lineStrong }]}>{label}</Text>
    </Press>
  );
}

/** A block of supporting information on the grey surface; a tone tints it and never stands alone. */
export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: "ok" | "warn" | "danger" | "accent" }) {
  const bg = tone === "ok" ? color.okSoft : tone === "danger" ? color.dangerSoft : tone === "warn" ? color.warnSoft : tone === "accent" ? color.mintSoft : color.surface;
  return <View style={[s.card, { backgroundColor: bg }, style]}>{children}</View>;
}

export function Status({ state, label, detail }: { state: "done" | "doing" | "todo" | "warn" | "fail"; label: string; detail?: string }) {
  const icon =
    state === "done" ? (
      <Animated.View style={[s.mark, { backgroundColor: color.mint }, TICK as object]}>
        <Icon name="check" tint={color.mintInk} size={13} />
      </Animated.View>
    ) : state === "doing" ? (
      <Cursor size={16} />
    ) : state === "warn" ? (
      <Icon name="alert" tint={color.warn} size={19} />
    ) : state === "fail" ? (
      <Icon name="alert" tint={color.danger} size={19} />
    ) : (
      <View style={[s.mark, { borderWidth: 1.5, borderColor: color.lineStrong }]} />
    );
  return (
    <View style={s.status}>
      <View style={s.statusIcon}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, state === "todo" && { color: color.faint }, state === "doing" && { fontFamily: type.heading.fontFamily }]}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function CheckRow({ checked, onToggle, title, detail, note }: { checked: boolean; onToggle: () => void; title: string; detail?: string; note?: string }) {
  return (
    <Press onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={title} style={({ pressed }) => [s.checkRow, pressed && { backgroundColor: color.surfacePressed }]}>
      <Animated.View style={[s.box, stateTransition, checked && { backgroundColor: color.text, borderColor: color.text }]}>
        {checked ? (
          <Animated.View style={DOT as object}>
            <Icon name="check" tint={color.accentInk} size={14} />
          </Animated.View>
        ) : null}
      </Animated.View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body}>{title}</Text>
        {note ? <Text style={type.small}>{note}</Text> : null}
        {detail ? <Text style={type.mono}>{detail}</Text> : null}
      </View>
    </Press>
  );
}

export function Choice({ selected, onPress, title, detail }: { selected: boolean; onPress: () => void; title: string; detail?: string }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={({ pressed }) => [s.choice, selected && s.choiceOn, pressed && { transform: [{ scale: 0.99 }] }]}
    >
      <Animated.View style={[s.radio, stateTransition, selected && { borderColor: color.text }]}>{selected ? <Animated.View style={[s.radioDot, DOT as object]} /> : null}</Animated.View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </Press>
  );
}

/** A named group of rows on the grey surface. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2) }}>
      <Text style={[type.label, { marginLeft: space(1) }]} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={[type.small, { marginLeft: space(1) }]}>{hint}</Text> : null}
      <View style={s.group}>{children}</View>
    </View>
  );
}

/** One row of a group: an icon, the name, what it does, and a chevron. */
export function Row({ icon, title, detail, onPress, last }: { icon?: IconName; title: string; detail?: string; onPress: () => void; last?: boolean; page?: number; tone?: string; tint?: string }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.surfacePressed }]}>
      {icon ? (
        <View style={s.rowIcon}>
          <Icon name={icon} tint={color.text} size={19} />
        </View>
      ) : null}
      <View style={[s.rowBody, !last && s.rowLine]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.heading}>{title}</Text>
          {detail ? <Text style={type.small}>{detail}</Text> : null}
        </View>
        <Icon name="chevron" tint={color.faint} size={17} />
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  wide: { flex: 1, flexDirection: "row", width: "100%", maxWidth: 1320, alignSelf: "center", gap: space(16), paddingHorizontal: space(12), paddingVertical: space(8) },
  main: { flex: 1 },
  mainWide: { maxWidth: 600 },

  stage: { flex: 1, maxWidth: layout.stage + 80, justifyContent: "space-between", paddingVertical: space(2) },
  stageTv: { flex: 1, justifyContent: "center" },

  topBar: { flexDirection: "row", alignItems: "center", gap: space(3), height: 60, paddingHorizontal: space(5), maxWidth: layout.column, width: "100%", alignSelf: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.line, marginLeft: -space(1) },

  demo: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: color.surface },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.ok },
  demoText: { ...type.tiny, color: color.muted },

  progress: { gap: space(2), marginBottom: space(6) },
  segments: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: color.line },
  stepText: { ...type.tiny, color: color.muted },

  content: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(12), maxWidth: layout.column, width: "100%", alignSelf: "center" },
  footer: { borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.chrome },
  footerInner: { paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(4), gap: space(1), maxWidth: layout.column, width: "100%", alignSelf: "center" },

  btn: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space(5), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },

  card: { borderRadius: radius.lg, padding: space(5), gap: space(2) },

  status: { flexDirection: "row", gap: space(3), alignItems: "flex-start", paddingVertical: space(2) },
  statusIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginTop: 1 },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  checkRow: { flexDirection: "row", gap: space(3), paddingVertical: space(4), paddingHorizontal: space(4), alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: color.line },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center", marginTop: 1, backgroundColor: color.bg },

  choice: { flexDirection: "row", gap: space(4), paddingVertical: space(4), paddingHorizontal: space(4), borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, backgroundColor: color.bg, alignItems: "center" },
  choiceOn: { borderColor: color.text, borderWidth: 1.5, backgroundColor: color.mintSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: color.bg },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.text },

  group: { backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingLeft: space(4) },
  rowIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: color.bg, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(4), paddingRight: space(4), minHeight: 68 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: color.line },
});
