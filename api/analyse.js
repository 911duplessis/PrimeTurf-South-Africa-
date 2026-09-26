/**
 * POST /api/analyse — vision pre-fill for the visualiser (Vercel serverless function).
 *
 * Request:  { image: { mediaType: "image/jpeg", data: "<base64>" } }
 * Response: { isOutdoorSpace, surface, areaM2: {low, high}, polygon: [[x,y]...], observations: [] }
 *
 * The browser only calls this when `visualiser.apiBase` is set in src/_data/site.json.
 * Any failure here is non-fatal: the visualiser simply continues with the user's answers.
 *
 * Env: ANTHROPIC_API_KEY (set in Vercel → Project → Settings → Environment Variables).
 * Never expose the key to the browser.
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isOutdoorSpace", "surface", "areaM2", "polygon", "observations"],
  properties: {
    isOutdoorSpace: { type: "boolean" },
    surface: { type: "string", enum: ["lawn", "soil", "paving", "old-turf", "mixed"] },
    areaM2: {
      type: "object",
      additionalProperties: false,
      required: ["low", "high"],
      properties: { low: { type: "number" }, high: { type: "number" } },
    },
    // Outline of the area that would receive turf, as normalised [x, y] points (0..1, origin top-left).
    polygon: { type: "array", items: { type: "array", items: { type: "number" } } },
    observations: { type: "array", items: { type: "string" } },
  },
};

const PROMPT = `You are helping an artificial turf installer in South Africa pre-fill a quote form from a customer's photo.
Look at the photo and return:
- isOutdoorSpace: false if this is not a garden, yard, verge, pool area or similar outdoor ground.
- surface: what currently covers the ground where turf would go (lawn, soil, paving, old-turf or mixed).
- areaM2: a cautious low/high estimate of that ground area in square metres, using doors (~2.1 m tall), paving slabs, walls and fences for scale. Keep the range wide when unsure.
- polygon: 4–12 points outlining only the ground that would receive turf (exclude paving, pools, beds, walls), normalised 0..1 with origin top-left.
- observations: up to 4 short, factual notes relevant to installation (slope, shade, trees, drainage signs, access). No sales language.`;

const MAX_BASE64 = 6 * 1024 * 1024; // ~4.5 MB image

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  // TODO before going live: rate-limit by IP (e.g. Vercel KV / Upstash) and check Origin.
  const image = req.body?.image;
  if (!image?.data || !/^image\/(jpeg|png|webp)$/.test(image.mediaType || "")) {
    return res.status(400).json({ error: "image {mediaType, data} required" });
  }
  if (image.data.length > MAX_BASE64) return res.status(413).json({ error: "image too large" });

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      // Re-routes automatically if a request is declined by a safety classifier.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "declined" });
    const text = response.content.find((b) => b.type === "text")?.text;
    const result = JSON.parse(text);
    if (!result.isOutdoorSpace) return res.status(200).json({ isOutdoorSpace: false });

    // Sanitise before it reaches the browser.
    result.polygon = (result.polygon || [])
      .filter((p) => Array.isArray(p) && p.length === 2)
      .map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: "upstream" });
    return res.status(500).json({ error: "failed" });
  }
}
