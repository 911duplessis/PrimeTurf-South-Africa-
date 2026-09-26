/**
 * Indicative price estimator — pure function, no DOM.
 *
 * Business rule (products.json → priceBands, site.json → pricing): fully
 * installed work, covering material, labour, excavation, sub-base and edging,
 * is priced per m² within a band for each turf range:
 *   Value R200–450 · Standard R350–600 · Premium R500–850 · Sport R285–625.
 * The band already includes preparation, so site conditions move a project
 * *within* its band (easy sites low, difficult sites high) rather than adding
 * on top. Every figure is clamped inside the band and the published R200–R850.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ CALIBRATE ME: the difficulty weights below are starting assumptions. │
 * │ Tune them against real quotes so the estimator mirrors PrimeTurf.    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Future: when a vision model returns a measured area or detects site
 * conditions (see providers.js → analyse()), pass those in via `answers`
 * — the pricing logic doesn't change.
 */

/** Fallback bands when no product is chosen, keyed by the concept "look". */
export const GRADE_BANDS = {
  hardwearing: [200, 450],
  natural: [350, 600],
  lush: [500, 850],
  putting: [285, 625],
};

/** How much each site condition pushes a project up its band (0 = easiest, 1 = hardest). */
export const DIFFICULTY = {
  surface: { paving: 0, soil: 0.15, lawn: 0.25, mixed: 0.3, "old-turf": 0.45 }, // paving = hard installation (bonded, minimal prep)
  extras: { slope: 0.2, drainage: 0.2, roots: 0.15, access: 0.1, irrigation: 0.05, shade: 0 },
  use: { commercial: 0.1, "school-sport": 0.1 },
};

/** Share of the band one estimate spans. */
const WINDOW = 0.4;

/** Uses that are always confirmed individually on site. */
const SITE_ASSESSED_USES = new Set(["commercial", "school-sport", "putting"]);

const LABELS = {
  surface: { lawn: "Existing lawn", soil: "Bare soil / sand", paving: "Paving or concrete (hard installation)", "old-turf": "Old artificial turf", mixed: "Mixed / not sure" },
  use: { family: "Family lawn", pets: "Pets", pool: "Pool surround", putting: "Putting green", decorative: "Low traffic / decorative", commercial: "Commercial / estate", "school-sport": "School / sports" },
  look: { natural: "Natural", lush: "Lush & dense", hardwearing: "Hard-wearing", putting: "Putting surface" },
  extras: { slope: "Slope", drainage: "Drainage issues", roots: "Tree roots", shade: "Heavy shade", access: "Limited access", irrigation: "Irrigation removal" },
};
export const label = (group, key) => LABELS[group]?.[key] ?? key;

const roundTo = (n, step) => Math.round(n / step) * step;

/**
 * @param {{areaM2:number, surface:string, use:string, look:string, band?:number[], extras:string[]}} a
 * @param {{minPerM2:number, maxPerM2:number}} pricing  from site.json
 */
export function estimate(a, pricing = { minPerM2: 200, maxPerM2: 850 }) {
  const { minPerM2: MIN, maxPerM2: MAX } = pricing;
  const area = Math.max(1, Number(a.areaM2) || 0);
  const notes = [];

  // A chosen product carries its range's band (products.json); otherwise fall back to the look.
  const [lo, hi] = (a.band || GRADE_BANDS[a.look] || GRADE_BANDS.natural).map((v) => Math.min(MAX, Math.max(MIN, v)));
  const span = hi - lo;

  let d = (DIFFICULTY.surface[a.surface] ?? 0.25) +
    (a.extras || []).reduce((s, x) => s + (DIFFICULTY.extras[x] ?? 0), 0) +
    (DIFFICULTY.use[a.use] ?? 0);
  // Small areas carry proportionally more set-up; large, simple areas less.
  if (area < 20) { d += 0.2; notes.push("Small areas carry proportionally more set-up per m²."); }
  else if (area > 250) d -= 0.1;
  d = Math.min(1, Math.max(0, d));

  const low = lo + d * span * (1 - WINDOW);
  const high = Math.min(hi, low + span * WINDOW);

  if ((a.extras || []).some((x) => ["slope", "drainage", "roots"].includes(x))) notes.push("Slope, drainage and root work are confirmed on site.");
  if ((a.extras || []).includes("shade")) notes.push("Heavy shade noted — we’ll check drainage and leaf fall on site.");
  if (a.surface === "paving") notes.push("Hard installation: turf is bonded to your existing surface, so minimal preparation is needed.");
  if (SITE_ASSESSED_USES.has(a.use)) notes.push(`${label("use", a.use)} projects are scoped individually after a site assessment.`);

  return {
    perM2: { low: Math.max(lo, roundTo(low, 10)), high: Math.min(hi, roundTo(high, 10)) },
    total: { low: roundTo(low * area, 500), high: roundTo(high * area, 500) },
    area,
    notes,
  };
}
