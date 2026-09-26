/**
 * POST /api/concept — AI "after" image (Vercel serverless function). STUB.
 *
 * Request:  { image: {mediaType, data}, polygon: [[x,y]...], look: "natural"|"lush"|"hardwearing"|"putting", use }
 * Response: { imageUrl: "https://… or data:image/jpeg;base64,…" }
 *
 * Until an image model is connected this returns 501, and the browser falls back
 * to the local procedural overlay (src/assets/js/visualiser/renderer.js) — the
 * visitor never sees an error.
 *
 * HOW TO CONNECT AN IMAGE-EDITING MODEL
 * 1. Pick a provider that supports image editing / inpainting with a mask.
 * 2. Build a mask from `polygon` (white = replace, black = keep) at the image's
 *    size — e.g. with `sharp` + an SVG polygon, or send the polygon if the
 *    provider accepts regions.
 * 3. Prompt with the look, e.g.
 *      "Replace the masked ground with professionally installed artificial turf,
 *       ${LOOK_PROMPTS[look]}. Keep everything outside the mask unchanged.
 *       Match the photo's lighting, shadows and perspective. Photorealistic."
 * 4. Upload the result to storage (Vercel Blob, S3, Cloudinary) and return its URL,
 *    or return a data URL for small images.
 * 5. Keep the "concept only" labelling: the UI shows it, but also stamp the image.
 *
 * Tip: run /api/analyse first and pass its polygon here when the user didn't draw one.
 */
const LOOK_PROMPTS = {
  natural: "natural mixed greens with a few straw-coloured fibres, medium pile",
  lush: "deep even green, dense and soft, longer pile",
  hardwearing: "resilient shorter pile in a mid green",
  putting: "short, tight putting-green surface with a clean fringe",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { image, polygon, look = "natural" } = req.body || {};
  if (!image?.data || !Array.isArray(polygon)) return res.status(400).json({ error: "image and polygon required" });

  if (!process.env.IMAGE_API_KEY) {
    return res.status(501).json({ error: "image model not configured", hint: "see api/concept.js" });
  }

  // const mask = await polygonToMaskPng(polygon, width, height);
  // const result = await yourImageProvider.edit({ image, mask, prompt: buildPrompt(LOOK_PROMPTS[look]) });
  // const url = await uploadToStorage(result);
  // return res.status(200).json({ imageUrl: url });
  void LOOK_PROMPTS[look];
  return res.status(501).json({ error: "not implemented" });
}
