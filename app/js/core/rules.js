// Port of src/shastho/rules.py (lab rows, flags, number check).
import * as G from "./generated.js";
import { rx, findAll } from "./rx.js";
import { strip, splitlines, toAsciiDigits } from "./py.js";

export function flagValue(value, low, high) {
  if (low == null && high == null) return "unknown";
  if (low != null && value < low) return "low";
  if (high != null && value > high) return "high";
  return "normal";
}

const f = (x) => (x == null ? null : Number(toAsciiDigits(x).replace(/,/g, ".")));

/** Pull 'test value unit range' rows out of a report and flag each one. */
export function parseLabLines(text) {
  const out = [];
  const re = rx(G.LAB_LINE);
  splitlines(text).forEach((raw, idx) => {
    const m = re.exec(raw);
    if (!m) return;
    const gr = m.groups;
    let lo = f(gr.lo), hi = f(gr.hi);
    if (gr.lt != null) { lo = null; hi = f(gr.lt); }
    if (gr.gt != null) { lo = f(gr.gt); hi = null; }
    const v = f(gr.val);
    out.push({ name: strip(gr.name), value: v, unit: gr.unit, low: lo, high: hi, flag: flagValue(v, lo, hi), line: idx + 1 });
  });
  return out;
}

export const numbersIn = (text) => [...findAll(G.ANY_NUM, text)].map((m) => toAsciiDigits(m[0]).replace(/,/g, "."));

/** Numbers in `generated` that never appear in `source` (9.8 == 9.80 == ৯.৮). */
export function unsupportedNumbers(generated, source) {
  const ok = new Set(numbersIn(source).map(Number));
  return numbersIn(generated).filter((n) => !ok.has(Number(n)));
}
