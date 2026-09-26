/**
 * Branded indicative quote — drawn in the browser as an A4-proportioned JPEG.
 *
 * Used as the email attachment (to PrimeTurf, and to the customer when they
 * give an email) and for "Download my quote". Brand tokens mirror main.css.
 */
const C = {
  deep: "#1A3A2A", green: "#1A5A28", gold: "#B8902A", goldLight: "#D4A940", goldText: "#8A6B20",
  ivory: "#FAF8F2", ink: "#1A3A2A", muted: "#4B6456", hair: "rgba(26,58,42,.18)", white: "#FFFFFF",
};
const F = {
  display: 'Cinzel, "Trajan Pro", Georgia, serif',
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: 'Montserrat, "Helvetica Neue", Arial, sans-serif',
};
const W = 1240, H = 1754, M = 72; // A4 at ~150 dpi, page margin

const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
});

/** Draw an image cropped to fill the box (object-fit: cover), with rounded corners. */
function cover(ctx, img, x, y, w, h, r = 10) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Wrap text into lines that fit `maxW`; returns the y after the last line. */
function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/\s+/);
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; }
    else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

function tag(ctx, text, x, y) {
  ctx.font = `600 20px ${F.sans}`;
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = "rgba(26,58,42,.85)";
  ctx.beginPath(); ctx.roundRect(x, y, w, 36, 4); ctx.fill();
  ctx.fillStyle = C.ivory; ctx.fillText(text, x + 14, y + 25);
}

export const quoteRef = () => {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `PT-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

/**
 * @param {object} q
 * @param {HTMLCanvasElement|string} q.before   the customer's photo (canvas or URL)
 * @param {string} q.after                      concept image URL
 * @param {string} q.logo                       reversed logo URL
 * @param {string} q.ref, q.name, q.location, q.total, q.rate
 * @param {[string,string][]} q.rows            label/value detail rows
 * @param {string[]} q.notes
 * @param {{person:string, phone:string, email:string, web:string}} q.contact
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderQuoteCard(q) {
  await Promise.all([
    document.fonts?.load(`400 40px ${F.display}`), document.fonts?.load(`600 30px ${F.serif}`),
    document.fonts?.load(`400 20px ${F.sans}`), document.fonts?.load(`600 20px ${F.sans}`),
  ].filter(Boolean)).catch(() => {});
  const [before, after, logo] = await Promise.all([
    typeof q.before === "string" ? loadImg(q.before) : q.before,
    loadImg(q.after),
    loadImg(q.logo).catch(() => null),
  ]);

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = C.ivory; ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = C.deep; ctx.fillRect(0, 0, W, 190);
  if (logo) ctx.drawImage(logo, M, 62, 400, 400 * logo.height / logo.width);
  ctx.textAlign = "right";
  ctx.fillStyle = C.goldLight; ctx.font = `600 20px ${F.sans}`;
  ctx.fillText("INDICATIVE QUOTE", W - M, 84);
  ctx.fillStyle = C.ivory; ctx.font = `400 20px ${F.sans}`;
  ctx.fillText(new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }), W - M, 116);
  ctx.fillText(`Ref ${q.ref}`, W - M, 146);
  ctx.textAlign = "left";
  ctx.fillStyle = C.gold; ctx.fillRect(0, 190, W, 4);

  // Prepared for
  let y = 262;
  ctx.fillStyle = C.goldText; ctx.font = `600 18px ${F.sans}`;
  ctx.fillText("PREPARED FOR", M, y);
  ctx.fillStyle = C.ink; ctx.font = `600 44px ${F.serif}`;
  ctx.fillText(q.name || "Your project", M, y + 50);
  if (q.location) { ctx.fillStyle = C.muted; ctx.font = `400 22px ${F.sans}`; ctx.fillText(q.location, M, y + 86); }

  // Before / concept
  y = 380;
  const gap = 32, iw = (W - 2 * M - gap) / 2, ih = Math.round(iw * 0.75);
  cover(ctx, before, M, y, iw, ih);
  cover(ctx, after, M + iw + gap, y, iw, ih);
  tag(ctx, "NOW", M + 16, y + 16);
  tag(ctx, "CONCEPT", M + iw + gap + 16, y + 16);
  y += ih + 30;
  ctx.fillStyle = C.muted; ctx.font = `400 17px ${F.sans}`;
  ctx.fillText("Concept visual only: a computer-generated impression, not a photograph of a finished installation.", M, y);

  // Price panel
  y += 34;
  ctx.fillStyle = C.white; ctx.strokeStyle = C.hair; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(M, y, W - 2 * M, 190, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.fillRect(M, y, 6, 190);
  ctx.fillStyle = C.goldText; ctx.font = `600 18px ${F.sans}`;
  ctx.fillText("INDICATIVE INSTALLED PRICE", M + 40, y + 50);
  ctx.fillStyle = C.deep; ctx.font = `400 68px ${F.display}`;
  ctx.fillText(q.total, M + 40, y + 124);
  ctx.fillStyle = C.muted; ctx.font = `400 22px ${F.sans}`;
  ctx.fillText(q.rate, M + 40, y + 164);
  y += 190 + 50;

  // Details
  ctx.fillStyle = C.goldText; ctx.font = `600 18px ${F.sans}`;
  ctx.fillText("PROJECT DETAILS", M, y);
  y += 22;
  for (const [k, v] of q.rows) {
    ctx.fillStyle = C.hair; ctx.fillRect(M, y, W - 2 * M, 1);
    ctx.fillStyle = C.muted; ctx.font = `400 21px ${F.sans}`;
    ctx.fillText(k, M, y + 38);
    ctx.fillStyle = C.ink; ctx.font = `600 21px ${F.sans}`;
    const endY = wrap(ctx, v, M + 300, y + 38, W - 2 * M - 300, 30);
    y = Math.max(y + 56, endY - 12);
  }
  ctx.fillStyle = C.hair; ctx.fillRect(M, y, W - 2 * M, 1);
  y += 44;

  // Notes + disclaimer
  ctx.fillStyle = C.ink; ctx.font = `400 19px ${F.sans}`;
  const notes = [
    "Price covers turf supply, excavation, sub-base preparation, edging and installation.",
    ...(q.notes || []),
  ];
  for (const n of notes) y = wrap(ctx, `•  ${n}`, M, y, W - 2 * M, 28) + 4;
  y += 10;
  ctx.fillStyle = C.muted; ctx.font = `italic 400 18px ${F.sans}`;
  wrap(ctx, "Indicative only. This range is based on the answers given and PrimeTurf's published price bands. Your fixed quote is confirmed after a free site visit.", M, y, W - 2 * M, 26);

  // Footer band
  ctx.fillStyle = C.deep; ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = C.gold; ctx.fillRect(0, H - 150, W, 3);
  ctx.fillStyle = C.ivory; ctx.font = `600 24px ${F.sans}`;
  ctx.fillText(`${q.contact.person}  ·  ${q.contact.phone}  ·  ${q.contact.email}`, M, H - 92);
  ctx.fillStyle = C.goldLight; ctx.font = `400 19px ${F.sans}`;
  ctx.fillText("Product warranty up to 6 years  ·  24-month workmanship guarantee  ·  Own installation team", M, H - 54);
  ctx.textAlign = "right"; ctx.fillStyle = C.ivory; ctx.font = `400 19px ${F.sans}`;
  ctx.fillText(q.contact.web, W - M, H - 92);
  ctx.textAlign = "left";
  return c;
}

export const toBlob = (canvas, q = 0.86) => new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
