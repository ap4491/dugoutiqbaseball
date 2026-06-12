# DugoutIQ — Smart Lineup Card (PWA)

One-tap baseball scorekeeping: editable lineup card (9-15 batters), balls/strikes/outs,
linescore with R/H/E, drag-and-drop named baserunners, per-pitcher stats (IP, H, R, BB, K, HR, NP),
pitch-limit warnings, plate-appearance play-by-play, score-graphic sharing, double-header rematch,
and lineup export/import. Autosaves locally, installable, works offline. No accounts, no API
keys, no running costs.

## Deploy (any static host)
Upload this folder to Netlify, Vercel, GitHub Pages, or Cloudflare Pages (HTTPS required
for offline mode and installation — all of the above provide it by default).
- Netlify: drag-and-drop this folder at app.netlify.com/drop
- GitHub Pages: push to a repo, enable Pages
- Vercel: `vercel deploy` from this folder

## Install on a phone
- iPhone: open the URL in Safari -> Share -> Add to Home Screen
- Android: open in Chrome -> Install app

## Notes
- Game state autosaves on-device; "New game" asks for confirmation before clearing
- Lineups persist between games. Save up to 12 rosters to "My Teams" for one-tap loading
  into either side; use Export/Import Lineups to move rosters between devices
- First load needs internet (React from unpkg, then cached); afterwards it runs fully offline
- Update a deployed site by deploying again
- Source: the dugout-scorecard.jsx artifact; recompile with
  `tsc app.jsx --jsx react --target es2020 --allowJs`


