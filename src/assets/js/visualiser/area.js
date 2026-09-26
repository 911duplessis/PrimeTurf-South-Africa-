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
 * @param {number[][]} poly   normalised [x,y] (0..1) outline, ≥3 points
 * @param {number} edge       index of the reference edge (poly[edge] → poly[edge+1])
 * @param {number} lengthM    real length of that edge in metres
 * @param {{width:number,height:number}} img  photo size in pixels
 * @returns {number|null}     area in m², or null if it can't be worked out
 */
export function areaFromOutline(poly, edge, lengthM, img) {
  if (!poly || poly.length < 3 || !(lengthM > 0)) return null;
  const { width: w, height: h } = img;
  const px = poly.map(([x, y]) => [x * w, y * h]);
  const n = px.length;
  const f = 0.75 * Math.max(w, h);
  const cx = w / 2, cy = h / 2;

  // Pitch from the convergence of the two sides next to the reference edge.
  const a = px[edge], b = px[(edge + 1) % n];
  const aPrev = px[(edge - 1 + n) % n], bNext = px[(edge + 2) % n];
  const top = Math.min(...px.map((p) => p[1]));
  let pitch = 30 * DEG;
  const yh = n >= 4 ? lineY(a, aPrev, b, bNext) : null;
  if (yh !== null && yh < top - 1) {
    const t = Math.atan((cy - yh) / f);
    if (t > 8 * DEG && t < 70 * DEG) pitch = t;
  }

  // Ray-cast each point onto the ground (camera height 1; scale fixed later).
  const cos = Math.cos(pitch), sin = Math.sin(pitch);
  const ground = [];
  for (const [x, y] of px) {
    const u = (x - cx) / f, v = (y - cy) / f;
    const down = v * cos + sin;
    if (down <= 1e-3) return null; // point at or above the horizon
    const t = 1 / down;
    ground.push([t * u, t * (cos - v * sin)]);
  }

  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = ground[i], [x2, z2] = ground[(i + 1) % n];
    area += x1 * z2 - x2 * z1;
  }
  area = Math.abs(area) / 2;
  const g1 = ground[edge], g2 = ground[(edge + 1) % n];
  const edgeLen = Math.hypot(g2[0] - g1[0], g2[1] - g1[1]);
  if (!(edgeLen > 0)) return null;
  const s = lengthM / edgeLen;
  return area * s * s;
}
