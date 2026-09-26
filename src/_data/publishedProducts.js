import { readFileSync } from "node:fs";

// Only products flagged `published: true` in products.json get a page.
export default function () {
  const data = JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf8"));
  return data.items.filter((p) => p.published);
}
