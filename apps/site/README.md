# KanTV website

A static product page (`index.html`) built with the taste skill's kit (`assets/`, MIT, from
github.com/leonxlnx/taste-skill), plus the demo web app under `/app`.

- Published by `.github/workflows/pages.yml` to GitHub Pages on every push to main (the site at
  `https://<owner>.github.io/<repo>/`, the demo app at `.../app/`). One-time setup: Settings > Pages > Source:
  GitHub Actions.
- Build locally: `apps/site/build.sh` (exports the Expo web app into `app/`, served at `/app`).
- Serve the folder as static files; `index.html` is the page.
- Still to supply: the domain (then uncomment the canonical link), a real contact address in place of
  `hello@kantv.example`, and Privacy and Terms pages once the drafts in `docs/legal` are final.
- `.taste-skill/waivers.json` lists the three checker findings that were waived, each with its reason.
