// Golden checks shared by the Node test and the in-browser Self-test (reader: file name -> text).
import * as G from "./generated.js";
import { findAll } from "./rx.js";
import { splitlines } from "./py.js";
import { ruleSpans, merge, subtract, trim, labRows, route, group, WordTaggerCore } from "./privacy.js";
import { parseLabLines, numbersIn } from "./rules.js";
import { template, facts, gate } from "./explain.js";
import { Pipeline } from "./pipeline.js";
import { cer, labScores, leakScores, layoutToText, norm } from "./ocr.js";

const jl = (s) => s.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const lab = (m) => ({ name: m.name, value: m.value, unit: m.unit, low: m.low ?? null, high: m.high ?? null, flag: m.flag, line: m.line ?? null });
const sp3 = (x) => x.map((a) => ({ start: a[0], end: a[1], label: a[2] }));
const S = (x) => JSON.stringify(x);

export async function runGolden(read, only = null) {
  const out = {};
  const want = (k) => !only || only.includes(k);
  const rulesOnly = new Pipeline();

  if (want("core")) {
    const f = []; const rows = jl(read("core_golden.jsonl"));
    const cmp = (id, what, a, b) => { if (S(a) !== S(b) && f.length < 30) f.push(`${id} [${what}]\n      python: ${S(a).slice(0, 300)}\n      js:     ${S(b).slice(0, 300)}`); };
    for (const g of rows) {
      const t = g.text, id = g.id;
      cmp(id, "rules_v1", sp3(g.rules_v1), ruleSpans(t, false));
      cmp(id, "rules_v2", sp3(g.rules_v2), ruleSpans(t, true));
      const labs = g.labs.map(lab);
      cmp(id, "labs", labs, parseLabLines(t));
      cmp(id, "lab_rows", g.lab_rows, labRows(t));
      const pr = await rulesOnly.privacy(t);
      cmp(id, "merged_v2", sp3(g.merged_v2), pr.spans);
      cmp(id, "redacted_v2", g.redacted_v2, pr.redacted);
      cmp(id, "template_bn", g.template_bn, template(labs, "bn"));
      cmp(id, "template_en", g.template_en, template(labs, "en"));
      cmp(id, "facts", g.facts, facts(labs));
      cmp(id, "numbers", g.numbers, numbersIn(t));
      cmp(id, "route", g.route, route(t));
    }
    out.core = { n: rows.length, fails: f };
  }

  if (want("gate")) {
    const f = []; const rows = jl(read("gate_golden.jsonl"));
    for (const g of rows) {
      const r = gate(g.text, g.labs.map(lab), g.lang);
      for (const [k, a, b] of [["source", g.source, r.source], ["out", g.out, r.text], ["blocked", g.blocked, r.blocked], ["missing", g.missing, r.missing]])
        if (S(a) !== S(b) && f.length < 30) f.push(`${g.id} [${k}] python ${S(a).slice(0, 200)} js ${S(b).slice(0, 200)}`);
    }
    out.gate = { n: rows.length, fails: f };
  }

  if (want("tagger")) {
    const f = []; const rows = jl(read("tagger_golden.jsonl"));
    for (const g of rows) {
      const tg = new WordTaggerCore({ labels: g.labels, cls: 1, sep: 2, maxLen: g.max_len, stride: g.stride,
        encode: (w) => [...w.slice(0, 3)].map((c) => 3 + (c.charCodeAt(0) % 50)),
        logits: (ids) => ids.map((id, j) => g.labels.map((_, k) => Math.fround(Math.sin(0.37 * id + 1.3 * k) * 3 + Math.cos(0.11 * j)))) });
      for (const mode of ["first", "mean", "max"]) {
        const got = await tg.wordLabels(g.words, mode), w = g[mode];
        const ok = w.length === got.length && w.every((a, i) => a[0] === got[i][0] && Math.abs(a[1] - got[i][1]) < 1e-6);
        if (!ok && f.length < 30) f.push(`${g.id} L=${g.max_len} [${mode}]`);
      }
    }
    out.tagger = { n: rows.length, fails: f };
  }

  if (want("groups")) {
    const f = []; const rows = jl(read("group_golden.jsonl"));
    rows.forEach((g, i) => {
      const got = group(g.spans, g.labels, g.types ? new Set(g.types) : null, g.threshold);
      const ok = g.group.length === got.length && g.group.every((a, k) => a[0] === got[k].start && a[1] === got[k].end && a[2] === got[k].type && Math.abs(a[3] - got[k].score) < 6e-5);
      if (!ok && f.length < 30) f.push(`group #${i}`);
      if (S(g.subtract) !== S(subtract(g.spans, g.holes)) && f.length < 30) f.push(`case ${i} [subtract]`);
      if (S(g.trim) !== S(trim(g.text, g.spans)) && f.length < 30) f.push(`case ${i} [trim]`);
      const m = merge(g.spans.map((s, k) => ({ start: s[0], end: s[1], label: g.labels[k][0] })));
      if (S(sp3(g.merge)) !== S(m) && f.length < 30) f.push(`case ${i} [merge]`);
    });
    out.groups = { n: rows.length, fails: f };
  }

  if (want("ocr")) {
    const f = []; const rows = jl(read("ocr_golden.jsonl"));
    for (const [i, g] of rows.entries()) {
      const red = (await rulesOnly.privacy(g.hyp)).redacted;
      if (g.redacted !== red && f.length < 30) f.push(`ocr ${i} [redacted]`);
      const c = cer(g.ref, g.hyp);
      if (Math.abs(c - g.cer) > 1e-12 && f.length < 30) f.push(`ocr ${i} [cer] python ${g.cer} js ${c}`);
      const ls = labScores(g.labs.map((m) => ({ ...lab(m), line: null })), g.hyp);
      if (S([g.gold_rows, g.rows_exact, g.flags_correct, g.spurious]) !== S([ls.gold_rows, ls.rows_exact, ls.flags_correct, ls.spurious]) && f.length < 30) f.push(`ocr ${i} [labs]`);
      const lk = leakScores(g.pii_items, red);
      if (S(g.leaked_items) !== S(lk.leaked_items) && f.length < 30) f.push(`ocr ${i} [leak]`);
    }
    out.ocr = { n: rows.length, fails: f };
  }

  if (want("layout")) {
    const f = []; const rows = jl(read("core_golden.jsonl")).filter((g) => g.id.startsWith("heldout")).slice(0, 60);
    const a = (3 * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
    for (const g of rows) {
      const src = splitlines(g.text), words = [];
      src.forEach((ln, li) => {
        for (const m of findAll(G.WORD, ln)) {
          const x0 = m.index * 12, x1 = (m.index + m[0].length) * 12, y0 = li * 34, y1 = y0 + 22;
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = cx * cs - cy * sn, ry = cx * sn + cy * cs;
          words.push({ text: m[0], left: rx - (x1 - x0) / 2, top: ry - 11, right: rx + (x1 - x0) / 2, bottom: ry + 11, line: li });
        }
      });
      const back = layoutToText([...words].sort((p, q) => p.left - q.left));
      const want_ = src.filter((s) => s.trim()).map(norm), got = splitlines(back).map(norm);
      if (S(want_) !== S(got) && f.length < 30) f.push(`${g.id} [layout rows]`);
      const k = (t) => parseLabLines(t).map((l) => [l.name, l.value, l.flag]);
      if (S(k(g.text)) !== S(k(back)) && f.length < 30) f.push(`${g.id} [layout labs]`);
    }
    out.layout = { n: rows.length, fails: f };
  }
  return out;
}
