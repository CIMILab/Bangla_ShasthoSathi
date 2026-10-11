# Bangla_ShasthoSathi — ShasthoSathi project page

Live at **https://cimilab.github.io/Bangla_ShasthoSathi/** (web app at `/app/`).

Static site, no build step: project page (`index.html`, `css/`, `js/`, `assets/`) and the full in-browser web app
(`app/`). Everything runs in the visitor's browser; nothing is uploaded.

Preview locally: `python -m http.server 8090` in this folder → http://localhost:8090

Publish: Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.
`.nojekyll` makes GitHub serve every file as is.
