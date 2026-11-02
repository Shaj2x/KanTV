// Step 4a: the questions this TV's list needs answered, then what will be turned off, in plain words, with
// every entry untickable. "Check with the TV" runs the safety checks (read-only) and shows what they kept.
import { applyAnswers, previewDebloat, questionsFor } from "@kantv/core";
import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { CATEGORY_LABEL, NOTE, SKIP_REASON, categoryOf, friendlyName, type Category } from "../../src/labels";
import { useSession } from "../../src/session";
import { color, space, type } from "../../src/theme";
import { Button, Card, CheckRow, Choice, Screen, Section } from "../../src/ui/kit";

export default function Review() {
  const { s: session, set } = useSession();
  const { model, list: baseList } = session;
  const [answers, setAnswers] = useState<Record<string, boolean>>(session.answers);
  const [unticked, setUnticked] = useState<string[]>(session.unticked);
  const [checking, setChecking] = useState(false);
  const questions = useMemo(() => (model && baseList ? questionsFor(model, baseList) : []), [model, baseList]);
  const asks = questions.filter((q) => q.kind === "yes-no");
  const answeredAll = asks.every((q) => answers[q.id] !== undefined);

  const { list, choice } = useMemo(() => {
    if (!model || !baseList) return { list: undefined, choice: undefined };
    const first = applyAnswers(model, baseList, answers, unticked);
    const list = first.useList ? (model.lists.find((l) => l.id === first.useList) ?? baseList) : baseList;
    const choice = list === baseList ? first : { ...applyAnswers(model, list, answers, unticked), launcher: first.launcher };
    return { list, choice };
  }, [model, baseList, answers, unticked]);

  const groups = useMemo(() => {
    const g = new Map<Category, { name: string; comment: string }[]>();
    for (const p of list?.packages ?? []) {
      const c = categoryOf(p.name, p.comment);
      g.set(c, [...(g.get(c) ?? []), p]);
    }
    return (["ads", "tracking", "apps", "system"] as Category[]).filter((c) => g.has(c)).map((c) => ({ c, items: g.get(c)! }));
  }, [list]);

  if (!model || !list || !choice || !session.connection) return <Redirect href="/setup" />;
  const preview = session.preview;

  const check = async () => {
    setChecking(true);
    const plan = await previewDebloat(session.connection!.shell, choice.packages);
    set({ answers, unticked, choice, list, preview: plan });
    setChecking(false);
  };

  const toggle = (name: string) => {
    set({ preview: undefined });
    setUnticked((u) => (u.includes(name) ? u.filter((n) => n !== name) : [...u, name]));
  };

  return (
    <Screen
      step="Step 4 of 5"
      title={preview ? "Ready to clean up" : "What gets turned off"}
      subtitle={
        preview
          ? `${preview.disable.length} apps will be turned off. Nothing is uninstalled, and Restore puts every one back.`
          : `From the tested list for ${model.tv}. Untick anything you use.`
      }
      footer={
        preview ? (
          <>
            <Button label={`Turn off ${preview.disable.length} apps`} onPress={() => router.push("/setup/run")} />
            <Button kind="ghost" label="Change the list" onPress={() => set({ preview: undefined })} />
          </>
        ) : (
          <Button label="Check with the TV" busy={checking} disabled={!answeredAll || !choice.packages.length} onPress={check} />
        )
      }
    >
      {preview ? (
        <>
          <Card style={{ gap: space(1) }}>
            {groups.map(({ c, items }) => {
              const n = items.filter((p) => preview.disable.includes(p.name)).length;
              return n ? (
                <View key={c} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space(1) }}>
                  <Text style={type.body}>{CATEGORY_LABEL[c].title}</Text>
                  <Text style={[type.body, { color: color.accent, fontWeight: "700" }]}>{n}</Text>
                </View>
              ) : null;
            })}
          </Card>
          {preview.skipped.length ? (
            <Section title={`Kept for safety (${preview.skipped.length})`}>
              {preview.skipped.map((k) => (
                <View key={k.name} style={{ padding: space(4), gap: space(1) }}>
                  <Text style={type.body}>{friendlyName(k.name, list.packages.find((p) => p.name === k.name)?.comment ?? "")}</Text>
                  <Text style={type.small}>{SKIP_REASON[k.reason]}</Text>
                </View>
              ))}
            </Section>
          ) : (
            <Card tone="ok">
              <Text style={type.body}>The TV's safety checks passed: nothing on the list is needed by your inputs, Settings or Wi-Fi.</Text>
            </Card>
          )}
          {preview.notes.filter((n) => NOTE[n]).map((n) => (
            <Card key={n} tone="warn">
              <Text style={type.small}>{NOTE[n]}</Text>
            </Card>
          ))}
          {choice.launcher === "none" ? (
            <Card>
              <Text style={type.heading}>This TV keeps its own home screen</Text>
              <Text style={type.small}>
                {model.launcher === "unsupported"
                  ? "Its maker doesn't allow other home screens, so KanTV cleans it up and leaves the home screen as it is."
                  : "Casting from your phone needs Google's setup app, which would take over any new home screen. You still get the cleanup."}
              </Text>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          {questions.map((q) =>
            q.kind === "yes-no" ? (
              <Card key={q.id} style={{ gap: space(3) }}>
                <Text style={type.title}>{q.title}</Text>
                <Text style={type.small}>{q.body}</Text>
                <Choice selected={answers[q.id] === true} onPress={() => setAnswers({ ...answers, [q.id]: true })} title="Yes" />
                <Choice selected={answers[q.id] === false} onPress={() => setAnswers({ ...answers, [q.id]: false })} title="No" />
              </Card>
            ) : (
              <Card key={q.id} tone="accent">
                <Text style={type.heading}>{q.title}</Text>
                <Text style={type.small}>{q.body}</Text>
              </Card>
            ),
          )}
          {groups.map(({ c, items }) => (
            <Section key={c} title={CATEGORY_LABEL[c].title} hint={CATEGORY_LABEL[c].hint}>
              {items.map((p) => (
                <CheckRow
                  key={p.name}
                  checked={!unticked.includes(p.name) && choice.packages.includes(p.name)}
                  onToggle={() => toggle(p.name)}
                  title={friendlyName(p.name, p.comment)}
                  detail={p.name}
                />
              ))}
            </Section>
          ))}
          {list.kept.length ? (
            <Text style={[type.tiny, { color: color.faint }]}>
              Always kept by KanTV: the phone remote service ({list.kept.join(", ")}).
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
