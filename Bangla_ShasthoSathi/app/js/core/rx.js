// A fresh RegExp per use (JS RegExp objects carry lastIndex state). 'g' is added for findAll.
export const rx = (p, extra = "") => new RegExp(p.source, p.flags + extra);
export function* findAll(p, text) {
  const r = rx(p, "g");
  for (const m of text.matchAll(r)) yield m;
}
