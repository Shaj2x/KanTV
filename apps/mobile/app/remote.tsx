// The phone remote: d-pad, OK, Back, Home, volume, power and typing. Over Google's Android TV Remote
// protocol, which keeps working after debugging is switched off; pairing asks for the code the TV shows.
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { platform, type RemoteKeys } from "../src/platform";
import { demoRemoteLog } from "../src/platform/demo";
import { useSession } from "../src/session";
import { color, radius, space, type } from "../src/theme";
import { Icon, type IconName } from "../src/ui/Icon";
import { Button, Card, Screen } from "../src/ui/kit";

type Key = Parameters<RemoteKeys["key"]>[0];

function Round({ icon, label, onPress, size = 64 }: { icon: IconName; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.round, { width: size, height: size, borderRadius: size / 2 }, pressed && s.pressed]}>
      <Icon name={icon} size={24} />
    </Pressable>
  );
}

export default function Remote() {
  const { s: session } = useSession();
  const [remote, setRemote] = useState<RemoteKeys | null>(null);
  const [codeAsked, setCodeAsked] = useState<((c: string) => void) | null>(null);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current || !session.tv) return;
    opened.current = true;
    platform.remote(session.tv, () => new Promise((resolve) => setCodeAsked(() => resolve))).then(setRemote);
    return () => remote?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tv]);

  if (!session.tv) {
    return (
      <Screen title="Remote" subtitle="Set up a TV first, and this phone becomes its remote.">
        <Button label="Set up my TV" onPress={() => router.replace("/setup")} />
      </Screen>
    );
  }

  const press = (k: Key) => {
    void remote?.key(k);
    setLast(platform.mode === "demo" ? demoRemoteLog[0] ?? k : k);
  };

  if (codeAsked) {
    return (
      <Screen title="Enter the code on your TV" subtitle="Your TV is showing a 6-character code. It's letters A–F and numbers.">
        <TextInput value={code} onChangeText={(c) => setCode(c.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6))} autoCapitalize="characters" autoCorrect={false} style={s.code} placeholder="A1B2C3" placeholderTextColor={color.faint} />
        <Button label="Pair" disabled={code.length !== 6} onPress={() => (codeAsked(code), setCodeAsked(null))} />
      </Screen>
    );
  }

  return (
    <Screen title={session.tv.name} subtitle={remote ? undefined : "Connecting to the remote…"}>
      <View style={s.pad}>
        <Pressable onPress={() => press("UP")} accessibilityLabel="Up" style={[s.arrow, s.up]}>
          <Icon name="up" size={30} />
        </Pressable>
        <Pressable onPress={() => press("LEFT")} accessibilityLabel="Left" style={[s.arrow, s.left]}>
          <Icon name="left" size={30} />
        </Pressable>
        <Pressable onPress={() => press("OK")} accessibilityLabel="OK" style={({ pressed }) => [s.ok, pressed && s.pressed]}>
          <Text style={s.okText}>OK</Text>
        </Pressable>
        <Pressable onPress={() => press("RIGHT")} accessibilityLabel="Right" style={[s.arrow, s.right]}>
          <Icon name="right" size={30} />
        </Pressable>
        <Pressable onPress={() => press("DOWN")} accessibilityLabel="Down" style={[s.arrow, s.down]}>
          <Icon name="down" size={30} />
        </Pressable>
      </View>

      <View style={s.row}>
        <Round icon="back" label="Back" onPress={() => press("BACK")} />
        <Round icon="home" label="Home" onPress={() => press("HOME")} />
        <Round icon="power" label="Power" onPress={() => press("POWER")} />
      </View>
      <View style={s.row}>
        <Round icon="volDown" label="Volume down" onPress={() => press("VOLUME_DOWN")} />
        <Round icon="mute" label="Mute" onPress={() => press("MUTE")} />
        <Round icon="volUp" label="Volume up" onPress={() => press("VOLUME_UP")} />
      </View>

      <Card style={{ gap: space(3) }}>
        <Text style={type.heading}>Type on the TV</Text>
        <View style={{ flexDirection: "row", gap: space(2) }}>
          <TextInput value={text} onChangeText={setText} placeholder="Search, passwords…" placeholderTextColor={color.faint} style={[s.input, { flex: 1 }]} onSubmitEditing={() => text && (void remote?.text(text), setLast(`“${text}”`), setText(""))} />
          <Button label="Send" kind="secondary" disabled={!text} onPress={() => (void remote?.text(text), setLast(`“${text}”`), setText(""))} />
        </View>
        <Text style={type.tiny}>Works when a text box is open on the TV.</Text>
      </Card>
      {platform.mode === "demo" && last ? <Text style={[type.tiny, { textAlign: "center" }]}>Preview: would send {last}</Text> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  pad: { width: 248, height: 248, alignSelf: "center", borderRadius: 124, backgroundColor: color.surface, marginTop: space(2) },
  arrow: { position: "absolute", width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  up: { top: 4, left: 88 },
  down: { bottom: 4, left: 88 },
  left: { left: 4, top: 88 },
  right: { right: 4, top: 88 },
  ok: { position: "absolute", top: 74, left: 74, width: 100, height: 100, borderRadius: 50, backgroundColor: color.surfaceRaised, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.line },
  okText: { ...type.heading, fontSize: 20 },
  pressed: { backgroundColor: color.accentSoft },
  row: { flexDirection: "row", justifyContent: "space-evenly" },
  round: { backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  input: { minWidth: 0, backgroundColor: color.bg, color: color.text, borderRadius: radius.sm, borderWidth: 1, borderColor: color.line, paddingHorizontal: space(3), height: 54, fontSize: 16 },
  code: { backgroundColor: color.surface, color: color.text, borderRadius: radius.md, height: 72, fontSize: 34, letterSpacing: 10, textAlign: "center", fontWeight: "700" },
});
