import { readFileSync } from "node:fs";

// Only products flagged `published: true` in products.json get a /turf/{slug}/ page.
// Maps the catalogue entries (shared with the visualiser) to the product-page fields.
export default function () {
  const data = JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf8"));
  return data.items.filter((p) => p.published).map((p) => ({
    ...p,
    slug: p.slug || p.id,
    summary: p.summary || p.desc,
    bestFor: Array.isArray(p.bestFor) ? p.bestFor : [p.bestFor],
    image: `/assets/img/products/${p.id}.webp`,
    specs: p.specs || [
      { label: "Range", value: p.tier },
      { label: "Pile height", value: p.pile },
      { label: "Yarn", value: p.yarn },
      { label: "Stitch rate", value: p.stitch },
      { label: "Manufacturer guarantee", value: `${p.guaranteeYears} years` },
    ],
  }));
}
