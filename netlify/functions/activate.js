// DugoutIQ — record an activation. Fire-and-forget from the app after a key
// verifies, and once per app open for already-activated users. Stores one entry
// per unique key so the creator dashboard can count real owners.
//
// Privacy: we store a SHA-256 hash of the key, never the key itself.
//
// POST { key } -> { ok: true }
//
// Env vars: BLOBS_SITE_ID (or SITE_ID), BLOBS_TOKEN — already set for the
// existing game/backup functions. No new variable needed.

const crypto = require("crypto");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  // Telemetry must NEVER break the app: every failure path still returns 200.
  let getStore;
  try { ({ getStore } = await import("@netlify/blobs")); }
  catch (e) { return json(200, { ok: false }); }

  const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (!siteID || !token) return json(200, { ok: false });

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch (e) { return json(200, { ok: false }); }

  const key = String((data && data.key) || "").trim();
  if (!key) return json(200, { ok: false });

  const id = crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);

  try {
    const store = getStore({ name: "dugoutiq-activations", siteID, token });
    let existing = null;
    try { existing = await store.get(id, { type: "json" }); } catch (e) { existing = null; }
    const now = Date.now();
    await store.setJSON(id, {
      first: (existing && existing.first) || now, // first ever activation
      last: now,                                  // most recent app open
      opens: ((existing && existing.opens) || 0) + 1,
    });
  } catch (e) { /* swallow */ }

  return json(200, { ok: true });
};
