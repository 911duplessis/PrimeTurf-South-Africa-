/**
 * Lead hand-off.
 *
 * When `window.PRIMETURF.forms.endpoint` is set (src/_data/site.json → forms.endpoint),
 * leads are POSTed there as multipart form data, with optional file attachments.
 * The default endpoint is FormSubmit (formsubmit.co): it needs no account, emails
 * each lead to PrimeTurf, can CC the customer, and accepts attachments (10 MB total).
 * FormSubmit needs a one-time activation: the first submission emails an activation
 * link to the address in the endpoint, and nothing is delivered until it's clicked.
 *
 * With no endpoint, or if sending fails, callers fall back to WhatsApp / email hand-off.
 */
const cfg = () => window.PRIMETURF || {};

export const waUrl = (text) => `https://wa.me/${cfg().contact.whatsapp}?text=${encodeURIComponent(text)}`;
export const mailUrl = (subject, body) =>
  `mailto:${cfg().contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/**
 * @param {Record<string,string>} fields  human-readable label → value (becomes the email table)
 * @param {{subject?:string, cc?:string, files?:{field:string, blob:Blob, filename:string}[]}} [opts]
 * @returns {Promise<{ok:boolean, via:'endpoint'|'handoff', error?:string}>}
 */
export async function submitLead(fields, { subject = "New enquiry from primeturf.co.za", cc = "", files = [] } = {}) {
  const endpoint = cfg().forms?.endpoint;
  if (!endpoint) return { ok: false, via: "handoff" };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== "") fd.append(k, String(v));
  fd.append("Page", location.href);
  // FormSubmit options (ignored by other backends).
  fd.append("_subject", subject);
  fd.append("_template", "table");
  fd.append("_captcha", "false");
  if (cc) fd.append("_cc", cc);
  if (fields.Email) fd.append("_replyto", fields.Email);
  for (const f of files) if (f.blob) fd.append(f.field, f.blob, f.filename);
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { Accept: "application/json" }, body: fd });
    const json = await res.json().catch(() => ({}));
    // FormSubmit answers 200 with success:"false" (e.g. before activation).
    if (!res.ok || json.success === false || json.success === "false") throw new Error(json.message || `HTTP ${res.status}`);
    return { ok: true, via: "endpoint" };
  } catch (err) {
    return { ok: false, via: "handoff", error: String(err) };
  }
}

export const formatRand = (n) => "R" + Math.round(n).toLocaleString("en-ZA").replace(/[, ]/g, " ");
