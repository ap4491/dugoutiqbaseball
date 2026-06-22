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

const PUBLIC_TTL = 6 * 60 * 60 * 1000; // drop entries we haven't heard from in 6h

// Only ever expose team-level info — never batter/pitcher/lineup names.
const publicEntry = (code, snap) => ({
  code,
  away: String(snap.away && snap.away.name || "Visitors").slice(0, 28),
  home: String(snap.home && snap.home.name || "Home").slice(0, 28),
  ac: (snap.away && snap.away.color) || "",
  hc: (snap.home && snap.home.color) || "",
  sA: Number(snap.away && snap.away.runs || 0),
  sH: Number(snap.home && snap.home.runs || 0),
  inning: Number(snap.inning || 1),
  half: snap.half === "bottom" ? "bottom" : "top",
  over: !!snap.over,
  linescore: Array.isArray(snap.linescore)
    ? snap.linescore.slice(0, 30).map((r) => ({ away: r.away, home: r.home }))
    : [],
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
          if (now - (e.updated || 0) > PUBLIC_TTL) {
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
