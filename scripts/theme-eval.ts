// Picks the cheapest model that designs well. Runs the same requests through each candidate (the real backend
// designer: same prompt, same checks) and reports, per candidate: answers that fit first time, fixes needed,
// whether concrete asks were followed, how different two runs of one request are, and cost per design.
//
//   ANTHROPIC_API_KEY=... npx tsx scripts/theme-eval.ts            # prints the plan and the cost estimate
//   ANTHROPIC_API_KEY=... npx tsx scripts/theme-eval.ts --yes      # runs it (real API calls, real cost)
import Anthropic from "@anthropic-ai/sdk";
import { designPrint, similarity, contrast, type ThemeSpec } from "../packages/core/src/index.ts";
import { claudeThemeModel, designTheme, type DesignResult } from "../packages/backend/src/designer.ts";

const APPS = [
  ["com.netflix.ninja", "Netflix"],
  ["com.google.android.youtube.tv", "YouTube"],
  ["com.disney.disneyplus", "Disney+"],
  ["com.amazon.amazonvideo.livingroom", "Prime Video"],
  ["com.spotify.tv.android", "Spotify"],
  ["com.plexapp.android", "Plex"],
  ["org.jellyfin.androidtv", "Jellyfin"],
  ["com.apple.atve.androidtv.appletv", "Apple TV"],
].map(([p, l]) => ({ package: p!, label: l! }));

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return -1;
  const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
};
const warm = (hex: string) => {
  const h = hue(hex);
  return h >= 0 && (h <= 60 || h >= 330);
};

/** Requests with the concrete things a person would check. */
const CASES: { request: string; check: (s: ThemeSpec) => string[] }[] = [
  {
    request: "dark minimal, big clock, Netflix and YouTube in the dock, warm colours",
    check: (s) => [
      ...(["large", "huge"].includes(s.clock.size) ? [] : ["clock not big"]),
      ...(s.dockApps.slice(0, 2).sort().join() === ["com.google.android.youtube.tv", "com.netflix.ninja"].sort().join() ? [] : ["Netflix and YouTube not first in the dock"]),
      ...(warm(s.palette.accent) ? [] : ["accent not warm"]),
    ],
  },
  { request: "like a cosy cabin in the woods", check: () => [] },
  { request: "cyberpunk neon, very lively", check: (s) => (s.motion === "lively" ? [] : ["not lively"]) },
  { request: "calm for my parents: huge clock, big app names, nothing moving", check: (s) => [...(s.clock.size === "huge" ? [] : ["clock not huge"]), ...(s.motion === "still" ? [] : ["still moving"]), ...(s.layout.appNames === "always" ? [] : ["names not always shown"])] },
  { request: "ocean at night, Spotify first in the dock", check: (s) => (s.dockApps[0] === "com.spotify.tv.android" ? [] : ["Spotify not first"]) },
  { request: "Swiss poster style, red accent, monospace", check: (s) => [...(hue(s.palette.accent) >= 340 || (hue(s.palette.accent) >= 0 && hue(s.palette.accent) <= 15) ? [] : ["accent not red"]), ...(s.font === "jetbrains-mono" ? [] : ["not monospace"])] },
  { request: "a home cinema feel, artwork filling the screen", check: (s) => (s.layout.style === "cinematic" ? [] : ["not cinematic"]) },
  { request: "pastel and playful for the kids' room, Disney+ in the dock", check: (s) => (s.dockApps.includes("com.disney.disneyplus") ? [] : ["no Disney+"]) },
  { request: "just make it look nice", check: () => [] },
  { request: "all my apps in one row, no grid, black background", check: (s) => [...(s.layout.style === "single-row" ? [] : ["not single row"]), ...(s.palette.background.toUpperCase() === "#000000" || contrast(s.palette.background, "#000000") < 1.2 ? [] : ["background not black"])] },
];

const CANDIDATES = [
  { model: "claude-haiku-5-5", effort: "low" as const },
  { model: "claude-haiku-5-5", effort: "medium" as const },
  { model: "claude-sonnet-5-5", effort: "low" as const },
];
const RUNS = 2;

async function main() {
  const calls = CASES.length * RUNS * CANDIDATES.length;
  console.log(`${CASES.length} requests x ${RUNS} runs x ${CANDIDATES.length} candidates = ${calls} designs (up to ${calls * 2} calls with retries).`);
  console.log("Estimated cost: about $0.30 (Haiku about $0.001 a design, Sonnet about $0.02).");
  if (!process.argv.includes("--yes")) {
    console.log("Nothing was sent. Run again with --yes to spend it.");
    return;
  }
  const client = new Anthropic();
  const rows: string[] = ["| Candidate | Fit first time | Fixes per design | Asks followed | Same-request similarity | Cost per design |", "|---|---|---|---|---|---|"];
  for (const cand of CANDIDATES) {
    const model = claudeThemeModel(client, cand.model, cand.effort);
    let firstTime = 0, fixes = 0, asks = 0, askTotal = 0, cost = 0, n = 0;
    const sims: number[] = [];
    for (const c of CASES) {
      const results: DesignResult[] = [];
      for (let run = 0; run < RUNS; run++) {
        try {
          const r = await designTheme(model, { request: c.request, installedApps: APPS, exact: false }, []);
          results.push(r);
          n++;
          if (r.attempts === 1) firstTime++;
          fixes += r.fixes.length;
          cost += r.costMicroUsd;
          const missed = c.check(r.spec);
          askTotal += 1;
          if (!missed.length) asks++;
          else console.log(`  ${cand.model}/${cand.effort} "${c.request}": ${missed.join(", ")}`);
        } catch (e) {
          console.log(`  ${cand.model}/${cand.effort} "${c.request}": failed (${(e as Error).message})`);
        }
      }
      if (results.length === 2) sims.push(similarity(designPrint(results[0]!.spec), designPrint(results[1]!.spec)));
    }
    const avgSim = sims.reduce((a, b) => a + b, 0) / Math.max(1, sims.length);
    rows.push(`| ${cand.model} (${cand.effort}) | ${firstTime}/${n} | ${(fixes / Math.max(1, n)).toFixed(2)} | ${asks}/${askTotal} | ${avgSim.toFixed(2)} | $${(cost / Math.max(1, n) / 1e6).toFixed(5)} |`);
  }
  console.log("\n" + rows.join("\n"));
  console.log("\nLower similarity is better (more variety). Pick the cheapest candidate whose fit and asks match the best one.");
}

main();
