// Step 2a: find the TV on this Wi-Fi. Discovery runs while the screen is open; typing the address is the way
// out when the network hides TVs from each other (guest Wi-Fi, mesh "client isolation").
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { platform, type FoundTv } from "../../src/platform";
import { useSession } from "../../src/session";
import { color, radius, space, type } from "../../src/theme";
import { Button, Card, Screen, Cursor, Row } from "../../src/ui/kit";

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export default function Find() {
  const { set } = useSession();
  const [found, setFound] = useState<FoundTv[]>([]);
  const [manual, setManual] = useState(false);
  const [address, setAddress] = useState("");

  useEffect(() => platform.discover((tv) => setFound((f) => (f.some((x) => x.id === tv.id) ? f : [...f, tv]))), []);

  const pick = (tv: FoundTv) => {
    set({ tv });
    router.push("/setup/allow");
  };

  return (
    <Screen step="Step 2 of 5" title="Looking for your TV" subtitle="Your phone and the TV need to be on the same Wi-Fi.">
      <View style={{ gap: space(3) }}>
        {found.map((tv) => (
          <Row key={tv.id} title={tv.name} detail={`Found on your Wi-Fi at ${tv.host}`} onPress={() => pick(tv)} last />
        ))}
        <View style={s.searching}>
          <Cursor size={16} />
          <Text style={type.small}>{found.length ? "Still looking for other TVs…" : "Searching this network…"}</Text>
        </View>
      </View>

      {manual ? (
        <Card style={{ gap: space(3) }}>
          <Text style={type.heading}>Type the TV's address</Text>
          <Text style={type.small}>On the TV: Settings → Network & Internet → your Wi-Fi network. It's the “IP address”, like 192.168.1.42.</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="192.168.1.42"
            placeholderTextColor={color.faint}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            style={s.input}
            accessibilityLabel="TV IP address"
          />
          <Button
            label="Connect"
            disabled={!IPV4.test(address.trim())}
            onPress={() => pick({ id: `manual-${address.trim()}`, name: "My TV", host: address.trim(), via: "adb-5555" })}
          />
        </Card>
      ) : (
        <Button kind="ghost" label="My TV isn't showing up" onPress={() => setManual(true)} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  tv: { flexDirection: "row", alignItems: "center", gap: space(4), backgroundColor: color.surface, borderRadius: radius.lg, padding: space(4) },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },
  searching: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2) },
  input: { backgroundColor: color.bg, color: color.text, borderRadius: radius.sm, borderWidth: 1, borderColor: color.line, paddingHorizontal: space(4), height: 50, fontSize: 18 },
});
