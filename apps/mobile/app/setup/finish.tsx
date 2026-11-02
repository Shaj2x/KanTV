// Step 5: close network ADB, as upstream recommends, and prove it: only the TV refusing the connection counts.
// Then what the shell cannot do, which the user does on the TV: revoke the debugging authorisation.
import { switchDebuggingOff, verifyAdbClosed } from "@kantv/core";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { platform } from "../../src/platform";
import { useSession } from "../../src/session";
import { space, type } from "../../src/theme";
import { Button, Card, Screen, Status } from "../../src/ui/kit";
import { TvPicture } from "../../src/ui/TvPicture";

export default function Finish() {
  const { s: session, set } = useSession();
  const [stage, setStage] = useState<"off" | "check" | "done">("off");
  const [verdict, setVerdict] = useState<"closed" | "open" | "unknown" | null>(null);
  const started = useRef(false);
  const insecure = session.identity && (session.identity.adbSecure === "0" || session.identity.adbSecure === "");

  const check = async () => {
    setStage("check");
    const ports = [5555, ...(session.tv?.wirelessPort ? [session.tv.wirelessPort] : [])];
    const r = await verifyAdbClosed(platform.prober, session.tv!.host, ports);
    setVerdict(r.verdict);
    set({ closed: r.verdict });
    setStage("done");
  };

  useEffect(() => {
    if (started.current || !session.connection) return;
    started.current = true;
    (async () => {
      await switchDebuggingOff(session.connection!.shell);
      session.connection!.close();
      await check();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen
      step="Step 5 of 5"
      title={verdict === "closed" ? "All done, and locked up" : "Closing the door behind us"}
      subtitle={
        verdict === "closed"
          ? "Debugging is off, so nothing on your network can reach the TV this way any more."
          : "Debugging lets anything on your Wi-Fi control the TV, so we switch it off now."
      }
      back={false}
      footer={stage === "done" ? <Button label="Go to my TV" onPress={() => router.replace("/")} /> : undefined}
    >
      <Card>
        <Status state={stage === "off" ? "doing" : "done"} label="Switch debugging off" />
        <Status
          state={stage === "check" ? "doing" : verdict === "closed" ? "done" : verdict ? "warn" : "todo"}
          label="Check that it's really off"
          detail={verdict === "open" ? "The TV still answers. Switch debugging off on the TV, then check again." : verdict === "unknown" ? "The TV didn't answer the check (asleep or restarting?). Wake it and check again." : undefined}
        />
      </Card>
      {verdict && verdict !== "closed" ? <Button kind="secondary" label="Check again" onPress={check} /> : null}

      {stage === "done" ? (
        <>
          <Text style={type.title}>One last thing on the TV</Text>
          <TvPicture
            crumb="Developer options"
            items={[{ label: "USB debugging", toggle: false }, { label: "Wireless debugging", toggle: false }, { label: "Revoke USB debugging authorisations" }]}
            highlight={2}
          />
          <Text style={type.body}>
            In Developer options, choose “Revoke USB debugging authorisations”. It makes the TV forget this phone; you'll tap Allow
            again if you ever use Restore.
          </Text>
          <Text style={[type.small, { marginTop: space(1) }]}>
            Turning the TV off and on once is a good idea too. Your new settings stay.
          </Text>
        </>
      ) : null}
      {insecure ? (
        <Card tone="danger">
          <Text style={type.heading}>Your TV skips the Allow question</Text>
          <Text style={type.small}>
            This TV lets any device on your Wi-Fi in without asking while debugging is on. Make sure debugging stays off.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
