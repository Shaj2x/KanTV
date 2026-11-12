// Home: the TV, lit by its home screen; the one thing to do next; then the everyday actions as one group.
// Restore is always here and always free.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth";
import { platform, type Entitlement } from "../src/platform";
import { demoEndTrial } from "../src/platform/demo/designs";
import { useSession } from "../src/session";
import { color, space, type } from "../src/theme";
import { LitTv } from "../src/ui/ambient";
import { Button, Row, Screen, Section, Status, useWide } from "../src/ui/kit";

function trialLine(e: Entitlement | null): string | null {
  if (!e) return null;
  if (e.plan === "subscription") return "Subscribed";
  if (e.plan === "trial" && e.trialEndsAt) {
    const days = Math.max(1, Math.ceil((new Date(e.trialEndsAt).getTime() - Date.now()) / 86_400_000));
    return `Free trial, ${days} day${days === 1 ? "" : "s"} left`;
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
    <Screen back={false} brand>
      {!wide ? <LitTv style={{ marginTop: space(4), marginBottom: space(6) }} /> : null}

      {!done ? (
        <View style={{ gap: space(6) }}>
          <View style={{ gap: space(3) }}>
            <Text style={[type.hero, { textWrap: "balance" } as object]} accessibilityRole="header">
              Take back your TV
            </Text>
            <Text style={[type.body, { color: color.muted }]}>
              Turn off the ads and the bloat, put a home screen you designed on it, and run it all from this phone.
            </Text>
          </View>
          <View style={{ gap: space(3) }}>
            <Button label="Set up my TV" onPress={() => router.push("/setup")} />
            <Text style={[type.small, { textAlign: "center" }]}>Takes about 10 minutes. Nothing is uninstalled, and Restore undoes it all.</Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: space(4) }}>
          <Text style={type.hero} accessibilityRole="header">
            {session.tv?.name ?? "Your TV"}
          </Text>
          <View style={s.facts}>
            <Status state="done" label={`${done.applied.disabled.length} apps turned off`} />
            {session.closed === "closed" ? <Status state="done" label="Debugging switched off again" /> : null}
            {line ? <Status state={ent?.entitled ? "done" : "warn"} label={line} /> : null}
          </View>
        </View>
      )}

      <View style={{ marginTop: space(6) }}>
        <Section title={done ? "Your TV" : "Also in KanTV"}>
          <Row icon="sparkle" title="Design your home screen" detail="Describe a look; AI builds it for your TV" onPress={() => router.push("/design")} />
          <Row icon="remote" title="Remote" detail="Arrows, volume and typing from your phone" onPress={() => router.push("/remote")} />
          <Row icon="restore" title="Restore my TV" detail="Put everything back the way it was. Always free." onPress={() => router.push("/restore")} last />
        </Section>
      </View>

      {!done && line ? <Text style={[type.small, { textAlign: "center" }]}>{line}</Text> : null}
      {auth.live ? (
        auth.signedIn ? (
          <Button kind="ghost" label={`Account: ${auth.email ?? ""}`} onPress={() => router.push("/account")} />
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
  facts: { gap: space(1) },
});
