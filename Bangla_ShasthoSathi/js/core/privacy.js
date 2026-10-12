// Port of the privacy parts of pipeline.py, protect.py, pii_rules.py and mobile_ref.py (same as Privacy.kt).
import * as G from "./generated.js";
import { rx, findAll } from "./rx.js";
import { isSpace, splitlines } from "./py.js";
import { parseLabLines } from "./rules.js";

/** pii_rules.rule_spans -> [{start, end, label}] */
export function ruleSpans(text, v2) {
  const out = [];
  for (const r of v2 ? [...G.RULES_V1, ...G.RULES_V2] : G.RULES_V1) {
    for (const m of findAll(r.rx, text)) {
      const ix = m.indices[r.group];
      if (!ix) continue;
      if (ix[1] > ix[0]) out.push({ start: ix[0], end: ix[1], label: r.label });
    }
  }
  return out;
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** sort by (start, end, label), join overlapping spans, keep the first label */
export function merge(spans) {
  const out = [];
  for (const sp of [...spans].sort((a, b) => a.start - b.start || a.end - b.end || cmpStr(a.label, b.label))) {
    const last = out[out.length - 1];
    if (last && sp.start <= last.end) out[out.length - 1] = { start: last.start, end: Math.max(last.end, sp.end), label: last.label };
    else out.push({ ...sp });
  }
  return out;
}

/** protect.subtract on [s, e] pairs */
export function subtract(spans, holes) {
  const hs = [...holes].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [s, e] of spans) {
    let pieces = [[s, e]];
    for (const [a, b] of hs) {
      const nxt = [];
      for (const [ps, pe] of pieces) {
        if (b <= ps || a >= pe) { nxt.push([ps, pe]); continue; }
        if (ps < a) nxt.push([ps, a]);
        if (b < pe) nxt.push([b, pe]);
      }
      pieces = nxt;
    }
    out.push(...pieces.filter((p) => p[1] > p[0]));
  }
  return out;
}

/** strip whitespace / punctuation at the edges; drop empty pieces */
export function trim(text, spans) {
  const skip = (c) => isSpace(c) || G.TRIM_PUNCT.has(c);
  const out = [];
  for (const [s0, e0] of spans) {
    let s = s0, e = e0;
    while (s < e && skip(text[s])) s++;
    while (e > s && skip(text[e - 1])) e--;
    if (e > s) out.push([s, e]);
  }
  return out;
}

/** spans of lines that parse as lab rows (never redacted by the models) */
export function labRows(text) {
  const wanted = new Set(parseLabLines(text).map((l) => l.line));
  const rows = []; let pos = 0;
  splitlines(text, true).forEach((ln, i) => {
    if (wanted.has(i + 1)) rows.push([pos, pos + ln.replace(/\n+$/, "").length]);
    pos += ln.length;
  });
  return rows;
}

export function route(text) {
  const b = rx(G.BN_CHAR).test(text), l = rx(G.LAT_CHAR).test(text);
  return b && l ? ["en", "bn"] : b ? ["bn"] : ["en"];
}

/** consecutive words with the same type -> one entity; 'B-' starts a new one */
export function group(spans, labels, types = null, threshold = 0) {
  const out = []; let cs = 0, ce = 0, ct = null, sc = [];
  const avg = () => sc.reduce((a, b) => a + b, 0) / sc.length;
  const flush = () => { if (ct != null && avg() >= threshold) out.push({ start: cs, end: ce, type: ct, score: avg() }); };
  for (let i = 0; i < spans.length; i++) {
    const [s, e] = spans[i], [lab, score] = labels[i];
    const typ = lab === "O" ? null : lab.replace(/^[BIES]-/, "");
    if (typ != null && (types == null || types.has(typ))) {
      if (ct === typ && !lab.startsWith("B-")) { ce = e; sc.push(score); }
      else { flush(); cs = s; ce = e; ct = typ; sc = [score]; }
    } else { flush(); ct = null; sc = []; }
  }
  flush();
  return out;
}

/** The model-independent part of the word tagger; `logits(ids)` runs the ONNX model on one window (may be async). */
export class WordTaggerCore {
  constructor({ labels, cls, sep, maxLen, stride, encode, logits }) {
    Object.assign(this, { labels, cls, sep, stride, encode, logits }); this.L = maxLen - 2;
  }
  wordPieces(words) {
    const ids = [], wid = [];
    words.forEach((w, i) => { for (const t of this.encode(w)) { ids.push(t); wid.push(i); } });
    return [ids, wid];
  }
  async tokenProbs(ids) {
    const n = ids.length, out = new Array(n).fill(null); let start = 0;
    while (n > 0) {
      const chunk = ids.slice(start, Math.min(n, start + this.L));
      const z = await this.logits([this.cls, ...chunk, this.sep]);
      for (let j = 0; j < chunk.length; j++) {
        if (out[start + j] != null) continue;
        const row = Array.from(z[j + 1]); const mx = Math.max(...row);
        const ex = row.map((v) => Math.exp(v - mx)); const sum = ex.reduce((a, b) => a + b, 0);
        out[start + j] = ex.map((v) => v / sum);
      }
      if (start + this.L >= n) break;
      start += this.L - this.stride;
    }
    return out;
  }
  async wordLabels(words, mode) {
    const [ids, wid] = this.wordPieces(words);
    const probs = await this.tokenProbs(ids);
    const per = words.map(() => []);
    ids.forEach((_, k) => per[wid[k]].push(probs[k]));
    const o = this.labels.indexOf("O");
    const argmax = (v) => { let b = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[b]) b = i; return b; };
    return per.map((ps) => {
      if (!ps.length) return ["O", 1.0];
      if (mode === "max" && o >= 0) {
        const ent = ps.map((p) => 1 - p[o]); const best = argmax(ent);
        const p = [...ps[best]]; p[o] = -1;
        return [this.labels[argmax(p)], ent[best]];
      }
      const v = mode === "first" ? ps[0] : ps[0].map((_, c) => ps.reduce((a, p) => a + p[c], 0) / ps.length);
      const k = argmax(v);
      return [this.labels[k], v[k]];
    });
  }
}
