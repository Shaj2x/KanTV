// Home: set up a TV, or, once one is set up, the remote and Restore. Restore is always here and always free.
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "../src/session";
import { color, radius, space, type } from "../src/theme";
import { Icon, type IconName } from "../src/ui/Icon";
import { Button, Card, Screen } from "../src/ui/kit";

function Tile({ icon, title, detail, onPress, soon }: { icon: IconName; title: string; detail: string; onPress?: () => void; soon?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={soon} accessibilityRole="button" style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }, soon && { opacity: 0.6 }]}>
      <View style={s.tileIcon}>
        <Icon name={icon} tint={color.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        <Text style={type.small}>{detail}</Text>
      </View>
      {soon ? <Text style={s.soon}>Soon</Text> : <Icon name="chevron" tint={color.faint} size={18} />}
    </Pressable>
  );
}

export default function Home() {
  const { s: session } = useSession();
  const done = session.result;
  return (
    <Screen back={false}>
      <View style={{ gap: space(1), marginTop: space(2) }}>
        <Text style={[type.small, { color: color.accent, fontWeight: "700", letterSpacing: 1 }]}>KANTV</Text>
        <Text style={type.display}>{done ? session.tv?.name ?? "Your TV" : "Make your TV yours"}</Text>
        <Text style={[type.body, { color: color.muted }]}>
          {done
            ? `${done.applied.disabled.length} apps turned off${session.closed === "closed" ? " · debugging closed" : ""}`
            : "Turn off the ads and the junk, get a clean home screen, and control it all from this phone."}
        </Text>
      </View>

      {!done ? (
        <Card tone="accent" style={{ gap: space(4) }}>
          <Text style={type.title}>Set up your TV</Text>
          <Text style={type.body}>
            About 10 minutes, with your phone and your TV remote. Nothing is uninstalled, and one tap puts everything back.
          </Text>
          <Button label="Start" icon="tv" onPress={() => router.push("/setup")} />
        </Card>
      ) : null}

      <View style={{ gap: space(3) }}>
        <Tile icon="remote" title="Remote" detail="D-pad, volume and typing from your phone" onPress={() => router.push("/remote")} />
        <Tile icon="sparkle" title="Design your home screen" detail="Describe the look you want; AI builds it" soon />
        <Tile icon="restore" title="Restore my TV" detail="Put everything back the way it was. Always free." onPress={() => router.push("/restore")} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  tile: { flexDirection: "row", alignItems: "center", gap: space(4), backgroundColor: color.surface, borderRadius: radius.lg, padding: space(4) },
  tileIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },
  soon: { ...type.tiny, color: color.accent, fontWeight: "700", textTransform: "uppercase" },
});
