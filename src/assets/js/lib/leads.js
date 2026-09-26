/**
 * Lead hand-off.
 *
 * If `window.PRIMETURF.forms.endpoint` is set (src/_data/site.json → forms.endpoint)
 * leads are POSTed there as JSON. Otherwise we fall back to WhatsApp / email,
 * which works on a static host with zero backend.
 */
const cfg = () => window.PRIMETURF || {};

export const waUrl = (text) => `https://wa.me/${cfg().contact.whatsapp}?text=${encodeURIComponent(text)}`;
export const mailUrl = (subject, body) =>
  `mailto:${cfg().contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/**
 * @param {object} payload  plain JSON-serialisable lead
 * @returns {Promise<{ok:boolean, via:'endpoint'|'handoff', error?:string}>}
 */
export async function submitLead(payload) {
  const endpoint = cfg().forms?.endpoint;
  if (!endpoint) return { ok: false, via: "handoff" };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...payload, source: location.href, submittedAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, via: "endpoint" };
  } catch (err) {
    return { ok: false, via: "handoff", error: String(err) };
  }
}

export const formatRand = (n) => "R" + Math.round(n).toLocaleString("en-ZA").replace(/[, ]/g, " ");
