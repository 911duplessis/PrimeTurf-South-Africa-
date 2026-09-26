/**
 * Procedural turf painter.
 *
 * Paints a photographic-ish lawn texture onto a 2D canvas: base tone, soft
 * colour variation, then thousands of individual blades drawn in horizontal
 * bands (far → near) with simple perspective scaling.
 *
 * Used by:
 *   - the hero (dry ground → turf reveal)
 *   - the visualiser's "look" swatches
 *   - the visualiser's client-side concept overlay (renderer.js)
 *
 * No dependencies. Deterministic for a given seed so re-renders match.
 */

/** Palettes per turf look. `dry` is the "before" state. */
export const LOOKS = {
  natural: {
    base: "#4B7431",
    blades: ["#5A8739", "#6C9A44", "#46702E", "#83A653", "#A3A566", "#3B6327"],
    tips: "#B9CC7A", length: [11, 19], width: [1.1, 1.9], density: 1.0, lean: 0.12,
  },
  lush: {
    base: "#2C6529",
    blades: ["#377A31", "#43893A", "#2D6729", "#509A41", "#33732E"],
    tips: "#8FC263", length: [13, 21], width: [1.2, 2.0], density: 1.3, lean: 0.08, stripes: true,
  },
  hardwearing: {
    base: "#3C6A2D",
    blades: ["#467A33", "#55883C", "#3A672B", "#679546"],
    tips: "#A6C57A", length: [7, 12], width: [1.2, 1.8], density: 1.2, lean: 0.1,
  },
  putting: {
    base: "#37752F",
    blades: ["#3F8236", "#377A31", "#4A8E3F"],
    tips: "#79B05A", length: [2, 4], width: [1, 1.4], density: 1.8, lean: 0.3, stripes: true,
  },
  dry: {
    base: "#8C7550",
    blades: ["#A08A5F", "#B39B6B", "#7B6743", "#8C8752", "#6A5A3B", "#9C8F5E"],
    tips: "#CDBB8A", length: [4, 11], width: [1, 1.6], density: 0.45, lean: 0.35, soil: true,
  },
};

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paint turf into ctx over (0,0,w,h).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {keyof LOOKS | object} lookKey
 * @param {{seed?:number, perspective?:boolean, scale?:number, horizon?:number}} opts
 *   perspective: blades shrink toward the top (horizon) of the area
 *   scale: global blade size multiplier (use ≈ devicePixelRatio or image scale)
 *   horizon: 0..1 — how small blades get at the top (0.3 = 30% size)
 */
export function paintTurf(ctx, w, h, lookKey = "natural", opts = {}) {
  const look = typeof lookKey === "string" ? LOOKS[lookKey] || LOOKS.natural : lookKey;
  const { seed = 7, perspective = true, scale = 1, horizon = 0.32 } = opts;
  const rand = rng(seed);

  // 1. Base tone
  ctx.save();
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, w, h);

  // 2. Soil speckle for dry ground
  if (look.soil) {
    for (let i = 0; i < (w * h) / 900; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(70,52,30,.25)" : "rgba(190,160,110,.18)";
      const r = (rand() * 2 + 0.5) * scale;
      ctx.fillRect(rand() * w, rand() * h, r, r);
    }
  }

  // 3. Low-frequency colour variation (large soft blotches)
  for (let i = 0; i < 26; i++) {
    const x = rand() * w, y = rand() * h, r = (0.15 + rand() * 0.35) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.5;
    g.addColorStop(0, light ? "rgba(255,255,210,.07)" : "rgba(0,20,0,.09)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 4. Mowing stripes (lush / putting)
  if (look.stripes) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      ctx.fillStyle = "rgba(255,255,220,.045)";
      ctx.beginPath();
      // stripes converge slightly toward the top for depth
      const x0 = (i / n) * w, x1 = ((i + 1) / n) * w;
      const pinch = perspective ? 0.18 : 0;
      ctx.moveTo(x0 + (w / 2 - x0) * pinch, 0);
      ctx.lineTo(x1 + (w / 2 - x1) * pinch, 0);
      ctx.lineTo(x1, h);
      ctx.lineTo(x0, h);
      ctx.fill();
    }
  }

  // 5. Blades — drawn in bands from far (top) to near (bottom), batched per colour.
  const bands = 28;
  const baseSpacing = 26 / look.density; // px² per blade at scale 1
  ctx.lineCap = "round";
  for (let b = 0; b < bands; b++) {
    const y0 = (b / bands) * h, y1 = ((b + 1) / bands) * h;
    const t = (y0 + y1) / 2 / h;
    const size = (perspective ? horizon + (1 - horizon) * t : 1) * scale;
    const s2 = Math.max(size, 0.55 * scale);
    const count = Math.round((w * (y1 - y0)) / (baseSpacing * s2 * s2 * 0.9));
    const paths = look.blades.map(() => new Path2D());
    const tipPath = new Path2D();
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = y0 + rand() * (y1 - y0) + 4 * size;
      const len = (look.length[0] + rand() * (look.length[1] - look.length[0])) * size;
      const ang = -Math.PI / 2 + (rand() - 0.5) * 2 * look.lean + 0.06;
      const bend = (rand() - 0.5) * len * 0.6;
      const tx = x + Math.cos(ang) * len + bend * 0.4;
      const ty = y + Math.sin(ang) * len;
      const p = paths[(rand() * paths.length) | 0];
      p.moveTo(x, y);
      p.quadraticCurveTo(x + bend, y - len * 0.55, tx, ty);
      if (rand() < 0.18) { tipPath.moveTo(tx, ty); tipPath.lineTo(tx + (tx - x) * 0.12, ty - len * 0.12); }
    }
    const lw = ((look.width[0] + look.width[1]) / 2) * size;
    look.blades.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.stroke(paths[i]); });
    ctx.globalAlpha = 0.55; ctx.strokeStyle = look.tips; ctx.lineWidth = lw * 0.8; ctx.stroke(tipPath); ctx.globalAlpha = 1;
  }

  // 6. Depth shading: haze at the far edge, slight darkening at the near edge.
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, "rgba(220,230,200,.10)");
  shade.addColorStop(0.55, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,15,0,.18)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Convenience: returns a new canvas of the given size with turf painted in. */
export function turfCanvas(w, h, look, opts) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  paintTurf(c.getContext("2d"), c.width, c.height, look, opts);
  return c;
}
