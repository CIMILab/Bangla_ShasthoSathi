// The in-browser pipeline (port of mobile_ref.MobilePipeline / PhonePipeline.kt):
//   1. privacy  : rule spans (v1 + v2 header rules) + optional PII models; medicine/dosage words and lab rows protected
//   2. lab flags: parse "test value unit range" rows; rules decide high / low / normal
//   3. explain  : deterministic template (Bengali or English)
import * as G from "./generated.js";
import { findAll } from "./rx.js";
import { ruleSpans, merge, subtract, trim, labRows, route, group } from "./privacy.js";
import { parseLabLines } from "./rules.js";
import { template } from "./explain.js";

export const DEFAULT_CONFIG = { agg: "mean", threshold: 0.1, rulesV2: true, nerVariant: "int8",
  piiVariant: { bn: "int8emb", en: "int8noattn" } };

export function configFromJson(j) {
  const pv = j.pii_variant;
  return { agg: j.agg, threshold: j.threshold, rulesV2: j.rules_v2, nerVariant: j.ner_variant ?? "int8",
    piiVariant: typeof pv === "string" ? { bn: pv, en: pv } : pv };
}

/** Replace each span by [LABEL]. */
export function redact(text, spans) {
  let out = "", last = 0;
  for (const m of spans) { out += text.substring(last, m.start) + "[" + m.label + "]"; last = m.end; }
  return out + text.substring(last);
}

export class Pipeline {
  constructor(config = DEFAULT_CONFIG, ner = null, pii = {}) { Object.assign(this, { config, ner, pii }); }

  async analyse(text) {
    const ms = [...findAll(G.WORD, text)];
    const words = ms.map((m) => m[0]), spans = ms.map((m) => [m.index, m.index + m[0].length]);
    const kept = this.ner ? group(spans, await this.ner.wordLabels(words, "first"), new Set(["Medicine", "Dosage"])) : [];
    const piiWords = {};
    for (const lg of route(text)) if (this.pii[lg]) piiWords[lg] = await this.pii[lg].wordLabels(words, this.config.agg);
    return { spans, kept, piiWords };
  }

  /** -> {redacted, spans, ruleSpans, modelSpans} */
  async privacy(text, an = null) {
    an = an ?? (await this.analyse(text));
    const rs = ruleSpans(text, this.config.rulesV2);
    const model = [];
    for (const labs of Object.values(an.piiWords))
      for (const e of group(an.spans, labs, null, this.config.threshold)) model.push([e.start, e.end]);
    const holes = [...an.kept.map((e) => [e.start, e.end]), ...labRows(text)];
    const ms = trim(text, subtract(model, holes)).map(([s, e]) => ({ start: s, end: e, label: "PII" }));
    const merged = merge([...rs, ...ms]);
    return { redacted: redact(text, merged), spans: merged, ruleSpans: rs, modelSpans: ms };
  }

  async run(text, lang = "bn") {
    const t0 = performance.now(); const an = await this.analyse(text);
    const t1 = performance.now(); const pr = await this.privacy(text, an);
    const t2 = performance.now(); const labs = parseLabLines(text); const explanation = template(labs, lang);
    const t3 = performance.now();
    const removed = {};
    for (const s of pr.spans) removed[s.label] = (removed[s.label] ?? 0) + 1;
    return {
      lang, text, redacted: pr.redacted, spans: pr.spans, removed,
      medicines: an.kept.map((e) => [text.substring(e.start, e.end), e.type]), labs,
      abnormal: labs.filter((l) => l.flag === "high" || l.flag === "low").map((l) => l.name), explanation,
      timingMs: { models_ms: t1 - t0, rules_ms: t2 - t1, labs_explain_ms: t3 - t2 },
      stages: { medicine_tagger: !!this.ner, pii_bn: !!this.pii.bn, pii_en: !!this.pii.en, header_rules_v2: this.config.rulesV2 },
    };
  }
}
