// What the app asks or tells the user before a list touches their TV, from the flags the feed builder read out
// of the list's header (scripts/lists/build.ts), and what each answer changes. Wording here is the plain
// English the app shows; the app may restyle it but not soften the warnings.
import type { FeedList, FeedModel } from "./feed.ts";
import { SETUPWRAITH } from "./packages.ts";

export interface Question {
  id: string;
  title: string;
  body: string;
  /** No answer needed: a note the user acknowledges. */
  kind: "yes-no" | "notice";
  /** The safe answer, pre-selected. */
  defaultAnswer?: boolean;
}

export interface Answers {
  [questionId: string]: boolean;
}

export function questionsFor(model: FeedModel, list: FeedList): Question[] {
  const f = new Set(list.flags);
  const q: Question[] = [];
  if (f.has("casting-needs-setupwraith") || (f.has("setupwraith") && /google/i.test(model.brand))) {
    q.push({
      id: "casting",
      kind: "yes-no",
      title: "Do you cast to this TV from your phone?",
      body:
        "On this TV, casting from a phone (YouTube, Netflix, Google Photos) needs Google's setup app, which normally has to be " +
        "switched off for a new home screen to stick. If you cast, KanTV keeps it, cleans up everything else, and may keep your " +
        "TV's own home screen.",
      defaultAnswer: true,
    });
  }
  if (f.has("usb-power")) {
    q.push({
      id: "usb",
      kind: "yes-no",
      title: "Is anything plugged into the TV's USB ports?",
      body:
        "A speaker, a drive, or a network adapter. On this TV, USB ports can lose power while debugging is on, so plan to finish " +
        "setup in one go. If your internet comes through a USB adapter, tell us and we'll keep the TV on Wi-Fi.",
      defaultAnswer: true,
    });
  }
  if (f.has("reenabled-at-boot")) {
    q.push({
      id: "reenabled",
      kind: "notice",
      title: "Some apps come back after a restart",
      body: "This TV switches a few apps back on every time it starts. That's the TV, not a failed cleanup, and it doesn't undo the rest.",
    });
  }
  if (f.has("remote-buttons")) {
    q.push({
      id: "remote-buttons",
      kind: "notice",
      title: "Your remote's app buttons",
      body: "On this TV the stock home screen also handles buttons like YouTube or Netflix. They keep working for now; when KanTV replaces the home screen, try each one.",
    });
  }
  return q;
}

export interface ListChoice {
  /** Packages to disable after the user's answers and unticks. */
  packages: string[];
  /** Leave the stock launcher enabled (set Home only), or skip the launcher entirely. */
  launcher: "replace-stock" | "keep-stock-enabled" | "none";
  /** A sibling list that fits the answers better, e.g. debloat-keep-cast.txt. */
  useList?: string;
}

/** Applies the answers and the user's unticked entries to the list. */
export function applyAnswers(model: FeedModel, list: FeedList, answers: Answers, unticked: string[] = []): ListChoice {
  const drop = new Set(unticked);
  let launcher: ListChoice["launcher"] = model.launcher === "unsupported" ? "none" : "replace-stock";
  if (list.flags.includes("cvte-keep-stock-launcher")) launcher = launcher === "none" ? "none" : "keep-stock-enabled";
  let useList: string | undefined;
  if (answers.casting && list.packages.some((p) => p.name === SETUPWRAITH)) {
    // Kept enabled, setupwraith answers Home ahead of any launcher (#1573): the handover could only roll
    // back, so this TV keeps its own home screen and gets the cleanup.
    const keepCast = model.lists.find((l) => /keep-cast/.test(l.file));
    if (keepCast && keepCast.id !== list.id) useList = keepCast.id;
    drop.add(SETUPWRAITH);
    launcher = "none";
  }
  return { packages: list.packages.map((p) => p.name).filter((n) => !drop.has(n)), launcher, useList };
}
