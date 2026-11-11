// The building blocks every screen uses: the screen frame (header, demo notice, sticky action), buttons,
// cards, rows. Kept in one file so the look stays consistent.
import { router, useNavigation } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { platform } from "../platform";
import { color, radius, space, type } from "../theme";
import { Icon, type IconName } from "./Icon";

export function DemoBanner() {
  if (platform.mode !== "demo") return null;
  return (
    <View style={s.demo} accessibilityRole="text">
      <Text style={s.demoText}>
        <Text style={{ fontWeight: "700", color: color.accent }}>Preview · </Text>
        a simulated Chromecast with Google TV. Nothing here talks to a real TV.
      </Text>
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
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <DemoBanner />
      <View style={s.topBar}>
        {back && canGoBack ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={s.backBtn}>
            <Icon name="back" />
          </Pressable>
        ) : (
          <View style={s.backBtn} />
        )}
        {step ? <Text style={s.step}>{step}</Text> : null}
        <View style={s.backBtn} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {title ? <Text style={type.display}>{title}</Text> : null}
        {subtitle ? <Text style={[type.body, { color: color.muted, marginTop: space(2) }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: title ? space(6) : 0, gap: space(4) }}>{children}</View>
      </ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
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
  const ink = kind === "primary" ? color.accentInk : kind === "danger" ? color.danger : color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        kind === "primary" && { backgroundColor: color.accent },
        kind === "secondary" && { backgroundColor: color.surfaceRaised },
        kind === "danger" && { backgroundColor: color.dangerSoft },
        kind === "ghost" && { backgroundColor: "transparent" },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
      ]}
    >
      {busy ? <ActivityIndicator color={ink} /> : icon ? <Icon name={icon} tint={ink} size={20} /> : null}
      <Text style={[s.btnText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: "ok" | "warn" | "danger" | "accent" }) {
  const bg = tone === "ok" ? color.okSoft : tone === "danger" ? color.dangerSoft : tone === "accent" || tone === "warn" ? color.accentSoft : color.surface;
  return <View style={[s.card, { backgroundColor: bg }, style]}>{children}</View>;
}

export function Status({ state, label, detail }: { state: "done" | "doing" | "todo" | "warn" | "fail"; label: string; detail?: string }) {
  const icon =
    state === "done" ? <Icon name="check" tint={color.ok} /> :
    state === "doing" ? <ActivityIndicator color={color.accent} /> :
    state === "warn" ? <Icon name="alert" tint={color.warn} /> :
    state === "fail" ? <Icon name="alert" tint={color.danger} /> :
    <Icon name="dot" tint={color.line} size={16} />;
  return (
    <View style={s.status}>
      <View style={s.statusIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, state === "todo" && { color: color.faint }]}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function CheckRow({ checked, onToggle, title, detail, note }: { checked: boolean; onToggle: () => void; title: string; detail?: string; note?: string }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} style={s.checkRow}>
      <View style={[s.box, checked && { backgroundColor: color.accent, borderColor: color.accent }]}>
        {checked ? <Icon name="check" tint={color.accentInk} size={16} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{title}</Text>
        {note ? <Text style={type.small}>{note}</Text> : null}
        {detail ? <Text style={type.mono}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Choice({ selected, onPress, title, detail }: { selected: boolean; onPress: () => void; title: string; detail?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[s.choice, selected && { borderColor: color.accent, backgroundColor: color.accentSoft }]}>
      <View style={[s.radio, selected && { borderColor: color.accent }]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(2) }}>
      <Text style={[type.small, { color: color.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 }]}>{title}</Text>
      {hint ? <Text style={type.small}>{hint}</Text> : null}
      <View style={s.group}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  demo: { backgroundColor: color.surface, paddingHorizontal: space(4), paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: color.line },
  demoText: { ...type.tiny, color: color.muted, textAlign: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(3), height: 48 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  step: { ...type.small, fontWeight: "600" },
  content: { paddingHorizontal: space(5), paddingBottom: space(8), maxWidth: 560, width: "100%", alignSelf: "center" },
  footer: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(4), gap: space(2), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.bg, maxWidth: 560, width: "100%", alignSelf: "center" },
  btn: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: space(5), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },
  btnText: { fontSize: 17, fontWeight: "700" },
  card: { borderRadius: radius.lg, padding: space(5), gap: space(2) },
  status: { flexDirection: "row", gap: space(3), alignItems: "flex-start", paddingVertical: space(2) },
  statusIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkRow: { flexDirection: "row", gap: space(3), paddingVertical: space(3), paddingHorizontal: space(4), alignItems: "flex-start" },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color.faint, alignItems: "center", justifyContent: "center", marginTop: 1 },
  choice: { flexDirection: "row", gap: space(3), padding: space(4), borderRadius: radius.md, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.surface, alignItems: "flex-start" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.faint, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  group: { backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden" },
});
