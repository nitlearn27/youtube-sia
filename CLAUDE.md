# CLAUDE.md

Guidance for working in this repo.

## What this is

**Sia's Videos** — a safe, mobile-first YouTube player for a toddler. The child
sees a scrollable grid of only the videos a grown-up has added: no search, no
recommendations, no comments, no way to navigate into YouTube proper. When a
video ends, the next one auto-plays.

It is a **plain static PWA** — vanilla HTML/CSS/ES modules, **no build step, no
backend, no API key, no dependencies**. Just serve the folder.

## Run / dev

```bash
npx serve .              # or: python3 -m http.server 8080
```

There is no build, no bundler, no test suite, no linter configured. Edit a file
and reload. `localhost` and any `https://` origin are secure contexts (real
SHA-256 PIN hashing); plain `http://` LAN IPs fall back to a weak hash (see
`js/storage.js`) — acceptable because a child's PIN isn't a real secret.

## Architecture

Three screens in one `index.html` (`#screen-grid`, `#screen-player`,
`#screen-parent`); `showScreen()` in `app.js` toggles the `.active` class. ES
modules wire everything together — no framework.

- `js/app.js` — controller: screen routing, grid render, player orchestration,
  swipe/scroll/tap gestures, service-worker registration.
- `js/player.js` — YouTube IFrame Player API wrapper. Uses the IFrame API
  (not a plain embed) specifically so it can detect the `ENDED` state and
  auto-advance, preventing YouTube's "suggested videos" end screen from showing.
- `js/storage.js` — `localStorage` persistence for the video list (`sia.videos`)
  and PIN hash (`sia.pin`). No accounts; per-device, per-origin.
- `js/youtube.js` — keyless helpers: link → 11-char id parsing, thumbnail URLs,
  oEmbed title lookup.
- `js/parent.js` — PIN pad + add/remove/reorder UI.
- `css/styles.css` — mobile-first dark theme, large tap targets.
- `service-worker.js` — caches the app shell for offline UI.

## Things to know before changing code

- **Never move the `#yt` iframe in the DOM.** Moving an iframe reloads it and
  breaks the IFrame API. There is one fixed player; switching videos calls
  `player.loadVideoById()` on it (see the note in `app.js`).
- **The tap-shield (`#tap-shield`) is load-bearing for child safety**, not just
  UX. It sits over the video to block taps from reaching YouTube's logo/title
  links. Custom controls + this shield are what truly box the child in;
  `modestbranding`/`rel:0`/`controls:0` in `player.js` only minimize chrome.
- **Cross-origin requests are intentionally never cached** by the service
  worker — only same-origin app-shell assets are. Playing videos always needs
  the network.
- **Bump the `CACHE` constant in `service-worker.js`** (`sia-v4` → `sia-v5`, …)
  whenever you change a cached asset, or stale files will be served. The
  `activate` handler deletes old caches.
- **Keep `ASSETS` in `service-worker.js` in sync** with the files the app
  actually loads.

## Deploy

Static files — drop the folder on any host (Netlify, GitHub Pages, Vercel,
Cloudflare Pages). For Render, the repo is Docker-ready (`Dockerfile`,
`nginx.conf.template`, `render.yaml`) — nginx serves the shell on Render's
`$PORT`; or use Render's Static Site (publish dir `.`). No backend, no quotas,
no cold starts.

## Notes

- README.md describes parent entry as a long-press on the top-right corner, but
  the current code uses a visible `⋮` button (`#parent-btn` → `openParent`);
  the PIN gate is unchanged. Update the README if this matters.
- The app icon is `icons/icon.svg` — a YouTube-red rounded square with a dark
  inner panel and white play triangle.
- Some videos have embedding disabled by their owner; those show a friendly
  error with Next/Back still working.
</content>
</invoke>
