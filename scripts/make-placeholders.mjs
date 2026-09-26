/**
 * Generates the illustrative Before/After placeholder scenes in
 * src/assets/img/projects/*.svg  (run: npm run placeholders)
 *
 * These are clearly-labelled stand-ins until real PrimeTurf project photos
 * are supplied. Replace them by dropping photos in the same folder and
 * updating src/_data/projects.json (set placeholder:false).
 */
import { writeFileSync, mkdirSync } from "node:fs";

const W = 1600, H = 1000;
const OUT = new URL("../src/assets/img/projects/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const pts = (poly) => poly.map(([x, y]) => `${x * W},${y * H}`).join(" ");

const defs = `
<defs>
  <filter id="turf" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9 0.11" numOctaves="4" seed="4"/>
    <feColorMatrix type="matrix" values="0.32 0 0 0 0.07  0.52 0 0 0 0.24  0.22 0 0 0 0.05  0 0 0 0 1"/>
  </filter>
  <filter id="dry" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.7 0.16" numOctaves="4" seed="9" result="a"/>
    <feColorMatrix in="a" type="matrix" values="0.42 0 0 0 0.3  0.36 0 0 0 0.25  0.22 0 0 0 0.14  0 0 0 0 1" result="grass"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="2" result="p"/>
    <feColorMatrix in="p" type="matrix" values="0 0 0 0 0.52  0 0 0 0 0.4  0 0 0 0 0.27  2.6 0 0 0 -1.25" result="soil"/>
    <feComposite in="soil" in2="grass" operator="over"/>
  </filter>
  <filter id="putt" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="5"/>
    <feColorMatrix type="matrix" values="0.1 0 0 0 0.2  0.18 0 0 0 0.46  0.08 0 0 0 0.19  0 0 0 0 1"/>
  </filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="1"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .06 0"/></filter>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFD3DE"/><stop offset="1" stop-color="#E4ECEC"/></linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5FB6C9"/><stop offset="1" stop-color="#2E8CA6"/></linearGradient>
  <linearGradient id="depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
</defs>`;

/** Fill a polygon with a filtered texture (clip + filtered rect). */
const textured = (id, poly, filter) => `
  <clipPath id="c-${id}"><polygon points="${pts(poly)}"/></clipPath>
  <g clip-path="url(#c-${id})"><rect width="${W}" height="${H}" filter="url(#${filter})"/><rect width="${W}" height="${H}" fill="url(#depth)"/></g>`;

const paving = (poly, id) => `
  <clipPath id="c-${id}"><polygon points="${pts(poly)}"/></clipPath>
  <g clip-path="url(#c-${id})"><rect width="${W}" height="${H}" fill="#CFC9BD"/>
  ${Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${600 + i * 32 + i * i * 1.2}" x2="${W}" y2="${600 + i * 32 + i * i * 1.2}" stroke="#B3AC9E" stroke-width="2"/>`).join("")}
  ${Array.from({ length: 30 }, (_, i) => `<line x1="${i * 60}" y1="560" x2="${(i * 60 - 800) * 1.6 + 800}" y2="1000" stroke="#B3AC9E" stroke-width="2"/>`).join("")}</g>`;

const house = `
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect y="120" width="${W}" height="420" fill="#E7E2D8"/>
  <rect y="120" width="${W}" height="28" fill="#5B5F5C"/>
  <rect x="180" y="230" width="260" height="210" fill="#4B5A63"/><rect x="180" y="230" width="260" height="210" fill="none" stroke="#2F3438" stroke-width="10"/>
  <rect x="640" y="210" width="420" height="330" fill="#46545C"/><line x1="850" y1="210" x2="850" y2="540" stroke="#2F3438" stroke-width="8"/><rect x="640" y="210" width="420" height="330" fill="none" stroke="#2F3438" stroke-width="10"/>
  <rect x="1240" y="230" width="220" height="210" fill="#4B5A63"/><rect x="1240" y="230" width="220" height="210" fill="none" stroke="#2F3438" stroke-width="10"/>
  <rect y="530" width="${W}" height="40" fill="#8E877A"/>`;

const shrubs = (y) => Array.from({ length: 18 }, (_, i) => {
  const x = 40 + i * 92 + ((i * 37) % 30);
  const r = 34 + ((i * 13) % 22);
  return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.8}" fill="${["#3E5E36", "#4A6B3C", "#35532F"][i % 3]}"/>`;
}).join("");

const scenes = {
  garden: {
    lawn: [[0, 0.62], [0.3, 0.6], [0.58, 0.61], [0.58, 1], [0, 1]],
    base: () => `${house}<rect y="560" width="${W}" height="80" fill="#6B5A43"/>${shrubs(585)}${paving([[0.58, 0.61], [1, 0.6], [1, 1], [0.58, 1]], "pave")}`,
  },
  pool: {
    lawn: [[0, 0.58], [1, 0.58], [1, 1], [0, 1]],
    base: () => `${house}${shrubs(575)}`,
    over: () => `<polygon points="${pts([[0.27, 0.66], [0.73, 0.66], [0.8, 0.93], [0.2, 0.93]])}" fill="#EDEAE3"/><polygon points="${pts([[0.29, 0.68], [0.71, 0.68], [0.775, 0.91], [0.225, 0.91]])}" fill="url(#water)"/><path d="M${0.33 * W} ${0.74 * H} q 120 -14 240 0 t 240 0" stroke="#fff" stroke-opacity=".35" stroke-width="5" fill="none"/>`,
  },
  frontage: {
    lawn: [[0, 0.64], [0.42, 0.64], [0.36, 1], [0, 1]],
    lawn2: [[0.58, 0.64], [1, 0.64], [1, 1], [0.64, 1]],
    base: () => `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect x="0" y="80" width="${W}" height="520" fill="#2E3A40"/>${Array.from({ length: 8 }, (_, i) => `<rect x="${40 + i * 196}" y="120" width="170" height="440" fill="#5E7A86" opacity=".85"/><rect x="${40 + i * 196}" y="120" width="170" height="440" fill="none" stroke="#1E272B" stroke-width="6"/>`).join("")}<rect y="580" width="${W}" height="60" fill="#A6A196"/>${paving([[0.42, 0.64], [0.58, 0.64], [0.64, 1], [0.36, 1]], "walk")}`,
  },
  green: {
    lawn: [[0, 0.55], [1, 0.55], [1, 1], [0, 1]],
    base: () => `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect y="200" width="${W}" height="340" fill="#D8D1C4"/><rect y="200" width="${W}" height="20" fill="#A39A8A"/>${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 200}" y1="220" x2="${i * 200}" y2="540" stroke="#C4BCAE" stroke-width="4"/>`).join("")}<rect y="530" width="${W}" height="30" fill="#7C7466"/>${shrubs(560)}`,
    afterOver: () => `<clipPath id="c-green-shape"><ellipse cx="${0.5 * W}" cy="${0.78 * H}" rx="${0.36 * W}" ry="${0.16 * H}"/></clipPath><g clip-path="url(#c-green-shape)"><rect width="${W}" height="${H}" filter="url(#putt)"/></g><ellipse cx="${0.5 * W}" cy="${0.78 * H}" rx="${0.36 * W}" ry="${0.16 * H}" fill="none" stroke="#2C5A26" stroke-width="6" opacity=".6"/><ellipse cx="${0.62 * W}" cy="${0.75 * H}" rx="16" ry="6" fill="#1a1a1a"/><line x1="${0.62 * W}" y1="${0.75 * H}" x2="${0.62 * W}" y2="${0.5 * H}" stroke="#EEE" stroke-width="5"/><polygon points="${0.62 * W},${0.5 * H} ${0.62 * W + 80},${0.53 * H} ${0.62 * W},${0.56 * H}" fill="#C6F24E"/>`,
  },
};

for (const [name, s] of Object.entries(scenes)) {
  for (const state of ["before", "after"]) {
    const fill = state === "before" ? "dry" : "turf";
    const body = [
      s.base(),
      textured(`${name}-lawn`, s.lawn, fill),
      s.lawn2 ? textured(`${name}-lawn2`, s.lawn2, fill) : "",
      s.over ? s.over() : "",
      state === "after" && s.afterOver ? s.afterOver() : "",
      `<rect width="${W}" height="${H}" filter="url(#grain)"/>`,
    ].join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${defs}${body}</svg>`;
    writeFileSync(new URL(`${name}-${state}.svg`, OUT), svg);
  }
}
console.log("Placeholders written to", OUT.pathname);
