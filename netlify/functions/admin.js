// DugoutIQ — private creator stats. Reads the live-game store and returns an
// aggregate view (counts + a lightweight list). Intended only for the secret
// dashboard page; guarded by a token so a leaked URL alone isn't enough.
//
// GET  /.netlify/functions/admin?token=XXXX
//   -> { ok, stats:{ live, today, week, total, activations }, games:[...] }
//
// Env vars (Netlify site settings): BLOBS_SITE_ID, BLOBS_TOKEN, DASH_TOKEN.

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const LIVE_WINDOW = 90 * 1000;          // "live now" = updated in last 90s
const DAY = 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  const token = (event.queryStringParameters || {}).token || "";
  const expected = process.env.DASH_TOKEN;
  if (!expected || token !== expected) return json(403, { ok: false, message: "Nope" });

  let getStore;
  try { ({ getStore } = await import("@netlify/blobs")); }
  catch (e) { return json(500, { ok: false, message: "Blobs library missing" }); }

  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const tk = process.env.BLOBS_TOKEN;
  if (!siteID || !tk) return json(500, { ok: false, message: "Missing Blobs env vars" });

  let live, lic;
  try {
    live = getStore({ name: "dugoutiq-live", siteID, token: tk });
    lic = getStore({ name: "dugoutiq-activations", siteID, token: tk });
  } catch (e) { return json(500, { ok: false, message: "Store init failed: " + e.message }); }

  const now = Date.now();
  try {
    let listing;
    try { listing = await live.list(); } catch (e) { listing = { blobs: [] }; }
    const keys = (listing && listing.blobs ? listing.blobs : []).map((b) => b.key);

    const games = [];
    let liveN = 0, todayN = 0, weekN = 0;
    for (const k of keys) {
      let s;
      try { s = await live.get(k, { type: "json" }); } catch { s = null; }
      if (!s) continue;
      const updated = s.updated || 0;
      const isLive = now - updated < LIVE_WINDOW && !s.over;
      if (isLive) liveN++;
      if (now - updated < DAY) todayN++;
      if (now - updated < 7 * DAY) weekN++;
      games.push({
        code: k,
        away: (s.away && s.away.name) || "Visitors",
        home: (s.home && s.home.name) || "Home",
        sA: (s.away && s.away.runs) || 0,
        sH: (s.home && s.home.runs) || 0,
        inning: s.inning || 1,
        half: s.half === "bottom" ? "bottom" : "top",
        over: !!s.over,
        av: s.av || "",
        updated,
        live: isLive,
      });
    }
    games.sort((a, b) => (a.live === b.live ? b.updated - a.updated : a.live ? -1 : 1));

    // Unique activations (written by the license check, if present). Safe if empty.
    let activations = 0;
    try {
      const la = await lic.list();
      activations = (la && la.blobs ? la.blobs.length : 0);
    } catch (e) { activations = 0; }

    return json(200, {
      ok: true,
      stats: { live: liveN, today: todayN, week: weekN, total: games.length, activations },
      games: games.slice(0, 200),
      now,
    });
  } catch (e) {
    return json(500, { ok: false, message: "Read error: " + e.message });
  }
};
