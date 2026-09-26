/**
 * Portfolio: category filters (with #hash deep links), progressive "Show more",
 * and a keyboard/swipe lightbox. Before/after pairs open as a drag-to-compare slider.
 * All items are in the HTML (crawlable, works without JS); this only enhances.
 */
import { createCompare } from "./ba-slider.js";

const PAGE = 12;
const grid = document.querySelector("[data-pf-grid]");
if (grid) {
  const items = [...grid.children];
  const chips = [...document.querySelectorAll("[data-filter]")];
  const moreBtn = document.querySelector("[data-pf-more]");
  const status = document.querySelector("[data-pf-status]");
  let filter = "all", limit = PAGE, visible = [];

  const apply = () => {
    const matching = items.filter((li) => filter === "all" || li.dataset.cats.split(" ").includes(filter));
    visible = matching.slice(0, limit);
    items.forEach((li) => (li.hidden = !visible.includes(li)));
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === filter)));
    const rest = matching.length - visible.length;
    moreBtn.hidden = rest <= 0;
    moreBtn.textContent = `Show more (${rest})`;
    const label = chips.find((c) => c.dataset.filter === filter)?.firstChild.textContent.trim() || "All";
    status.textContent = `Showing ${visible.length} of ${matching.length}${filter === "all" ? "" : ` · ${label}`}`;
  };
  const setFilter = (f, { push = true } = {}) => {
    filter = chips.some((c) => c.dataset.filter === f) ? f : "all";
    limit = PAGE;
    apply();
    if (push) history.replaceState(null, "", filter === "all" ? location.pathname : `#${filter}`);
  };
  chips.forEach((c) => c.addEventListener("click", () => setFilter(c.dataset.filter)));
  moreBtn.addEventListener("click", () => { limit += PAGE; apply(); });
  addEventListener("hashchange", () => setFilter(location.hash.slice(1), { push: false }));
  setFilter(location.hash.slice(1) || "all", { push: false });

  /* ---------- Lightbox ---------- */
  const lb = document.querySelector("[data-pf-lightbox]");
  const stage = lb.querySelector("[data-lb-stage]");
  let cur = 0;
  const show = (i) => {
    cur = (i + visible.length) % visible.length;
    const d = visible[cur].querySelector("[data-pf-open]").dataset;
    stage.replaceChildren();
    if (d.before) {
      const box = document.createElement("div");
      stage.append(box);
      createCompare(box, { before: d.before, after: d.full, beforeAlt: `${d.caption}, before`, afterAlt: `${d.caption}, after`, beforeLabel: "Before", afterLabel: "After" });
    } else {
      const img = new Image();
      img.src = d.full; img.alt = d.caption; img.className = "pf-lb__img";
      stage.append(img);
    }
    lb.querySelector("[data-lb-caption]").textContent = d.note ? `${d.caption}. ${d.note}` : d.caption;
    lb.querySelector("[data-lb-cat]").textContent = d.cat;
    lb.querySelector("[data-lb-count]").textContent = `${cur + 1} / ${visible.length}`;
  };
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pf-open]");
    if (!btn) return;
    show(visible.indexOf(btn.closest(".pf-item")));
    lb.showModal();
  });
  lb.querySelector("[data-lb-prev]").addEventListener("click", () => show(cur - 1));
  lb.querySelector("[data-lb-next]").addEventListener("click", () => show(cur + 1));
  lb.querySelector("[data-lb-close]").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", (e) => {
    if (e.target.closest?.("[data-ba-handle]")) return; // arrows belong to the compare slider
    if (e.key === "ArrowRight") show(cur + 1);
    if (e.key === "ArrowLeft") show(cur - 1);
  });
  // Swipe on photos (not on the compare slider, which uses horizontal drags).
  let x0 = null;
  stage.addEventListener("touchstart", (e) => { x0 = e.target.closest(".ba") ? null : e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    x0 = null;
  });
}
