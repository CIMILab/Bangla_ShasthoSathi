// SVG/HTML charts. Status colours are reserved for HIGH / LOW / NORMAL and always come with an icon + word.
import { g } from "./core/py.js";

export const STATUS_ORDER = ["normal", "high", "low", "unknown"];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ICON = {
  high: '<path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/>',
  low: '<path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/>',
  normal: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8z"/>',
  unknown: '<path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>',
};
export const statusIcon = (f, size = 16) => `<svg class="sicon s-${f}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON[f] ?? ICON.unknown}</svg>`;
export const pill = (f, word) => `<span class="pill p-${f}">${statusIcon(f)}<span>${esc(word)}</span></span>`;

/** Donut of counts by status; each slice has data-flag for click handling. */
export function donut(counts, center, sub, size = 168) {
  const tot = counts.reduce((a, [, n]) => a + n, 0) || 1, r = size / 2 - 14, c = size / 2, sw = 24;
  const circ = 2 * Math.PI * r, gap = counts.filter(([, n]) => n).length > 1 ? 3 : 0;
  let acc = 0, arcs = "";
  for (const [f, n] of counts) {
    if (!n) continue;
    const len = (circ * n) / tot;
    arcs += `<circle class="slice s-${f}" data-action="slice" data-flag="${f}" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${sw}"
      stroke-dasharray="${Math.max(0.5, len - gap)} ${circ}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${c} ${c})"><title>${n}</title></circle>`;
    acc += len;
  }
  return `<div class="donut" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" class="track" stroke-width="${sw}"/>${arcs}</svg>
    <div class="donut-c"><div class="donut-n">${esc(center)}</div><div class="donut-s">${esc(sub)}</div></div></div>`;
}

/** Normal zone [a, b] and the value's position on a 0..1 track; null when the report gives no range. */
export function geom(l) {
  const lo = l.low, hi = l.high;
  if (lo == null && hi == null) return null;
  let ref = lo != null && hi != null ? hi - lo : Math.abs(hi ?? lo);
  if (ref <= 0) ref = 1;
  let min = lo != null ? lo - 0.6 * ref : Math.min(0, l.value);
  let max = hi != null ? hi + 0.6 * ref : lo + 1.6 * ref;
  min = Math.min(min, l.value - 0.08 * ref); max = Math.max(max, l.value + 0.08 * ref);
  const f = (x) => Math.min(1, Math.max(0, (x - min) / (max - min)));
  return { a: lo != null ? f(lo) : 0, b: hi != null ? f(hi) : 1, pos: f(l.value) };
}

/** Range gauge (HTML so it can animate with CSS): grey track, green normal zone, marker for the value. */
export function gauge(l, labels = true) {
  const G = geom(l);
  if (!G) return "";
  return `<div class="gauge${labels ? "" : " slim"}">
    <div class="g-track"><div class="g-zone" style="left:${G.a * 100}%;width:${(G.b - G.a) * 100}%"></div>
      <div class="g-mark s-${l.flag}" data-pos="${G.pos * 100}" style="left:0%"></div></div>
    ${labels ? `<div class="g-labels">${l.low != null ? `<span style="left:${G.a * 100}%">${g(l.low)}</span>` : ""}${l.high != null ? `<span style="left:${G.b * 100}%">${g(l.high)}</span>` : ""}</div>` : ""}
  </div>`;
}

/** Called after each render: slide gauge markers to their value (CSS transition). */
export function animate(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll(".g-mark[data-pos]").forEach((m) => { m.style.left = m.dataset.pos + "%"; });
    root.querySelectorAll(".donut").forEach((d) => d.classList.add("in"));
  }));
}

/** Trend of one test across saved reports: points coloured by flag, green band = latest normal range. */
export function trend(points, unit, fmtDate, W = 520, H = 170) {
  const P = { l: 44, r: 14, t: 12, b: 28 };
  const xs = points.map((p) => +new Date(p.date)), vs = points.map((p) => p.value);
  const last = points[points.length - 1];
  const lo = last.low, hi = last.high;
  let vmin = Math.min(...vs, lo ?? Infinity), vmax = Math.max(...vs, hi ?? -Infinity);
  if (vmin === vmax) { vmin -= 1; vmax += 1; }
  const pad = (vmax - vmin) * 0.15; vmin -= pad; vmax += pad;
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  const X = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r), Y = (v) => P.t + (1 - (v - vmin) / (vmax - vmin)) * (H - P.t - P.b);
  const band = lo != null || hi != null
    ? `<rect class="t-band" x="${P.l}" width="${W - P.l - P.r}" y="${Y(hi ?? vmax)}" height="${Math.max(0, Y(lo ?? vmin) - Y(hi ?? vmax))}"/>` : "";
  const ticks = [vmin + pad, (vmin + vmax) / 2, vmax - pad].map((v) => `<line class="t-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/>
    <text class="t-ax" x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${g(+v.toPrecision(3))}</text>`).join("");
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(p.value).toFixed(1)}`).join("");
  const dots = points.map((p, i) => `<g class="t-pt" data-tip="${esc(fmtDate(p.date) + " · " + g(p.value) + " " + unit)}">
      <circle cx="${X(xs[i])}" cy="${Y(p.value)}" r="14" class="hit"/><circle cx="${X(xs[i])}" cy="${Y(p.value)}" r="5.5" class="dot s-${p.flag}"/></g>`).join("");
  const xl = points.map((p, i) => `<text class="t-ax" x="${X(xs[i])}" y="${H - 8}" text-anchor="middle">${esc(fmtDate(p.date, true))}</text>`).join("");
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img">${band}${ticks}<path class="t-line" d="${line}"/>${dots}${xl}</svg>`;
}
