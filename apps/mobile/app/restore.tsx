// Restore: put the TV back exactly as it was before cleanup, from the restore point. Free forever, whatever
// the subscription says. It needs debugging on again for a few minutes; the user switches it back off after.
import { KNOWN_STOCK_LAUNCHERS, restoreCommands, type RecoveryRecord } from "@kantv/core";
import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { platform } from "../src/platform";
import { demoTapAllow } from "../src/platform/demo";
import { useSession } from "../src/session";
import { space, type } from "../src/theme";
import { Button, Card, Screen, Status } from "../src/ui/kit";
import { TvPicture } from "../src/ui/TvPicture";

type Stage = "intro" | "connect" | "prompt" | "restore" | "done" | "failed";

export default function Restore() {
  const { s: session, set } = useSession();
  const [stage, setStage] = useState<Stage>("intro");
  const [progress, setProgress] = useState({ i: 0, total: 0 });
  const record: RecoveryRecord | undefined = session.result?.record;

  if (!record || !session.tv) {
    return (
      <Screen title="Restore my TV" subtitle="Puts back everything KanTV turned off, and your TV's own home screen.">
        <Card>
          <Text style={type.body}>
            There's no restore point on this phone yet. It's made automatically before KanTV changes anything, and kept in your
            account too, so a new phone can restore an old cleanup.
          </Text>
        </Card>
        <Button label="Back" kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const start = async () => {
    setStage("connect");
    try {
      const connection = await platform.connect(session.tv!, { onAllowPrompt: () => setStage("prompt") });
      setStage("restore");
      const stock = Object.keys(record.packages).find((p) => (KNOWN_STOCK_LAUNCHERS as readonly string[]).includes(p));
      const commands = restoreCommands(record, session.list?.packages.map((p) => p.name) ?? [], stock);
      setProgress({ i: 0, total: commands.length });
      for (const [i, c] of commands.entries()) {
        const r = await connection.shell.run(c);
        if (!r.ok) throw new Error("the TV stopped answering");
        setProgress({ i: i + 1, total: commands.length });
      }
      set({ connection, closed: undefined });
      setStage("done");
    } catch {
      setStage("failed");
    }
  };

  const enabledAgain = Object.values(record.packages).filter((v) => v === "enabled").length;

  return (
    <Screen
      title={stage === "done" ? "Your TV is back to how it was" : "Restore my TV"}
      subtitle={
        stage === "done"
          ? "Everything KanTV turned off is on again, and the home screen is the one it had before."
          : `Turns ${enabledAgain} apps back on and puts back the home screen. Always free.`
      }
      footer={
        stage === "intro" ? <Button label="Start restore" icon="restore" onPress={start} /> :
        stage === "prompt" && platform.mode === "demo" ? <Button kind="secondary" label="Preview: tap Allow on the TV" onPress={demoTapAllow} /> :
        stage === "done" ? <Button label="Switch debugging off again" onPress={() => router.replace("/setup/finish")} /> :
        stage === "failed" ? <Button label="Try again" onPress={start} /> : undefined
      }
    >
      {stage === "intro" ? (
        <>
          <Text style={type.heading}>First, on the TV</Text>
          <TvPicture crumb="Developer options" items={[{ label: "USB debugging", toggle: true }, { label: "Wireless debugging", toggle: true }, { label: "Revoke USB debugging authorisations" }]} highlight={0} />
          <Text style={type.body}>Switch “USB debugging” back on (and Wireless or Network debugging, if your TV has it). Then tap Start.</Text>
        </>
      ) : null}
      {stage === "prompt" ? (
        <TvPicture dialog={{ title: "Allow USB debugging?", body: "The computer's RSA key fingerprint is: KanTV on this phone", check: "Always allow from this computer", buttons: ["Cancel", "Allow"] }} />
      ) : null}
      {stage !== "intro" ? (
        <Card>
          <Status state={stage === "connect" ? "doing" : "done"} label="Reach the TV" />
          <Status state={stage === "prompt" ? "doing" : stage === "connect" ? "todo" : "done"} label="Allow this phone on the TV" />
          <Status
            state={stage === "restore" ? "doing" : stage === "done" ? "done" : stage === "failed" ? "fail" : "todo"}
            label={progress.total ? `Put things back (${progress.i} of ${progress.total})` : "Put things back"}
            detail={stage === "failed" ? "The TV stopped answering. Check debugging is on and try again; nothing is lost." : undefined}
          />
        </Card>
      ) : null}
      {stage === "done" ? (
        <Text style={[type.small, { marginTop: space(1) }]}>
          Debugging is on again for the restore. Switch it off now so nothing on your Wi-Fi can reach the TV this way.
        </Text>
      ) : null}
    </Screen>
  );
}
