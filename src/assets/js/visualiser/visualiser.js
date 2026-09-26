/**
 * "Visualise Your Project" — flow controller.
 *
 *   photo → area → size → use → look → extras → contact → result
 *
 * Responsibilities: step navigation + validation, collecting answers,
 * calling the AI provider (providers.js), the estimator (estimator.js),
 * and rendering the result (concept compare slider + indicative range + CTAs).
 *
 * The controller never talks to a model directly — swap the provider, not this file.
 */
import { loadToCanvas, maskEditor } from "./renderer.js";
import { estimate, label } from "./estimator.js";
import { getProvider } from "./providers.js";
import { createCompare } from "../ba-slider.js";
import { turfCanvas } from "../lib/turf.js";
import { submitLead, waUrl, mailUrl, formatRand } from "../lib/leads.js";

const STEPS = ["photo", "area", "size", "use", "look", "extras", "contact", "result"];
const SKIPPABLE = new Set(["area", "extras"]);
const MAX_BYTES = 20 * 1024 * 1024;

/** Sample photo + a matching outline, so the demo works without an upload. */
const SAMPLE = {
  src: "/assets/img/projects/garden-before.svg",
  polygon: [[0, 0.62], [0.3, 0.6], [0.58, 0.61], [0.58, 1], [0, 1]],
  areaM2: 70,
};

function init(root) {
  const cfg = window.PRIMETURF;
  const provider = getProvider();
  const form = root.querySelector("[data-viz-form]");
  const q = (s) => root.querySelector(s);
  const steps = Object.fromEntries(STEPS.map((k) => [k, q(`[data-step="${k}"]`)]));
  const rail = [...root.querySelectorAll("[data-viz-progress] li")];
  const nav = q("[data-viz-nav]");
  const btnBack = q("[data-viz-back]");
  const btnNext = q("[data-viz-next]");
  const btnSkip = q("[data-viz-skip]");

  const state = { i: 0, photo: null, editor: null, polygon: null, analysis: null, concept: null, sample: false };

  if (provider.isRemote) q("[data-viz-privacy]").textContent = "Your photo is sent securely to generate the concept. It isn’t published.";

  /* ---------- Look swatches: paint each turf look ---------- */
  root.querySelectorAll("[data-swatch]").forEach((el) => {
    const c = turfCanvas(320, 180, el.dataset.swatch, { seed: 3, scale: 1.2, horizon: 0.45 });
    el.style.backgroundImage = `url(${c.toDataURL("image/jpeg", 0.8)})`;
  });

  /* ---------- Navigation ---------- */
  const current = () => STEPS[state.i];
  const show = (i, { focus = true } = {}) => {
    state.i = i;
    const key = current();
    STEPS.forEach((k) => (steps[k].hidden = k !== key));
    rail.forEach((li, idx) => {
      li.classList.toggle("is-done", idx < i);
      li.classList.toggle("is-current", idx === i);
      if (idx === i) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    btnBack.disabled = i === 0;
    btnSkip.hidden = !SKIPPABLE.has(key);
    btnNext.textContent = key === "contact" ? "See my concept" : "Continue";
    nav.hidden = key === "result";
    onEnter(key);
    if (focus) {
      const r = root.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight * 0.5) root.scrollIntoView({ behavior: "smooth", block: "start" });
      const legend = steps[key].querySelector("legend, [data-viz-loading]");
      legend?.setAttribute("tabindex", "-1");
      legend?.focus({ preventScroll: true });
    }
  };
  const go = (d) => show(Math.min(STEPS.length - 1, Math.max(0, state.i + d)));

  btnBack.addEventListener("click", () => go(-1));
  btnSkip.addEventListener("click", () => { if (current() === "area") state.editor?.clear(); go(1); });
  form.addEventListener("submit", (e) => { e.preventDefault(); if (validate(current())) go(1); });

  /* ---------- Step: photo ---------- */
  const fileInput = q("[data-viz-file]");
  const dz = q("[data-dropzone]");
  const photoErr = q('[data-viz-error="photo"]');
  const setPhoto = async (src, { sample = false } = {}) => {
    photoErr.hidden = true;
    try {
      state.photo = await loadToCanvas(src);
      state.sample = sample;
      state.polygon = sample ? SAMPLE.polygon : null;
      state.editor?.destroy(); state.editor = null;
      if (sample) { form.elements.areaM2.value = SAMPLE.areaM2; syncRange(); }
      // Ask the vision model (if configured) for a head start — don't block the flow.
      state.analysis = null;
      provider.analyse(state.photo).then((a) => applyAnalysis(a)).catch(() => {});
      go(1);
    } catch {
      photoErr.textContent = "We couldn’t read that image. Try a JPG or PNG.";
      photoErr.hidden = false;
    }
  };
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { photoErr.textContent = "Please choose an image file."; photoErr.hidden = false; return; }
    if (f.size > MAX_BYTES) { photoErr.textContent = "That photo is over 20 MB — try a smaller one."; photoErr.hidden = false; return; }
    setPhoto(f);
  });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event("change")); } });
  q("[data-viz-sample]").addEventListener("click", () => setPhoto(SAMPLE.src, { sample: true }));

  /** Pre-fill answers from a vision model, only where the user hasn't already acted. */
  function applyAnalysis(a) {
    if (!a) return;
    state.analysis = a;
    if (a.areaM2?.low && a.areaM2?.high) { form.elements.areaM2.value = Math.round((a.areaM2.low + a.areaM2.high) / 2); syncRange(); }
    if (a.surface && form.querySelector(`[name="surface"][value="${a.surface}"]`)) form.querySelector(`[name="surface"][value="${a.surface}"]`).checked = true;
    if (a.polygon?.length >= 3 && !state.polygon) { state.polygon = a.polygon; if (state.editor) { state.editor.destroy(); state.editor = null; if (current() === "area") onEnter("area"); } }
  }

  /* ---------- Step: area (outline) ---------- */
  const pointsOut = q("[data-viz-points]");
  q("[data-viz-undo]").addEventListener("click", () => state.editor?.undo());
  q("[data-viz-clear]").addEventListener("click", () => state.editor?.clear());

  /* ---------- Step: size ---------- */
  const m2 = form.elements.areaM2;
  const m2Range = q("[data-viz-m2-range]");
  function syncRange() {
    m2Range.value = Math.min(+m2Range.max, +m2.value || 0);
    m2Range.dispatchEvent(new Event("input"));
  }
  m2Range.addEventListener("input", (e) => { if (e.isTrusted) m2.value = m2Range.value; });
  m2.addEventListener("input", syncRange);

  /* ---------- Enter hooks ---------- */
  function onEnter(key) {
    if (key === "area" && state.photo && !state.editor) {
      state.editor = maskEditor(q("[data-viz-mask-canvas]"), state.photo, {
        initial: state.polygon || [],
        onChange: (pts) => {
          state.polygon = pts.length >= 3 ? pts.map((p) => [...p]) : null;
          pointsOut.textContent = pts.length < 3 ? `${pts.length} point${pts.length === 1 ? "" : "s"} · ${pts.length ? "add " + (3 - pts.length) + " more" : "using default area"}` : `${pts.length} points · outline set`;
        },
      });
    }
    if (key === "result") buildResult();
  }

  /* ---------- Validation ---------- */
  function validate(key) {
    if (key === "photo" && !state.photo) {
      photoErr.textContent = "Add a photo, or use the sample garden to try it out.";
      photoErr.hidden = false;
      return false;
    }
    if (key === "size") {
      const v = +m2.value;
      const bad = !(v >= 1 && v <= 20000);
      m2.setAttribute("aria-invalid", bad);
      if (bad) { m2.focus(); return false; }
    }
    if (key === "contact") {
      const err = q('[data-viz-error="contact"]');
      const f = form.elements;
      const problems = [];
      const mark = (el, bad) => el.setAttribute("aria-invalid", bad);
      mark(f.name, !f.name.value.trim()); if (!f.name.value.trim()) problems.push("your name");
      const hasPhone = f.phone.value.replace(/\D/g, "").length >= 9;
      const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim());
      mark(f.phone, !hasPhone && !hasEmail); mark(f.email, !hasPhone && !hasEmail);
      if (!hasPhone && !hasEmail) problems.push("a mobile number or email");
      if (!f.consent.checked) problems.push("your OK to be contacted");
      err.hidden = !problems.length;
      err.textContent = problems.length ? `Please add ${problems.join(", ")}.` : "";
      if (problems.length) return false;
    }
    return true;
  }
  form.addEventListener("input", (e) => e.target.removeAttribute?.("aria-invalid"));

  /* ---------- Answers ---------- */
  function collectAnswers() {
    const f = new FormData(form);
    return {
      areaM2: Number(f.get("areaM2")),
      surface: f.get("surface"),
      use: f.get("use"),
      look: f.get("look"),
      extras: f.getAll("extras"),
      notes: String(f.get("notes") || "").trim(),
      contact: { name: f.get("name"), phone: f.get("phone"), email: f.get("email"), location: f.get("location") },
      outlined: !!state.polygon,
      samplePhoto: state.sample,
    };
  }

  /* ---------- Result ---------- */
  const loading = q("[data-viz-loading]");
  const loadingText = q("[data-viz-loading-text]");
  const output = q("[data-viz-output]");
  let answers = null, est = null;

  async function buildResult() {
    loading.hidden = false;
    output.hidden = true;
    q("[data-viz-sent]").hidden = true;
    answers = collectAnswers();
    const msgs = ["Reading the space…", "Laying the turf…", "Working out your range…"];
    let m = 0; loadingText.textContent = msgs[0];
    const cycle = setInterval(() => (loadingText.textContent = msgs[++m % msgs.length]), 900);

    const [concept] = await Promise.all([
      provider.generateConcept({ photo: state.photo, polygon: state.polygon, answers }),
      new Promise((r) => setTimeout(r, 1400)), // let the moment register
    ]);
    clearInterval(cycle);
    state.concept = concept;
    est = estimate(answers, cfg.pricing);

    createCompare(q("[data-viz-compare]"), {
      before: state.photo.toDataURL("image/jpeg", 0.88),
      after: concept.src,
      beforeAlt: "Your photo",
      afterAlt: "Concept visual with artificial turf",
    });

    q("[data-viz-total]").textContent = `${formatRand(est.total.low)} – ${formatRand(est.total.high)}`;
    q("[data-viz-rate]").textContent = `${formatRand(est.perM2.low)}–${formatRand(est.perM2.high)} per m² · ${est.area} m²`;
    const rows = [
      ["Area", `${est.area} m²`],
      ["Current surface", label("surface", answers.surface)],
      ["Use", label("use", answers.use)],
      ["Look", label("look", answers.look)],
      ["Requirements", answers.extras.length ? answers.extras.map((x) => label("extras", x)).join(", ") : "None noted"],
    ];
    const ul = q("[data-viz-summary]");
    ul.replaceChildren(...rows.map(([k, v]) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = k;
      const b = document.createElement("span"); b.textContent = v;
      li.append(a, b);
      return li;
    }));
    q("[data-viz-notes]").textContent = est.notes.join(" ");
    q("[data-viz-wa]").href = waUrl(summaryText());

    loading.hidden = true;
    output.hidden = false;
  }

  function summaryText() {
    const a = answers;
    return [
      "Hi Leon, I used the PrimeTurf visualiser and would like a free site visit.",
      `Name: ${a.contact.name}`,
      a.contact.phone && `Mobile: ${a.contact.phone}`,
      a.contact.email && `Email: ${a.contact.email}`,
      `Area: ${a.contact.location}`,
      `Size: ~${est.area} m² · Surface: ${label("surface", a.surface)}`,
      `Use: ${label("use", a.use)} · Look: ${label("look", a.look)}`,
      a.extras.length && `Requirements: ${a.extras.map((x) => label("extras", x)).join(", ")}`,
      a.notes && `Notes: ${a.notes}`,
      `Indicative range shown: ${formatRand(est.total.low)} – ${formatRand(est.total.high)}`,
    ].filter(Boolean).join("\n");
  }

  q("[data-viz-book]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = await submitLead({
      type: "visualiser",
      answers,
      estimate: est,
      conceptKind: state.concept?.kind,
      // Upgrade path: upload the concept + original to storage and send URLs here.
    });
    btn.disabled = false;
    const sent = q("[data-viz-sent]");
    sent.hidden = false;
    if (res.ok) {
      sent.textContent = "Request sent. Leon will be in touch within 2 hours to arrange your free site visit.";
    } else {
      sent.innerHTML = "";
      sent.append("Opening your email app with the details. Prefer WhatsApp? Use the button above.");
      location.href = mailUrl("Free site visit request (visualiser)", summaryText());
    }
  });

  q("[data-viz-download]").addEventListener("click", () => {
    if (!state.concept) return;
    const a = document.createElement("a");
    a.href = state.concept.src;
    a.download = "primeturf-concept.jpg";
    a.click();
  });

  q("[data-viz-restart]").addEventListener("click", () => {
    state.photo = null; state.polygon = null; state.editor?.destroy(); state.editor = null; state.concept = null;
    fileInput.value = "";
    show(0);
  });

  show(0, { focus: false });
}

document.querySelectorAll("[data-visualiser]").forEach(init);
