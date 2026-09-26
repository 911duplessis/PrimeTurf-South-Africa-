/**
 * Indicative price estimator — pure function, no DOM.
 *
 * Business rule (site.json → pricing): fully installed work is typically
 * R450–R850 per m², depending on turf grade and site preparation.
 * Every figure this module returns is clamped inside that published range.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ CALIBRATE ME: the grade bands and preparation loadings below are     │
 * │ starting assumptions that keep output inside R450–R850/m². Tune them │
 * │ against real quotes so the estimator mirrors how PrimeTurf prices.   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Future: when a vision model returns a measured area or detects site
 * conditions (see providers.js → analyse()), pass those in via `answers`
 * — the pricing logic doesn't change.
 */

/** Per-m² band by turf grade (the "look" answer). */
export const GRADE_BANDS = {
  natural: [450, 620],
  hardwearing: [500, 700],
  lush: [560, 760],
  putting: [680, 850],
};

/** Site-preparation loadings, R per m², added to both ends of the band. */
export const PREP_LOADINGS = {
  surface: { lawn: 20, soil: 0, paving: 0, "old-turf": 35, mixed: 20 }, // paving = hard installation (bonded, minimal prep)
  extras: { slope: 35, drainage: 35, roots: 25, access: 20, irrigation: 10, shade: 0 },
};

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
 * @param {{areaM2:number, surface:string, use:string, look:string, extras:string[]}} a
 * @param {{minPerM2:number, maxPerM2:number}} pricing  from site.json
 */
export function estimate(a, pricing = { minPerM2: 450, maxPerM2: 850 }) {
  const { minPerM2: MIN, maxPerM2: MAX } = pricing;
  const clamp = (v) => Math.min(MAX, Math.max(MIN, v));
  const area = Math.max(1, Number(a.areaM2) || 0);
  const notes = [];

  let [low, high] = GRADE_BANDS[a.look] || GRADE_BANDS.natural;

  // Heavier use nudges toward a more robust grade.
  if (["pets", "commercial", "school-sport"].includes(a.use) && a.look === "natural") { low += 30; high += 40; }

  const prep = (PREP_LOADINGS.surface[a.surface] ?? 0) +
    (a.extras || []).reduce((s, x) => s + (PREP_LOADINGS.extras[x] ?? 0), 0);
  low += prep; high += prep;

  // Small areas carry proportionally more set-up; large, simple areas less.
  if (area < 20) { low += 40; high += 40; notes.push("Small areas carry proportionally more set-up per m²."); }
  else if (area > 250) { low -= 20; high -= 20; }

  low = clamp(low); high = clamp(Math.max(high, low + 60));
  if (high > MAX) high = MAX;

  if ((a.extras || []).some((x) => ["slope", "drainage", "roots"].includes(x))) notes.push("Slope, drainage and root work are confirmed on site.");
  if ((a.extras || []).includes("shade")) notes.push("Heavy shade noted — we’ll check drainage and leaf fall on site.");
  if (a.surface === "paving") notes.push("Hard installation: turf is bonded to your existing surface, so minimal preparation is needed.");
  if (SITE_ASSESSED_USES.has(a.use)) notes.push(`${label("use", a.use)} projects are scoped individually after a site assessment.`);

  return {
    perM2: { low: roundTo(low, 10), high: roundTo(high, 10) },
    total: { low: roundTo(low * area, 500), high: roundTo(high * area, 500) },
    area,
    notes,
  };
}
