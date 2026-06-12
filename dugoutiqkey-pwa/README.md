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

## Selling it: license keys (Gumroad)

The app shows an activation screen on first launch. Keys verify once against
`/.netlify/functions/verify`, then the device stays activated forever — fully
offline after that one check.

**Setup (one time):**
1. Create your product on Gumroad → enable **"Generate a unique license key per sale"**
2. In Netlify → Site settings → **Environment variables**, add:
   - `GUMROAD_PRODUCT_ID` — from your Gumroad product's edit page
   - `MANUAL_LICENSE_KEYS` *(optional)* — comma-separated keys you hand out yourself
     (comps, league deals, your own devices), e.g. `COACH-AARON-1,LEAGUE-DEMO-2`
   - `MAX_ACTIVATIONS` *(optional)* — devices allowed per key (default 5, 0 = unlimited)
3. Redeploy after setting variables.

**Important:** serverless functions do NOT work with drag-and-drop deploys
(app.netlify.com/drop). Deploy with the Netlify CLI (`netlify deploy --prod`)
or by connecting a Git repo. Everything else about the app tolerates Drop;
license verification is the one piece that doesn't.

**Buyer experience:** purchase on Gumroad → key arrives in the receipt email →
enter it once on the activation screen → done. Refunded or charged-back keys
stop activating new devices automatically. To reset a customer's activations,
use Gumroad's "reset uses" on their purchase.

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
