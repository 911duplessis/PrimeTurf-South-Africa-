/**
 * Lawn auto-detect — pure function on raw pixels, no DOM, no network.
 *
 * Finds the biggest connected patch of lawn-coloured pixels (greens, plus the
 * yellow-brown of a tired lawn when it sits inside green) in a downscaled copy
 * of the photo, then traces its outline as a polygon the visitor can keep or
 * redraw. Dark greens (hedges and shrubs in shadow) and bright, low-saturation
 * pixels (paving, sky, walls) are left out.
 *
 * @param {{data: Uint8ClampedArray|Buffer, width: number, height: number, channels?: number}} img
 * @returns {{polygon: number[][], coverage: number} | null}  normalised [x,y] points (0..1)
 */
export function detectLawn(img) {
  const { data, width: W, height: H } = img;
  const ch = img.channels || 4;
  const N = W * H;

  // 1. Classify pixels: 2 = green grass, 1 = dry/brown lawn, 0 = other.
  const cls = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * ch] / 255, g = data[i * ch + 1] / 255, b = data[i * ch + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const s = max ? d / max : 0;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h >= 55 && h <= 160 && s > 0.18 && max > 0.2 && max < 0.95) cls[i] = 2;
    else if (h >= 25 && h < 55 && s > 0.15 && s < 0.7 && max > 0.25 && max < 0.85) cls[i] = 1;
  }

  // 2. Keep brown only where there's grass around it (a patchy lawn, not a flowerbed or paving).
  const green = new Float32Array(N);
  const R = Math.max(2, Math.round(W / 40));
  const integ = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    integ[(y + 1) * (W + 1) + x + 1] = (cls[y * W + x] === 2) + integ[y * (W + 1) + x + 1] + integ[(y + 1) * (W + 1) + x] - integ[y * (W + 1) + x];
  }
  const boxMean = (x, y) => {
    const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    return (integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  const mask = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = boxMean(x, y);
    green[i] = m;
    mask[i] = (cls[i] === 2 && m > 0.35) || (cls[i] === 1 && m > 0.3) || (cls[i] === 0 && m > 0.6) ? 1 : 0;
  }

  // 3. Largest connected region (4-neighbour flood fill).
  const label = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0;
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (!mask[s] || label[s] !== -1) continue;
    let size = 0; stack.push(s); label[s] = s;
    while (stack.length) {
      const i = stack.pop(); size++;
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && mask[i - 1] && label[i - 1] === -1) { label[i - 1] = s; stack.push(i - 1); }
      if (x < W - 1 && mask[i + 1] && label[i + 1] === -1) { label[i + 1] = s; stack.push(i + 1); }
      if (y > 0 && mask[i - W] && label[i - W] === -1) { label[i - W] = s; stack.push(i - W); }
      if (y < H - 1 && mask[i + W] && label[i + W] === -1) { label[i + W] = s; stack.push(i + W); }
    }
    if (size > bestSize) { bestSize = size; best = s; }
  }
  const coverage = bestSize / N;
  if (best < 0 || coverage < 0.04) return null;

  // 4. Trace the region row by row: left edge going down, right edge coming back up.
  const rows = [];
  const minRun = Math.max(2, Math.round(W * 0.03));
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1, count = 0;
    for (let x = 0; x < W; x++) if (label[y * W + x] === best) { if (l < 0) l = x; r = x; count++; }
    if (count >= minRun) rows.push([y, l, r]);
  }
  if (rows.length < 3) return null;
  // Smooth the edges a little so a stray tuft doesn't make a spike.
  const k = Math.max(1, Math.round(rows.length / 40));
  const smooth = rows.map((row, i) => {
    const win = rows.slice(Math.max(0, i - k), i + k + 1);
    const med = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
    return [row[0], med(win.map((w) => w[1])), med(win.map((w) => w[2]))];
  });
  const ring = [
    ...smooth.map(([y, l]) => [l / (W - 1), y / (H - 1)]),
    ...smooth.slice().reverse().map(([y, , r]) => [r / (W - 1), y / (H - 1)]),
  ];
  return { polygon: simplify(ring, 0.012), coverage };
}

/** Douglas–Peucker on a closed ring, tolerance in normalised units. */
function simplify(pts, tol) {
  const dp = (a, b) => {
    let idx = -1, dmax = 0;
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / len;
      if (d > dmax) { dmax = d; idx = i; }
    }
    return dmax > tol ? [...dp(a, idx).slice(0, -1), ...dp(idx, b)] : [pts[a], pts[b]];
  };
  const half = pts.length >> 1;
  const out = [...dp(0, half).slice(0, -1), ...dp(half, pts.length - 1)];
  // Drop near-duplicate points.
  return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 0.005);
}
