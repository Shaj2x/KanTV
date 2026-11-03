// The design studio: describe the look, see it on a TV-shaped preview, try another take, put it on the TV.
// Designs come from the AI designer on KanTV's server; after the free week this sends people to the paywall.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COMMON_APPS } from "../../src/apps";
import { platform, type Design, type DesignFailure, type Entitlement } from "../../src/platform";
import { useSession } from "../../src/session";
import { color, radius, space, type } from "../../src/theme";
import { Button, Card, CheckRow, Screen } from "../../src/ui/kit";
import { ThemePreview } from "../../src/ui/ThemePreview";

const IDEAS = ["Dark and minimal, big clock, Netflix and YouTube in the dock, warm colours", "Like a cosy cabin in the woods", "A home cinema feel", "Calm and simple for my parents", "Neon and playful"];

const FAILURE: Record<Exclude<DesignFailure, "subscription-required">, string> = {
  "daily-limit": "That's a lot of designs for one day. Try again tomorrow, or pick one from My designs.",
  "too-fast": "One moment, the last design is still settling. Try again in a few seconds.",
  busy: "The designer is very busy right now. Try again in a little while.",
  "design-refused": "The designer couldn't make that one. Try describing the look differently.",
  "design-invalid": "That design didn't come out right. Try again, maybe with a few more details.",
  "design-truncated": "That design didn't come out right. Try again.",
  offline: "Couldn't reach KanTV. Check your internet connection and try again.",
};

export default function DesignStudio() {
  const { s: session } = useSession();
  const apps = session.installedApps?.length ? session.installedApps : COMMON_APPS;
  const [request, setRequest] = useState("");
  const [exact, setExact] = useState(false);
  const [busy, setBusy] = useState<"design" | "again" | "apply" | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [ent, setEnt] = useState<Entitlement | null>(null);
  useFocusEffect(
    useCallback(() => {
      void platform.designer.entitlement().then(setEnt);
    }, []),
  );

  const handle = (r: Design | DesignFailure) => {
    if (typeof r !== "string") return setDesign(r);
    if (r === "subscription-required") return router.push("/paywall");
    setError(FAILURE[r]);
  };
  const go = async () => {
    setBusy("design");
    setError(null);
    setApplied(null);
    handle(await platform.designer.design(request, apps, exact));
    setBusy(null);
  };
  const again = async () => {
    if (!design) return;
    setBusy("again");
    setError(null);
    setApplied(null);
    handle(await platform.designer.regenerate(design.id, apps));
    setBusy(null);
  };
  const apply = async () => {
    if (!design) return;
    setBusy("apply");
    if (!session.householdId) return setError("Set up your TV first, so KanTV knows which TV to put it on.");
    const r = await platform.designer.apply(design.id, session.householdId, "launcher");
    setBusy(null);
    if (r === "subscription-required") return router.push("/paywall");
    if (typeof r === "string") return setError(FAILURE[r]);
    setApplied(Object.keys(r.config).length);
  };

  return (
    <Screen title="Design your home screen" subtitle="Describe it the way you'd tell a friend: colours, mood, the clock, which apps go up front.">
      {ent && !ent.entitled ? (
        <Card tone="accent" style={{ gap: space(3) }}>
          <Text style={type.heading}>Your free week is over</Text>
          <Text style={type.small}>Your designs are saved. Subscribe to make new ones and put them back on your TV.</Text>
          <Button label="See plans" onPress={() => router.push("/paywall")} />
        </Card>
      ) : null}
      <TextInput
        value={request}
        onChangeText={(t) => setRequest(t.slice(0, 500))}
        placeholder="Dark and minimal, a big clock, Netflix first…"
        placeholderTextColor={color.faint}
        multiline
        style={s.input}
        accessibilityLabel="Describe your home screen"
      />
      <View style={s.ideas}>
        {IDEAS.map((idea) => (
          <Pressable key={idea} onPress={() => setRequest(idea)} style={s.idea} accessibilityRole="button">
            <Text style={[type.small, { color: color.text }]} numberOfLines={1}>
              {idea}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.lg }}>
        <CheckRow checked={exact} onToggle={() => setExact(!exact)} title="Exactly as I describe" note="Off: KanTV adds its own ideas and never repeats a recent design." />
      </View>
      <Button label={design ? "Design a new one" : "Design it"} icon="sparkle" busy={busy === "design"} disabled={!request.trim() || !!busy} onPress={go} />
      {error ? (
        <Card tone="warn">
          <Text style={type.small}>{error}</Text>
        </Card>
      ) : null}

      {design ? (
        <View style={{ gap: space(3) }}>
          <ThemePreview spec={design.spec} />
          <Text style={type.title}>{design.name}</Text>
          <Text style={type.small}>{design.summary}</Text>
          {design.fixes.length ? <Text style={type.tiny}>Adjusted for your TV: {design.fixes.join("; ").toLowerCase()}.</Text> : null}
          {!platform.designer.live ? <Text style={[type.tiny, { color: color.accent }]}>Preview: a sample design. Real designs are made by the AI designer on KanTV's server.</Text> : null}
          <Button label="Put it on my TV" busy={busy === "apply"} disabled={!!busy} onPress={apply} />
          <Button kind="secondary" label="Try another take" busy={busy === "again"} disabled={!!busy} onPress={again} />
          {applied !== null ? (
            <Card tone="ok">
              <Text style={type.small}>
                {platform.mode === "demo"
                  ? `Preview: ${applied} settings for this design are ready to send to the KanTV home screen on your TV, once it's installed.`
                  : "Sent to your TV. It changes the next time you press Home."}
              </Text>
            </Card>
          ) : null}
        </View>
      ) : null}
      <Button kind="ghost" label="My designs" onPress={() => router.push("/design/saved")} />
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { minHeight: 110, backgroundColor: color.surface, color: color.text, borderRadius: radius.lg, padding: space(4), fontSize: 17, lineHeight: 24, textAlignVertical: "top" },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  idea: { backgroundColor: color.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2), maxWidth: "100%" },
});
