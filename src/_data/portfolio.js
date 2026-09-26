/**
 * Portfolio data, built automatically from photos on disk.
 *
 *   src/portfolio/photos/<category>/<photo>.(jpg|jpeg|png|webp)
 *
 * - Category = folder name. New folders just work (labels/order: portfolioCategories.json).
 * - Captions, alt text, extra tags, featured, date: optional, in portfolioMeta.json.
 * - Every photo is resized to 480/960/1600px WebP at build time (@11ty/eleventy-img),
 *   so full-size phone photos can be dropped straight in.
 * - Before/after slider pairs from projects.json are added under "Before & after".
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import Image from "@11ty/eleventy-img";

const ROOT = "src/portfolio/photos";
const OUT_DIR = path.join(process.env.ELEVENTY_OUTPUT || "_site", "assets/img/portfolio");
const URL_PATH = "/assets/img/portfolio/";
const IMG_RE = /\.(jpe?g|png|webp)$/i;

const readJson = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
const titleCase = (s) => s.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

async function processImage(file) {
  const meta = await Image(file, {
    widths: [480, 960, 1600],
    formats: ["webp"],
    outputDir: OUT_DIR,
    urlPath: URL_PATH,
    filenameFormat: (id, src, width, format) => `${path.basename(src, path.extname(src))}-${id.slice(0, 6)}-${width}.${format}`,
  });
  const set = meta.webp;
  const largest = set[set.length - 1];
  return {
    src: set[Math.min(1, set.length - 1)].url,
    srcset: set.map((s) => `${s.url} ${s.width}w`).join(", "),
    full: largest.url,
    width: largest.width,
    height: largest.height,
  };
}

export default async function () {
  const metaAll = readJson("./portfolioMeta.json");
  const catCfg = readJson("./portfolioCategories.json").items;
  const items = [];

  if (existsSync(ROOT)) {
    for (const folder of readdirSync(ROOT).sort()) {
      const dir = path.join(ROOT, folder);
      if (!statSync(dir).isDirectory()) continue;
      for (const name of readdirSync(dir).sort()) {
        if (!IMG_RE.test(name)) continue;
        const key = `${folder}/${name}`;
        const m = metaAll[key] || {};
        const caption = m.caption || titleCase(name.replace(IMG_RE, ""));
        items.push({
          id: key.replace(IMG_RE, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
          kind: "photo",
          category: folder,
          cats: [...new Set([folder, ...(m.tags || [])])],
          caption,
          alt: m.alt || caption,
          location: m.location || "",
          featured: !!m.featured,
          date: m.date || "",
          img: await processImage(path.join(dir, name)),
        });
      }
    }
  }

  // Before/after slider pairs (projects.json) — shown as interactive comparisons in the lightbox.
  const pairs = readJson("./projects.json").items.filter((p) => !p.placeholder);
  for (const p of pairs) {
    const after = await processImage(path.join("src", p.after));
    const before = await processImage(path.join("src", p.before));
    items.push({
      id: `pair-${p.id}`,
      kind: "pair",
      category: "before-after",
      cats: ["before-after"],
      caption: `${p.title}: before and after`,
      alt: `${p.title} after installation`,
      location: "",
      featured: false,
      date: "",
      img: after,
      before,
      note: p.caption,
    });
  }

  // Order: featured first, then newest date, then as found.
  items.sort((a, b) => (b.featured - a.featured) || (b.date || "").localeCompare(a.date || ""));

  // Categories that actually have photos, in configured order, with counts.
  const used = new Set(items.flatMap((i) => i.cats));
  const known = catCfg.filter((c) => used.has(c.slug));
  const extra = [...used].filter((s) => !catCfg.some((c) => c.slug === s)).sort().map((s) => ({ slug: s, label: titleCase(s) }));
  const categories = [...known, ...extra].map((c) => ({ ...c, count: items.filter((i) => i.cats.includes(c.slug)).length }));
  const labels = Object.fromEntries(categories.map((c) => [c.slug, c.label]));
  for (const i of items) i.categoryLabel = labels[i.category] || titleCase(i.category);

  return { items, categories, total: items.length };
}
