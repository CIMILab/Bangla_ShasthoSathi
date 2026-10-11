// Port of src/shastho/explain.py: fact sheet, deterministic templates (EN / BN), strict prompt and the gate.
import * as G from "./generated.js";
import { rx } from "./rx.js";
import { g, strip } from "./py.js";
import { unsupportedNumbers } from "./rules.js";

function range(l, lang) {
  if (l.low == null && l.high == null) return "";
  const r = l.low != null && l.high != null ? `${g(l.low)}-${g(l.high)}` : l.low == null ? `< ${g(l.high)}` : `> ${g(l.low)}`;
  return lang === "bn" ? ` (স্বাভাবিক সীমা ${r})` : ` (normal range ${r})`;
}

export const bnLabel = (name) => G.BN_LABEL[strip(name).toLowerCase().replace(rx(G.SPACES, "g"), " ")] ?? null;

export const facts = (labs) => labs.map((l) => `- ${l.name}: ${g(l.value)} ${l.unit}${range(l, "en")} -> ${l.flag.toUpperCase()}`).join("\n");

export function template(labs, lang) {
  const rows = labs.map((l) => {
    const st = G.STATUS[lang][l.flag];
    if (lang === "bn") {
      const lab = bnLabel(l.name);
      const head = lab != null ? `${lab} — ${l.name}` : l.name;
      return `${head}: ${g(l.value)} ${l.unit} — ${st}${range(l, "bn")}।`;
    }
    return `${l.name}: ${g(l.value)} ${l.unit} is ${st}${range(l, "en")}.`;
  });
  return [...rows, G.DOCTOR[lang]].join("\n");
}

export function strictPrompt(labs, lang) {
  const name = lang === "bn" ? "Bangla (Bengali script)" : "English";
  return `These facts were checked by the app:\n${facts(labs)}\n\nRewrite them for the patient in simple ${name}.\n${G.STRICT}`;
}

/** Number check + coverage check: an LLM text that fails either is replaced by the template. */
export function gate(text, labs, lang) {
  const clean = text.replaceAll("**", "").replace(rx(G.GATE_BULLET, "g"), "");
  const bad = unsupportedNumbers(clean, facts(labs));
  const low = clean.toLowerCase();
  const missing = labs.filter((l) => (l.flag === "high" || l.flag === "low") &&
    (!low.includes(l.name.replace(rx(G.NAME_PAREN, "g"), "").toLowerCase().replaceAll("s. ", "")) || !clean.includes(g(l.value))))
    .map((l) => l.name);
  return bad.length || missing.length
    ? { source: "template", text: template(labs, lang), blocked: bad, missing }
    : { source: "llm", text, blocked: [], missing: [] };
}
