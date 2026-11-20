// The real-TV path end to end: starts a simulated TV (testing/fake-tv/adbd.py on this machine's network
// address, port 5555) and KanTV Connect, then a phone-sized browser opens the link, finds the TV by address,
// connects over ADB, cleans up, locks up, and restores, checking the TV's own state after each.
//   npm run build -w @kantv/connect && node apps/connect/e2e/walk.cjs [screenshot dir]
// The browser opens the helper on 127.0.0.1 (some sandboxes proxy a browser's LAN WebSockets); the helper
// still reaches the TV over the network, as at home.
const { chromium, devices } = require("playwright");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const OUT = process.argv[2] || os.tmpdir();
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "kantv-connect-e2e-"));
const STATE = path.join(WORK, "tv.json");
const HOST = Object.values(os.networkInterfaces()).flat().find((a) => a.family === "IPv4" && !a.internal).address;
const PORT = 7790;
const procs = [];
const run = (cmd, args, env) => {
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  procs.push(p);
  return new Promise((resolve, reject) => {
    let out = "";
    p.stdout.on("data", (d) => ((out += d), /READY|KanTV Connect is running/.test(out) && resolve(p)));
    p.once("exit", (c) => reject(new Error(`${cmd} exited ${c}: ${out.slice(-300)}`)));
  });
};
const tvOn = () => run(path.join(ROOT, "testing/venv/bin/python"), ["testing/fake-tv/adbd.py", "--host", HOST, "--port", "5555", "--keys", path.join(WORK, "keys"), "--prompt", "accept"], { FAKE_TV_STATE: STATE });

(async () => {
  execFileSync("npx", ["tsx", "apps/connect/e2e/state.ts", STATE], { cwd: ROOT });
  fs.writeFileSync(path.join(WORK, "keys"), "");
  await tvOn();
  // KANTV_CONNECT_BIN tests the packaged program instead of the source.
  const bin = process.env.KANTV_CONNECT_BIN;
  await run(bin ?? "npx", bin ? [] : ["tsx", "apps/connect/src/main.ts"], { KANTV_NO_BROWSER: "1", KANTV_CONNECT_HOME: path.join(WORK, "home"), PORT: String(PORT) });
  const URL_ = `http://127.0.0.1:${PORT}/?key=${fs.readFileSync(path.join(WORK, "home", "link-key"), "utf8")}`;
  const browser = await chromium.launch();
  const { defaultBrowserType, ...iphone } = devices["iPhone 15"];
  const context = await browser.newContext({ ...iphone, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  let n = 0;
  const shot = async (name) => (await page.waitForTimeout(300), page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` }));
  const tap = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).last().click();
  const see = (text, timeout = 20000) => page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  try {
    await page.goto(URL_);
    await see("Ad-free home screen for your TV");
    if (await page.getByText("Demo TV").count()) throw new Error("the demo banner is showing on the real-TV build");
    await shot("home");
    await tap("Set up my TV"); await see("Which home screen");
    await tap("Google TV"); await see("Find the build number");
    await tap("Next"); await see("Turn on USB debugging");
    await tap("Next"); await see("Wireless or Network debugging");
    await tap("Done, find my TV"); await see("KanTV Connect and the TV need to be on the same Wi-Fi"); await shot("find");
    await tap("My TV isn't showing up");
    await page.getByLabel("TV IP address").fill(HOST);
    await tap("Connect"); await see("Is this your TV?", 30000); await shot("model");
    await tap("Yes, that's it"); await see("Do you cast to this TV");
    await page.getByText("No", { exact: true }).click();
    await tap("Check with the TV"); await see("Ready to clean up", 30000); await shot("review-checked");
    const btn = await page.getByText(/^Turn off \d+ apps$/).textContent();
    await page.getByText(/^Turn off \d+ apps$/).click();
    await see("Your TV is cleaned up", 90000); await shot("run-done");
    const tv = JSON.parse(fs.readFileSync(STATE, "utf8"));
    console.log(`TV now has ${tv.disabled.length} apps disabled`);
    if (!tv.disabled.length) throw new Error("nothing was disabled on the TV");
    await tap("Finish setup"); await see("All done, and locked up", 60000); await shot("finish");
    // Restore: the person switches debugging back on at the TV, then KanTV puts every app back.
    await tap("Go to my TV"); await see("apps turned off");
    const on = JSON.parse(fs.readFileSync(STATE, "utf8")); on.settings.adb_enabled = "1"; fs.writeFileSync(STATE, JSON.stringify(on));
    await tvOn();
    await tap("Restore my TV"); await see("Start restore"); await tap("Start restore");
    await see("back to how it was", 90000); await shot("restore-done");
    const back = JSON.parse(fs.readFileSync(STATE, "utf8"));
    if (back.disabled.length) throw new Error(`restore left ${back.disabled.length} apps disabled`);
    console.log("Restore put every app back");
    console.log("FLOW OK", btn);
  } catch (e) {
    console.log("FLOW FAILED after shot", n, String(e).split("\n")[0]);
    process.exitCode = 1;
    await page.screenshot({ path: `${OUT}/failed.png` });
  }
  console.log("console errors:", errors.length ? errors.join("\n") : "none");
  await browser.close();
  procs.forEach((p) => p.kill());
})().catch((e) => (console.log("FAILED", e.message), procs.forEach((p) => p.kill()), (process.exitCode = 1)));
