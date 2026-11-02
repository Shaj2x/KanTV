// The AI designer. The model only ever returns a theme spec (data, checked against the schema), never code;
// the backend checks it again, fixes what is safe to fix, steers away from the account's recent designs, and
// records what each call cost. The API key lives only here, in the backend's environment.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  DIRECTIONS,
  TOO_SIMILAR,
  ThemeSpecSchema,
  checkTheme,
  closestRecent,
  describeForPrompt,
  designPrint,
  type DesignPrint,
  type ThemeSpec,
} from "@kantv/core";

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ModelAnswer {
  /** The structured output, or null when the model refused or ran out of room. */
  output: unknown;
  stop: "done" | "refused" | "truncated";
  usage: ModelUsage;
  model: string;
}

/** What the designer needs from a model; the Claude implementation is below, tests use a scripted one. */
export interface ThemeModel {
  readonly model: string;
  design(system: string, user: string): Promise<ModelAnswer>;
}

/** US dollars per million tokens (input, output), from Anthropic's price list. Cache reads are counted as input. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

export function costMicroUsd(model: string, u: ModelUsage): number {
  const [inp, out] = PRICES[model] ?? [4, 20]; // unknown model: assume the dearest, so the budget errs safe
  return Math.ceil((u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens * 1.25) * inp + u.outputTokens * out);
}

export function claudeThemeModel(client: Anthropic, model = "claude-haiku-5-5", effort: "low" | "medium" | "high" = "low"): ThemeModel {
  return {
    model,
    async design(system, user) {
      const res = await client.messages.parse({
        model,
        max_tokens: 8000,
        // The system prompt and the schema never change between requests, so they are cached.
        cache_control: { type: "ephemeral" },
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(ThemeSpecSchema), effort },
      });
      const u = res.usage;
      const stop = res.stop_reason === "refusal" ? "refused" : res.stop_reason === "max_tokens" ? "truncated" : "done";
      return {
        output: stop === "done" ? res.parsed_output : null,
        stop,
        model: res.model ?? model,
        usage: {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}

export const SYSTEM_PROMPT = `You design home screens for Android TVs. A person describes the look they want, and you answer with a theme spec that the KanTV launcher renders. You only choose values; you never write code.

The screen is seen from a sofa two or three metres away, often in a dim room. Text must be easy to read from there: light text on dark grounds works best, and wallpapers stay dark enough that the clock and app names sit clearly on top. The focus highlight (the accent) is how people see which app is selected, so it must stand out against the background.

How the spec maps to the screen:
- palette: background is the whole screen behind any wallpaper; surface colours the dock band, buttons and panels; text is the clock and names; textMuted the date and small labels; accent the focus highlight and glow.
- font: the typeface of the clock and labels.
- wallpaper: none (flat background), gradient (smooth blend of its colours), sky (a dark gradient that follows the time of day), pattern (its colours drawn as the named pattern), photo (a photograph with the named subject from KanTV's library). dim darkens the wallpaper in percent.
- layout.style: classic (big name of the focused app above the dock, a grid of apps below), cinematic (the focused dock app's artwork fills the top of the screen), single-row (every app in one sideways row), minimal (no big title, no glow, quiet).
- layout.columns is apps per grid row; dockSize the number of dock apps; rowsBelowDock how many grid rows peek under the dock.
- clock: size and position of the clock; showDate and showGreeting add the date and "Good evening".
- topBar: pills (labelled Inputs, Wi-Fi and Settings buttons), icons (round icon buttons), menu (a single gear).
- motion: lively (springy, with effects), calm (smooth, no overshoot), still (minimal animation).
- widgets: stats (one line of CPU and memory under the clock), idle-clock (a clock screensaver after ten idle minutes).
- dockApps: package names from the TV's installed apps list, in dock order. Use only packages from that list. Put apps the person names first, then the most likely everyday streaming apps.

When the request is specific, follow it closely: named colours, sizes, apps and moods win over everything else. When it leaves room, take the design direction you are given as a starting point and make a confident, coherent look rather than a safe average one. Recent designs for this person are listed so you can avoid repeating them: unless the request asks for one of them, make this one clearly different in palette, typeface and layout.

name is 1-4 evocative words; summary is one plain sentence a person would use to describe the look.`;

export interface DesignRequest {
  request: string;
  installedApps: { package: string; label: string }[];
  /** The person asked for exactly this, so no steering away from recent designs and no direction. */
  exact: boolean;
}

export function userPrompt(req: DesignRequest, recent: ThemeSpec[], direction: string | null, retryNote?: string): string {
  const apps = req.installedApps
    .slice(0, 200)
    .map((a) => `${a.package} - ${a.label}`)
    .join("\n");
  const parts = [`Request: ${req.request.trim()}`, `Installed apps (package - name):\n${apps || "(none reported)"}`];
  if (recent.length && !req.exact) parts.push(`Recent designs to avoid repeating:\n${recent.map((r) => `- ${describeForPrompt(r)}`).join("\n")}`);
  if (direction) parts.push(`Design direction for this one, where the request leaves room: ${direction}`);
  if (req.exact) parts.push("The person wants exactly what they described; do not vary it.");
  if (retryNote) parts.push(retryNote);
  return parts.join("\n\n");
}

export class DesignError extends Error {
  /** What the failed calls cost; the daily budget counts it. */
  costMicroUsd = 0;
  constructor(
    readonly kind: "refused" | "invalid" | "truncated",
    message: string,
  ) {
    super(message);
  }
}

export interface DesignResult {
  spec: ThemeSpec;
  print: DesignPrint;
  fixes: string[];
  attempts: number;
  usage: ModelUsage;
  costMicroUsd: number;
  model: string;
}

/**
 * Asks the model, checks the answer, and asks once more (with the reason) when the answer is not usable or is
 * too close to a recent design. Every call's cost is counted, including the one thrown away.
 */
export async function designTheme(
  model: ThemeModel,
  req: DesignRequest,
  recent: ThemeSpec[],
  random: () => number = Math.random,
): Promise<DesignResult> {
  const installed = new Set(req.installedApps.map((a) => a.package));
  const direction = req.exact ? null : DIRECTIONS[Math.floor(random() * DIRECTIONS.length)]!;
  const recentPrints = recent.map(designPrint);
  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let cost = 0;
  let retryNote: string | undefined;
  let fallback: DesignResult | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const answer = await model.design(SYSTEM_PROMPT, userPrompt(req, recent, direction, retryNote));
    for (const k of Object.keys(usage) as (keyof ModelUsage)[]) usage[k] += answer.usage[k];
    cost += costMicroUsd(answer.model, answer.usage);
    // A second answer that fails falls back to a usable first one that was only too familiar.
    const fail = (e: DesignError) => {
      if (fallback) return { ...fallback, attempts: 2, usage, costMicroUsd: cost };
      e.costMicroUsd = cost;
      throw e;
    };
    if (answer.stop === "refused") return fail(new DesignError("refused", "the designer declined this request"));
    if (answer.stop === "truncated") {
      retryNote = "Your previous answer was cut off. Answer with the complete spec only.";
      if (attempt === 2) return fail(new DesignError("truncated", "the designer's answer was cut off"));
      continue;
    }
    const check = checkTheme(answer.output, installed);
    if (!check.ok) {
      retryNote = `Your previous answer did not fit the spec: ${check.errors.slice(0, 5).join("; ")}. Fix these.`;
      if (attempt === 2) return fail(new DesignError("invalid", check.errors.join("; ")));
      continue;
    }
    const print = designPrint(check.spec!);
    const result: DesignResult = { spec: check.spec!, print, fixes: check.fixes, attempts: attempt, usage, costMicroUsd: cost, model: answer.model };
    const close = req.exact ? null : closestRecent(print, recentPrints);
    if (close && close.score > TOO_SIMILAR && attempt === 1) {
      fallback = result;
      retryNote = `That is too close to the recent design ${describeForPrompt(recent[close.index]!)}. Make a clearly different one: change the palette, the typeface and the layout style.`;
      continue;
    }
    return { ...result, attempts: attempt, usage, costMicroUsd: cost };
  }
  const e = new DesignError("invalid", "no usable design");
  e.costMicroUsd = cost;
  throw e;
}
