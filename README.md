# KanTV

Make an Android TV / Google TV yours: remove the ads and preinstalled junk, replace the home screen with a clean
launcher, design its look with AI from a plain-English description, and control it all from your phone.

Built on the open-source [cleanyourtv](https://github.com/Gathin23/cleanyourtv) project. KanTV is independent and
not affiliated with or endorsed by it.

The architecture and build plan are in [docs/PLAN.md](docs/PLAN.md).

## Development

Needs Node 22 and Python 3, and an upstream cleanyourtv checkout next to this repo at the commit in
`upstream.lock.json` (`git clone https://github.com/Gathin23/cleanyourtv ../cleanyourtv`).

```bash
npm ci
python3 -m venv testing/venv && testing/venv/bin/pip install -r testing/requirements.txt
npm test                 # unit tests, and the list feed built from upstream
npm run conformance      # upstream's own scripts vs the KanTV port, on the same fake TVs
npm run lists:build -- --dev-key
```

What Phase 0 built and how it is checked: [docs/phase0.md](docs/phase0.md).
