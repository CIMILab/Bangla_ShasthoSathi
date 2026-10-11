// On-device OCR in the browser: Tesseract.js (WASM) with the same 'fast' ben+eng models the phone app ships.
// Word boxes go through the core's row rebuilding (layoutToText), as on the phone. Nothing leaves the browser.
import { layoutToText } from "./core/ocr.js";

let worker = null, workerLangs = null;
const base = new URL("../vendor/tesseract/", import.meta.url).href;

async function getWorker(langs) {
  if (worker && workerLangs === langs) return worker;
  if (worker) await worker.terminate();
  const T = await import("../vendor/tesseract/tesseract.esm.min.js");
  const createWorker = T.createWorker ?? T.default.createWorker;
  worker = await createWorker(langs.split("+"), 1, {
    workerPath: base + "worker.min.js", corePath: base, langPath: new URL("../tessdata/", import.meta.url).href,
    gzip: false, workerBlobURL: false, cacheMethod: "none",
  });
  await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
  workerLangs = langs;
  return worker;
}

/** Decode an image file upright (EXIF) and scale its long side to at most maxSide pixels. */
export async function loadImage(file, maxSide = 2000) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

const bengaliShare = (t) => { const b = (t.match(/[ঀ-৿]/g) || []).length, l = (t.match(/[A-Za-z]/g) || []).length; return b + l ? b / (b + l) : 0; };

/** mode: "auto" (ben+eng) | "eng". Returns {text, engine, ms, bengaliShare, words}. */
export async function readImage(canvas, mode = "auto", timeoutMs = 60000, onProgress = () => {}) {
  const langs = mode === "eng" ? "eng" : "ben+eng";
  const t0 = performance.now();
  const w = await getWorker(langs);
  onProgress("recognizing");
  const job = w.recognize(canvas, {}, { blocks: true, text: true });
  const timer = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs));
  const { data } = await Promise.race([job, timer]);
  const words = []; let line = 0;
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
    for (const wd of l.words) words.push({ text: wd.text, left: wd.bbox.x0, top: wd.bbox.y0, right: wd.bbox.x1, bottom: wd.bbox.y1, line });
    line++;
  }
  const text = words.length ? layoutToText(words) : (data.text || "");
  return { text, engine: `Tesseract (${langs})`, ms: Math.round(performance.now() - t0), bengaliShare: bengaliShare(text), words: words.length };
}
