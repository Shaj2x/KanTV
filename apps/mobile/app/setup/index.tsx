// Step 1: turn on developer mode and debugging on the TV. Three short pages with a picture each, for the two
// menu layouts Android TVs use. Wording follows upstream PROMPT.md's instructions.
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useRequireSignIn } from "../../src/auth";
import { color, space, type } from "../../src/theme";
import { Button, Card, Choice, Screen } from "../../src/ui/kit";
import { TvPicture } from "../../src/ui/TvPicture";

type Family = "google-tv" | "android-tv";

const PAGES: Record<Family, { title: string; body: string; picture: Parameters<typeof TvPicture>[0] }[]> = {
  "google-tv": [
    {
      title: "Find the build number",
      body: "On the TV: Settings → System → About. Scroll down to “Android TV OS build” and press OK on it 7 times. The TV says “You are now a developer!”.",
      picture: {
        crumb: "Settings › System › About",
        items: [{ label: "Device name", value: "Living room TV" }, { label: "Android TV OS version", value: "14" }, { label: "Android TV OS build", value: "UTTC…" }, { label: "Legal information" }],
        highlight: 2,
        badge: "Press OK ×7",
      },
    },
    {
      title: "Turn on USB debugging",
      body: "Press Back once, open “Developer options” (now in Settings → System), and switch on “USB debugging”. You don't need a cable.",
      picture: {
        crumb: "Settings › System › Developer options",
        items: [{ label: "Stay awake", toggle: false }, { label: "USB debugging", toggle: true }, { label: "Wireless debugging", toggle: false }, { label: "Revoke USB debugging authorisations" }],
        highlight: 1,
      },
    },
    {
      title: "Turn on Wireless or Network debugging",
      body: "In the same menu, switch on “Wireless debugging” (or “Network debugging” if that's what your TV calls it). If you don't see either, that's fine: skip this.",
      picture: {
        crumb: "Settings › System › Developer options",
        items: [{ label: "USB debugging", toggle: true }, { label: "Wireless debugging", toggle: true }, { label: "Revoke USB debugging authorisations" }, { label: "Bug report shortcut", toggle: false }],
        highlight: 1,
      },
    },
  ],
  "android-tv": [
    {
      title: "Find the build number",
      body: "On the TV: Settings → Device Preferences → About. Press OK on “Build” 7 times. The TV says “You are now a developer!”.",
      picture: {
        crumb: "Settings › Device Preferences › About",
        items: [{ label: "Model", value: "Smart TV" }, { label: "Version", value: "11" }, { label: "Build", value: "RTO1…" }, { label: "Legal information" }],
        highlight: 2,
        badge: "Press OK ×7",
      },
    },
    {
      title: "Turn on USB debugging",
      body: "Press Back once and open “Developer options” (in Device Preferences). Switch on “USB debugging”. You don't need a cable.",
      picture: {
        crumb: "Settings › Device Preferences › Developer options",
        items: [{ label: "Stay awake", toggle: false }, { label: "USB debugging", toggle: true }, { label: "Network debugging", toggle: false }, { label: "Revoke USB debugging authorisations" }],
        highlight: 1,
      },
    },
    {
      title: "Turn on Network debugging",
      body: "If you see “Network debugging”, “ADB debugging” or “Wireless debugging”, switch it on too. If not, skip this: many TVs don't need it.",
      picture: {
        crumb: "Settings › Device Preferences › Developer options",
        items: [{ label: "USB debugging", toggle: true }, { label: "Network debugging", toggle: true }, { label: "Revoke USB debugging authorisations" }, { label: "Bug report shortcut", toggle: false }],
        highlight: 1,
      },
    },
  ],
};

export default function Prepare() {
  // The account comes first: registering the TV during setup is what starts its free week.
  useRequireSignIn("/setup");
  const [family, setFamily] = useState<Family | null>(null);
  const [page, setPage] = useState(0);

  if (!family) {
    return (
      <Screen
        step="Step 1 of 5"
        title="Which home screen does your TV have?"
        subtitle="Developer mode is hidden in a slightly different place on each. Look at the TV's Settings if you're not sure."
        footer={<Text style={[type.small, { textAlign: "center" }]}>Samsung, LG, Roku or Vizio? They don't run Android, so KanTV can't set them up.</Text>}
      >
        <Choice selected={false} onPress={() => setFamily("google-tv")} title="Google TV" detail="Tabs at the top: For you, Live, Apps. Chromecast, Google TV Streamer, newer Sony, TCL, Hisense." />
        <Choice selected={false} onPress={() => setFamily("android-tv")} title="Android TV" detail="Rows of apps and channels. Xiaomi, Philips, Nvidia Shield, older Sony and many others." />
      </Screen>
    );
  }

  const pages = PAGES[family];
  const p = pages[page]!;
  const last = page === pages.length - 1;
  return (
    <Screen
      step={`Step 1 of 5 · ${page + 1}/${pages.length}`}
      title={p.title}
      footer={
        <>
          <Button label={last ? "Done, find my TV" : "Next"} onPress={() => (last ? router.push("/setup/find") : setPage(page + 1))} />
          {page > 0 ? <Button kind="ghost" label="Back a step" onPress={() => setPage(page - 1)} /> : <Button kind="ghost" label="My TV looks different" onPress={() => setFamily(null)} />}
        </>
      }
    >
      <TvPicture {...p.picture} />
      <Text style={type.body}>{p.body}</Text>
      {page === 0 ? (
        <Card>
          <Text style={[type.small, { color: color.text }]}>Keep the TV on and connected to the same Wi-Fi as this phone until setup is finished.</Text>
        </Card>
      ) : null}
      {page === 1 ? (
        <View style={{ gap: space(1) }}>
          <Text style={type.small}>Is anything plugged into the TV's USB ports? Some TVs switch them off while debugging is on, so plan to finish in one go.</Text>
        </View>
      ) : null}
    </Screen>
  );
}
