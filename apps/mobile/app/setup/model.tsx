// Step 3: which tested list fits this TV. The match is a suggestion; the user confirms it, and picks from a
// short list when several TVs share a board (18 TCL lists share G08).
import { matchModels } from "@kantv/core";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { useSession } from "../../src/session";
import { color, space, type } from "../../src/theme";
import { Button, Card, Choice, Screen } from "../../src/ui/kit";

export default function Model() {
  const { s: session, set } = useSession();
  const matches = useMemo(
    () => (session.identity && session.feed ? matchModels(session.identity.props, session.feed.models).slice(0, 4) : []),
    [session.identity, session.feed],
  );
  const [picked, setPicked] = useState(matches[0]?.item.folder ?? null);
  const p = session.identity?.props ?? {};
  const found = [p.manufacturer, p.model].filter(Boolean).join(" ") || "your TV";

  const go = () => {
    const model = matches.find((m) => m.item.folder === picked)?.item;
    if (!model) return;
    const list = model.lists.find((l) => l.file === "debloat.txt") ?? model.lists[0]!;
    set({ model, list, answers: {}, unticked: [] });
    router.push("/setup/review");
  };

  if (!matches.length) {
    return (
      <Screen step="Step 3 of 5" title="We haven't tested your TV yet" subtitle={`We found ${found}, but nobody has shared a tested cleanup list for it.`}>
        <Card>
          <Text style={type.body}>
            Cleaning an untested TV safely needs someone to check each app first, so KanTV won't guess. You can still use the
            remote, and we'll let you know when a list for your TV arrives.
          </Text>
        </Card>
        <Button label="Back to home" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  return (
    <Screen
      step="Step 3 of 5"
      title="Is this your TV?"
      subtitle={`This TV calls itself ${found}${p.device ? ` (${p.device})` : ""}.${matches.length > 1 ? " Pick the one on its box or label." : ""}`}
      footer={<Button label="Yes, that's it" disabled={!picked} onPress={go} />}
    >
      {matches.map((m) => (
        <Choice
          key={m.item.folder}
          selected={picked === m.item.folder}
          onPress={() => setPicked(m.item.folder)}
          title={m.item.tv}
          detail={`${m.item.os}${m.item.launcher === "unsupported" ? " · cleanup only, keeps its own home screen" : ""}`}
        />
      ))}
      {session.trial === "used-on-this-tv" ? (
        <Card>
          <Text style={type.small}>This TV has already had its free week on another account. Cleanup and Restore are still free.</Text>
        </Card>
      ) : null}
      <Text style={[type.tiny, { marginTop: space(2) }]}>
        Lists come from the open-source cleanyourtv project, each tested on a real TV by its owner.
      </Text>
      <Text style={[type.tiny, { color: color.faint }]}>None of these? Go back and check you picked the right TV on the network.</Text>
    </Screen>
  );
}
