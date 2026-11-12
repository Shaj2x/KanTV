const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
// Walks the whole app in Chromium at phone size against the web export (demo TV): setup, cleanup, closing
// debugging, remote, Restore. Fails on any missing step or browser console error; writes a screenshot per screen.
//   npx expo export --platform web --output-dir dist && node e2e/walk.cjs <screenshot dir>
const DIST = require("path").join(__dirname, "..", "dist"), OUT = process.argv[2] || require("os").tmpdir();
const types = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  let n = 0;
  const shot = async (name, h) => {
    if (h) await page.setViewportSize({ width: 400, height: h });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` });
    if (h) await page.setViewportSize({ width: 400, height: 860 });
  };
  const tap = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).last().click();
  const see = (text, timeout = 15000) => page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await see("Ad-free home screen for your TV"); await shot("home");
    await tap("Set up my TV"); await see("Which home screen"); await shot("tv-family");
    await tap("Google TV"); await see("Find the build number"); await shot("dev-mode-1");
    await tap("Next"); await see("Turn on USB debugging"); await shot("dev-mode-2");
    await tap("Next"); await see("Wireless or Network debugging"); await shot("dev-mode-3");
    await tap("Done, find my TV"); await see("Living room TV"); await shot("find");
    await tap("Living room TV"); await see("Look at your TV"); await shot("allow-prompt");
    await tap("Preview: tap Allow on the TV"); await see("Is this your TV?"); await shot("model");
    await tap("Yes, that's it"); await see("Do you cast to this TV"); await shot("review-question");
    await page.getByText("No", { exact: true }).click();
    await shot("review-list", 2200);
    await tap("Check with the TV"); await see("Ready to clean up"); await shot("review-checked", 1300);
    const btn = await page.getByText(/^Turn off \d+ apps$/).textContent();
    await page.getByText(/^Turn off \d+ apps$/).click(); await page.waitForTimeout(1200); await shot("run-progress");
    await see("Your TV is cleaned up", 30000); await shot("run-done");
    await tap("Finish setup"); await see("All done, and locked up", 20000); await shot("finish", 1200);
    await tap("Go to my TV"); await see("apps turned off"); await shot("home-after");
    await tap("Remote"); await page.getByLabel("Up", { exact: true }).waitFor(); await page.getByLabel("Up", { exact: true }).click(); await page.getByLabel("Volume up", { exact: true }).click(); await shot("remote");
    await page.goBack(); await tap("Restore my TV"); await see("Start restore"); await shot("restore-intro");
    await tap("Start restore"); await see("Allow USB debugging?"); await tap("Preview: tap Allow on the TV");
    await see("back to how it was", 20000); await shot("restore-done");
    await tap("Switch debugging off again"); await see("All done, and locked up", 20000);
    await tap("Go to my TV"); await see("Free trial");
    await tap("Design"); await see("Design your home screen"); await shot("design-empty");
    await tap("Like a cosy cabin in the woods"); await tap("Design it"); await see("Try another take", 15000); await shot("design-result", 1500);
    const first = await page.getByText(/^(Ember Lounge|Deep Ocean|Swiss Grid|Botanical|Neon Noir|Art Deco)$/).filter({ visible: true }).first().textContent();
    await tap("Try another take"); await page.waitForTimeout(1600);
    const second = await page.getByText(/^(Ember Lounge|Deep Ocean|Swiss Grid|Botanical|Neon Noir|Art Deco)$/).filter({ visible: true }).first().textContent();
    if (first === second) throw new Error(`another take gave the same design (${first})`);
    await shot("design-another", 1500);
    await tap("Put it on my TV"); await see("ready to send"); await shot("design-applied", 1700);
    await tap("My designs"); await see("2 saved"); await shot("saved", 1500);
    await page.goBack(); await page.goBack(); await see("Free trial");
    await tap("Preview: end the free trial"); await see("Free trial over");
    await tap("Design"); await see("Your free week is over"); await shot("design-after-trial");
    await tap("My designs"); await see("Your designs are safe"); await shot("saved-locked", 1500);
    await tap("See plans"); await see("Keep your TV looking yours"); await shot("paywall");
    await tap("Subscribe monthly"); await see("Your designs are safe", 15000).catch(() => {});
    await page.waitForTimeout(800);
    if (await page.getByText("Paused", { exact: true }).filter({ visible: true }).count()) {
      await page.goBack(); await page.waitForTimeout(400);
    }
    await page.goBack(); await page.goBack(); await see("Subscribed"); await shot("home-subscribed");

    console.log("FLOW OK", btn);
  } catch (e) {
    console.log("FLOW FAILED at step", n, String(e).split("\n")[0]);
    process.exitCode = 1;
    await page.screenshot({ path: `${OUT}/failed.png` });
  }
  console.log("console errors:", errors.length ? errors.join("\n") : "none");
  await browser.close(); server.close();
  if (process.exitCode === undefined && (errors.length || n < 25)) process.exitCode = 1;
});
