// The phone remote: d-pad, OK, Back, Home, volume, power and typing. Over Google's Android TV Remote
// protocol, which keeps working after debugging is switched off; pairing asks for the code the TV shows.
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { platform, type RemoteKeys } from "../src/platform";
import { demoRemoteLog } from "../src/platform/demo";
import { useSession } from "../src/session";
import { color, radius, space, tt, type } from "../src/theme";
import { Icon, type IconName } from "../src/ui/Icon";
import { Button, Screen, Section } from "../src/ui/kit";
import { Press } from "../src/ui/Press";
import { tick } from "../src/motion";

type Key = Parameters<RemoteKeys["key"]>[0];

function Key({ icon, label, onPress, size = 60, tint }: { icon: IconName; label: string; onPress: () => void; size?: number; tint?: string }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [s.key, { width: size, height: size, borderRadius: 3 }, pressed && s.keyOn]}>
      <Icon name={icon} size={size > 50 ? 22 : 18} tint={tint} />
    </Press>
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
    tick();
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
    <Screen title={session.tv.name} subtitle={remote ? "Connected. Point it anywhere: it works over Wi-Fi." : "Connecting to the remote…"}>
      {/* Shaped like the remote in your hand: power at the top, the ring in the middle, volume below. */}
      <View style={s.body}>
        <View style={s.topRow}>
          <View style={s.led}>{remote ? <View style={s.ledOn} /> : null}</View>
          <Key icon="power" label="Power" onPress={() => press("POWER")} size={44} tint={color.danger} />
        </View>

        <View style={s.pad}>
          <Press onPress={() => press("UP")} accessibilityLabel="Up" frame={s.up} style={({ pressed }) => [s.arrow, pressed && s.arrowOn]}>
            <Icon name="up" size={26} />
          </Press>
          <Press onPress={() => press("LEFT")} accessibilityLabel="Left" frame={s.left} style={({ pressed }) => [s.arrow, pressed && s.arrowOn]}>
            <Icon name="left" size={26} />
          </Press>
          <Press onPress={() => press("OK")} accessibilityLabel="OK" frame={s.okFrame} style={({ pressed }) => [s.ok, pressed && s.okOn]}>
            <Text style={s.okText}>OK</Text>
          </Press>
          <Press onPress={() => press("RIGHT")} accessibilityLabel="Right" frame={s.right} style={({ pressed }) => [s.arrow, pressed && s.arrowOn]}>
            <Icon name="right" size={26} />
          </Press>
          <Press onPress={() => press("DOWN")} accessibilityLabel="Down" frame={s.down} style={({ pressed }) => [s.arrow, pressed && s.arrowOn]}>
            <Icon name="down" size={26} />
          </Press>
        </View>

        <View style={s.row}>
          <Key icon="back" label="Back" onPress={() => press("BACK")} />
          <Key icon="home" label="Home" onPress={() => press("HOME")} />
          <Key icon="mute" label="Mute" onPress={() => press("MUTE")} />
        </View>

        <View style={s.rocker}>
          <Press onPress={() => press("VOLUME_DOWN")} accessibilityLabel="Volume down" style={({ pressed }) => [s.rockerHalf, pressed && s.arrowOn]}>
            <Icon name="volDown" size={22} />
          </Press>
          <Text style={s.rockerLabel}>VOL</Text>
          <Press onPress={() => press("VOLUME_UP")} accessibilityLabel="Volume up" style={({ pressed }) => [s.rockerHalf, pressed && s.arrowOn]}>
            <Icon name="volUp" size={22} />
          </Press>
        </View>
        {platform.mode === "demo" ? <Text style={[type.tiny, { textAlign: "center", minHeight: 17 }]}>{last ? `Preview: would send ${last}` : " "}</Text> : null}
      </View>

      <Section title="Type on the TV" hint="Works when a text box is open on the TV: search, passwords, Wi-Fi names.">
        <View style={{ flexDirection: "row", gap: space(2), padding: space(3), alignItems: "center" }}>
          <TextInput value={text} onChangeText={setText} placeholder="Type here" placeholderTextColor={color.faint} style={[s.input, { flex: 1 }]} onSubmitEditing={() => text && (void remote?.text(text), setLast(`“${text}”`), setText(""))} />
          <Button label="Send" kind="secondary" disabled={!text} onPress={() => (void remote?.text(text), setLast(`“${text}”`), setText(""))} />
        </View>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  // A remote drawn in teletext's blocks: black body, square keys, the four arrows as a cross around OK.
  body: { alignSelf: "center", width: "100%", maxWidth: 300, paddingVertical: space(6), paddingHorizontal: space(5), gap: space(6), borderRadius: 18, backgroundColor: color.bg, borderWidth: 2, borderColor: color.line },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  led: { width: 10, height: 10, backgroundColor: color.line, marginLeft: space(2) },
  ledOn: { flex: 1, backgroundColor: color.ok },
  pad: { width: 216, height: 216, alignSelf: "center" },
  arrow: { width: 68, height: 68, borderRadius: 3, borderWidth: 2, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center" },
  arrowOn: { backgroundColor: color.surfacePressed },
  up: { position: "absolute", top: 0, left: 74 },
  down: { position: "absolute", bottom: 0, left: 74 },
  left: { position: "absolute", left: 0, top: 74 },
  right: { position: "absolute", right: 0, top: 74 },
  okFrame: { position: "absolute", top: 74, left: 74 },
  ok: { width: 68, height: 68, borderRadius: 3, backgroundColor: tt.blue, alignItems: "center", justifyContent: "center" },
  okOn: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  okText: { ...type.title, color: color.accentInk },
  row: { flexDirection: "row", justifyContent: "space-between" },
  key: { backgroundColor: color.surface, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.line },
  keyOn: { backgroundColor: color.surfacePressed, transform: [{ scale: 0.94 }] },
  rocker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 60, borderRadius: 3, borderWidth: 2, borderColor: color.lineStrong, overflow: "hidden" },
  rockerHalf: { width: 76, height: "100%", alignItems: "center", justifyContent: "center" },
  rockerLabel: { ...type.pixel, color: color.muted },
  input: { minWidth: 0, backgroundColor: color.bg, color: color.text, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, paddingHorizontal: space(4), height: 56, fontSize: 16, fontFamily: type.body.fontFamily },
  code: { backgroundColor: color.surface, color: color.text, borderRadius: radius.md, height: 72, fontSize: 30, letterSpacing: 10, textAlign: "center", fontFamily: type.display.fontFamily },
});
