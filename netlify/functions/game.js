// DugoutIQ — live game relay for the spectator (view-only) link,
// plus an optional PUBLIC scores-only index for the games hub.
//
// POST { code, snap, list? }
//   - stores the full snapshot under `code` (private spectator view)
//   - if list === true:  writes a trimmed, team-names+score-only entry to the
//                         public index (NO player names ever)
//   - if list === false: removes that code from the public index (unlist)
// GET  ?code=XXXX  -> latest snapshot for that code (private view)
// GET  ?list=1     -> array of public scores-only entries (the hub)

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const PUBLIC_TTL = 6 * 60 * 60 * 1000;            // undated entries: 6h since last push
const EVENT_TTL = 5 * 24 * 60 * 60 * 1000;        // dated entries: 5 days AFTER the game date
const FUTURE_CAP = 60 * 24 * 60 * 60 * 1000;      // ignore dates more than ~2 months out

// When does an entry stop being listed?
//   Dated (a fixture or a played game): 5 days after the DATE OF THE GAME, so a
//   schedule published a week early still shows on opening day, and a Friday
//   game is still there on Sunday.
//   Undated: 6 hours since we last heard from it, as before.
const expiresAt = (e) => {
  const t = Date.parse(String(e.gdate || "") + "T23:59:59");
  if (!isNaN(t)) {
    // a wildly future date is almost certainly a typo — fall back to the push clock
    if (t - Date.now() < FUTURE_CAP)
      return t + EVENT_TTL;
  }
  return (e.updated || 0) + (e.ev ? EVENT_TTL : PUBLIC_TTL);
};

// Only ever expose team-level info — never batter/pitcher/lineup names.
const publicEntry = (code, snap) => ({
  code,
  away: String(snap.away && snap.away.name || "Visitors").slice(0, 28),
  home: String(snap.home && snap.home.name || "Home").slice(0, 28),
  ac: (snap.away && snap.away.color) || "",
  hc: (snap.home && snap.home.color) || "",
  // team crests (already resized to 96px by the app) — still team-level only
  al: String((snap.away && snap.away.logo) || "").slice(0, 40000),
  hl: String((snap.home && snap.home.logo) || "").slice(0, 40000),
  sA: Number(snap.away && snap.away.runs || 0),
  sH: Number(snap.home && snap.home.runs || 0),
  inning: Number(snap.inning || 1),
  half: snap.half === "bottom" ? "bottom" : "top",
  over: !!snap.over,
  linescore: Array.isArray(snap.linescore)
    ? snap.linescore.slice(0, 30).map((r) => ({ away: r.away, home: r.home }))
    : [],
  // tournament context for the hub — still team-level only
  ev: String(snap.ev || "").slice(0, 60),
  gdate: String(snap.gdate || "").slice(0, 10),
  gtime: String(snap.gtime || "").slice(0, 5),
  gfield: String(snap.gfield || "").slice(0, 24),
  // a score entered by hand — there is no play-by-play behind it
  manual: !!snap.manual,
  // a fixture published before it's played — no score yet
  sched: !!snap.sched,
  // pool letters, so the hub can build standings without a second lookup
  // round robin / semi-final / championship, for the schedule grouping
  stage: String(snap.stage || "").slice(0, 20),
  gnum: String(snap.gnum || "").slice(0, 6),
  apool: String(snap.apool || "").slice(0, 2),
  hpool: String(snap.hpool || "").slice(0, 2),
  updated: Date.now(),
});

exports.handler = async (event) => {
  let getStore;
  try {
    ({ getStore } = await import("@netlify/blobs"));
  } catch (e) {
    return json(500, { ok: false, message: "Blobs library missing" });
  }

  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (!siteID || !token)
    return json(500, { ok: false, message: "Missing BLOBS_SITE_ID or BLOBS_TOKEN env var" });

  let store, pub;
  try {
    store = getStore({ name: "dugoutiq-live", siteID, token });
    pub = getStore({ name: "dugoutiq-public", siteID, token });
  } catch (e) {
    return json(500, { ok: false, message: "Store init failed: " + e.message });
  }

  try {
    if (event.httpMethod === "POST") {
      let data;
      try { data = JSON.parse(event.body || "{}"); }
      catch { return json(400, { ok: false, message: "Bad JSON" }); }
      const code = String(data.code || "").trim().toUpperCase();
      const snap = data.snap;
      if (!/^[A-Z0-9]{4,8}$/.test(code) || !snap || typeof snap !== "object")
        return json(400, { ok: false, message: "Bad code or snapshot" });
      snap.updated = Date.now();
      await store.setJSON(code, snap);
      // Public index: opt-in only.
      if (data.list === true) {
        try { await pub.setJSON(code, publicEntry(code, snap)); } catch (e) {}
      } else if (data.list === false) {
        try { await pub.delete(code); } catch (e) {}
      }
      return json(200, { ok: true, code });
    }

    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};

      if (q.list) {
        let listing;
        try { listing = await pub.list(); } catch (e) { return json(200, { ok: true, games: [] }); }
        const keys = (listing && listing.blobs ? listing.blobs : []).map((b) => b.key);
        const now = Date.now();
        const games = [];
        for (const k of keys) {
          let e;
          try { e = await pub.get(k, { type: "json" }); } catch { e = null; }
          if (!e) continue;
          if (now > expiresAt(e)) {
            try { await pub.delete(k); } catch {}
            continue;
          }
          games.push(e);
        }
        // live games first, then most-recently updated
        games.sort((a, b) =>
          (a.over === b.over ? (b.updated || 0) - (a.updated || 0) : a.over ? 1 : -1)
        );
        return json(200, { ok: true, games });
      }

      const code = String(q.code || "").trim().toUpperCase();
      if (!code) return json(400, { ok: false, message: "No code" });
      const snap = await store.get(code, { type: "json" });
      if (!snap) return json(404, { ok: false, message: "Game not found" });
      return json(200, { ok: true, snap });
    }

    return json(405, { ok: false, message: "Method not allowed" });
  } catch (e) {
    return json(500, { ok: false, message: "Storage error: " + e.message });
  }
};
