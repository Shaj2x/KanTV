// Home: the TV, lit by its home screen; the one thing to do next; then the everyday actions as one group.
// Restore is always here and always free.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth";
import { platform, type Entitlement } from "../src/platform";
import { demoEndTrial } from "../src/platform/demo/designs";
import { useSession } from "../src/session";
import { space, tt, type } from "../src/theme";
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
    <Screen
      back={false}
      hero={!wide ? <LitTv style={{ marginTop: space(3), marginBottom: space(7) }} /> : undefined}
      title={done ? session.tv?.name ?? "Your TV" : "Take back your TV"}
      subtitle={done ? undefined : "Turn off the ads and the bloat, put a home screen you designed on it, and run it all from this phone."}
    >
      {!done ? (
        <View style={{ gap: space(3) }}>
          <Button label="Set up my TV" onPress={() => router.push("/setup")} />
          <Text style={type.small}>Takes about 10 minutes. Nothing is uninstalled, and Restore undoes it all.</Text>
        </View>
      ) : (
        <View style={s.facts}>
          <Status state="done" label={`${done.applied.disabled.length} apps turned off`} />
          {session.closed === "closed" ? <Status state="done" label="Debugging switched off again" /> : null}
          {line ? <Status state={ent?.entitled ? "done" : "warn"} label={line} /> : null}
        </View>
      )}

      <View style={{ marginTop: space(4) }}>
        <Section title="INDEX">
          {done ? null : <Row title="Set up my TV" page={200} tone={tt.cyan} detail="Clean it up, step by step" onPress={() => router.push("/setup")} />}
          <Row title="Design" page={300} tone={tt.magenta} detail="Describe a look; AI builds your TV's home screen" onPress={() => router.push("/design")} />
          <Row title="Remote" page={400} tone={tt.blue} detail="Arrows, volume and typing from your phone" onPress={() => router.push("/remote")} />
          <Row title="Restore my TV" page={500} tone={tt.green} detail="Put everything back the way it was. Always free." onPress={() => router.push("/restore")} last />
        </Section>
      </View>

      {!done && line ? <Text style={type.small}>{line}</Text> : null}
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
