// The building blocks every screen uses: the screen frame (top bar with progress, the preview label, the sticky
// action area, and on wide screens the lit TV beside the column), buttons, notes, rows. One file, so the look
// stays consistent: a change here reaches every screen.
import { router, useNavigation } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { platform } from "../platform";
import { bars, color, layout, radius, space, type, web } from "../theme";
import { Brand, LitTv, useAmbient } from "./ambient";
import { Icon, type IconName } from "./Icon";

/** True on a tablet or a desktop browser: the TV moves beside the column instead of stretching it. */
export function useWide() {
  return useWindowDimensions().width >= layout.wide;
}

/** The preview build's label: small and always there, so nobody mistakes the pretend TV for theirs. */
export function DemoBanner() {
  if (platform.mode !== "demo") return null;
  return (
    <View style={s.demo} accessibilityRole="text" accessibilityLabel="Preview mode: a simulated TV. Nothing here talks to a real TV.">
      <Text style={s.demoText}>Simulated TV</Text>
    </View>
  );
}

/** "Step 2 of 5" as test-card bars: each finished step lights its colour, the current one is white. */
function Progress({ step }: { step: string }) {
  const m = step.match(/Step (\d+) of (\d+)/);
  if (!m) return <Text style={s.stepText}>{step}</Text>;
  const at = Number(m[1]);
  const of = Number(m[2]);
  return (
    <View style={s.progress} accessibilityRole="progressbar" accessibilityLabel={`Step ${at} of ${of}`} accessibilityValue={{ min: 0, max: of, now: at }}>
      <View style={s.segments}>
        {Array.from({ length: of }, (_, i) => (
          <View key={i} style={[s.segment, web.press, i < at - 1 && { backgroundColor: bars[(i + 1) % bars.length] }, i === at - 1 && { backgroundColor: color.text, flex: 1.6 }]} />
        ))}
      </View>
      <Text style={s.stepText}>{`Step ${at} of ${of}`}</Text>
    </View>
  );
}

/** Wide screens: the brand and the lit TV, showing whichever design is lighting the app. */
function Stage({ children }: { children?: ReactNode }) {
  const spec = useAmbient();
  return (
    <View style={s.stage}>
      <Brand />
      <View style={s.stageTv}>
        {children ?? (
          <>
            <LitTv spec={spec} />
            <Text style={[type.small, { textAlign: "center", marginTop: space(6) }]}>
              On the TV: <Text style={{ color: color.text }}>{spec.name}</Text>
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
  brand,
}: {
  step?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
  /** What the wide-screen stage shows instead of the lit TV. */
  stage?: ReactNode;
  /** Show the KanTV name where the back button would be (the home screen, on phones). */
  brand?: boolean;
}) {
  // From the navigator, not the imperative router, which isn't up yet when the app opens straight onto a screen.
  const canGoBack = useNavigation().canGoBack();
  const wide = useWide();

  const main = (
    <View style={[s.main, wide && s.mainWide]}>
      <View style={s.topBar}>
        {back && canGoBack ? (
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [s.backBtn, web.press, pressed && s.backPressed]}>
            <Icon name="back" size={20} />
          </Pressable>
        ) : brand && !wide ? (
          <Brand size={26} />
        ) : (
          <View style={s.backSpacer} />
        )}
        <View style={[s.topCenter, brand && { flex: 0 }]}>{step ? <Progress step={step} /> : null}</View>
        <View style={s.topRight}>
          <DemoBanner />
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {title ? <Text style={[type.display, { textWrap: "balance" } as object]} accessibilityRole="header">{title}</Text> : null}
        {subtitle ? <Text style={[type.body, { color: color.muted, marginTop: space(3), maxWidth: 480 }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: title ? space(7) : 0, gap: space(4) }}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={[s.footer, web.material]}>
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
  // A disabled primary loses its light entirely, so it can't be mistaken for the next step.
  const ink = kind === "primary" ? (off && !busy ? color.faint : color.accentInk) : kind === "danger" ? color.danger : kind === "ghost" ? color.muted : color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      pressRetentionOffset={16}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        web.press,
        kind === "primary" && { backgroundColor: off && !busy ? color.surfaceRaised : pressed || busy ? color.accentPressed : color.accent },
        kind === "secondary" && { backgroundColor: pressed ? color.surfacePressed : "transparent", borderWidth: 1.5, borderColor: color.lineStrong },
        kind === "danger" && { backgroundColor: pressed ? "rgba(255,138,128,0.2)" : color.dangerSoft },
        kind === "ghost" && { backgroundColor: pressed ? color.accentSoft : "transparent", minHeight: 48 },
        off && kind !== "primary" && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {busy ? <ActivityIndicator color={ink} /> : icon ? <Icon name={icon} tint={ink} size={19} /> : null}
      <Text style={[type.button, { color: ink }, kind === "ghost" && { fontFamily: type.heading.fontFamily, fontSize: 15.5 }]}>{label}</Text>
    </Pressable>
  );
}

/** A block of supporting information. Plain by default; a tone adds a tint and an icon, never colour alone. */
export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: "ok" | "warn" | "danger" | "accent" }) {
  const bg = tone === "ok" ? color.okSoft : tone === "danger" ? color.dangerSoft : tone === "warn" ? color.warnSoft : tone === "accent" ? color.accentSoft : color.surface;
  const edge = tone === "ok" ? color.ok : tone === "danger" ? color.danger : tone === "warn" ? color.warn : tone === "accent" ? color.accentLine : null;
  return (
    <View style={[s.card, { backgroundColor: bg }, style]}>
      {edge ? <View style={[s.cardEdge, { backgroundColor: edge }]} /> : null}
      {children}
    </View>
  );
}

export function Status({ state, label, detail }: { state: "done" | "doing" | "todo" | "warn" | "fail"; label: string; detail?: string }) {
  const icon =
    state === "done" ? <View style={[s.statusBadge, { backgroundColor: color.ok }]}><Icon name="check" tint={color.accentInk} size={13} /></View> :
    state === "doing" ? <ActivityIndicator color={color.text} size="small" /> :
    state === "warn" ? <Icon name="alert" tint={color.warn} size={20} /> :
    state === "fail" ? <Icon name="alert" tint={color.danger} size={20} /> :
    <View style={s.statusTodo} />;
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
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={title} style={({ pressed }) => [s.checkRow, web.press, pressed && { backgroundColor: color.surfacePressed }]}>
      <View style={[s.box, web.press, checked && { backgroundColor: color.accent, borderColor: color.accent }]}>
        {checked ? <Icon name="check" tint={color.accentInk} size={15} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body}>{title}</Text>
        {note ? <Text style={type.small}>{note}</Text> : null}
        {detail ? <Text style={type.mono}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Choice({ selected, onPress, title, detail }: { selected: boolean; onPress: () => void; title: string; detail?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={({ pressed }) => [s.choice, web.press, selected && s.choiceOn, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={[s.radio, web.press, selected && { borderColor: color.accent }]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

/** A named group of rows, joined into one surface. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2) }}>
      <Text style={type.label} accessibilityRole="header">{title}</Text>
      {hint ? <Text style={type.small}>{hint}</Text> : null}
      <View style={s.group}>{children}</View>
    </View>
  );
}

/** One row of a group: icon, name, what it does, and where it goes. Feedback on press-in. */
export function Row({ icon, title, detail, onPress, last, tint }: { icon: IconName; title: string; detail?: string; onPress: () => void; last?: boolean; tint?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} style={({ pressed }) => [s.row, web.press, pressed && { backgroundColor: color.surfacePressed }]}>
      <View style={[s.rowIcon, tint ? { borderColor: tint } : null]}>
        <Icon name={icon} tint={tint ?? color.text} size={19} />
      </View>
      <View style={[s.rowBody, !last && s.rowLine]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.heading}>{title}</Text>
          {detail ? <Text style={type.small}>{detail}</Text> : null}
        </View>
        <Icon name="chevron" tint={color.faint} size={17} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  wide: { flex: 1, flexDirection: "row", width: "100%", maxWidth: 1320, alignSelf: "center", gap: space(16), paddingHorizontal: space(12), paddingVertical: space(10) },
  main: { flex: 1 },
  mainWide: { maxWidth: 600, borderLeftWidth: 1, borderLeftColor: color.line, paddingLeft: space(6) },

  stage: { flex: 1, maxWidth: layout.stage + 120, justifyContent: "space-between", paddingVertical: space(2) },
  stageTv: { flex: 1, justifyContent: "center", paddingHorizontal: space(4) },

  demo: { paddingHorizontal: 10, height: 26, borderRadius: radius.pill, borderWidth: 1, borderStyle: "dashed", borderColor: color.lineStrong, justifyContent: "center" },
  demoText: { ...type.tiny, color: color.muted },

  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space(4), height: 60, gap: space(3), maxWidth: layout.column + space(10), width: "100%", alignSelf: "center" },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.line },
  backPressed: { backgroundColor: color.surfacePressed, transform: [{ scale: 0.94 }] },
  backSpacer: { width: 44, height: 44 },
  topCenter: { flex: 1, alignItems: "center" },
  topRight: { flex: 1, minWidth: 44, alignItems: "flex-end" },
  progress: { alignItems: "center", gap: 7, width: "100%", maxWidth: 180 },
  segments: { flexDirection: "row", gap: 3, width: "100%" },
  segment: { flex: 1, height: 5, borderRadius: 1.5, backgroundColor: color.line },
  stepText: { ...type.tiny, color: color.muted },

  content: { paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(12), maxWidth: layout.column, width: "100%", alignSelf: "center" },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.chrome },
  footerInner: { paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(4), gap: space(2), maxWidth: layout.column, width: "100%", alignSelf: "center" },

  btn: { minHeight: 56, borderRadius: radius.pill, paddingHorizontal: space(6), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },

  card: { borderRadius: radius.md, padding: space(5), gap: space(2), overflow: "hidden" },
  cardEdge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },

  status: { flexDirection: "row", gap: space(3), alignItems: "flex-start", paddingVertical: space(2) },
  statusIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginTop: 1 },
  statusBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statusTodo: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: color.lineStrong },

  checkRow: { flexDirection: "row", gap: space(3), paddingVertical: space(4), paddingHorizontal: space(4), alignItems: "flex-start", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },

  choice: { flexDirection: "row", gap: space(4), paddingVertical: space(5), paddingHorizontal: space(5), borderRadius: radius.md, borderWidth: 1.5, borderColor: color.line, alignItems: "center" },
  choiceOn: { borderColor: color.accent, backgroundColor: color.accentSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },

  group: { backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space(4), paddingLeft: space(4) },
  rowIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(4), paddingRight: space(4), minHeight: 72 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
});
