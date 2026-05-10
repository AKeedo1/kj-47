# The Path — Training PWA

Marcus's program. Mon / Wed / Sat. Editorial training journal that lives on your home screen.

## What it does

- Auto-detects today (Mon / Wed / Sat). Off-days show the next session.
- 7-exercise card list per day. Tap a card → form cue, video, set logger.
- Every set logger has weight + reps with quick `±2.5 kg` and `±1 rep` buttons.
- Logging a set auto-starts a 2-minute rest timer with skip / ±15s.
- "How does it feel?" — Solid / Mediocre / Joints unhappy. Adjusts the prescription.
- Per-exercise swap menu — Marcus pre-approved alternatives.
- Last session's top weight × reps shown on every exercise screen.
- Session-end note field. All data saved on-device (`localStorage`). No login. No cloud. No tracking.

## Install on your phone (PWA)

PWA install requires HTTPS, so the page must be served from a domain. Three paths:

### 1. Test locally first (same Wi-Fi as your phone)

From this folder:

```bash
cd outputs/Vita/workout-app
python -m http.server 8000
```

On your phone (same Wi-Fi), open `http://<YOUR-PC-IP>:8000` in Safari/Chrome. Find your PC's IP with `ipconfig` (Windows) — look for `IPv4 Address`.

This lets you *use* the app, but iOS will not let you install as a PWA over plain HTTP. For install you need step 2 or 3.

### 2. Netlify Drop (fastest path to install)

1. Visit [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag this entire `workout-app/` folder onto the page.
3. You get a free HTTPS URL like `https://serene-abc-123.netlify.app/`.
4. Open that URL in Safari on iPhone → Share → "Add to Home Screen".
5. Done. Icon appears on the home screen, opens full-screen.

No account required for the initial drop. Free forever for static sites.

### 3. GitHub Pages (if you want it tied to this repo)

1. Push this folder to a public GitHub repo.
2. Settings → Pages → enable Pages from branch.
3. Get an HTTPS URL like `https://<you>.github.io/<repo>/`.

## Adding to home screen

**iPhone (Safari):** Open the HTTPS URL → Share → "Add to Home Screen" → Add.
**Android (Chrome):** Open the URL → menu → "Install app".

The app opens full-screen with no browser chrome. Editorial typography, dark mode auto-respects system preference.

## File structure

```
workout-app/
├── index.html              # entry point
├── styles.css              # editorial paper-and-ink aesthetic, dark/light auto
├── app.js                  # logic — state, rendering, rest timer, swaps
├── manifest.json           # PWA metadata
├── sw.js                   # offline shell cache
├── data/
│   └── program.js          # Marcus's program + form cues + video IDs
├── icons/
│   ├── icon.svg            # source
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png
│   └── _build_icons.py     # regenerate PNGs from the SVG idea
└── README.md
```

## Updating the program

The program lives in `data/program.js`. Three constants:

- `EXERCISE_LIBRARY` — every exercise with `name`, `cue`, `video` (YouTube ID), `videoTitle`, `swaps` (array of exercise IDs).
- `PROGRAM` — `monday`, `wednesday`, `saturday`. Each has `title`, `subtitle`, `warmup`, `exercises` array.
- `FEEL_OPTIONS` — the three "how does it feel" buttons.

To swap Phase 1 → Phase 2 (week 7+, when Marcus reassesses), just edit this file. The shell stays.

## Data storage

Everything saved to `localStorage` under the key `thepath.training.v1`:
- Per-session: feel, set-by-set log, completion status, end-of-session notes
- Per-exercise: history of top weight × reps (last 20 sessions)

To wipe: in dev tools → Application → Local Storage → clear the key. Or in the app, "Reset today" wipes only today's session.

## Out of scope for v1 (intentional)

- Progression charts → revisit after 4 weeks of data
- Cloud sync → not needed unless you want desktop access too
- Plate calculator → Phase 2, when barbell lifts come back
- Custom Marcus voiceovers → separate project, weeks not hours

## Phase 1 hard rules (from Marcus)

- No barbell back squat / deadlift / overhead press until Phase 2.
- Every set leaves 4 reps in the tank. RPE 6.
- Sharp joint pain (not muscle burn) = stop the exercise, swap, log it.
- Soreness 24-48h is fine. Past 72h means we did too much — drop a set next session.

---

Built by the council.
