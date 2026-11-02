// Step 4b: the cleanup itself. Restore point first (the run stops if it cannot be saved), one app at a time,
// then the TV is read back and given time to write its changes before anything restarts it.
import { runDebloat } from "@kantv/core";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { friendlyName } from "../../src/labels";
import { platform } from "../../src/platform";
import { useSession } from "../../src/session";
import { color, radius, space, type } from "../../src/theme";
import { Button, Card, Screen, Status } from "../../src/ui/kit";

type Stage = "record" | "disable" | "verify" | "settle" | "done" | "failed";
const order: Stage[] = ["record", "disable", "verify", "settle", "done"];

export default function Run() {
  const { s: session, set } = useSession();
  const [stage, setStage] = useState<Stage>("record");
  const [progress, setProgress] = useState({ i: 0, total: 0, name: "" });
  const [failure, setFailure] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !session.connection || !session.choice || !session.model || !session.household) return;
    started.current = true;
    const tvId = session.household.serial ?? session.household.androidId ?? session.tv!.id;
    (async () => {
      try {
        const result = await runDebloat(session.connection!.shell, platform.records, {
          tvId,
          listId: session.list!.id,
          packages: session.choice!.packages,
          onProgress: (name, i, total) => {
            setStage("disable");
            setProgress({ i, total, name });
          },
        });
        if (!result.ok) throw new Error("the list was refused");
        setStage("verify");
        await new Promise((r) => setTimeout(r, 400));
        setStage("settle");
        await new Promise((r) => setTimeout(r, platform.settleDelayMs));
        set({ result });
        setStage("done");
      } catch (e) {
        setFailure(String((e as Error).message ?? e));
        setStage("failed");
      }
    })();
  }, [session, set]);

  const at = order.indexOf(stage);
  const st = (s: Stage) => (stage === "failed" ? "todo" : order.indexOf(s) < at ? "done" : order.indexOf(s) === at ? "doing" : "todo");
  const r = session.result?.applied;

  if (stage === "failed") {
    return (
      <Screen step="Step 4 of 5" title="Setup stopped" subtitle="Nothing more was changed. Anything already turned off can be put back with Restore." footer={<Button label="Restore my TV" onPress={() => router.replace("/restore")} />}>
        <Card tone="danger">
          <Text style={type.small}>{failure}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      step="Step 4 of 5"
      title={stage === "done" ? "Your TV is cleaned up" : "Cleaning up"}
      subtitle={stage === "done" ? undefined : "Keep the TV on. This takes a minute or two."}
      back={false}
      footer={stage === "done" ? <Button label="Finish setup" onPress={() => router.push("/setup/finish")} /> : undefined}
    >
      <Card>
        <Status state={st("record")} label="Save a restore point" detail="So one tap can put everything back" />
        <Status
          state={st("disable")}
          label={progress.total ? `Turn off apps (${Math.min(progress.i + 1, progress.total)} of ${progress.total})` : "Turn off apps"}
          detail={stage === "disable" ? friendlyName(progress.name, session.list?.packages.find((p) => p.name === progress.name)?.comment ?? "") : undefined}
        />
        <Status state={st("verify")} label="Check the TV took every change" />
        <Status state={st("settle")} label="Let the TV save its changes" />
      </Card>
      {stage === "disable" && progress.total ? (
        <View style={{ height: 8, backgroundColor: color.surface, borderRadius: radius.pill, overflow: "hidden" }}>
          <View style={{ width: `${((progress.i + 1) / progress.total) * 100}%`, height: "100%", backgroundColor: color.accent }} />
        </View>
      ) : null}
      {stage === "done" && r ? (
        <>
          <Card tone="ok">
            <Text style={type.title}>{r.disabled.length} apps turned off</Text>
            <Text style={type.small}>Saved a restore point for this TV.</Text>
          </Card>
          {r.stillOn.length ? (
            <Card tone="warn">
              <Text style={type.heading}>The TV refused {r.stillOn.length}</Text>
              <Text style={type.small}>{r.stillOn.map((n) => friendlyName(n, "")).join(", ")}. Some TVs protect a few apps; that's the TV, not a failed setup.</Text>
            </Card>
          ) : null}
          {r.unverified ? (
            <Card tone="warn">
              <Text style={type.small}>We couldn't read the TV back to confirm every change. It's worth opening an HDMI input and Settings once to check.</Text>
            </Card>
          ) : null}
          {session.choice?.launcher !== "none" ? (
            <Card>
              <Text style={type.heading}>Your new home screen comes next</Text>
              <Text style={type.small}>The KanTV home screen arrives with the next app update. Your TV keeps its own until then.</Text>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
