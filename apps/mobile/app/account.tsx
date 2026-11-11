// The account: who is signed in, the plan, a copy of everything KanTV holds, sign-out, and deleting the
// account (the app stores require deletion inside the app).
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Share, Text, View } from "react-native";
import { signOut, useAuth, useRequireSignIn } from "../src/auth";
import { platform, type Entitlement } from "../src/platform";
import { color, space, type } from "../src/theme";
import { Button, Card, Screen } from "../src/ui/kit";

/** A titled group of cards and buttons, spaced apart (the kit's Section joins rows into one list). */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space(3), marginTop: space(2) }}>
      <Text style={[type.small, { color: color.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 }]}>{title}</Text>
      {hint ? <Text style={type.small}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function planLine(e: Entitlement | null) {
  if (!e) return "…";
  if (e.plan === "subscription") return "KanTV subscription";
  if (e.plan === "trial") return `Free trial, until ${new Date(e.trialEndsAt!).toLocaleDateString()}`;
  return "No subscription. Cleanup, the remote and Restore stay free.";
}

export default function Account() {
  const ok = useRequireSignIn("/account");
  const { email } = useAuth();
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (ok) void platform.designer.entitlement().then(setEnt);
    }, [ok]),
  );

  const exportData = async () => {
    const data = await platform.account.exportData();
    if (data === "offline") return setNote("Can't reach KanTV right now.");
    await Share.share({ message: JSON.stringify(data, null, 2) }).catch(() => setNote("Couldn't open sharing."));
  };

  const remove = async () => {
    setBusy(true);
    const done = await platform.account.deleteAccount();
    setBusy(false);
    if (!done) return setNote("Couldn't delete the account. Try again, or email support.");
    await signOut(true); // the sign-in gate then takes this screen home
  };

  return (
    <Screen title="Account" subtitle={email ?? undefined}>
      <Group title="Plan">
        <Card>
          <Text style={type.body}>{planLine(ent)}</Text>
        </Card>
        {ent && ent.plan !== "subscription" ? <Button kind="secondary" label="See plans" onPress={() => router.push("/paywall")} /> : null}
      </Group>
      <Group title="Your data">
        <Button kind="secondary" label="Get a copy of my data" onPress={exportData} />
        <Button kind="secondary" label="Sign out" onPress={() => void signOut()} />
      </Group>
      <Group title="Delete account" hint="Deletes your account and saved designs. A subscription bought in the App Store or Google Play is cancelled there, not here.">
        {confirm ? (
          <Card tone="danger">
            <Text style={[type.body, { marginBottom: space(3) }]}>Delete your KanTV account and every saved design? This can't be undone. Your TV keeps working, and Restore still works.</Text>
            <Button kind="danger" label="Yes, delete everything" onPress={remove} busy={busy} />
            <Button kind="ghost" label="Keep my account" onPress={() => setConfirm(false)} />
          </Card>
        ) : (
          <Button kind="danger" label="Delete my account" onPress={() => setConfirm(true)} />
        )}
      </Group>
      {note ? <Text style={[type.small, { color: color.danger }]}>{note}</Text> : null}
    </Screen>
  );
}
