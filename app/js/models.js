// Optional privacy models in the browser: ONNX Runtime Web (WASM, CPU) + the exported tokenizer.json.
// Files are chosen from the user's computer (a folder copied from Hellbender mobile/assets) or fetched from this
// site's ./models/ folder, and cached in this browser (IndexedDB). They are never uploaded anywhere.
import { WordTaggerCore } from "./core/privacy.js";
import { configFromJson, DEFAULT_CONFIG } from "./core/pipeline.js";
import { idbGet, idbPut, idbDel, idbKeys } from "./store.js";

export const MODELS = ["ner", "pii_bn", "pii_en"];
let ort = null;

async function loadOrt() {
  if (ort) return ort;
  ort = await import("../vendor/ort/ort.wasm.min.mjs");
  ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  return ort;
}

export function variantFor(name, config = DEFAULT_CONFIG) {
  return name === "ner" ? config.nerVariant : config.piiVariant[name.slice(4)];
}
export const neededFiles = (name, config) => ["meta.json", "tokenizer.json", `model_${variantFor(name, config)}.onnx`];

/** Save files {"ner/meta.json": ArrayBuffer, ...} into the browser cache. */
export async function cacheFiles(files) {
  for (const [k, buf] of Object.entries(files)) await idbPut("models", k, buf);
}
export async function cachedStatus(config) {
  const keys = new Set(await idbKeys("models"));
  return Object.fromEntries(MODELS.map((m) => [m, neededFiles(m, config).every((f) => keys.has(`${m}/${f}`))]));
}
export async function clearCache() { for (const k of await idbKeys("models")) await idbDel("models", k); }

/** Files picked with <input webkitdirectory>: keep only what the pipeline needs. */
export async function filesFromFolder(fileList, config) {
  const out = {};
  for (const f of fileList) {
    const parts = (f.webkitRelativePath || f.name).split("/");
    for (const m of MODELS) {
      const i = parts.indexOf(m);
      if (i >= 0 && i === parts.length - 2) {
        const fn = parts[i + 1];
        if (neededFiles(m, config).includes(fn) || fn === "tok_golden.json" || fn === "model_golden.json") out[`${m}/${fn}`] = await f.arrayBuffer();
      }
    }
    if (parts[parts.length - 1] === "pipeline_config.json") out["pipeline_config.json"] = await f.arrayBuffer();
  }
  return out;
}

/** Fetch from ./models/<name>/... on this site (for self-hosting). */
export async function filesFromSite(config, onProgress = () => {}) {
  const out = {};
  for (const m of MODELS) for (const fn of neededFiles(m, config)) {
    onProgress(`${m}/${fn}`);
    const r = await fetch(`models/${m}/${fn}`);
    if (!r.ok) throw new Error(`models/${m}/${fn}: HTTP ${r.status}`);
    out[`${m}/${fn}`] = await r.arrayBuffer();
  }
  return out;
}

const text = (buf) => new TextDecoder().decode(buf);

/** Build WordTaggerCore objects for every cached model. Returns {ner, pii: {bn, en}, checks}. */
export async function loadTaggers(config) {
  const o = await loadOrt();
  const { Tokenizer } = await import("../vendor/tokenizers.min.mjs");
  const res = { ner: null, pii: {}, checks: {} };
  for (const m of MODELS) {
    const files = {};
    for (const fn of [...neededFiles(m, config), "tok_golden.json", "model_golden.json"]) {
      const b = await idbGet("models", `${m}/${fn}`); if (b) files[fn] = b;
    }
    if (!neededFiles(m, config).every((fn) => files[fn])) continue;
    const meta = JSON.parse(text(files["meta.json"]));
    const tok = new Tokenizer(JSON.parse(text(files["tokenizer.json"])), {});
    const encode = (w) => tok.encode(w, { add_special_tokens: false }).ids;
    const sess = await o.InferenceSession.create(files[`model_${variantFor(m, config)}.onnx`], { executionProviders: ["wasm"] });
    const inputs = new Set(sess.inputNames);
    const logits = async (ids) => {
      const n = ids.length, t = (arr) => new o.Tensor("int64", BigInt64Array.from(arr, BigInt), [1, n]);
      const feed = { input_ids: t(ids) };
      if (inputs.has("attention_mask")) feed.attention_mask = t(ids.map(() => 1));
      if (inputs.has("token_type_ids")) feed.token_type_ids = t(ids.map(() => 0));
      const out = await sess.run(feed);
      const z = out[sess.outputNames[0]].data, L = meta.labels.length, rows = [];
      for (let j = 0; j < n; j++) rows.push(z.subarray(j * L, (j + 1) * L));
      return rows;
    };
    const tagger = new WordTaggerCore({ labels: meta.labels, cls: meta.cls_id, sep: meta.sep_id, maxLen: meta.max_len, stride: meta.stride, encode, logits });
    res.checks[m] = await checkModel(m, files, encode, tagger, config);
    if (m === "ner") res.ner = tagger; else res.pii[m.slice(4)] = tagger;
  }
  return res;
}

/** If the folder has golden files from scripts/20_web_golden.py, compare tokenizer ids and word labels with Python. */
async function checkModel(m, files, encode, tagger, config) {
  const r = { tokenizer: null, labels: null };
  if (files["tok_golden.json"]) {
    const g = JSON.parse(text(files["tok_golden.json"]));
    const bad = g.filter((x) => JSON.stringify(encode(x.word)) !== JSON.stringify(x.ids));
    r.tokenizer = { n: g.length, diff: bad.length, examples: bad.slice(0, 3).map((x) => x.word) };
  }
  if (files["model_golden.json"]) {
    const g = JSON.parse(text(files["model_golden.json"]));
    const mode = m === "ner" ? "first" : config.agg;
    let n = 0, diff = 0, maxd = 0;
    for (const doc of g) {
      const got = await tagger.wordLabels(doc.words, mode);
      doc[mode].forEach((w, i) => { n++; if (w[0] !== got[i][0]) diff++; maxd = Math.max(maxd, Math.abs(w[1] - got[i][1])); });
    }
    r.labels = { words: n, diff, maxScoreDiff: maxd };
  }
  return r;
}

export async function cachedConfig() {
  const b = await idbGet("models", "pipeline_config.json");
  return b ? configFromJson(JSON.parse(text(b))) : DEFAULT_CONFIG;
}
