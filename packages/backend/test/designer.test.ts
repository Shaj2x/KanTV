// The AI designer through the API, with a scripted model in place of Claude: who may generate, the limits, the
// variety rules, what happens to bad or refused answers, applying a design, and the Claude request itself.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME, contrast, type ThemeSpec } from "@kantv/core";
import { createApp, DEFAULT_DESIGN_LIMITS, type DesignLimits } from "../src/app.ts";
import { migrate, type Db } from "../src/db.ts";
import { claudeThemeModel, costMicroUsd, type ModelAnswer, type ThemeModel } from "../src/designer.ts";
import { generateLeaseKeys, verifyLease } from "../src/leases.ts";

const DAY = 24 * 3600_000;
const h = (s: string) => createHash("sha256").update(s).digest("hex");
const APPS = [
  { package: "com.netflix.ninja", label: "Netflix" },
  { package: "com.google.android.youtube.tv", label: "YouTube" },
  { package: "com.disney.disneyplus", label: "Disney+" },
];

const spec = (patch: (s: ThemeSpec) => void = () => {}): ThemeSpec => {
  const s = structuredClone(DEFAULT_THEME);
  s.dockApps = ["com.netflix.ninja", "com.google.android.youtube.tv"];
  patch(s);
  return s;
};
const OCEAN = spec((s) => {
  s.name = "Deep Ocean";
  s.palette = { background: "#06121F", surface: "#0E2236", text: "#EAF6FF", textMuted: "#9DB8CF", accent: "#3FE0C5" };
  s.font = "fraunces";
  s.layout.style = "cinematic";
  s.wallpaper = { kind: "pattern", colors: ["#06121F", "#0B2A44"], pattern: "waves", photoTag: null, dim: 20 };
});

/** Answers from a script, and remembers every prompt it was given. */
function scripted(answers: Partial<ModelAnswer>[]): ThemeModel & { prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    model: "claude-haiku-5-5",
    prompts,
    async design(_system, user) {
      prompts.push(user);
      const a = answers[Math.min(i++, answers.length - 1)]!;
      return { output: null, stop: "done", model: "claude-haiku-5-5", usage: { inputTokens: 2000, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 }, ...a };
    },
  };
}

let clock: Date;
let token: (sub: string) => Promise<string>;
let db: Db;
let leaseKeys: Awaited<ReturnType<typeof generateLeaseKeys>>;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeEach(async () => {
  const pg = new PGlite();
  const wrap = (q: Pick<PGlite, "query">): Db => ({
    query: async (sql, params = []) => (await q.query(sql, params)).rows as never,
    transaction: (f) => pg.transaction((tx) => f(wrap(tx))) as never,
  });
  db = wrap(pg);
  await migrate(db);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
  token = (sub) => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("i").setAudience("kantv").setSubject(sub).setExpirationTime("1h").sign(privateKey);
  clock = new Date("2026-11-02T12:00:00Z");
  leaseKeys = await generateLeaseKeys();
});

function app(model: ThemeModel, limits: Partial<DesignLimits> = {}) {
  const a = createApp({
    db,
    pepper: "p".repeat(32),
    leaseKeys,
    auth: { jwks, issuer: "i", audience: "kantv" },
    revenueCatWebhookAuth: "Bearer x",
    designer: { model, limits: { ...DEFAULT_DESIGN_LIMITS, minIntervalMs: 0, ...limits }, random: () => 0.5 },
    now: () => clock,
  });
  return async (method: string, path: string, sub: string, body?: unknown) => {
    const res = await a.request(path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${await token(sub)}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };
}
const ask = (request: string, extra: object = {}) => ({ request, installedApps: APPS, ...extra });
const startTrial = async (call: ReturnType<typeof app>, sub = "alice") => (await call("POST", "/v1/me/tvs", sub, { serial: h(sub), model: "TV" })).json.household as string;

describe("who can design", () => {
  it("a trial account gets a checked design, saved to its history", async () => {
    const call = app(scripted([{ output: OCEAN }]));
    await startTrial(call);
    const r = await call("POST", "/v1/me/designs", "alice", ask("deep sea, calm"));
    expect(r.status).toBe(200);
    expect(r.json.design).toMatchObject({ name: "Deep Ocean", locked: false });
    expect((await call("GET", "/v1/me/designs", "alice")).json.designs).toHaveLength(1);
  });

  it("after the trial: no new designs, saved ones listed but locked, and none can be applied", async () => {
    const call = app(scripted([{ output: OCEAN }]));
    const household = await startTrial(call);
    const made = (await call("POST", "/v1/me/designs", "alice", ask("deep sea"))).json.design;
    clock = new Date(clock.getTime() + 8 * DAY);
    expect((await call("POST", "/v1/me/designs", "alice", ask("again"))).status).toBe(402);
    const list = (await call("GET", "/v1/me/designs", "alice")).json;
    expect(list.designs[0]).toMatchObject({ id: made.id, locked: true });
    expect((await call("POST", `/v1/me/designs/${made.id}/apply`, "alice", { household, instance: "inst-1234" })).status).toBe(402);
  });

  it("an account without a trial or subscription is asked to subscribe", async () => {
    const call = app(scripted([{ output: OCEAN }]));
    await startTrial(call, "alice");
    await call("POST", "/v1/me/tvs", "bob", { serial: h("alice"), model: "TV" }); // same TV: no second trial
    expect((await call("POST", "/v1/me/designs", "bob", ask("x"))).status).toBe(402);
  });
});

describe("limits", () => {
  it("per account per day, and a pause between requests", async () => {
    const call = app(scripted([{ output: OCEAN }]), { perDayTrial: 2 });
    await startTrial(call);
    await call("POST", "/v1/me/designs", "alice", ask("a"));
    await call("POST", "/v1/me/designs", "alice", ask("b", { exact: true }));
    expect((await call("POST", "/v1/me/designs", "alice", ask("c"))).json).toMatchObject({ error: "daily-limit", limit: 2 });
    const slow = app(scripted([{ output: OCEAN }]), { minIntervalMs: 5000 });
    await startTrial(slow, "carol");
    await slow("POST", "/v1/me/designs", "carol", ask("a"));
    expect((await slow("POST", "/v1/me/designs", "carol", ask("b"))).json.error).toBe("too-fast");
  });

  it("stops everyone once the day's budget is spent, failed calls included", async () => {
    const call = app(scripted([{ stop: "refused" }]), { dailyBudgetMicroUsd: 600 });
    await startTrial(call);
    expect((await call("POST", "/v1/me/designs", "alice", ask("x"))).json.error).toBe("design-refused");
    // That refused call cost 2000 * 0.1 + 600 * 0.5 = 500 micro-dollars; one more fills the budget.
    await call("POST", "/v1/me/designs", "alice", ask("y"));
    expect((await call("POST", "/v1/me/designs", "alice", ask("z"))).json.error).toBe("busy");
  });

  it("prices calls from the model's usage", () => {
    expect(costMicroUsd("claude-haiku-5-5", { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(350);
    expect(costMicroUsd("claude-sonnet-5-5", { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(7000);
  });
});

describe("variety", () => {
  it("sends back a design too close to a recent one, saying which, and shows the model its recent designs", async () => {
    const twin = spec((s) => ((s.name = "Ocean Again"), (s.palette = { ...OCEAN.palette, accent: "#40DEC8" }), (s.font = OCEAN.font), (s.layout = { ...OCEAN.layout }), (s.wallpaper = { ...OCEAN.wallpaper })));
    const fresh = spec((s) => ((s.name = "Ember"), (s.palette = { background: "#1A0E08", surface: "#2A160C", text: "#FFF4EA", textMuted: "#D9B9A0", accent: "#FF7A2F" }), (s.font = "nunito")));
    const model = scripted([{ output: OCEAN }, { output: twin }, { output: fresh }]);
    const call = app(model);
    await startTrial(call);
    await call("POST", "/v1/me/designs", "alice", ask("calm"));
    const second = await call("POST", "/v1/me/designs", "alice", ask("calm"));
    expect(second.json.design.name).toBe("Ember");
    expect(model.prompts[1]).toContain('"Deep Ocean"');
    expect(model.prompts[2]).toMatch(/too close to the recent design "Deep Ocean"/);
  });

  it("gives exactly what was asked when the person asks for it", async () => {
    const model = scripted([{ output: OCEAN }]);
    const call = app(model);
    await startTrial(call);
    await call("POST", "/v1/me/designs", "alice", ask("deep ocean"));
    const again = await call("POST", "/v1/me/designs", "alice", ask("the deep ocean one again", { exact: true }));
    expect(again.json.design.name).toBe("Deep Ocean");
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]).not.toMatch(/Recent designs|Design direction/);
  });

  it("regenerate is a fresh take on the same words", async () => {
    const fresh = spec((s) => ((s.name = "Ember"), (s.font = "nunito"), (s.palette.background = "#1A0E08"), (s.palette.accent = "#FF7A2F")));
    const model = scripted([{ output: OCEAN }, { output: fresh }]);
    const call = app(model);
    await startTrial(call);
    const first = (await call("POST", "/v1/me/designs", "alice", ask("something cosy"))).json.design;
    const re = await call("POST", `/v1/me/designs/${first.id}/regenerate`, "alice", { installedApps: APPS });
    expect(re.json.design.name).toBe("Ember");
    expect(model.prompts[1]).toContain("Request: something cosy");
  });
});

describe("what the model sends back", () => {
  it("is checked: unknown apps dropped, unreadable text fixed, and the fixes reported", async () => {
    const sloppy = spec((s) => ((s.palette.text = "#151515"), (s.palette.background = "#101010"), (s.dockApps = ["com.netflix.ninja", "com.made.up.app"])));
    const call = app(scripted([{ output: sloppy }]));
    await startTrial(call);
    const d = (await call("POST", "/v1/me/designs", "alice", ask("x"))).json.design;
    expect(d.spec.dockApps).toEqual(["com.netflix.ninja"]);
    expect(contrast(d.spec.palette.text, d.spec.palette.background)).toBeGreaterThanOrEqual(7);
    expect(d.fixes.length).toBeGreaterThanOrEqual(2);
  });

  it("gets one more try when it does not fit the spec, with the reasons", async () => {
    const model = scripted([{ output: { name: "Bad", palette: "blue" } }, { output: OCEAN }]);
    const call = app(model);
    await startTrial(call);
    expect((await call("POST", "/v1/me/designs", "alice", ask("x"))).json.design.name).toBe("Deep Ocean");
    expect(model.prompts[1]).toMatch(/did not fit the spec/);
  });

  it("fails cleanly after two misfits, and on a refusal", async () => {
    const bad = app(scripted([{ output: { nope: true } }]));
    await startTrial(bad);
    expect((await bad("POST", "/v1/me/designs", "alice", ask("x"))).json.error).toBe("design-invalid");
    const refuses = app(scripted([{ stop: "refused" }]));
    await startTrial(refuses, "carol");
    expect((await refuses("POST", "/v1/me/designs", "carol", ask("x"))).json.error).toBe("design-refused");
  });

  it("rejects requests that are empty, huge, or carry made-up package names", async () => {
    const call = app(scripted([{ output: OCEAN }]));
    await startTrial(call);
    expect((await call("POST", "/v1/me/designs", "alice", ask(" "))).status).toBe(400);
    expect((await call("POST", "/v1/me/designs", "alice", ask("x".repeat(501)))).status).toBe(400);
    expect((await call("POST", "/v1/me/designs", "alice", { request: "x", installedApps: [{ package: "rm -rf /", label: "x" }] })).status).toBe(400);
  });
});

describe("applying", () => {
  it("returns the launcher config for the design and a pass for that launcher", async () => {
    const call = app(scripted([{ output: OCEAN }]));
    const household = await startTrial(call);
    const d = (await call("POST", "/v1/me/designs", "alice", ask("x"))).json.design;
    const r = await call("POST", `/v1/me/designs/${d.id}/apply`, "alice", { household, instance: "inst-1234" });
    expect(r.status).toBe(200);
    expect(r.json.config).toMatchObject({ background_color: "#06121F", cinematic_home: true, kantv_font: "fraunces", dock_apps: OCEAN.dockApps });
    expect(await verifyLease(leaseKeys.publicJwk, r.json.lease, "inst-1234", clock)).not.toBeNull();
    expect((await call("POST", `/v1/me/designs/${d.id}/apply`, "bob", { household, instance: "inst-1234" })).status).toBe(404);
  });
});

describe("the Claude request", () => {
  it("asks for the spec as structured output, cached, with no sampling settings", async () => {
    let sent: any = null;
    const fake = {
      messages: {
        parse: async (params: unknown) => {
          sent = params;
          return { stop_reason: "end_turn", parsed_output: OCEAN, model: "claude-haiku-5-5", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 } };
        },
      },
    };
    const model = claudeThemeModel(fake as never);
    const a = await model.design("system", "user");
    expect(sent).toMatchObject({ model: "claude-haiku-5-5", cache_control: { type: "ephemeral" }, system: "system", output_config: { effort: "low" } });
    expect(sent.output_config.format).toBeDefined();
    expect(sent.temperature).toBeUndefined();
    expect(a).toMatchObject({ output: OCEAN, stop: "done", usage: { cacheReadTokens: 2000 } });
  });

  it("reports a refusal without trusting its output", async () => {
    const fake = { messages: { parse: async () => ({ stop_reason: "refusal", parsed_output: OCEAN, usage: { input_tokens: 1, output_tokens: 1 } }) } };
    expect(await claudeThemeModel(fake as never).design("s", "u")).toMatchObject({ stop: "refused", output: null });
  });
});
