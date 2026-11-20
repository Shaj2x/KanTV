// The page KanTV Connect opens on the computer: one QR code to scan with the iPhone, and the link to type.
import QRCode from "qrcode";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function welcomePage(url: string): Promise<string> {
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1F1F1F", light: "#FFFFFF" } });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KanTV Connect</title>
<style>
  :root { --ink:#1F1F1F; --muted:#555; --line:#E6E6E6; --mint:#A1FFCB; --bg:#FFFFFF; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--ink); font:17px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; display:flex; align-items:center; justify-content:center; padding:32px 16px; }
  main { width:100%; max-width:880px; display:grid; grid-template-columns: 1fr 340px; gap:56px; align-items:center; }
  .mark { display:flex; flex-direction:column; gap:4px; width:30px; margin-bottom:28px; }
  .mark i { display:block; height:7px; border-radius:4px; background:var(--ink); }
  h1 { font-size:44px; line-height:1.05; letter-spacing:-0.03em; margin:0 0 16px; font-weight:600; }
  p { color:var(--muted); margin:0 0 12px; max-width:30em; }
  ol { padding:0; margin:28px 0 0; list-style:none; counter-reset:s; }
  li { counter-increment:s; display:grid; grid-template-columns:32px 1fr; gap:12px; padding:14px 0; border-top:1px solid var(--line); }
  li::before { content:counter(s); width:26px; height:26px; border-radius:13px; background:var(--mint); display:grid; place-items:center; font-size:14px; font-weight:600; }
  .qr { background:#fff; border:1px solid var(--line); border-radius:24px; padding:28px; }
  .qr svg { width:100%; height:auto; display:block; }
  .link { margin-top:16px; font:15px ui-monospace, Menlo, Consolas, monospace; word-break:break-all; text-align:center; color:var(--ink); user-select:all; }
  .ok { display:inline-flex; align-items:center; gap:8px; font-size:15px; color:var(--muted); margin-top:24px; }
  .ok::before { content:""; width:8px; height:8px; border-radius:4px; background:#1DB954; }
  @media (max-width: 760px) { main { grid-template-columns:1fr; gap:32px; } h1 { font-size:34px; } }
</style></head>
<body><main>
  <section>
    <div class="mark"><i style="width:100%"></i><i style="width:70%"></i><i style="width:40%"></i></div>
    <h1>Scan this with your iPhone</h1>
    <p>KanTV opens in Safari and reaches your TV through this computer.</p>
    <ol>
      <li><span>Put the iPhone on the <b>same Wi-Fi</b> as this computer and the TV.</span></li>
      <li><span>Open the <b>Camera</b> and point it at the code, then tap the link that appears.</span></li>
      <li><span>Leave this window and KanTV Connect open until you're done.</span></li>
    </ol>
    <div class="ok">KanTV Connect is running</div>
  </section>
  <aside>
    <div class="qr">${qr}</div>
    <div class="link">${esc(url)}</div>
  </aside>
</main></body></html>`;
}
