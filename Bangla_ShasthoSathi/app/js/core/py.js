// Helpers that reproduce Python behaviour exactly (same as the Kotlin core's Py.kt), so the browser gives
// byte-identical output to the Python reference. Offsets are UTF-16 indices (equal to Python's for BMP text).
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** str.isspace() */
export function isSpace(c) {
  const k = c.charCodeAt(0);
  return c === " " || (k >= 9 && k <= 13) || (k >= 0x1c && k <= 0x1f) || k === 0x85 || k === 0xa0 || k === 0x1680 ||
    (k >= 0x2000 && k <= 0x200a) || k === 0x2028 || k === 0x2029 || k === 0x202f || k === 0x205f || k === 0x3000;
}

/** str.strip() */
export function strip(s) {
  let a = 0, b = s.length;
  while (a < b && isSpace(s[a])) a++;
  while (b > a && isSpace(s[b - 1])) b--;
  return s.substring(a, b);
}

/** '১২.৫' -> '12.5' */
export function toAsciiDigits(s) {
  let out = "";
  for (const c of s) { const i = BN_DIGITS.indexOf(c); out += i >= 0 ? String(i) : c; }
  return out;
}

/** str.splitlines(keepends) */
export function splitlines(s, keepends = false) {
  const out = []; let start = 0, i = 0;
  while (i < s.length) {
    const k = s.charCodeAt(i);
    const brk = k === 10 || k === 13 || k === 11 || k === 12 || (k >= 0x1c && k <= 0x1e) || k === 0x85 || k === 0x2028 || k === 0x2029;
    if (brk) {
      let end = i + 1;
      if (k === 13 && end < s.length && s.charCodeAt(end) === 10) end++;
      out.push(keepends ? s.substring(start, end) : s.substring(start, i));
      start = end; i = end;
    } else i++;
  }
  if (start < s.length) out.push(s.substring(start));
  return out;
}

/** f"{x:g}" */
export function g(x) {
  if (x === null || x === undefined) return "";
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const e = Number(x.toExponential(5).split("e")[1]);        // exponent after rounding to 6 significant digits
  if (e < -4 || e >= 6) {
    let [m, ex] = x.toExponential(5).split("e");
    if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
    const n = Number(ex);
    return m + "e" + (n < 0 ? "-" : "+") + String(Math.abs(n)).padStart(2, "0");
  }
  let t = x.toFixed(Math.max(0, 5 - e));
  if (t.includes(".")) t = t.replace(/0+$/, "").replace(/\.$/, "");
  return t;
}
