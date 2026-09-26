/**
 * Eleventy configuration.
 * Source lives in /src, output in /_site. Content is driven by JSON in src/_data
 * so new locations, services, turf products and projects are data entries, not new code.
 */
import { HtmlBasePlugin } from "@11ty/eleventy";

export default function (eleventyConfig) {
  // Serve from a sub-path (GitHub Pages project URL) or a domain root.
  // Set PATH_PREFIX, e.g. "/PrimeTurf-South-Africa-/"; defaults to "/".
  // HtmlBasePlugin rewrites root-relative href/src in the HTML output.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/site.webmanifest": "site.webmanifest" });

  eleventyConfig.addWatchTarget("src/assets/");

  // Absolute URL helper for canonical / Open Graph tags.
  eleventyConfig.addFilter("absoluteUrl", (path, base) => {
    try { return new URL(path, base).href; } catch { return path; }
  });

  // "R12 345" style formatting for rand values.
  eleventyConfig.addFilter("rand", (n) =>
    "R" + Math.round(n).toLocaleString("en-ZA").replace(/,/g, " ")
  );

  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("isoDate", (d) => {
    const date = new Date(d);
    return isNaN(date) ? "" : date.toISOString().slice(0, 10);
  });
  eleventyConfig.addFilter("readableDate", (d) =>
    new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  );
  eleventyConfig.addFilter("where", (arr, key, val) => (arr || []).filter((x) => x[key] === val));
  eleventyConfig.addFilter("findBy", (arr, key, val) => (arr || []).find((x) => x[key] === val));

  // Collections. Items with `draft: true` never publish.
  const published = (item) => !item.data.draft;
  eleventyConfig.addCollection("resources", (api) =>
    api.getFilteredByGlob("src/resources/posts/*.md").filter(published).reverse()
  );
  eleventyConfig.addCollection("caseStudies", (api) =>
    api.getFilteredByGlob("src/projects/case-studies/*.md").filter(published)
  );

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    pathPrefix: process.env.PATH_PREFIX || "/",
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
