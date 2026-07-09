// DugoutIQ — scan a lineup card photo into a structured batting order.
//
// POST { image: "<base64 jpeg, no data: prefix>" }
//   -> { ok: true, players: [{ num, name, pos }] }  (in batting order)
//
// Requires the ANTHROPIC_API_KEY environment variable (Netlify site settings
// → Environment variables). Each scan is one small vision request.

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap; handles handwriting

const PROMPT =
  'This image shows a baseball lineup — a photo of a lineup card (possibly handwritten), a screenshot, or a text message. Extract the batting order from top to bottom. ' +
  'Respond with ONLY a JSON array — no prose, no markdown fences. Each item: ' +
  '{"num":"12","name":"Jaxon H","pos":"SS"}. Use "" for anything unreadable or absent. ' +
  'num is the jersey number (digits only). pos is a standard abbreviation (P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH, EH) or "". ' +
  'Write names exactly as written. Ignore coach names, dates, team headers, phone UI, and anything that is not a batting-order row.';

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(500, { ok: false, message: "Scanning isn't set up on this server (missing API key)" });

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return json(400, { ok: false, message: "Bad JSON" }); }

  const image = String(data.image || "");
  if (!image) return json(400, { ok: false, message: "No image" });
  if (image.length > 3.8 * 1024 * 1024) return json(413, { ok: false, message: "Photo too large — try again" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      const msg = (d && d.error && d.error.message) || "Scan failed";
      return json(502, { ok: false, message: msg });
    }
    const text = (d.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    // tolerate stray fences/prose: take the outermost JSON array
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return json(422, { ok: false, message: "Couldn't read a lineup in that photo" });
    let players;
    try { players = JSON.parse(text.slice(start, end + 1)); }
    catch { return json(422, { ok: false, message: "Couldn't read a lineup in that photo" }); }
    if (!Array.isArray(players) || !players.length)
      return json(422, { ok: false, message: "No batting order found in that photo" });
    players = players
      .slice(0, 20)
      .map((p) => ({
        num: String((p && p.num) || "").replace(/[^0-9]/g, "").slice(0, 2),
        name: String((p && p.name) || "").trim().slice(0, 40),
        pos: String((p && p.pos) || "").trim().toUpperCase().slice(0, 3),
      }))
      .filter((p) => p.name || p.num);
    if (!players.length) return json(422, { ok: false, message: "No batting order found in that photo" });
    return json(200, { ok: true, players });
  } catch (e) {
    return json(500, { ok: false, message: "Scan failed: " + e.message });
  }
};
