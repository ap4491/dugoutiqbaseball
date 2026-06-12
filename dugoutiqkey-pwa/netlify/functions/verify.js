// DugoutIQ license verification
// Env vars (set in Netlify → Site settings → Environment variables):
//   GUMROAD_PRODUCT_ID   – your Gumroad product ID (required for Gumroad keys)
//   MANUAL_LICENSE_KEYS  – optional comma-separated keys you issue by hand
//   MAX_ACTIVATIONS      – optional device cap per key (default 5, 0 = unlimited)

const resp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return resp(405, { ok: false, message: "Method not allowed" });
  }

  let key = "";
  try {
    key = (JSON.parse(event.body || "{}").key || "").trim();
  } catch {}
  if (!key) return resp(400, { ok: false, message: "No key provided" });

  // 1) Manually issued keys (comps, refund replacements, league deals)
  const manual = (process.env.MANUAL_LICENSE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (manual.includes(key)) return resp(200, { ok: true, source: "manual" });

  // 2) Gumroad license verification
  const productId = process.env.GUMROAD_PRODUCT_ID;
  if (!productId) {
    return resp(500, { ok: false, message: "License server is not configured yet" });
  }

  try {
    const r = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        product_id: productId,
        license_key: key,
        increment_uses_count: "true",
      }).toString(),
    });
    const data = await r.json().catch(() => null);

    if (
      data &&
      data.success &&
      data.purchase &&
      !data.purchase.refunded &&
      !data.purchase.chargebacked
    ) {
      const max = parseInt(process.env.MAX_ACTIVATIONS || "5", 10);
      if (max > 0 && data.uses > max) {
        return resp(200, {
          ok: false,
          message: `This key has already been activated on ${max} devices. Reply to your purchase email if you need a reset.`,
        });
      }
      return resp(200, { ok: true, source: "gumroad" });
    }
    return resp(200, {
      ok: false,
      message: (data && data.message) || "Key not recognized — check it against your receipt.",
    });
  } catch {
    return resp(502, { ok: false, message: "Could not reach the license service — try again shortly." });
  }
};
