/**
 * Area from an outline — pure functions, no DOM.
 *
 * A phone photo of a garden is a perspective view of the ground, so pixel
 * area is not proportional to real area (far ground is squashed). We model a
 * level camera (no roll) looking down at flat ground:
 *   - focal length ≈ 0.75 × the photo's long side (a typical phone main lens),
 *   - pitch from the outline itself: the two sides next to the reference edge
 *     usually converge toward the horizon, which fixes how far the camera
 *     tilts down. If they don't converge sensibly, assume 30°.
 * Each outline point is ray-cast onto the ground, and the ground polygon is
 * scaled so the reference edge matches the length the visitor typed.
 * Expect roughly ±25%: good enough for an indicative price, confirmed on site.
 */

const DEG = Math.PI / 180;

/**
 * Index of the edge (i → i+1) to measure: the widest edge running across the
 * photo, favouring the one nearest the camera. People can pace out a width
 * much more easily than a depth. Edges that just run along the photo's border
 * are skipped, because they aren't real edges on the ground.
 */
export function nearestEdge(poly) {
  const onBorder = ([x, y]) => x <= 0.01 || x >= 0.99 || y <= 0.01 || y >= 0.99;
  let best = 0, bestScore = -Infinity;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const across = Math.abs(q[0] - p[0]) - 0.5 * Math.abs(q[1] - p[1]);
    const score = across * (0.5 + (p[1] + q[1]) / 2) - (onBorder(p) && onBorder(q) ? 10 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

const lineY = (a, b, c, d) => {
  // Intersection y of lines a→b and c→d (pixel coords), or null if parallel.
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return a[1] + t * (b[1] - a[1]);
};

/**
 * Horizon row from the outline's left and right sides: scan the middle 80% of
 * the outline's height, fit a line to each side, and intersect them.
 * Returns null when the sides don't converge upward.
 */
function sidesHorizon(px) {
  const ys = px.map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), n = px.length;
  const L = [], R = [];
  for (let k = 1; k < 20; k++) {
    const y = y0 + (y1 - y0) * (0.1 + 0.8 * k / 20);
    const xs = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = px[i], [bx, by] = px[(i + 1) % n];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    if (xs.length >= 2) { L.push([y, Math.min(...xs)]); R.push([y, Math.max(...xs)]); }
  }
  if (L.length < 5) return null;
  const fit = (pts) => { // x = m*y + c
    const my = pts.reduce((s, p) => s + p[0], 0) / pts.length, mx = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let num = 0, den = 0;
    for (const [y, x] of pts) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
    const m = den ? num / den : 0;
    return [m, mx - m * my];
  };
  const [m1, c1] = fit(L), [m2, c2] = fit(R);
  // Sides must close in going up: left side leans right (m1 < 0), right side leans left (m2 > 0).
  if (!(m1 < 0 && m2 > 0)) return null;
  return (c2 - c1) / (m1 - m2);
}

/** Typical camera heights (metres) for the "Photo taken from" choice. */
export const VIEWPOINTS = {
  ground: { height: 1.6, pitch: 30 }, // standing, phone at eye level
  upstairs: { height: 4.5, pitch: 45 }, // first-floor window or balcony, looking down
};

/**
 * Project the outline onto flat ground with the camera at height 1.
 * @returns {{ground:number[][], area:number}|null}  ground coords in camera-heights
 */
function toGround(poly, img, { edge = null, pitchDeg = 30 } = {}) {
  if (!poly || poly.length < 3) return null;
  const { width: w, height: h } = img;
  const px = poly.map(([x, y]) => [x * w, y * h]);
  const n = px.length;
  const f = 0.75 * Math.max(w, h);
  const cx = w / 2, cy = h / 2;

  // Pitch from the convergence of the two sides next to the reference edge,
  // when both are long enough to trust; otherwise the viewpoint's default.
  let pitch = pitchDeg * DEG;
  const top = Math.min(...px.map((p) => p[1]));
  const usePitchFrom = (yh) => {
    if (yh === null || !(yh < top - 1)) return false;
    const t = Math.atan((cy - yh) / f);
    if (t > 8 * DEG && t < 70 * DEG) { pitch = t; return true; }
    return false;
  };
  // Many-point outlines (auto-detected): fit straight lines to the left and
  // right sides and see where they meet.
  if (n >= 8) usePitchFrom(sidesHorizon(px));
  else if (edge != null && n >= 4) {
    const a = px[edge], b = px[(edge + 1) % n];
    const aPrev = px[(edge - 1 + n) % n], bNext = px[(edge + 2) % n];
    const long = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.12 * h;
    usePitchFrom(long(a, aPrev) && long(b, bNext) ? lineY(a, aPrev, b, bNext) : null);
  }

  const cos = Math.cos(pitch), sin = Math.sin(pitch);
  const ground = [];
  for (const [x, y] of px) {
    const u = (x - cx) / f, v = (y - cy) / f;
    const down = v * cos + sin;
    if (down < 0.03) return null; // at or near the horizon: distance can't be judged
    const t = 1 / down;
    ground.push([t * u, t * (cos - v * sin)]);
  }
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = ground[i], [x2, z2] = ground[(i + 1) % n];
    area += x1 * z2 - x2 * z1;
  }
  return { ground, area: Math.abs(area) / 2 };
}

/**
 * Area when the visitor gives one real length.
 * @param {number[][]} poly   normalised [x,y] (0..1) outline, ≥3 points
 * @param {number} edge       index of the reference edge (poly[edge] → poly[edge+1])
 * @param {number} lengthM    real length of that edge in metres
 * @param {{width:number,height:number}} img  photo size in pixels
 * @param {{pitch?:number}} [view]  default camera tilt in degrees
 * @returns {number|null}     area in m²
 */
export function areaFromOutline(poly, edge, lengthM, img, view = VIEWPOINTS.ground) {
  if (!(lengthM > 0)) return null;
  const g = toGround(poly, img, { edge, pitchDeg: view.pitch });
  if (!g) return null;
  const n = poly.length;
  const g1 = g.ground[edge], g2 = g.ground[(edge + 1) % n];
  const edgeLen = Math.hypot(g2[0] - g1[0], g2[1] - g1[1]);
  if (!(edgeLen > 0)) return null;
  const s = lengthM / edgeLen;
  return g.area * s * s;
}

/**
 * Area with no measurement at all: assumes the camera height for the chosen
 * viewpoint (standing or upstairs). Rougher (about ±35%), but instant.
 */
export function areaFromPhoto(poly, img, view = VIEWPOINTS.ground, edge = null) {
  const g = toGround(poly, img, { edge, pitchDeg: view.pitch });
  if (!g) return null;
  const a = g.area * view.height * view.height;
  // Outside this, the photo's angle is almost certainly misread: ask for a length instead.
  return a >= 8 && a <= 2000 ? a : null;
}
