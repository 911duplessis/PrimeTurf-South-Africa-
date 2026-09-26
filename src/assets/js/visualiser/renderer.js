/**
 * Client-side image work for the visualiser:
 *   - loading + downscaling the uploaded photo
 *   - the tap-to-outline mask editor
 *   - compositing a procedural turf layer into the marked area (concept only)
 *
 * This is the "local" concept generator. A real image model plugs in via
 * providers.js — this file is then only used as the offline fallback.
 */
import { turfCanvas } from "../lib/turf.js";

const MAX_EDGE = 1600;

/** Load a File/Blob or URL into a canvas, downscaled so the long edge ≤ MAX_EDGE. */
export async function loadToCanvas(src) {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // SVG sources may report no intrinsic size; fall back to 16:10.
    const iw = img.naturalWidth || 1600, ih = img.naturalHeight || 1000;
    const k = Math.min(1, MAX_EDGE / Math.max(iw, ih));
    const c = document.createElement("canvas");
    c.width = Math.round(iw * k);
    c.height = Math.round(ih * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); // browsers apply EXIF orientation
    return c;
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

/** Default area when the user doesn't outline: the lower ~half with a soft, uneven top edge. */
export function defaultMask() {
  return [[0, 0.56], [0.2, 0.53], [0.45, 0.55], [0.7, 0.52], [1, 0.55], [1, 1], [0, 1]];
}

const pathFrom = (poly, w, h) => {
  const p = new Path2D();
  poly.forEach(([x, y], i) => (i ? p.lineTo(x * w, y * h) : p.moveTo(x * w, y * h)));
  p.closePath();
  return p;
};
const supportsFilter = () => "filter" in CanvasRenderingContext2D.prototype;

/**
 * Tap-to-outline editor.
 * @returns {{ points: number[][], undo():void, clear():void, destroy():void }}
 */
export function maskEditor(canvas, source, { onChange, initial = [] } = {}) {
  const ctx = canvas.getContext("2d");
  canvas.width = source.width;
  canvas.height = source.height;
  let points = initial.map((p) => [...p]);

  const draw = () => {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0);
    // UI unit = one on-screen CSS pixel, so handles stay tappable however large the photo is.
    const u = Math.max(w / (canvas.clientWidth || w), Math.max(w, h) / 1400);
    const poly = points.length >= 3 ? points : null;

    if (poly) {
      ctx.fillStyle = "rgba(198,242,78,.32)";
      ctx.fill(pathFrom(poly, w, h));
    } else {
      // Preview of the default area, dashed.
      ctx.save();
      ctx.setLineDash([10 * u, 8 * u]);
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2 * u;
      ctx.fillStyle = "rgba(198,242,78,.14)";
      const d = pathFrom(defaultMask(), w, h);
      ctx.fill(d); ctx.stroke(d);
      ctx.restore();
    }
    if (points.length) {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      if (poly) ctx.closePath();
      ctx.strokeStyle = "#C6F24E";
      ctx.lineWidth = 3 * u;
      ctx.stroke();
      points.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x * w, y * h, (i === 0 ? 10 : 7) * u, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#0F1411" : "#C6F24E";
        ctx.fill();
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = i === 0 ? "#C6F24E" : "#0F1411";
        ctx.stroke();
      });
    }
    onChange?.(points);
  };

  const onPointer = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    points.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
    draw();
  };
  canvas.addEventListener("pointerup", onPointer);
  draw();

  return {
    get points() { return points; },
    undo() { points.pop(); draw(); },
    clear() { points = []; draw(); },
    destroy() { canvas.removeEventListener("pointerup", onPointer); },
  };
}

/**
 * Composite a turf concept into the photo.
 * @param {HTMLCanvasElement} source  the user's photo (from loadToCanvas)
 * @param {number[][]} polygon         normalised [x,y] points (0..1)
 * @param {string} look                key of LOOKS in lib/turf.js
 * @returns {HTMLCanvasElement}
 */
export function renderConcept(source, polygon, look = "natural") {
  const { width: w, height: h } = source;
  const poly = polygon && polygon.length >= 3 ? polygon : defaultMask();
  const clip = pathFrom(poly, w, h);

  // Bounding box of the marked area → turf is painted with perspective across it.
  const ys = poly.map((p) => p[1] * h);
  const top = Math.max(0, Math.min(...ys));
  const bottom = Math.min(h, Math.max(...ys));
  const unit = w / 1100;

  // 1. Turf layer, full size, painted only across the mask's vertical span.
  const layer = document.createElement("canvas");
  layer.width = w; layer.height = h;
  const lctx = layer.getContext("2d");
  const band = turfCanvas(w, Math.max(8, bottom - top), look, {
    seed: 21, scale: unit * 1.15, horizon: Math.max(0.25, 0.25 + (top / h) * 0.6),
  });
  lctx.drawImage(band, 0, top);

  // 2. Keep the photo's light and shadow (trees, walls) by soft-lighting a greyscale copy on top.
  if (supportsFilter()) {
    lctx.save();
    lctx.globalCompositeOperation = "soft-light";
    lctx.globalAlpha = 0.6;
    lctx.filter = "grayscale(1) contrast(1.2)";
    lctx.drawImage(source, 0, 0);
    lctx.restore();
  }

  // 3. Feathered mask.
  const mask = document.createElement("canvas");
  mask.width = w; mask.height = h;
  const mctx = mask.getContext("2d");
  if (supportsFilter()) mctx.filter = `blur(${Math.max(1, unit * 1.6)}px)`;
  mctx.fillStyle = "#000";
  mctx.fill(clip);
  lctx.globalCompositeOperation = "destination-in";
  lctx.drawImage(mask, 0, 0);

  // 4. Composite onto the original.
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const o = out.getContext("2d");
  o.drawImage(source, 0, 0);
  // A faint contact shadow seats the turf against edges.
  o.save();
  if (supportsFilter()) o.filter = `blur(${unit * 4}px)`;
  o.strokeStyle = "rgba(0,0,0,.28)";
  o.lineWidth = unit * 5;
  o.stroke(clip);
  o.restore();
  o.drawImage(layer, 0, 0);

  // 5. Label — this is a concept, not a photograph.
  const fs = Math.max(11, Math.round(unit * 15));
  o.font = `500 ${fs}px "Geist Mono", ui-monospace, monospace`;
  const text = "CONCEPT ONLY · PRIMETURF";
  const tw = o.measureText(text).width;
  o.fillStyle = "rgba(15,20,17,.72)";
  o.fillRect(w - tw - fs * 2, h - fs * 2.6, tw + fs * 1.4, fs * 1.9);
  o.fillStyle = "#C6F24E";
  o.fillText(text, w - tw - fs * 1.3, h - fs * 1.25);
  return out;
}

export const canvasToDataURL = (c, q = 0.88) => c.toDataURL("image/jpeg", q);
