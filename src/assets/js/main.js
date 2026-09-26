/**
 * Site-wide behaviour. Progressive enhancement only — every page works without JS.
 */
import { submitLead, waUrl, mailUrl, formatRand } from "./lib/leads.js";

document.documentElement.classList.add("js");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Header: solid on scroll, hide on scroll-down ---------- */
(() => {
  const header = $("[data-header]");
  const bar = $("[data-action-bar]");
  const footer = $(".site-footer");
  if (!header) return;
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle("is-scrolled", y > 12);
    const menuOpen = document.body.classList.contains("menu-open");
    header.classList.toggle("is-hidden", !menuOpen && y > 400 && y > lastY + 4);
    if (y < lastY - 4) header.classList.remove("is-hidden");
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Hide the mobile action bar once the footer (which repeats the contacts) is on screen.
  if (bar && footer) {
    new IntersectionObserver(([e]) => bar.classList.toggle("is-hidden", e.isIntersecting)).observe(footer);
  }
})();

/* ---------- Mobile menu ---------- */
(() => {
  const btn = $("[data-menu-toggle]");
  const nav = $("#site-nav");
  if (!btn || !nav) return;
  const set = (open) => {
    btn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => e.target.closest("a") && set(false));
  addEventListener("keydown", (e) => e.key === "Escape" && set(false));
  matchMedia("(min-width: 1121px)").addEventListener("change", () => set(false));
})();

/* ---------- Scroll reveals (staggered within a parent) ---------- */
(() => {
  const els = $$("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const siblings = [...e.target.parentElement.children].filter((c) => c.hasAttribute("data-reveal"));
      e.target.style.setProperty("--d", `${Math.min(siblings.indexOf(e.target), 6) * 0.08}s`);
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach((el) => io.observe(el));
})();

/* ---------- Hero: gentle parallax on the project photo ---------- */
(() => {
  const field = $("[data-hero] .hero__field");
  if (!field || reduceMotion) return;
  addEventListener("scroll", () => {
    if (scrollY > innerHeight) return;
    field.style.transform = `translate3d(0, ${scrollY * 0.15}px, 0)`;
  }, { passive: true });
})();

/* ---------- Quick price calculator ---------- */
(() => {
  const root = $("[data-quick-calc]");
  if (!root) return;
  const { minPerM2, maxPerM2 } = window.PRIMETURF.pricing;
  const range = $("[data-calc-m2]", root);
  const out = $("[data-calc-m2-out]", root);
  const total = $("[data-calc-total]", root);
  const update = () => {
    const m2 = +range.value;
    out.textContent = `${m2} m²`;
    total.textContent = `${formatRand(m2 * minPerM2)} – ${formatRand(m2 * maxPerM2)}`;
    range.style.setProperty("--fill", `${((m2 - range.min) / (range.max - range.min)) * 100}%`);
  };
  range.addEventListener("input", update);
  update();
})();

/* Paint range fills for any other .range inputs */
$$(".range").forEach((r) => {
  const f = () => r.style.setProperty("--fill", `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  r.addEventListener("input", f); f();
});

/* ---------- Quote forms ---------- */
$$("[data-quote-form]").forEach((form) => {
  const status = $("[data-form-status]", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const need = ["name", "phone"];
    let firstBad = null;
    need.forEach((k) => {
      const el = form.elements[k];
      const bad = !String(data[k] || "").trim();
      el.setAttribute("aria-invalid", bad);
      if (bad && !firstBad) firstBad = el;
    });
    if (firstBad) { firstBad.focus(); return; }

    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    const res = await submitLead({ type: "quote", ...data });
    btn.disabled = false;
    status.hidden = false;
    if (res.ok) {
      status.className = "form-status is-success";
      status.textContent = "Thanks — Leon will be in touch within 2 hours.";
      form.reset();
      return;
    }
    // Static-hosting fallback: hand the enquiry to WhatsApp or email.
    const text = [
      `Hi Leon, I'd like a free turf quote.`,
      `Name: ${data.name}`, `Phone: ${data.phone}`, data.email && `Email: ${data.email}`,
      `Area: ${data.location}`, `Project: ${data.service}`, data.areaM2 && `Approx. size: ${data.areaM2} m²`,
      data.message && `Notes: ${data.message}`,
    ].filter(Boolean).join("\n");
    status.className = "form-status";
    status.innerHTML = `Almost done — send your details to Leon: <a href="${waUrl(text)}" target="_blank" rel="noopener"><strong>WhatsApp</strong></a> or <a href="${mailUrl("Free turf quote request", text)}"><strong>email</strong></a>.`;
  });
  form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));
});
