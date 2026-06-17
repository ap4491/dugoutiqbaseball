// DugoutIQ — live game relay for the spectator (view-only) link.
// POST { code, snap } -> store snapshot under a short code (Netlify Blobs)
// GET  ?code=XXXX     -> return latest snapshot for that code
// Blobs is configured manually with siteID + token (env vars) so it works
// reliably even when Netlify doesn't auto-inject the Blobs environment.

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
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
  if (!siteID || !token) {
    return json(500, {
      ok: false,
      message: "Missing BLOBS_SITE_ID or BLOBS_TOKEN env var",
    });
  }

  let store;
  try {
    store = getStore({ name: "dugoutiq-live", siteID, token });
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
      return json(200, { ok: true, code });
    }

    if (event.httpMethod === "GET") {
      const code = String((event.queryStringParameters || {}).code || "").trim().toUpperCase();
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
