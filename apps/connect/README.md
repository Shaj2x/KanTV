# KanTV Connect

A browser can't open a connection to a TV, so on an iPhone the KanTV web app can't reach the TV by itself.
KanTV Connect runs on a computer on the same Wi-Fi and does it: it serves the KanTV web app to the phone
over the home network, and the app sends it what to do (find the TV, connect over ADB on port 5555, run the
cleanup, check the port is closed, keep the recovery records, drive the remote). People download it from
the website's `connect.html` page; GitHub builds it for Windows, Mac and Linux (`.github/workflows/connect.yml`).

- Only a phone that opened the link it prints (with its key) can use it; the key is kept in
  `~/.kantv-connect` with the ADB key, the remote's certificate and the recovery records.
- The TV shows "Allow USB debugging?" for "KanTV Connect on <computer>" once.
- Not yet: Wireless debugging with a pairing code (TVs that only offer that see "This TV needs a pairing code").

```bash
npm run build -w @kantv/connect      # web app + one program file: apps/connect/dist/kantv-connect
```

```bash
node apps/connect/e2e/walk.cjs       # the whole real-TV path against testing/fake-tv/adbd.py
```

```bash
npx vitest run apps/connect          # the remote (pairing, keys) against a fake TV, and the SHA-256 shim
```
