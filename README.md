# Sia's Videos 📺

A safe, mobile-first YouTube player for a toddler. The child sees a clean,
scrollable grid of **only the videos a grown-up has added** — no search, no
recommendations, no comments, and no way to wander off into the rest of YouTube.
When a video ends, the next one in the list plays automatically.

It's a plain static **Progressive Web App** (HTML/CSS/JS, no build step) that you
can install to a phone's home screen and run like a real app.

## How it keeps the child boxed in

- Videos play through the **YouTube IFrame Player API**, so the app detects when
  a video *ends* and immediately starts the next one in your list — YouTube's
  "suggested videos" end screen never appears.
- A transparent **tap-shield** sits over the video so taps can't reach YouTube's
  logo or title link. The child controls playback with three big buttons
  (Back / Play-Pause / Next), or by tapping the video to pause.
- There is no search box and no related content anywhere on the child's screens.

## Run it locally

From inside this folder, start any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open the printed URL (e.g. `http://localhost:8080`) on your computer.
To try it on a phone on the same Wi-Fi, use your computer's LAN IP
(e.g. `http://192.168.1.20:8080`).

> Tip: `localhost` and any `https://` URL are "secure contexts" and use proper
> SHA-256 hashing for the PIN. On a plain `http://` LAN IP the app still works
> and falls back to a simple hash (a child's PIN isn't a real secret).

## Add videos (parent)

1. On the grid, **long-press the top-right corner for ~1.2 seconds**.
2. The first time, **create a 4-digit PIN** (you'll confirm it). After that,
   you'll just enter the PIN.
3. Paste a YouTube link and tap **Add**. The title fills in automatically.
   Supported link shapes: `youtube.com/watch?v=…`, `youtu.be/…`,
   `youtube.com/shorts/…`, `/embed/…`, or a bare 11-character video ID.
4. Reorder with ▲ / ▼ or remove with 🗑️. Tap **Done** to return to the grid.
5. **Change PIN** is at the bottom of the manage screen.

The list and PIN are stored on the device (localStorage) — private, no account.

## Install to the home screen

- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app* / *Add to Home screen*.

It launches full-screen from the icon. The app shell is cached for offline use,
but **playing videos still needs an internet connection**.

## Deploy (optional, free)

It's just static files, so drop the whole folder onto any static host:

- **Netlify:** drag-and-drop the folder at app.netlify.com, or `netlify deploy`.
- **GitHub Pages:** push to a repo and enable Pages on the branch root.
- **Vercel / Cloudflare Pages:** point them at this folder.

Any HTTPS host gives you secure-context PIN hashing and a proper installable PWA.

### Deploy on Render

This repo is Render-ready two ways. Either gives you a free `https://…onrender.com`
URL. There is **no backend and no API key**, so there are no server-side API
calls, no quotas, and (because it's static) **no free-tier spin-down / cold
starts** — those only affect Render *Web Services*, not what we deploy here.

**Option A — Docker (included).** A `Dockerfile`, `nginx.conf.template`, and
`render.yaml` are committed.

1. Push this folder to a GitHub/GitLab repo.
2. Render Dashboard → **New → Blueprint** → pick the repo. It reads `render.yaml`
   and creates a Dockerized nginx service on the free plan.
   (Or **New → Web Service → Docker** and accept the defaults.)
3. Deploy. nginx listens on Render's `$PORT` automatically.

**Option B — Static Site (no Docker).** Even simpler:

1. Render Dashboard → **New → Static Site** → pick the repo.
2. **Build Command:** leave empty. **Publish Directory:** `.`
3. Deploy.

> Note: the video list and PIN live in the browser's `localStorage`, which is
> per-origin and per-device. After deploying you'll re-add your videos once on
> the new URL (and again on each device). That's by design — fully private, no
> account, no backend.

## Notes / limitations

- Some videos have embedding disabled by their owner; those show a friendly
  "can't play here" message with Next/Back still available.
- The IFrame API minimizes but cannot 100% remove YouTube branding; the
  tap-shield + custom controls are what truly prevent navigating away.
- The app icon (`icons/icon.svg`) is a placeholder — swap in your own if you like.

## File layout

```
index.html            three screens: grid / player / parent
css/styles.css        mobile-first dark theme, large tap targets
js/storage.js         video list + PIN in localStorage
js/youtube.js         link parsing, thumbnails, oEmbed title lookup
js/player.js          IFrame API wrapper (auto-advance on end)
js/parent.js          long-press entry, PIN pad, add/remove/reorder
js/app.js             screen routing + grid + player wiring
manifest.webmanifest  PWA manifest (installable)
service-worker.js     caches the app shell for offline UI
icons/icon.svg        app icon
```
