// After the free week: designing, saved designs and the custom look on the TV need a subscription. Monthly is
// the default choice, yearly is offered next to it. Restore my TV never asks for a subscription.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRequireSignIn } from "../src/auth";
import { success } from "../src/feedback";
import { platform, type Entitlement, type Plan } from "../src/platform";
import { color, space, type } from "../src/theme";
import { Button, Card, Choice, Screen, Status } from "../src/ui/kit";

export default function Paywall() {
  const ok = useRequireSignIn("/paywall");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pick, setPick] = useState<Plan["id"]>("monthly");
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void platform.purchases.plans().then(setPlans);
    if (ok) void platform.designer.entitlement().then(setEnt);
  }, [ok]);

  const buy = async () => {
    setBusy(true);
    const r = await platform.purchases.buy(pick);
    setBusy(false);
    if (r === "bought") {
      success();
      router.back();
    }
    else if (r === "failed") setNote("The purchase didn't go through. Nothing was charged.");
  };
  const restore = async () => setNote((await platform.purchases.restore()) ? "Restored. Welcome back." : "No subscription found for this account.");

  const ended = ent?.plan === "none";
  return (
    <Screen
      title={ended ? "Keep your TV looking yours" : "Unlock KanTV"}
      subtitle={
        ended
          ? "Your free week is over. Your TV is back on the KanTV default look, and every design you made is saved. Subscribe and it comes straight back."
          : "Design as many looks as you like and keep them on your TV."
      }
      footer={
        <>
          <Button label={`Subscribe ${pick === "monthly" ? "monthly" : "yearly"}`} busy={busy} onPress={buy} />
          <Button kind="ghost" label="Restore purchases" onPress={restore} />
          <Text style={[type.tiny, { textAlign: "center" }]}>
            Restore my TV is always free.{platform.mode === "demo" ? " Preview: example prices, nothing is charged." : ""}
          </Text>
        </>
      }
    >
      <Card>
        <Status state="done" label="Design your home screen with AI, as often as you like" />
        <Status state="done" label="Keep every design and switch between them" />
        <Status state="done" label="Your custom look stays on the TV" />
      </Card>
      {plans.map((p) => (
        <Choice
          key={p.id}
          selected={pick === p.id}
          onPress={() => setPick(p.id)}
          title={`${p.id === "monthly" ? "Monthly" : "Yearly"}, ${p.price}`}
          detail={p.id === "yearly" ? `Works out at ${p.perMonth} a month.${p.note ? ` ${p.note}.` : ""}` : "Cancel any time."}
        />
      ))}
      {note ? <Text style={[type.small, { color: color.text }]}>{note}</Text> : null}
      <View style={{ gap: space(1) }}>
        <Text style={type.tiny}>Renews automatically until cancelled in your App Store or Google Play settings.</Text>
      </View>
    </Screen>
  );
}
