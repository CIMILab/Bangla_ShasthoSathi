import { TABLES, EXPLAIN, CASES } from "./data.js";
import { Pipeline } from "./core/pipeline.js";
import { g } from "./core/py.js";
import { bnLabel } from "./core/explain.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- theme
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };
if (store.get("theme")) document.documentElement.dataset.theme = store.get("theme");
$("#theme").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = document.documentElement.dataset.theme ?? (dark ? "dark" : "light");
  const nxt = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nxt; store.set("theme", nxt);
});

// ---------------------------------------------------------------- tables (sortable)
const numOf = (s) => { const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
function renderTable(el) {
  const t = TABLES[el.dataset.table]; if (!t) return;
  let rows = t.rows.map((r, i) => ({ r, i })), sort = null;
  const draw = () => {
    el.innerHTML = `<p class="cap">${esc(t.caption)}</p><div class="scroll"><table><thead><tr>${t.cols.map((c, j) =>
      `<th data-j="${j}" class="${sort?.j === j ? (sort.d > 0 ? "asc" : "desc") : ""}" title="Sort">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(({ r, i }) => `<tr class="${t.hl === i ? "hl" : ""}">${r.map((c, j) => `<td data-j="${j}" class="${t.num?.includes(j) ? "n" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  };
  draw();
  el.addEventListener("click", (e) => {
    const th = e.target.closest("th"); if (!th) return;
    const j = +th.dataset.j; sort = { j, d: sort?.j === j ? -sort.d : 1 };
    rows.sort((a, b) => { const x = numOf(a.r[j]), y = numOf(b.r[j]);
      return (Number.isNaN(x) || Number.isNaN(y) ? String(a.r[j]).localeCompare(String(b.r[j])) : x - y) * sort.d; });
    draw(); applyCols(el);
  });
}
$$("[data-table]").forEach(renderTable);
function applyCols(el) {
  const tg = $(`.toggle[data-for="${el.dataset.table}"] .on`); if (!tg) return;
  const keep = tg.dataset.cols === "all" ? null : tg.dataset.cols.split(",").map(Number);
  $$("th, td", el).forEach((c) => { const j = +c.dataset.j; c.hidden = keep ? j !== 0 && !keep.includes(j) : false; });
}
$$(".toggle[data-for]").forEach((tg) => tg.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("button", tg).forEach((x) => x.classList.toggle("on", x === b)); applyCols($(`[data-table="${tg.dataset.for}"]`));
}));

// ---------------------------------------------------------------- result tabs
$$(".subnav button").forEach((b) => b.addEventListener("click", () => {
  $$(".subnav button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.id === b.dataset.pane));
}));

// ---------------------------------------------------------------- counters
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return; io.unobserve(e.target);
  const el = e.target, to = +el.dataset.count, dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || "";
  const t0 = performance.now(), D = 1100;
  const step = (t) => { const k = Math.min(1, (t - t0) / D), v = to * (1 - Math.pow(1 - k, 3));
    el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + suf; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), { threshold: 0.4 });
$$("[data-count]").forEach((el) => io.observe(el));

// ---------------------------------------------------------------- explanation explorer
const sel = $("#ex-model");
sel.innerHTML = Object.keys(EXPLAIN.models).map((m) => `<option ${m === "Qwen3-1.7B" ? "selected" : ""}>${m}</option>`).join("");
let exLang = "en";
function drawExplorer() {
  const m = EXPLAIN.models[sel.value][exLang], tpl = EXPLAIN.template[exLang];
  $("#ex-chart").innerHTML = ["Correct", "Safe"].map((name, k) => `<div class="bgroup"><h5>${name}</h5>
    ${EXPLAIN.conditions.map((c, i) => { const v = m[k][i]; return `<div class="brow"><span class="bl">${c}</span><div class="btrack">
      <div class="bfill c${i}" style="width:${v ?? 0}%"></div><div class="bref" style="left:${tpl[k]}%" title="template ${tpl[k]}%"></div></div>
      <span class="bv">${v == null ? "—" : v + "%"}</span></div>`; }).join("")}</div>`).join("");
}
sel.addEventListener("change", drawExplorer);
$("#ex-lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; exLang = b.dataset.l;
  $$("#ex-lang button").forEach((x) => x.classList.toggle("on", x === b)); drawExplorer(); });
drawExplorer();

// ---------------------------------------------------------------- live demo (real core, rules + template)
const TAGS = { en: { PHONE: "Phone", NID: "National ID", ID: "ID", FACILITY: "Facility", ADDRESS: "Address", DATE: "Date", NAME: "Name", DOCTOR: "Doctor" },
               bn: { PHONE: "ফোন", NID: "এনআইডি", ID: "আইডি", FACILITY: "প্রতিষ্ঠান", ADDRESS: "ঠিকানা", DATE: "তারিখ", NAME: "নাম", DOCTOR: "ডাক্তার" } };
const FLAG = { en: { high: "High", low: "Low", normal: "Normal", unknown: "No range" }, bn: { high: "বেশি", low: "কম", normal: "স্বাভাবিক", unknown: "সীমা নেই" } };
const pipe = new Pipeline();
let samples = [], dLang = "bn";
async function runDemo() {
  const text = $("#d-text").value, t0 = performance.now();
  const r = await pipe.run(text, dLang), ms = performance.now() - t0;
  $("#d-red").innerHTML = esc(r.redacted).replace(/\[([A-Z_]+)\]/g, (_, k) => `<mark>${esc(TAGS[dLang][k] ?? k)}</mark>`);
  $("#d-chips").innerHTML = Object.entries(r.removed).map(([k, n]) => `<span>🔒 ${esc(TAGS[dLang][k] ?? k)} × ${n}</span>`).join("") || `<span>—</span>`;
  $("#d-labs").innerHTML = r.labs.length ? `<table class="mini">${r.labs.map((l) => `<tr><td>${esc(dLang === "bn" ? bnLabel(l.name) ?? l.name : l.name)}</td>
      <td class="n">${esc(g(l.value))} <small>${esc(l.unit)}</small></td><td><span class="pill p-${l.flag}">${FLAG[dLang][l.flag]}</span></td></tr>`).join("")}</table>` : `<p class="mu small">No lab rows in this text.</p>`;
  $("#d-exp").innerHTML = r.explanation.split("\n").map((s) => `<p>${esc(s)}</p>`).join("");
  $("#d-time").textContent = `${r.spans.length} personal details hidden · ${r.labs.length} lab rows · ${ms.toFixed(1)} ms in this browser · rules v1+v2 (privacy models are in the full app)`;
}
fetch("data/samples.json").then((x) => x.json()).then((d) => {
  samples = d.samples;
  $("#d-sample").innerHTML = samples.map((s, i) => `<option value="${i}">${esc(s.title)}</option>`).join("");
  $("#d-sample").value = "1"; $("#d-text").value = samples[1].text; runDemo();
});
$("#d-sample").addEventListener("change", (e) => { $("#d-text").value = samples[+e.target.value].text; runDemo(); });
$("#d-run").addEventListener("click", runDemo);
$("#d-lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; dLang = b.dataset.l;
  $$("#d-lang button").forEach((x) => x.classList.toggle("on", x === b)); runDemo(); });

// ---------------------------------------------------------------- failure cases (step-through)
let ci = 0, shown = 1;
function drawCase() {
  const c = CASES[ci];
  $("#case-tabs").innerHTML = CASES.map((x, i) => `<button class="${i === ci ? "on" : ""}" data-i="${i}">${esc(x.title)}</button>`).join("");
  $("#convo").innerHTML = c.lines.slice(0, shown).map(([who, html, note]) => `<div class="msg ${who}"><span class="who">${{ user: "Input", model: "Small LLM / OCR", judge: "Check" }[who]}</span>
    <div class="bubble">${html}</div>${note ? `<small>${esc(note)}</small>` : ""}</div>`).join("") +
    `<div class="convo-ctl">${shown < c.lines.length ? `<button class="btn sm" data-a="next">Next ▸</button><button class="btn sm ghost" data-a="all">Show all</button>` : `<button class="btn sm ghost" data-a="reset">Reset</button>`}</div>`;
}
$("#case-tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; ci = +b.dataset.i; shown = 1; drawCase(); });
$("#convo").addEventListener("click", (e) => { const a = e.target.closest("button")?.dataset.a; if (!a) return;
  shown = a === "next" ? shown + 1 : a === "all" ? CASES[ci].lines.length : 1; drawCase(); });
drawCase();

// ---------------------------------------------------------------- lightbox
const lb = $("#lightbox");
document.addEventListener("click", (e) => {
  const z = e.target.closest("[data-zoom]"); if (!z) return;
  e.preventDefault(); $("img", lb).src = z.dataset.zoom || z.src; lb.hidden = false;
});
lb.addEventListener("click", () => { lb.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.hidden = true; });

// ---------------------------------------------------------------- scrollspy + bib
const secs = $$("main section[id]"), links = $$(".nav .links a");
const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-45% 0px -50% 0px" });
secs.forEach((s) => spy.observe(s));
$("#copy-bib").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#bib").textContent); $("#copy-bib").textContent = "Copied"; } catch { /* */ } });
