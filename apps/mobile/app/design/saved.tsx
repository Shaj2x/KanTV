// Every design the person has made. After the free week they stay here, marked locked, and come back the
// moment they subscribe.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRequireSignIn } from "../../src/auth";
import { platform, type Design } from "../../src/platform";
import { color, radius, space, type } from "../../src/theme";
import { Button, Card, Screen } from "../../src/ui/kit";
import { ThemePreview } from "../../src/ui/ThemePreview";

export default function Saved() {
  const ok = useRequireSignIn("/design/saved");
  const [designs, setDesigns] = useState<Design[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (ok) void platform.designer.list().then(setDesigns);
    }, [ok]),
  );
  const locked = designs?.some((d) => d.locked);

  return (
    <Screen title="My designs" subtitle={designs?.length ? `${designs.length} saved` : undefined}>
      {locked ? (
        <Card tone="accent" style={{ gap: space(3) }}>
          <Text style={type.heading}>Your designs are safe</Text>
          <Text style={type.small}>Your free week is over, so they're paused. Subscribe and any of them goes straight back on your TV.</Text>
          <Button label="See plans" onPress={() => router.push("/paywall")} />
        </Card>
      ) : null}
      {designs && !designs.length ? (
        <Card>
          <Text style={type.body}>Nothing yet. Describe a look and it's saved here.</Text>
          <Button label="Design one" onPress={() => router.replace("/design")} />
        </Card>
      ) : null}
      {designs?.map((d) => (
        <Pressable key={d.id} onPress={() => (d.locked ? router.push("/paywall") : undefined)} style={{ gap: space(2), opacity: d.locked ? 0.6 : 1 }} accessibilityRole="button">
          <ThemePreview spec={d.spec} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={type.heading}>{d.name}</Text>
            {d.locked ? <Text style={{ ...type.tiny, color: color.warn, backgroundColor: color.warnSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>Paused</Text> : null}
          </View>
          <Text style={type.small}>“{d.request}”</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
