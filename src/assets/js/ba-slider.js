/**
 * Before & After comparison slider.
 *
 * - Pointer Events: one code path for mouse, pen and touch.
 * - `touch-action: pan-y` on the frame keeps vertical page scrolling on phones;
 *   horizontal drags move the divider.
 * - Position is eased toward its target on rAF for a smooth, weighted feel.
 * - Keyboard: the handle is a role="slider" (←/→ 5%, PgUp/PgDn 20%, Home/End).
 * - A one-off "peek" animation hints that it's interactive when first seen.
 *
 * Exports:
 *   initCompare(figureEl)  → controller for an existing [data-ba] figure
 *   createCompare(container, {before, after, beforeAlt, afterAlt}) → builds one (used by the visualiser)
 * Auto-inits every [data-ba-gallery] on the page.
 */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initCompare(fig) {
  const frame = fig.querySelector("[data-ba-frame]");
  const handle = fig.querySelector("[data-ba-handle]");
  let pos = 50, target = 50, raf = 0, dragging = false, ease = 0.28;

  const render = () => {
    frame.style.setProperty("--pos", `${pos}%`);
    handle.setAttribute("aria-valuenow", Math.round(pos));
    handle.setAttribute("aria-valuetext", `${Math.round(pos)}% before`);
  };
  const loop = () => {
    const d = target - pos;
    if (Math.abs(d) < 0.05 || reduceMotion) { pos = target; render(); raf = 0; return; }
    pos += d * ease;
    render();
    raf = requestAnimationFrame(loop);
  };
  const set = (v, k = 0.28) => {
    target = Math.min(100, Math.max(0, v));
    ease = k;
    if (!raf) raf = requestAnimationFrame(loop);
  };
  const fromEvent = (e) => {
    const r = frame.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  };

  frame.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    fig.classList.add("is-dragging");
    frame.setPointerCapture(e.pointerId);
    set(fromEvent(e), 0.22);
  });
  frame.addEventListener("pointermove", (e) => { if (dragging) set(fromEvent(e), 0.45); });
  const end = () => { dragging = false; fig.classList.remove("is-dragging"); };
  frame.addEventListener("pointerup", end);
  frame.addEventListener("pointercancel", end); // browser took over for vertical scroll

  handle.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[e.key];
    if (step !== undefined) { e.preventDefault(); set(target + step, 0.3); }
    else if (e.key === "Home") { e.preventDefault(); set(0, 0.3); }
    else if (e.key === "End") { e.preventDefault(); set(100, 0.3); }
  });

  // Peek hint the first time it scrolls into view.
  let peeked = false;
  const peek = async () => {
    if (peeked || reduceMotion) return;
    peeked = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    set(28, 0.08); await wait(650);
    if (!dragging) set(68, 0.08); await wait(700);
    if (!dragging) set(50, 0.1);
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { peek(); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(frame);
  }

  render();
  return { set, get value() { return target; }, peek };
}

export function createCompare(container, { before, after, beforeAlt = "Before", afterAlt = "After" }) {
  container.innerHTML = `
    <figure class="ba" data-ba>
      <div class="ba__frame" data-ba-frame>
        <img class="ba__img" alt="${afterAlt}">
        <div class="ba__before" data-ba-before><img class="ba__img" alt="${beforeAlt}"></div>
        <span class="ba__tag ba__tag--before" aria-hidden="true">Now</span>
        <span class="ba__tag ba__tag--after" aria-hidden="true">Concept</span>
        <div class="ba__handle" data-ba-handle role="slider" tabindex="0" aria-label="Compare your photo with the concept" aria-valuemin="0" aria-valuemax="100">
          <span class="ba__knob" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
      </div>
    </figure>`;
  const [afterImg, beforeImg] = container.querySelectorAll("img");
  afterImg.src = after;
  beforeImg.src = before;
  // Let the natural image ratio drive the frame for user photos.
  afterImg.style.position = "relative";
  const ctrl = initCompare(container.querySelector("[data-ba]"));
  return ctrl;
}

/* ---------- Gallery: tabs swap project pairs ---------- */
function initGallery(root) {
  const fig = root.querySelector("[data-ba]");
  const ctrl = initCompare(fig);
  const after = fig.querySelector("[data-ba-after]");
  const before = fig.querySelector("[data-ba-before] img");
  const tabs = [...root.querySelectorAll(".ba-tab")];
  const text = (sel, v) => (fig.querySelector(sel).textContent = v);
  const illo = fig.querySelector("[data-ba-illustration]");

  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = src; });

  const select = async (tab) => {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    const d = tab.dataset;
    await Promise.all([load(d.before), load(d.after)]);
    after.style.opacity = before.style.opacity = "0";
    await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 220));
    after.src = d.after; after.alt = `After: ${d.title}`;
    before.src = d.before; before.alt = `Before: ${d.title}`;
    text("[data-ba-title]", d.title);
    text("[data-ba-caption]", d.caption);
    text("[data-ba-type]", d.type);
    illo.hidden = d.placeholder !== "true";
    after.style.opacity = before.style.opacity = "1";
    ctrl.set(50, 0.15);
  };

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const next = tabs[(i + dir + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
}

document.querySelectorAll("[data-ba-gallery]").forEach(initGallery);
