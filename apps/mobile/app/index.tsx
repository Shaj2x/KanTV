// Home: what KanTV makes (a TV home screen), the one thing to do next, and the everyday actions in one group.
// Restore is always here and always free.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth";
import { platform, type Entitlement } from "../src/platform";
import { SAMPLES, demoEndTrial } from "../src/platform/demo/designs";
import { useSession } from "../src/session";
import { color, radius, space, type, web } from "../src/theme";
import { Icon, type IconName } from "../src/ui/Icon";
import { Button, Screen, useWide } from "../src/ui/kit";
import { ThemePreview } from "../src/ui/ThemePreview";

/** One row of the inset group: icon, name, what it does. Feedback on press-in. */
function Row({ icon, title, detail, onPress, last }: { icon: IconName; title: string; detail: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.row, web.press, !last && s.rowLine, pressed && { backgroundColor: color.surfacePressed }]}
    >
      <View style={s.rowIcon}>
        <Icon name={icon} tint={color.accent} size={20} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.heading}>{title}</Text>
        <Text style={type.small}>{detail}</Text>
      </View>
      <Icon name="chevron" tint={color.faint} size={18} />
    </Pressable>
  );
}

/** The KanTV home screen on a TV, as the customer will see it. */
function TvHero() {
  return (
    <View>
      <View style={s.tvFrame}>
        <ThemePreview spec={SAMPLES[0]!} />
      </View>
      <View style={s.tvStand} />
    </View>
  );
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "ok" | "accent" }) {
  const c = tone === "ok" ? color.ok : tone === "accent" ? color.accent : color.muted;
  const bg = tone === "ok" ? color.okSoft : tone === "accent" ? color.accentSoft : color.surfaceRaised;
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[type.tiny, { color: c, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

function trialLine(e: Entitlement | null): string | null {
  if (!e) return null;
  if (e.plan === "subscription") return "Subscribed";
  if (e.plan === "trial" && e.trialEndsAt) {
    const days = Math.max(1, Math.ceil((new Date(e.trialEndsAt).getTime() - Date.now()) / 86_400_000));
    return `Free trial · ${days} day${days === 1 ? "" : "s"} left`;
  }
  return "Free trial over";
}

export default function Home() {
  const auth = useAuth();
  const { s: session } = useSession();
  const done = session.result;
  const [ent, setEnt] = useState<Entitlement | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (auth.signedIn) void platform.designer.entitlement().then(setEnt);
      else setEnt(null);
    }, [auth.signedIn]),
  );
  const line = trialLine(ent);
  const wide = useWide();
  return (
    <Screen back={false}>
      {!wide ? (
        <View style={s.brand}>
          <View style={s.brandMark}>
            <Icon name="tv" tint={color.accentInk} size={16} />
          </View>
          <Text style={s.brandName}>KanTV</Text>
        </View>
      ) : null}

      {!done ? (
        <View style={{ gap: space(6) }}>
          <View style={{ gap: space(3) }}>
            <Text style={[type.hero, { textWrap: "balance" } as object]}>Make your TV yours</Text>
            <Text style={[type.body, { color: color.muted }]}>
              Turn off the ads and the junk, get a clean home screen you designed, and control it all from this phone.
            </Text>
          </View>
          {!wide ? <TvHero /> : null}
          <View style={{ gap: space(3) }}>
            <Button label="Set up my TV" icon="tv" onPress={() => router.push("/setup")} />
            <Text style={[type.small, { textAlign: "center" }]}>About 10 minutes · Nothing is uninstalled · Undo any time</Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: space(4) }}>
          <Text style={type.label}>Your TV</Text>
          <Text style={type.hero}>{session.tv?.name ?? "Your TV"}</Text>
          <View style={s.pills}>
            <Pill tone="ok" label={`${done.applied.disabled.length} apps turned off`} />
            {session.closed === "closed" ? <Pill tone="ok" label="Debugging closed" /> : null}
            {line ? <Pill tone={ent?.entitled ? "accent" : "neutral"} label={line} /> : null}
          </View>
        </View>
      )}

      <View style={{ gap: space(2), marginTop: space(4) }}>
        <Text style={[type.label, { marginLeft: space(1) }]}>{done ? "Your TV" : "Also in KanTV"}</Text>
        <View style={s.group}>
          <Row icon="sparkle" title="Design your home screen" detail="Describe the look you want; AI builds it" onPress={() => router.push("/design")} />
          <Row icon="remote" title="Remote" detail="D-pad, volume and typing from your phone" onPress={() => router.push("/remote")} />
          <Row icon="restore" title="Restore my TV" detail="Put everything back the way it was. Always free." onPress={() => router.push("/restore")} last />
        </View>
      </View>

      {!done && line ? <Text style={[type.small, { textAlign: "center" }]}>{line}</Text> : null}
      {auth.live ? (
        auth.signedIn ? (
          <Button kind="ghost" label={`Account · ${auth.email ?? ""}`} onPress={() => router.push("/account")} />
        ) : (
          <Button kind="ghost" label="Sign in" onPress={() => router.push("/signin")} />
        )
      ) : null}
      {!platform.designer.live && ent?.entitled && ent.plan === "trial" ? (
        <Button kind="ghost" label="Preview: end the free trial" onPress={() => (demoEndTrial(), void platform.designer.entitlement().then(setEnt))} />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: space(2), marginBottom: space(2) },
  brandMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  brandName: { ...type.heading, letterSpacing: -0.3 },
  tvFrame: { padding: 6, backgroundColor: color.tvBezel, borderRadius: 12, borderWidth: 1, borderColor: color.line },
  tvStand: { alignSelf: "center", width: "26%", height: 7, backgroundColor: color.tvBezel, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  pill: { paddingHorizontal: space(3), height: 28, borderRadius: radius.pill, justifyContent: "center" },
  group: { backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: color.line },
  row: { flexDirection: "row", alignItems: "center", gap: space(4), paddingHorizontal: space(4), paddingVertical: space(4), minHeight: 72 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },
});
