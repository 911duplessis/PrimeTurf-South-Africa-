/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AI PROVIDER ADAPTER — the single seam between the visualiser UI and any AI.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The UI (visualiser.js) only ever calls these three methods:
 *
 *   analyse(photo)                    → optional pre-fill from a vision model
 *       photo: HTMLCanvasElement
 *       returns { areaM2?: {low, high}, surface?: string, polygon?: number[][],
 *                 observations?: string[] } | null
 *
 *   generateConcept({ photo, polygon, answers })  → the "after" image
 *       returns { src: string (data: or https: URL), kind: 'local'|'ai' }
 *
 *   isRemote: boolean                 → UI copy ("processed in your browser" vs "uploaded")
 *
 * TWO IMPLEMENTATIONS
 *   LocalProvider   — today. No network. Procedural turf composited into the
 *                     user-marked area (renderer.js). Always available.
 *   RemoteProvider  — tomorrow. Calls your backend (see /api in the repo):
 *                       POST {apiBase}/analyse  → vision model (e.g. Claude)
 *                       POST {apiBase}/concept  → image-editing / inpainting model
 *                     Falls back to LocalProvider on any error or timeout, so the
 *                     visitor always gets a result.
 *
 * TO GO LIVE WITH REAL AI
 *   1. Deploy the functions in /api (Vercel) and set their env vars.
 *   2. Set `visualiser.apiBase` in src/_data/site.json (e.g. "/api").
 *   3. Nothing else changes — getProvider() picks RemoteProvider automatically.
 *
 * NEVER put model API keys in this file or anywhere in /src — the browser
 * can read everything here. Keys live only in the server functions.
 */
import { renderConcept, canvasToDataURL } from "./renderer.js";

export const LocalProvider = {
  name: "local",
  isRemote: false,
  async analyse() {
    return null; // Nothing to infer without a model; the user answers the questions.
  },
  async generateConcept({ photo, polygon, answers }) {
    // Yield a frame so the loading state paints before the heavy canvas work.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    const canvas = renderConcept(photo, polygon, answers.look);
    return { src: canvasToDataURL(canvas), kind: "local" };
  },
};

export function RemoteProvider(apiBase, { timeoutMs = 45000 } = {}) {
  const post = async (path, body) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  };
  // Send a smaller JPEG to keep uploads quick on mobile data.
  const toPayload = (canvas) => {
    const k = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
    const c = document.createElement("canvas");
    c.width = Math.round(canvas.width * k);
    c.height = Math.round(canvas.height * k);
    c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
    return { mediaType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
  };

  return {
    name: "remote",
    isRemote: true,
    async analyse(photo) {
      try {
        return await post("/analyse", { image: toPayload(photo) });
      } catch (err) {
        console.warn("[visualiser] analyse failed, continuing without it", err);
        return null;
      }
    },
    async generateConcept({ photo, polygon, answers }) {
      try {
        const { imageUrl } = await post("/concept", { image: toPayload(photo), polygon, look: answers.look, use: answers.use });
        if (!imageUrl) throw new Error("no imageUrl");
        return { src: imageUrl, kind: "ai" };
      } catch (err) {
        console.warn("[visualiser] remote concept failed, using local overlay", err);
        return LocalProvider.generateConcept({ photo, polygon, answers });
      }
    },
  };
}

export function getProvider() {
  const apiBase = window.PRIMETURF?.visualiser?.apiBase;
  return apiBase ? RemoteProvider(apiBase) : LocalProvider;
}
