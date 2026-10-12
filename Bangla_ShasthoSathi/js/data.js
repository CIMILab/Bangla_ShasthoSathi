// All numbers on this page come from the experiment logs (docs/RESULTS.md) and the manuscript tables.
export const TABLES = {
  data: {
    caption: "Table I. Evaluation sets. No licensed or data-use-agreement corpora; every identifier is invented.",
    cols: ["Set", "Docs", "Used for"],
    rows: [
      ["Bangla-HealthNER train / val / test", "31,783", "NER training and test (E0, E2, E4, E5, E18)"],
      ["Synthetic dev (vocabulary A)", "300", "threshold and setting selection"],
      ["Synthetic held-out (vocabulary B)", "300", "de-identification, lab flags, explanation (1,892 identifier spans, 452 lab rows)"],
      ["Real text + injected identifiers", "400", "de-identification on real language (200 PMC-Patients + 200 HealthNER posts, 2,000 spans)"],
      ["Free-text names (dev / test)", "400 / 400", "model-only privacy, quantization (unlabelled names inside sentences)"],
      ["Printed sheets (E8)", "30", "OCR (15 lab reports, 8 mixed prescriptions, 7 Bengali notes)"],
    ],
  },
  deid: {
    caption: "Table II. De-identification: identifier leak and clinical over-redaction (%, bootstrap 95% CI). Thresholds chosen on the development set.",
    cols: ["System (threshold)", "Leak, held-out", "Over-red., held-out", "Leak, real", "Over-red., real"],
    num: [1, 2, 3, 4],
    rows: [
      ["Rules only", "53.6 [53.1, 54.1]", "0.0", "60.0", "0.0"],
      ["OpenMed PII (0.5)", "10.3 [9.0, 11.6]", "8.4", "5.5 [4.7, 6.5]", "36.9"],
      ["Hybrid (0.5)", "0.6 [0.3, 1.1]", "8.4", "0.2 [0.1, 0.4]", "36.9"],
      ["+ protect (0.5)", "0.6", "0.0", "0.2", "6.2"],
      ["+ protect (0.3) — chosen", "0.0 [0, 0]", "0.1", "0.0 [0, 0]", "6.9"],
    ],
    hl: 4,
  },
  e1: {
    caption: "Appendix Table. OpenMed PII models alone on the development set (E1).",
    cols: ["Route (threshold)", "Leak [95% CI]", "Docs with leak", "Over-red."],
    num: [1, 2, 3],
    rows: [
      ["English model (0.5)", "23.6 [21.3, 25.8]", "79%", "6.8"], ["Bengali model (0.5)", "28.8 [27.2, 30.5]", "93%", "14.1"],
      ["By script (0.3)", "9.5 [8.4, 10.7]", "53%", "16.3"], ["By script (0.5)", "12.2 [11.0, 13.4]", "62%", "7.9"],
      ["By script (0.7)", "19.9 [18.5, 21.2]", "85%", "4.0"],
    ],
  },
  ner: {
    caption: "Table III. Bangla-HealthNER test (exact span, ×100; mean ± SD over three seeds; † one seed). Published BanglishBERT micro-F1: 56.13.",
    cols: ["Model (params)", "Micro F1", "Medicine F1", "Medicine recall (Bengali script)", "Dosage F1"],
    num: [1, 2, 3, 4],
    rows: [
      ["OpenMed-bn PII encoder (278M)", "58.71 ± 0.84", "83.97 ± 0.53", "81.83 ± 0.36", "44.91 ± 1.09"],
      ["XLM-R base (277M)", "58.67 ± 0.75", "84.23 ± 0.83", "82.31 ± 0.86", "45.18 ± 1.89"],
      ["BanglishBERT (110M) — exported", "57.81 ± 0.40", "83.03 ± 0.33", "80.77 ± 0.50", "45.29 ± 1.43"],
      ["BanglaBERT (110M) †", "55.75", "81.83", "83.36", "43.13"],
      ["XLM-R, LoRA r=16 †", "49.93", "78.54", "75.61", "36.82"],
      ["BanglishBERT INT8 ONNX † (106 MB)", "57.32", "82.50", "—", "—"],
    ],
    hl: 2,
  },
  e18: {
    caption: "E18. Shipped INT8 tagger, entity-level scores per type on the 3,179 test posts (exact span).",
    cols: ["Entity type", "Precision", "Recall", "F1", "Gold mentions"],
    num: [1, 2, 3, 4],
    rows: [
      ["Specialist", "0.832", "0.863", "0.847", "687"], ["Medicine", "0.805", "0.847", "0.825", "1,852"], ["Age", "0.759", "0.769", "0.764", "554"],
      ["Medical Procedure", "0.551", "0.666", "0.603", "308"], ["Dosage", "0.416", "0.499", "0.454", "747"],
      ["Health Condition", "0.421", "0.485", "0.451", "786"], ["Symptom", "0.391", "0.455", "0.420", "3,528"],
      ["Micro average", "0.542", "0.609", "0.573", "8,462"],
    ],
  },
  fail: {
    caption: "Table IV. Failure types observed in small-LLM explanations (E6, E6c).",
    cols: ["Failure", "Example (English gloss for Bengali)"],
    rows: [
      ["Wrong direction", "A low haemoglobin described as high (free condition: 17–42% of abnormal results)."],
      ["Unsupported inference", "“Low HbA1c means better sugar control”; supplement advice."],
      ["Number in wrong role", "“Haemoglobin is usually between 10.2 and 15.5”, where 10.2 is the patient's value."],
      ["Looping (BN)", "One word repeated until the token limit (up to 100% of outputs)."],
      ["Wrong term (BN)", "“Hematocrit” written for haemoglobin; a non-word used for “high”."],
      ["Untranslated copy (BN)", "The English fact sheet copied with Bengali connectives."],
    ],
  },
  explain: {
    caption: "Table V. Judged explanation quality (% of 100 held-out outputs, 1,024 new tokens). Judge v2: correctness κ = 0.80, safety κ = 0.66 (n = 60).",
    cols: ["Model / condition", "EN correct", "EN safe", "BN correct", "BN safe"],
    rows: [
      ["Qwen2.5-0.5B: free → grounded", "4 → 22", "11 → 17", "5 → 3", "67 → 54"],
      ["Qwen2.5-1.5B: free → grounded", "6 → 59", "12 → 23", "8 → 31", "14 → 24"],
      ["Qwen3-1.7B: free → grounded", "16 → 95", "53 → 61", "8 → 50", "46 → 50"],
      ["Phi-3.5-mini: free → grounded", "55 → 98", "52 → 68", "25 → 18", "66 → 81"],
      ["Qwen3-1.7B, strict", "97", "96", "71", "78"],
      ["Phi-3.5-mini, strict", "96", "94", "35", "66"],
      ["Template (no LLM)", "99", "98", "100", "99"],
    ],
    hl: 6,
  },
  native: {
    caption: "Table VI. Blinded native-speaker check of Bengali output (30 reports; sign test p < 0.001 in favour of the template on all 30 pairs).",
    cols: ["System", "Correct", "Clear (1–5)", "Natural (1–5)", "Safe"],
    rows: [["Template", "100%", "5.00", "5.00", "100%"], ["Qwen3-1.7B, strict", "60%", "2.27", "1.03", "100%"]],
    hl: 0,
  },
  quant: {
    caption: "Mobile privacy tuning (PII models alone, server; % of unlabelled names missed). Selected on development data; the E7c choice was replaced after the on-phone leak test.",
    cols: ["PII models", "Size (MB)", "Free dev", "Free test", "Free, Bengali"],
    num: [1, 2, 3, 4],
    rows: [
      ["FP32 (both)", "1602", "3.3", "0.7", "0.0"], ["INT8 plain (both)", "486", "52.7", "50.7", "100.0"],
      ["INT8 reduced range (both)", "486", "35.7", "33.0", "25.5"], ["INT8 embedding only (both) — shipped", "770", "3.3", "0.7", "0.0"],
      ["BN embedding-only + EN no-attention (E7c; leaked on the phone)", "689", "3.5", "1.0", "0.0"],
    ],
    hl: 3,
  },
  ocr: {
    caption: "OCR of printed sheets (%). Desktop proxy with the phone's Tesseract fast ben+eng models; phone photographs are future work.",
    cols: ["Setting", "Condition", "CER", "Rows exact", "Flags ok", "Leak (rules)"],
    rows: [
      ["Proxy", "clean", "1.6", "65.2", "81.8", "8.4"], ["Proxy", "tilted 3°", "2.5", "48.5", "71.2", "15.3"],
      ["Proxy", "half resolution", "2.7", "42.4", "75.8", "12.4"],
    ],
  },
  impl: {
    caption: "Implementation settings.",
    cols: ["Component", "Setting"],
    rows: [
      ["PII models", "OpenMed PII: Bengali encoder (278M) and English Small-44M; routed by script; union with rules"],
      ["Medicine tagger", "BanglishBERT, BIO on first sub-word, 4 epochs, batch 32, lr 3e-5, max 256 sub-words, 3 seeds"],
      ["LLMs", "Qwen2.5-0.5B/1.5B-Instruct, Qwen3-1.7B, Phi-3.5-mini; 4-bit NF4; greedy; 320 and 1,024 new tokens"],
      ["Judge", "Qwen2.5-14B-Instruct (4-bit); rubric v2 extracts the stated status, code scores it"],
      ["Statistics", "bootstrap CI (2,000), McNemar, Welch t, sign test, Cohen's κ, rule of three"],
      ["Compute", "Hellbender HPC (NVIDIA H100); PyTorch 2.14, Transformers 4.57, OpenMed 2.5, ONNX Runtime 1.25"],
      ["Phone", "Kotlin + Jetpack Compose; no INTERNET permission; ML Kit + Tesseract4Android; ONNX Runtime Android 1.20 + DJL tokenizers 0.33; Samsung Galaxy S23 Ultra"],
      ["Web", "In-browser: JS core, Tesseract.js, ONNX Runtime Web, tokenizers.js; WebCrypto vault; CSP self-only"],
    ],
  },
  phone: {
    caption: "On-phone leak test (Galaxy S23 Ultra) vs. server, same 1,100 documents and metric (%; Med./lab hit = phone / server). *English INT8 except attention, replaced.",
    cols: ["Set (n)", "Leak, phone", "Leak, server", "Med./lab hit", "Same spans"],
    num: [1, 2],
    rows: [
      ["Held-out (300)", "0.0", "0.0", "0.0 / 0.0", "300 / 300"],
      ["Real (400)", "0.0", "0.0", "3.1 / 3.8", "398 / 400"],
      ["Free (400)", "0.75", "0.75", "3.8 / 3.8", "399 / 400"],
      ["Free, first EN model*", "15.5", "1.0", "3.1 / 3.1", "297 / 400"],
    ],
    hl: 2,
  },
  phonespeed: {
    caption: "Galaxy S23 Ultra (Android 16, 8 cores), shipped configuration, 4 threads.",
    cols: ["Measure", "Value"],
    rows: [
      ["Per report, all three models (median / p90)", "262 / 524 ms"], ["of which models", "260 ms"],
      ["Rules + template (no models)", "0.96 ms"], ["Model loading", "3–4 s"],
      ["Model folder on the phone", "900 MB"], ["App memory (PSS)", "2.0 GB"],
      ["Self-test: token ids", "identical (3 models)"], ["Self-test: word labels", "identical (both PII models); tagger 1.1% differ"],
    ],
  },
  golden: {
    caption: "Cross-implementation parity: Python reference vs Kotlin (JVM and on the phone) vs JavaScript (Node and Chromium).",
    cols: ["Check", "Cases", "Kotlin", "JavaScript"],
    rows: [
      ["Rules, lab parsing, templates, redaction", "909", "identical", "identical"], ["Number + coverage gate", "720", "identical", "identical"],
      ["Tagger windowing / decoding", "98", "identical", "identical"], ["Span grouping, subtract, trim, merge", "300", "identical", "identical"],
      ["OCR metrics + redaction on real OCR output", "240", "identical", "identical"], ["Row rebuilding (tilted, shuffled)", "60", "identical", "identical"],
    ],
  },
};

// Judged correctness / safety by model, language and condition (Fig. explain_conditions)
export const EXPLAIN = {
  conditions: ["free", "fact sheet", "strict"],
  template: { en: [99, 98], bn: [100, 99] },
  models: {
    "Qwen2.5-0.5B": { en: [[4, 22, null], [11, 17, null]], bn: [[5, 3, null], [67, 54, null]] },
    "Qwen2.5-1.5B": { en: [[6, 59, null], [12, 23, null]], bn: [[8, 31, null], [14, 24, null]] },
    "Qwen3-1.7B": { en: [[16, 95, 97], [53, 61, 96]], bn: [[8, 50, 71], [46, 50, 78]] },
    "Phi-3.5-mini": { en: [[55, 98, 96], [52, 68, 94]], bn: [[25, 18, 35], [66, 81, 66]] },
  },
};

// Illustrative reconstructions of failure types observed in E6/E6c/E8 (Table IV and the E8 proxy), not verbatim outputs.
export const CASES = [
  { id: "wrong", title: "Wrong direction", lines: [
      ["user", "Report: Haemoglobin 10.2 g/dL (normal 12.0–15.5)"],
      ["model", "Your haemoglobin is <b>higher</b> than normal.", "Free condition (model reads the report)"],
      ["judge", "✗ Wrong direction: the value is below the range. Flags must come from rules, not the model."] ] },
  { id: "role", title: "Number in the wrong role", lines: [
      ["user", "Fact sheet: Haemoglobin: 10.2 g/dL (normal range 12-15.5) -> LOW"],
      ["model", "Haemoglobin is usually between <b>10.2</b> and 15.5…", "Grounded condition"],
      ["judge", "✗ The number check passes (10.2 is in the facts) but the role is wrong. The strict prompt and coverage check reduce this risk."] ] },
  { id: "loop", title: "Bengali generation fails", lines: [
      ["user", "Fact sheet (3 abnormal tests) → write in simple Bengali"],
      ["model", "হিমোগ্লোবিন কম কম কম কম কম কম কম কম কম কম কম …", "Looping until the token limit (up to 100% of outputs)"],
      ["judge", "✗ Unusable. The deterministic template is shown instead (100% correct, 5.00/5 clear for the native rater)."] ] },
  { id: "ocr", title: "OCR breaks format rules", lines: [
      ["user", "Printed: <span class='del'>Ref. by: Dr. [name]</span> · <span class='del'>WBC 1.7 x10^9/L</span>"],
      ["model", "OCR: <span class='ins'>Ref. by: pr. [name]</span> · <span class='ins'>WBC 1.7 x1049/L</span>", "Tesseract fast ben+eng, clean page"],
      ["judge", "⚠ “pr.” no longer matches the doctor rule; the unit no longer parses. Hence the mandatory ‘check the text against the photo’ step."] ] },
];
