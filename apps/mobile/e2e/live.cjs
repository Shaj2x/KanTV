const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
// The real account path in a browser: the web export built against the local stack (npm run dev:stack, then
// npm run dev:api, then expo export with apps/mobile/.env.local). Signs up with an emailed code read from the
// mail catcher, sets up the demo TV so the backend registers it and starts the free week, checks the account
// screen, then deletes the account. Fails on any missing step or browser console error.
//   node e2e/live.cjs <screenshot dir>
const DIST = path.join(__dirname, "..", "dist"), OUT = process.argv[2] || require("os").tmpdir();
const MAIL = "http://localhost:54324", PORT = 8081;
const types = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  const errors = [];
  // HTTP failures are checked by URL below; the browser's matching console line adds nothing.
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource: the server responded with a status of/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  // The only failures expected: the designer without a model key (503), the deliberately wrong code, and
  // logging out a user who was just deleted (supabase-js clears the session regardless).
  const expected = [/ 503 .*\/v1\/me\/designs$/, / 403 POST .*\/auth\/v1\/verify$/, / 403 POST .*\/auth\/v1\/logout\?scope=local$/];
  page.on("response", (r) => {
    const line = `${r.status()} ${r.request().method()} ${r.url()}`;
    if (r.status() >= 400 && !expected.some((e) => e.test(` ${line}`))) errors.push(`HTTP ${line}`);
  });
  let n = 0;
  const shot = async (name) => (await page.waitForTimeout(350), page.screenshot({ path: `${OUT}/live-${String(++n).padStart(2, "0")}-${name}.png` }));
  const signIn = async () => {
    await page.getByLabel("Email", { exact: true }).fill(email); await tap("Email me a code"); await see("Check your email");
    await page.getByLabel("Code from the email").fill(await latestCode()); await tap("Sign in");
  };
  const setUpTv = async () => {
    await tap("Set up my TV"); await see("Which home screen");
    await tap("Google TV"); await tap("Next"); await tap("Next"); await tap("Done, find my TV");
    await see("Living room TV"); await tap("Living room TV"); await see("Look at your TV");
    await tap("Preview: tap Allow on the TV"); await see("Is this your TV?");
  };
  const tap = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).last().click();
  const see = (text, timeout = 15000) => page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  // A fresh backend database each run: the demo TV has fixed hardware IDs, and one TV gets one free week.
  require("child_process").execFileSync("docker", ["exec", "kantv-dev-db-1", "psql", "-U", "postgres", "-d", "kantv", "-qc",
    "truncate accounts, households, tv_identifiers, account_tvs, subscriptions, webhook_events, designs, ai_spend_daily cascade"]);
  let email = `e2e-${Date.now()}@example.com`;
  const latestCode = async () => {
    for (let i = 0; i < 40; i++) {
      const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const m = r.messages?.[0]?.Snippet?.match(/\b(\d{6})\b/);
      if (m) return m[1];
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("no code email");
  };
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await see("Ad-free home screen for your TV"); await see("Sign in"); await shot("home-signed-out");
    // Account features send a signed-out person to sign in, then back; also on a cold start straight onto one.
    await page.goto(`http://localhost:${PORT}/account`); await see("Sign in to KanTV");
    await page.goto(`http://localhost:${PORT}/`); await see("Ad-free home screen for your TV");
    await tap("Design your home screen"); await see("Sign in to KanTV"); await shot("signin-email");
    await page.getByLabel("Email", { exact: true }).fill("not-an-email"); await tap("Email me a code"); await see("doesn't look like an email");
    await page.getByLabel("Email", { exact: true }).fill(email); await tap("Email me a code"); await see("Check your email"); await shot("signin-code");
    await page.getByLabel("Code from the email").fill("000000"); await tap("Sign in"); await see("That code isn't right");
    await page.getByLabel("Code from the email").fill(await latestCode()); await tap("Sign in");
    await see("Design your home screen"); await shot("design-after-signin");
    await page.goto(`http://localhost:${PORT}/`); await see(`Account: ${email}`);
    // Setup registers the TV with the backend: the free week starts.
    await setUpTv();
    await page.goto(`http://localhost:${PORT}/`); await see("Free trial, 7 days left"); await shot("home-trial");
    // The designer has no model key in this stack: it says so plainly instead of failing.
    await tap("Design your home screen"); await tap("Like a cosy cabin in the woods"); await tap("Design it");
    await see("Couldn't reach KanTV"); await shot("design-no-ai");
    await page.goto(`http://localhost:${PORT}/account`); await see("Free trial, until"); await shot("account");
    await tap("Delete my account"); await see("can't be undone"); await tap("Yes, delete everything");
    await see("Ad-free home screen for your TV"); await see("Sign in"); await shot("home-after-delete");
    // A new account on the same TV gets no second free week: the TV's history outlives the deleted account.
    email = `e2e-second-${Date.now()}@example.com`;
    await tap("Sign in"); await see("Sign in to KanTV"); await signIn(); await see(`Account: ${email}`);
    await setUpTv();
    await page.goto(`http://localhost:${PORT}/`); await see("Free trial over"); await shot("second-account-no-trial");
    if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
    console.log(`live walk ok (${n} screenshots) for ${email}`);
  } catch (e) {
    await page.screenshot({ path: `${OUT}/live-failed.png` }).catch(() => {});
    console.error(e); process.exitCode = 1;
  } finally {
    await browser.close(); server.close();
  }
});
