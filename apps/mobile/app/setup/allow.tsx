// Step 2b: connect, and walk the user through the "Allow USB debugging?" prompt on the TV. Then read who the
// TV is, so the next screen can offer its tested list.
import { AdbError, householdIds, readIdentity } from "@kantv/core";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { platform } from "../../src/platform";
import { demoTapAllow } from "../../src/platform/demo";
import { useSession } from "../../src/session";
import { color, space, type } from "../../src/theme";
import { Button, Card, Screen, Status } from "../../src/ui/kit";
import { TvPicture } from "../../src/ui/TvPicture";

type Phase = "connecting" | "prompt" | "reading" | "failed";

const FAILURE: Record<string, { title: string; body: string }> = {
  "auth-timeout": { title: "Nobody allowed it on the TV", body: "The question on the TV timed out. Try again and choose Allow on the TV when it appears." },
  "auth-rejected": { title: "The TV said no", body: "“Deny” was chosen, or this phone was removed from the TV's list. Try again and choose Allow." },
  closed: { title: "The TV didn't answer", body: "Check that USB debugging is on, that the TV is awake, and that both are on the same Wi-Fi." },
  "tls-required": { title: "This TV needs a pairing code", body: "Open Developer options → Wireless debugging → Pair device with pairing code on the TV, then try again." },
  protocol: { title: "The TV answered something unexpected", body: "Restart the TV and try again. If it keeps happening, tell us your TV model." },
};

export default function Allow() {
  const { s: session, set } = useSession();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string>("closed");
  const started = useRef(false);

  const run = useCallback(async () => {
    if (!session.tv) return router.replace("/setup/find");
    setPhase("connecting");
    try {
      const connection = await platform.connect(session.tv, { onAllowPrompt: () => setPhase("prompt") });
      setPhase("reading");
      const identity = await readIdentity(connection.shell);
      const [household, feed] = await Promise.all([householdIds(identity), platform.feed()]);
      set({ connection, identity, household, feed });
      // Registering decides the free trial. Cleanup and Restore are free, so setup never waits on it: offline,
      // it is tried again when the person first designs.
      const model = [identity.props.manufacturer, identity.props.model].filter(Boolean).join(" ");
      const reg = await platform.account.registerTv({ serial: household.serial, androidId: household.androidId }, model);
      if (reg !== "offline") set({ householdId: reg.household, trial: reg.trial });
      router.replace("/setup/model");
    } catch (e) {
      setError(e instanceof AdbError ? e.kind : "closed");
      setPhase("failed");
    }
  }, [session.tv, set]);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void run();
    }
  }, [run]);

  if (phase === "failed") {
    const f = FAILURE[error] ?? FAILURE.closed!;
    return (
      <Screen step="Step 2 of 5" title={f.title} subtitle={f.body} footer={<Button label="Try again" onPress={run} />}>
        <Button kind="ghost" label="Back to the setup steps" onPress={() => router.replace("/setup")} />
      </Screen>
    );
  }

  return (
    <Screen
      step="Step 2 of 5"
      title={phase === "prompt" ? "Look at your TV" : phase === "reading" ? "Connected" : "Connecting to your TV"}
      subtitle={
        phase === "prompt"
          ? "It's asking whether to allow this phone. Tick “Always allow from this computer”, then choose Allow."
          : phase === "reading"
            ? "Finding out which TV this is…"
            : `Reaching ${session.tv?.name ?? "the TV"}…`
      }
      footer={
        phase === "prompt" && platform.mode === "demo" ? (
          <Button kind="secondary" label="Preview: tap Allow on the TV" onPress={demoTapAllow} />
        ) : undefined
      }
    >
      <TvPicture
        dialog={
          phase === "prompt"
            ? { title: "Allow USB debugging?", body: "The computer's RSA key fingerprint is: KanTV on this phone", check: "Always allow from this computer", buttons: ["Cancel", "Allow"] }
            : undefined
        }
        items={phase === "prompt" ? undefined : [{ label: "Home" }, { label: "Apps" }, { label: "Settings" }]}
      />
      <Card>
        <Status state={phase === "connecting" ? "doing" : "done"} label="Reach the TV" />
        <Status state={phase === "prompt" ? "doing" : phase === "reading" ? "done" : "todo"} label="Allow this phone on the TV" detail={phase === "prompt" ? "Waiting for you to choose Allow" : undefined} />
        <Status state={phase === "reading" ? "doing" : "todo"} label="Identify the TV" />
      </Card>
      {phase === "prompt" ? (
        <View style={{ gap: space(1) }}>
          <Text style={[type.small, { color: color.text }]}>Don't see anything? Wake the TV with the remote; the question sometimes waits behind the screensaver.</Text>
        </View>
      ) : null}
    </Screen>
  );
}
