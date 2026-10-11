// OCR row rebuilding and E8 metrics (port of Ocr.kt / src/shastho/ocr_eval.py).
import * as G from "./generated.js";
import { rx, findAll } from "./rx.js";
import { strip } from "./py.js";
import { parseLabLines } from "./rules.js";

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const cx = (w) => (w.left + w.right) / 2, cy = (w) => (w.top + w.bottom) / 2, hh = (w) => w.bottom - w.top;
const minBy = (a, f) => a.reduce((b, x) => (f(x) < f(b) ? x : b)), maxBy = (a, f) => a.reduce((b, x) => (f(x) > f(b) ? x : b));

/** words: [{text, left, top, right, bottom, line}] -> text with table rows rebuilt (tilt undone). */
export function slope(words) {
  const byLine = new Map();
  for (const w of words) if (w.line >= 0) { if (!byLine.has(w.line)) byLine.set(w.line, []); byLine.get(w.line).push(w); }
  const s = [];
  for (const ln of byLine.values()) {
    if (ln.length < 2) continue;
    const a = minBy(ln, cx), b = maxBy(ln, cx);
    if (cx(b) - cx(a) > 3 * hh(a)) s.push((cy(b) - cy(a)) / (cx(b) - cx(a)));
  }
  return median(s);
}

export function layoutToText(words) {
  const ws = words.filter((w) => w.text.trim().length);
  if (!ws.length) return "";
  const k = slope(ws), h = Math.max(1, median(ws.map(hh)));
  const y = (w) => cy(w) - k * cx(w);
  const rows = [], rowY = [];
  for (const w of [...ws].sort((a, b) => y(a) - y(b))) {
    const i = rowY.length - 1;
    if (i >= 0 && Math.abs(y(w) - rowY[i]) < 0.55 * h) { rows[i].push(w); rowY[i] = rows[i].reduce((a, x) => a + y(x), 0) / rows[i].length; }
    else { rows.push([w]); rowY.push(y(w)); }
  }
  return rows.map((row) => {
    const r = [...row].sort((a, b) => a.left - b.left);
    return r.map((w, i) => (i > 0 ? (w.left - r[i - 1].right > 1.2 * h ? "   " : " ") : "") + w.text).join("");
  }).join("\n");
}

export const norm = (t) => strip(t.replace(rx(G.OCR_ID_LINE, "g"), "").replace(rx(G.SPACES, "g"), " "));

export function levenshtein(a0, b0) {
  const [a, b] = a0.length < b0.length ? [b0, a0] : [a0, b0];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    prev = cur;
  }
  return prev[b.length];
}

export const cer = (ref, hyp) => { const r = norm(ref); return levenshtein(r, norm(hyp)) / Math.max(1, r.length); };

export function labScores(gold, hyp) {
  const got = parseLabLines(hyp);
  const key = (n) => strip(n).replace(rx(G.SPACES, "g"), " ").toLowerCase();
  const used = new Set(); let exact = 0, flags = 0;
  for (const gl of gold) {
    const j = got.findIndex((x, i) => !used.has(i) && key(x.name) === key(gl.name));
    if (j < 0) continue;
    used.add(j); const h = got[j];
    if (h.value === gl.value && h.unit === gl.unit && h.low === gl.low && h.high === gl.high) exact++;
    if (h.flag === gl.flag) flags++;
  }
  return { gold_rows: gold.length, rows_exact: exact, flags_correct: flags, spurious: got.length - used.size };
}

export function leakScores(pii, redacted) {
  const visible = new Set([...findAll(G.OCR_TOKEN, redacted)].map((m) => m[0]));
  const leaked = pii.filter((p) => [...findAll(G.OCR_TOKEN, p)].some((m) => m[0].length >= 3 && visible.has(m[0])));
  return { pii: pii.length, leaked: leaked.length, leaked_items: leaked };
}
