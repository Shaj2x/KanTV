// The building blocks every screen uses, in teletext's vocabulary: a page header (page number, name, clock), a
// coloured masthead band with the page title, Fastext keys for actions, index rows with dotted leaders and page
// numbers, and square markers for progress. One file, so the look stays consistent: a change here reaches every
// screen.
import { router, useNavigation, usePathname } from "expo-router";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { CSS_EASE_OUT, stateTransition } from "../motion";
import { platform } from "../platform";
import { color, layout, pageFor, space, tt, type, type Page } from "../theme";
import { BrandMark, LitTv, useAmbient } from "./ambient";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Press";

// A tick landing: grows from 60% with a fade, 220ms, once when it appears. A CSS animation rather than a layout
// animation, so it always ends fully visible even when many land at once.
const POP = { from: { opacity: 0, transform: [{ scale: 0.6 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };
const TICK = { animationName: POP, animationDuration: 220, animationTimingFunction: CSS_EASE_OUT, animationFillMode: "both" } as const;
// The radio's fill: quicker; it's picked often.
const DOT = { ...TICK, animationDuration: 160 } as const;
// The teletext cursor: a hard on/off blink, not a fade.
const BLINK = { "0%": { opacity: 1 }, "50%": { opacity: 1 }, "50.01%": { opacity: 0 }, "100%": { opacity: 0 } };

/** The page the screen belongs to: its number and colour. Controls inside take their colour from it. */
const PageContext = createContext<Page>(pageFor("/"));
export const usePage = () => useContext(PageContext);

/** True on a tablet or a desktop browser: the TV moves beside the column instead of stretching it. */
export function useWide() {
  return useWindowDimensions().width >= layout.wide;
}

/** The time, like the clock in the corner of every teletext page. */
function Clock() {
  const fmt = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [t, setT] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 15_000);
    return () => clearInterval(id);
  }, []);
  return <Text style={s.headerText}>{t}</Text>;
}

/** "THU 12 NOV", as at the top of a teletext page. */
function today() {
  const d = new Date();
  return `${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()]} ${d.getDate()} ${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()]}`;
}

/** A blinking block: something is happening. Steady with Reduce Motion. */
export function Cursor({ tint = color.text, size = 14 }: { tint?: string; size?: number }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      accessibilityLabel="Working"
      style={[
        { width: size * 0.62, height: size, backgroundColor: tint },
        !reduced && ({ animationName: BLINK, animationDuration: 1000, animationIterationCount: "infinite", animationTimingFunction: "linear" } as object),
      ]}
    />
  );
}

/** The preview build's label: always there, so nobody mistakes the pretend TV for theirs. */
export function DemoBanner() {
  if (platform.mode !== "demo") return null;
  return (
    <View style={s.demo} accessibilityRole="text" accessibilityLabel="Preview mode: a simulated TV. Nothing here talks to a real TV.">
      <Text style={s.demoText}>DEMO TV</Text>
    </View>
  );
}

/** "Step 2 of 5" as teletext blocks: filled for done, the current one blinking-white outline, the rest empty. */
function Progress({ step, ink }: { step: string; ink: string }) {
  const m = step.match(/Step (\d+) of (\d+)/);
  if (!m) return null;
  const at = Number(m[1]);
  const of = Number(m[2]);
  return (
    <View style={s.progress} accessibilityRole="progressbar" accessibilityLabel={`Step ${at} of ${of}`} accessibilityValue={{ min: 0, max: of, now: at }}>
      <Text style={[s.bandMeta, { color: ink }]}>{`STEP ${at}/${of}`}</Text>
      <View style={s.blocks}>
        {Array.from({ length: of }, (_, i) => (
          <Animated.View key={i} style={[s.block, stateTransition, { borderColor: ink }, i < at && { backgroundColor: ink }]} />
        ))}
      </View>
    </View>
  );
}

/** Wide screens: the lit TV beside the page, showing whichever design is lighting the app. */
function Stage({ children }: { children?: ReactNode }) {
  const spec = useAmbient();
  return (
    <View style={s.stage}>
      <View style={s.stageTv}>
        {children ?? (
          <>
            <LitTv spec={spec} />
            <Text style={[type.pixel, { textAlign: "center", marginTop: space(8), color: color.muted }]}>
              NOW ON YOUR TV: <Text style={{ color: tt.yellow }}>{spec.name.toUpperCase()}</Text>
            </Text>
          </>
        )}
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
  stage,
  hero,
}: {
  step?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
  /** What the wide-screen stage shows instead of the lit TV. */
  stage?: ReactNode;
  /** Something to show above the masthead band (the home screen's TV). */
  hero?: ReactNode;
  /** @deprecated the page header always carries the name now. */
  brand?: boolean;
}) {
  // From the navigator, not the imperative router, which isn't up yet when the app opens straight onto a screen.
  const canGoBack = useNavigation().canGoBack();
  const wide = useWide();
  const page = pageFor(usePathname());

  const main = (
    <View style={[s.main, wide && s.mainWide]}>
      {/* The page header: back, page number, name, clock. */}
      <View style={s.header}>
        {back && canGoBack ? (
          <Press onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: color.surfacePressed }]}>
            <Icon name="back" size={20} />
          </Press>
        ) : null}
        <Text style={[s.headerText, { color: page.tone }]}>{`P${page.number}`}</Text>
        <View style={s.headerBrand}>
          <BrandMark size={22} />
          <Text style={s.headerText}>KanTV</Text>
        </View>
        <View style={{ flex: 1 }} />
        <DemoBanner />
        <Clock />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {hero}
        {title ? (
          <View style={[s.band, { backgroundColor: page.tone }]}>
            {step ? <Progress step={step} ink={color.accentInk} /> : <Text style={[s.bandMeta, { color: color.accentInk }]}>{page.number === 100 ? today() : page.name.toUpperCase()}</Text>}
            <Text style={[type.display, s.bandTitle]} accessibilityRole="header">
              {title}
            </Text>
          </View>
        ) : null}
        {subtitle ? <Text style={[type.body, { color: color.muted, marginTop: space(4), maxWidth: 480 }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: title ? space(6) : 0, gap: space(4) }}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={s.footer}>
          <View style={s.footerInner}>{footer}</View>
        </View>
      ) : null}
    </View>
  );

  return (
    <PageContext.Provider value={page}>
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
    </PageContext.Provider>
  );
}

/** A Fastext key: a solid block in the page's colour for the main action, an outlined one for the alternative. */
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
  const page = usePage();
  const off = !!(disabled || busy);
  const fill = kind === "primary" ? page.tone : kind === "danger" ? tt.red : null;
  const ink = fill ? (off && !busy ? color.faint : color.accentInk) : kind === "ghost" ? color.muted : color.text;
  return (
    <Press
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        s.btn,
        fill && { backgroundColor: off && !busy ? color.surfaceRaised : fill, opacity: pressed ? 0.82 : 1 },
        kind === "secondary" && { borderWidth: 2, borderColor: color.text, backgroundColor: pressed ? color.surfacePressed : "transparent" },
        kind === "ghost" && { minHeight: 48, backgroundColor: pressed ? color.surfacePressed : "transparent" },
        off && !fill && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {busy ? <Cursor tint={ink} size={20} /> : icon && kind !== "ghost" ? <Icon name={icon} tint={ink} size={19} /> : null}
      <Text style={[type.button, { color: ink }, kind === "ghost" && { fontSize: 24 }]}>{label}</Text>
    </Press>
  );
}

/** A block of supporting information. Plain is a dark panel; a tone draws a box in that colour around it. */
export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: "ok" | "warn" | "danger" | "accent" }) {
  const page = usePage();
  const edge = tone === "ok" ? tt.green : tone === "danger" ? tt.red : tone === "warn" ? tt.yellow : tone === "accent" ? page.tone : null;
  return <View style={[s.card, edge ? { borderWidth: 2, borderColor: edge, backgroundColor: "transparent" } : null, style]}>{children}</View>;
}

export function Status({ state, label, detail }: { state: "done" | "doing" | "todo" | "warn" | "fail"; label: string; detail?: string }) {
  const icon =
    state === "done" ? (
      <Animated.View style={[s.mark, { backgroundColor: tt.green }, TICK as object]}>
        <Icon name="check" tint={color.accentInk} size={14} />
      </Animated.View>
    ) : state === "doing" ? (
      <Cursor size={18} />
    ) : state === "warn" ? (
      <View style={[s.mark, { backgroundColor: tt.yellow }]}><Text style={s.markText}>!</Text></View>
    ) : state === "fail" ? (
      <View style={[s.mark, { backgroundColor: tt.red }]}><Text style={s.markText}>×</Text></View>
    ) : (
      <View style={[s.mark, { borderWidth: 2, borderColor: color.lineStrong }]} />
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
      <Animated.View style={[s.box, stateTransition, checked && { backgroundColor: color.accent, borderColor: color.accent }]}>
        {checked ? (
          <Animated.View style={DOT as object}>
            <Icon name="check" tint={color.accentInk} size={15} />
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
  const page = usePage();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={({ pressed }) => [s.choice, selected && { borderColor: page.tone }, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <Animated.View style={[s.radio, stateTransition, selected && { borderColor: page.tone }]}>{selected ? <Animated.View style={[s.radioFill, { backgroundColor: page.tone }, DOT as object]} /> : null}</Animated.View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.title, { fontSize: 28, lineHeight: 28 }, selected && { color: page.tone }]}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </Press>
  );
}

/** A named group of rows: the name in pixel type, the rows below as an index. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const page = usePage();
  return (
    <View style={{ gap: space(2) }}>
      <View style={s.sectionHead}>
        <View style={[s.sectionMark, { backgroundColor: page.tone }]} />
        <Text style={type.label} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {hint ? <Text style={type.small}>{hint}</Text> : null}
      <View style={s.group}>{children}</View>
    </View>
  );
}

const LEADER = ". ".repeat(80);

/**
 * One index line, teletext style: the name, a dotted leader, the page number it goes to in that page's colour.
 * What it does sits underneath in readable type.
 */
export function Row({ title, detail, onPress, last, page, tone }: { icon?: IconName; title: string; detail?: string; onPress: () => void; last?: boolean; page?: number; tone?: string; tint?: string }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} style={({ pressed }) => [s.row, !last && s.rowLine, pressed && { backgroundColor: color.surfacePressed }]}>
      <View style={s.rowTop}>
        <Text style={[type.title, { fontSize: 30, lineHeight: 30 }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.leader} accessibilityElementsHidden importantForAccessibility="no">
          {LEADER}
        </Text>
        {page ? <Text style={[type.title, { fontSize: 30, lineHeight: 30, color: tone ?? color.text }]}>{page}</Text> : null}
      </View>
      {detail ? <Text style={type.small}>{detail}</Text> : null}
    </Press>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  wide: { flex: 1, flexDirection: "row", width: "100%", maxWidth: 1320, alignSelf: "center", gap: space(16), paddingHorizontal: space(12), paddingVertical: space(8) },
  main: { flex: 1 },
  mainWide: { maxWidth: 600 },

  stage: { flex: 1, maxWidth: layout.stage + 120 },
  stageTv: { flex: 1, justifyContent: "center", paddingHorizontal: space(4) },

  header: { flexDirection: "row", alignItems: "center", gap: space(3), height: 56, paddingHorizontal: space(5), maxWidth: layout.column, width: "100%", alignSelf: "center" },
  headerText: { ...type.pixel, fontSize: 24, lineHeight: 24 },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: space(2) },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.line, borderRadius: 3, marginLeft: -space(1) },

  demo: { backgroundColor: tt.magenta, paddingHorizontal: 6, height: 22, justifyContent: "center", borderRadius: 2 },
  demoText: { ...type.pixel, fontSize: 20, lineHeight: 20, color: color.accentInk },

  band: { paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(4), gap: space(3), borderRadius: 3 },
  bandMeta: { ...type.pixel, fontSize: 22, lineHeight: 22 },
  bandTitle: { color: color.accentInk },
  progress: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blocks: { flexDirection: "row", gap: 4 },
  block: { width: 16, height: 12, borderWidth: 2 },

  content: { paddingHorizontal: space(5), paddingTop: space(2), paddingBottom: space(12), maxWidth: layout.column, width: "100%", alignSelf: "center" },
  footer: { borderTopWidth: 2, borderTopColor: color.line, backgroundColor: color.chrome },
  footerInner: { paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(4), gap: space(2), maxWidth: layout.column, width: "100%", alignSelf: "center" },

  btn: { minHeight: 58, borderRadius: 3, paddingHorizontal: space(5), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(3) },

  card: { borderRadius: 3, padding: space(5), gap: space(2), backgroundColor: color.surface },

  status: { flexDirection: "row", gap: space(3), alignItems: "flex-start", paddingVertical: space(2) },
  statusIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginTop: 1 },
  mark: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 2 },
  markText: { ...type.pixel, fontSize: 22, lineHeight: 20, color: color.accentInk },

  checkRow: { flexDirection: "row", gap: space(3), paddingVertical: space(4), paddingHorizontal: space(4), alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: color.line },
  box: { width: 22, height: 22, borderRadius: 2, borderWidth: 2, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },

  choice: { flexDirection: "row", gap: space(4), paddingVertical: space(4), paddingHorizontal: space(4), borderRadius: 3, borderWidth: 2, borderColor: color.line, alignItems: "center" },
  radio: { width: 24, height: 24, borderRadius: 2, borderWidth: 2, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center" },
  radioFill: { width: 12, height: 12 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  sectionMark: { width: 10, height: 18 },
  group: { borderTopWidth: 1, borderTopColor: color.line },
  row: { paddingVertical: space(4), paddingHorizontal: space(1), gap: space(1), minHeight: 64, justifyContent: "center" },
  rowLine: { borderBottomWidth: 1, borderBottomColor: color.line },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: space(2) },
  // Wraps onto hidden lines instead of ending in an ellipsis.
  leader: { ...type.pixel, flex: 1, color: color.lineStrong, fontSize: 24, lineHeight: 24, height: 24, overflow: "hidden" },
});
