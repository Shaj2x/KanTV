// The building blocks every screen uses: the screen frame (header with progress, the preview label, the sticky
// action area, and on wide screens a side panel), buttons, cards, rows. Kept in one file so the look stays
// consistent: a change here reaches every screen.
import { router, useNavigation } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { platform } from "../platform";
import { SAMPLES } from "../platform/demo/designs";
import { color, layout, radius, space, type, web } from "../theme";
import { Icon, type IconName } from "./Icon";
import { ThemePreview } from "./ThemePreview";

/** True on a tablet or a desktop browser: the app adds a side panel instead of stretching the column. */
export function useWide() {
  return useWindowDimensions().width >= layout.wide;
}

/** The preview build's label: small and always there, so nobody mistakes the pretend TV for theirs. */
export function DemoBanner() {
  if (platform.mode !== "demo") return null;
  return (
    <View style={s.demo} accessibilityRole="text" accessibilityLabel="Preview mode: a simulated TV. Nothing here talks to a real TV.">
      <View style={s.demoDot} />
      <Text style={s.demoText}>Preview · simulated TV</Text>
    </View>
  );
}

/** "Step 2 of 5" (or "Step 1 of 5 · 2/3") as segments: where you are and how much is left, at a glance. */
function Progress({ step }: { step: string }) {
  const m = step.match(/Step (\d+) of (\d+)/);
  if (!m) return <Text style={s.stepText}>{step}</Text>;
  const at = Number(m[1]);
  const of = Number(m[2]);
  return (
    <View style={s.progress} accessibilityRole="progressbar" accessibilityLabel={`Step ${at} of ${of}`}>
      <View style={s.segments}>
        {Array.from({ length: of }, (_, i) => (
          <View key={i} style={[s.segment, web.press, i < at && { backgroundColor: i === at - 1 ? color.accent : color.accentLine }]} />
        ))}
      </View>
      <Text style={s.stepText}>{`Step ${at} of ${of}`}</Text>
    </View>
  );
}

const PROMISES: { icon: IconName; text: string }[] = [
  { icon: "shield", text: "Nothing is uninstalled. Safety checks keep inputs, Settings and Wi-Fi working." },
  { icon: "restore", text: "One tap puts everything back. Free, forever." },
  { icon: "sparkle", text: "Describe the look you want and AI designs your home screen." },
];

/** The wide-screen side panel: what KanTV is for, shown as the result on a TV, and its three promises. */
function Rail() {
  return (
    <View style={s.rail}>
      <View style={s.brand}>
        <View style={s.brandMark}>
          <Icon name="tv" tint={color.accentInk} size={18} />
        </View>
        <Text style={s.brandName}>KanTV</Text>
      </View>
      <View style={{ gap: space(3) }}>
        <Text style={type.hero}>Your TV,{"\n"}without the ads.</Text>
        <Text style={[type.body, { color: color.muted }]}>Clean it up, give it a home screen you designed, and run it all from your phone.</Text>
      </View>
      <View>
        <View style={s.tvFrame}>
          <ThemePreview spec={SAMPLES[0]!} />
        </View>
        <View style={s.tvStand} />
      </View>
      <View style={{ gap: space(4) }}>
        {PROMISES.map((p) => (
          <View key={p.icon} style={s.promise}>
            <View style={s.promiseIcon}>
              <Icon name={p.icon} tint={color.accent} size={18} />
            </View>
            <Text style={[type.small, { flex: 1, color: color.text }]}>{p.text}</Text>
          </View>
        ))}
      </View>
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
}: {
  step?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
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
        ) : (
          <View style={s.backSpacer} />
        )}
        <View style={s.topCenter}>{step ? <Progress step={step} /> : null}</View>
        <View style={s.topRight}>
          <DemoBanner />
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {title ? <Text style={[type.display, { textWrap: "balance" } as object]}>{title}</Text> : null}
        {subtitle ? <Text style={[type.body, { color: color.muted, marginTop: space(3) }]}>{subtitle}</Text> : null}
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
          <Rail />
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
  // A disabled primary turns neutral rather than a dimmed amber, so it can't be mistaken for the next step.
  const ink = kind === "primary" ? (off && !busy ? color.faint : color.accentInk) : kind === "danger" ? color.danger : color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      pressRetentionOffset={16}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        web.press,
        kind === "primary" && { backgroundColor: off && !busy ? color.surfaceRaised : busy ? color.accentPressed : pressed ? color.accentPressed : color.accent },
        kind === "secondary" && { backgroundColor: pressed ? color.surfacePressed : color.surfaceRaised, borderWidth: 1, borderColor: color.line },
        kind === "danger" && { backgroundColor: color.dangerSoft },
        kind === "ghost" && { backgroundColor: pressed ? color.surface : "transparent", minHeight: 48 },
        off && kind !== "primary" && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {busy ? <ActivityIndicator color={ink} /> : icon ? <Icon name={icon} tint={ink} size={20} /> : null}
      <Text style={[s.btnText, { color: ink }, kind === "ghost" && { fontWeight: "600", color: color.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: "ok" | "warn" | "danger" | "accent" }) {
  const bg = tone === "ok" ? color.okSoft : tone === "danger" ? color.dangerSoft : tone === "accent" || tone === "warn" ? color.accentSoft : color.surface;
  const border = tone === "ok" ? "rgba(90,214,143,0.28)" : tone === "danger" ? "rgba(255,116,102,0.3)" : tone ? color.accentLine : color.line;
  return <View style={[s.card, { backgroundColor: bg, borderColor: tone === "accent" || tone === "warn" ? "rgba(255,181,71,0.28)" : border }, style]}>{children}</View>;
}

export function Status({ state, label, detail }: { state: "done" | "doing" | "todo" | "warn" | "fail"; label: string; detail?: string }) {
  const icon =
    state === "done" ? <View style={[s.statusBadge, { backgroundColor: color.okSoft }]}><Icon name="check" tint={color.ok} size={14} /></View> :
    state === "doing" ? <ActivityIndicator color={color.accent} size="small" /> :
    state === "warn" ? <Icon name="alert" tint={color.warn} size={20} /> :
    state === "fail" ? <Icon name="alert" tint={color.danger} size={20} /> :
    <View style={s.statusTodo} />;
  return (
    <View style={s.status}>
      <View style={s.statusIcon}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, state === "todo" && { color: color.faint }, state === "doing" && { fontWeight: "600" }]}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function CheckRow({ checked, onToggle, title, detail, note }: { checked: boolean; onToggle: () => void; title: string; detail?: string; note?: string }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} style={({ pressed }) => [s.checkRow, web.press, pressed && { backgroundColor: color.surfacePressed }]}>
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
      style={({ pressed }) => [s.choice, web.press, selected && s.choiceOn, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
      <View style={[s.radio, selected && { borderColor: color.accent, backgroundColor: color.accent }]}>
        {selected ? <Icon name="check" tint={color.accentInk} size={14} /> : null}
      </View>
    </Pressable>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2) }}>
      <Text style={[type.label, { marginLeft: space(1) }]}>{title}</Text>
      {hint ? <Text style={[type.small, { marginLeft: space(1) }]}>{hint}</Text> : null}
      <View style={s.group}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  wide: { flex: 1, flexDirection: "row", width: "100%", maxWidth: 1240, alignSelf: "center", gap: space(10), paddingHorizontal: space(10), paddingVertical: space(8) },
  main: { flex: 1 },
  mainWide: { backgroundColor: color.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: color.line, overflow: "hidden", maxWidth: 640 },

  rail: { width: layout.rail, gap: space(8), paddingTop: space(2) },
  brand: { flexDirection: "row", alignItems: "center", gap: space(3) },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  brandName: { ...type.heading, fontSize: 19, letterSpacing: -0.3 },
  tvFrame: { padding: 8, backgroundColor: color.tvBezel, borderRadius: 14, borderWidth: 1, borderColor: color.line },
  tvStand: { alignSelf: "center", width: "26%", height: 8, backgroundColor: color.tvBezel, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  promise: { flexDirection: "row", gap: space(3), alignItems: "flex-start" },
  promiseIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },

  demo: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: color.accentSoft, borderWidth: 1, borderColor: "rgba(255,181,71,0.25)" },
  demoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  demoText: { ...type.tiny, color: color.accent, fontWeight: "600", letterSpacing: 0.2 },

  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space(4), height: 60, gap: space(3), maxWidth: layout.column + space(10), width: "100%", alignSelf: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.line },
  backPressed: { backgroundColor: color.surfacePressed, transform: [{ scale: 0.94 }] },
  backSpacer: { width: 40, height: 40 },
  topCenter: { flex: 1, alignItems: "center" },
  topRight: { minWidth: 40, alignItems: "flex-end" },
  progress: { alignItems: "center", gap: 6, width: "100%", maxWidth: 200 },
  segments: { flexDirection: "row", gap: 4, width: "100%" },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.line },
  stepText: { ...type.tiny, color: color.muted, fontWeight: "600" },

  content: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(10), maxWidth: layout.column, width: "100%", alignSelf: "center" },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.chrome },
  footerInner: { paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(4), gap: space(1), maxWidth: layout.column, width: "100%", alignSelf: "center" },

  btn: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: space(5), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },
  btnText: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2, ...(Platform.OS === "web" ? { fontFamily: type.body.fontFamily } : null) },

  card: { borderRadius: radius.lg, padding: space(5), gap: space(2), borderWidth: 1 },

  status: { flexDirection: "row", gap: space(3), alignItems: "flex-start", paddingVertical: space(2) },
  statusIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginTop: 1 },
  statusBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statusTodo: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color.lineStrong },

  checkRow: { flexDirection: "row", gap: space(3), paddingVertical: space(4), paddingHorizontal: space(4), alignItems: "flex-start", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },

  choice: { flexDirection: "row", gap: space(4), padding: space(5), borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.surface, alignItems: "center" },
  choiceOn: { borderColor: color.accent, backgroundColor: color.accentSoft },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center" },

  group: { backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: color.line },
});
