// ShasthoSathi web app. Everything runs in this browser tab: OCR (Tesseract.js), de-identification (rules + optional
// ONNX models), lab flags and the explanation template come from the same core that is golden-tested against Python.
import { Pipeline, redact, DEFAULT_CONFIG } from "./core/pipeline.js";
import { merge } from "./core/privacy.js";
import { flagValue } from "./core/rules.js";
import { template } from "./core/explain.js";
import { g, toAsciiDigits } from "./core/py.js";
import { runGolden } from "./core/golden.js";
import { STRINGS, bnDigits } from "./i18n.js";
import * as C from "./charts.js";
import * as V from "./vault.js";
import * as M from "./models.js";
import { loadImage, readImage } from "./ocr.js";

const esc = C.esc;
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
             set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

const S = {
  lang: ls.get("lang", null), reader: ls.get("reader", "auto"), view: "home",
  input: { text: "", photo: null, ocr: null, fromPhoto: false, confirmed: false },
  reading: false, busy: false, error: null, ocrStarted: false,
  report: null, modal: null, samples: [], config: DEFAULT_CONFIG,
  pipeline: new Pipeline(DEFAULT_CONFIG),
  models: { status: {}, active: false, loading: null, checks: {}, error: null },
  vault: { exists: false, records: [], person: null, error: null },
  selftest: null, toast: null,
};
const T = () => STRINGS[S.lang ?? "bn"];
const num = (n) => (S.lang === "bn" ? bnDigits(n) : String(n));
const root = document.getElementById("app");

// ------------------------------------------------------------------------------------------------ helpers
const ico = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const fmtDate = (iso, short = false) => {
  const d = new Date(iso + "T00:00:00");
  const s = d.toLocaleDateString(S.lang === "bn" ? "bn-BD" : "en-GB", short ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
  return s;
};
const today = () => new Date().toISOString().slice(0, 10);
const key = (s) => `${s.start}:${s.end}`;
function toast(msg) { S.toast = msg; render(); setTimeout(() => { S.toast = null; render(); }, 2200); }

function effSpans(r) {
  return merge([...r.result.spans.filter((s) => !r.unhidden.has(key(s))), ...r.added]);
}
const protectedText = (r) => (r.fromRecord ? r.result.redacted : redact(r.result.text, effSpans(r)));

function reportDateFrom(r) {
  const d = r.result.spans.find((s) => s.label === "DATE");
  if (d) {
    const m = toAsciiDigits(r.result.text.slice(d.start, d.end)).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) {
      let [, dd, mm, yy] = m; if (yy.length === 2) yy = "20" + yy;
      const iso = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      if (!isNaN(new Date(iso))) return iso;
    }
  }
  return today();
}
function patientName(r) {
  const n = r.result.spans.find((s) => s.label === "NAME");
  return n ? r.result.text.slice(n.start, n.end) : null;
}

// ------------------------------------------------------------------------------------------------ views
function header() {
  const t = T();
  const nav = [["home", "home", S.lang === "bn" ? "হোম" : "Home"], ["history", "history", t.history], ["settings", "settings", t.settings]];
  return `<header class="top"><div class="wrap top-in">
    <a class="brand" href="#" data-action="go" data-view="home"><img src="img/logo.svg" alt="" width="36" height="36">
      <span><b>${esc(t.appName)}</b><small>${esc(t.offline)}</small></span></a>
    <nav>${nav.map(([v, i, l]) => `<button class="nav ${S.view === v ? "on" : ""}" data-action="go" data-view="${v}">${ico(i)}<span>${esc(l)}</span></button>`).join("")}
      <div class="seg" role="group" aria-label="Language">
        <button class="${S.lang === "bn" ? "on" : ""}" data-action="lang" data-lang="bn">বাংলা</button>
        <button class="${S.lang === "en" ? "on" : ""}" data-action="lang" data-lang="en">English</button></div>
    </nav></div></header>`;
}

function home() {
  const t = T();
  return `<main class="wrap home">
    <section class="hero-col">
      <h1>${esc(t.greeting)}</h1>
      <div class="hero dropzone" data-drop>
        <div class="bubble light">${ico("camera")}</div>
        <h2>${esc(t.scanTitle)}</h2><p>${esc(t.scanBody)}</p>
        <div class="row gap">
          <label class="btn white">${ico("camera")}<span>${esc(t.takePhoto)}</span><input type="file" accept="image/*" capture="environment" data-file hidden></label>
          <label class="btn ghost-w">${ico("image")}<span>${esc(t.upload)}</span><input type="file" accept="image/*" data-file hidden></label>
        </div>
        <div class="drop-hint">${esc(t.drop)}</div>
      </div>
      ${S.reading ? `<div class="status">${spinner()}<span>${esc(t.reading)}${S.ocrStarted ? "" : "<br><small>" + esc(t.firstOcr) + "</small>"}</span></div>` : ""}
      ${S.error ? `<div class="err">${esc(S.error)}</div>` : ""}
      <div class="tiles">
        ${tile("paste", t.paste, t.pasteBody, "paste")}
        ${tile("doc", t.sample, t.sampleBody, "samples")}
        ${tile("history", t.history, t.historyBody, "go", 'data-view="history"')}
      </div>
    </section>
    <aside class="side-col">
      <div class="card tint"><div class="row">${ico("shield", "big")}<div><h3>${esc(t.privacyTitle)}</h3><p>${esc(t.privacyBody)}</p></div></div></div>
      <div class="card"><h3>${esc(t.howTitle)}</h3>
        ${t.steps.map(([a, b], i) => `<div class="step"><span class="num">${num(i + 1)}</span><div><b>${esc(a)}</b><p>${esc(b)}</p></div></div>`).join("")}</div>
      <div class="card"><div class="row">${ico("rule")}<div><b>${esc(t.models)}</b><p class="mu">${esc(t.provModels(S.models.active))}</p></div></div></div>
    </aside></main>`;
}
const tile = (icon, title, body, action, extra = "") => `<button class="tile" data-action="${action}" ${extra} ${S.reading ? "disabled" : ""}>
  <div class="bubble">${ico(icon)}</div><b>${esc(title)}</b><span>${esc(body)}</span></button>`;
const spinner = () => `<span class="spin" aria-hidden="true"></span>`;

function review() {
  const t = T(), I = S.input;
  const rows = I.text ? num(parseRows(I.text)) : num(0);
  return `<main class="wrap">
    ${backBar(t.reviewTitle, "home")}
    ${I.fromPhoto ? `<div class="warn">${ico("warning")}<span>${esc(t.reviewWarn)}</span></div>` : I.text ? "" : `<p class="mu">${esc(t.emptyText)}</p>`}
    <div class="review ${I.photo ? "two" : ""}">
      ${I.photo ? `<figure class="card photo"><figcaption>${esc(t.photo)}</figcaption><img src="${I.photo}" alt=""></figure>` : ""}
      <div class="card">
        <label class="lbl" for="rtext">${esc(t.textLabel)}</label>
        <textarea id="rtext" data-bind="text" spellcheck="false">${esc(I.text)}</textarea>
        <div class="mu small">${I.ocr ? esc(t.readBy(I.ocr.engine, I.ocr.ms)) + " · " : ""}<span data-rows>${esc(t.rowsFound(+toAsciiDigits(rows)))}</span></div>
      </div>
    </div>
    <div class="actionbar">
      ${I.fromPhoto ? `<label class="check"><input type="checkbox" data-action="confirm" ${I.confirmed ? "checked" : ""}><span>${esc(t.confirm)}</span></label>` : "<span></span>"}
      <button class="btn primary lg" data-action="analyse" ${(!I.fromPhoto || I.confirmed) && I.text.trim() && !S.busy ? "" : "disabled"}>
        ${S.busy ? spinner() + esc(t.analysing) : esc(t.analyse)}</button>
    </div></main>`;
}
let _rowsCache = ["", 0];
function parseRows(text) {
  if (_rowsCache[0] !== text) _rowsCache = [text, S.pipelineRows(text)];
  return _rowsCache[1];
}
const backBar = (title, view, actions = "") => `<div class="backbar"><button class="icon-btn" data-action="go" data-view="${view}" aria-label="${esc(T().actions.back)}">${ico("back")}</button>
  <h1>${esc(title)}</h1><div class="grow"></div>${actions}</div>`;

function reportView() {
  const t = T(), r = S.report;
  const acts = `${r.fromRecord ? "" : `<button class="btn ${r.savedId ? "done" : "tonal"}" data-action="save" ${r.savedId ? "disabled" : ""}>${ico(r.savedId ? "check" : "save")}<span>${esc(r.savedId ? t.actions.saved : t.actions.save)}</span></button>`}
    <button class="btn tonal" data-action="go" data-view="summary">${ico("print")}<span>${esc(t.actions.summary)}</span></button>
    <button class="btn text" data-action="new">${esc(t.actions.newReport)}</button>`;
  const tabs = t.tabs.map((x, i) => `<button role="tab" class="tab ${r.tab === i ? "on" : ""}" data-action="tab" data-tab="${i}">${esc(x)}</button>`).join("");
  const body = [summaryTab, resultsTab, explainTab, privacyTab][r.tab]();
  return `<main class="wrap">${backBar(t.reportTitle, r.fromRecord ? "history" : "review", `<div class="acts">${acts}</div>`)}
    <div class="tabs" role="tablist">${tabs}</div><div class="tabbody">${body}</div></main>${r.detail != null ? detailSheet() : ""}`;
}

function summaryTab() {
  const t = T(), r = S.report, labs = r.labs;
  if (!labs.length) return `<div class="card row">${ico("info")}<p>${esc(t.noLabs)}</p></div>` + howMade();
  const counts = C.STATUS_ORDER.map((f) => [f, labs.filter((l) => l.flag === f).length]);
  const outside = labs.filter((l) => l.flag === "high" || l.flag === "low").length;
  const abn = labs.map((l, i) => [l, i]).filter(([l]) => l.flag === "high" || l.flag === "low");
  return `<div class="grid2">
    <div class="card donut-card">
      ${C.donut(counts, num(outside), t.outsideShort)}
      <div><h3>${esc(t.testsChecked(labs.length))}</h3>
        ${counts.filter(([, n]) => n).map(([f, n]) => `<button class="legend" data-action="slice" data-flag="${f}"><i class="dot s-${f}"></i><span>${esc(t.flag[f])}</span><b>${num(n)}</b></button>`).join("")}
        <p class="mu small">${esc(t.tapHint)}</p></div>
    </div>
    <div><h3 class="sec">${esc(t.needsAttention)}</h3>
      ${abn.length ? abn.map(([l, i]) => compact(l, i)).join("") : `<div class="card row">${C.statusIcon("normal", 22)}<p>${esc(t.allNormal)}</p></div>`}
    </div></div>${howMade()}`;
}
function compact(l, i) {
  const t = T(), [name] = t.labName(l.name);
  return `<button class="card res compact" data-action="detail" data-i="${i}">
    <div class="row"><b class="grow ell">${esc(name)}</b><span class="val">${esc(g(l.value))} ${esc(l.unit)}</span>${C.pill(l.flag, t.flag[l.flag])}</div>
    ${C.gauge(l, false)}${S.report.edited.has(i) ? `<small class="accent">${esc(t.editedByYou)}</small>` : ""}</button>`;
}
function howMade() {
  const t = T(), r = S.report;
  const rows = [[r.fromPhoto ? "camera" : "paste", r.fromPhoto ? t.provPhoto : t.provTyped], ["shield", t.provModels(r.models)], ["rule", t.provRules],
    ["check", t.provTemplate], ["cloud-off", t.provLocal]];
  if (r.edited.size) rows.push(["edit", t.edited(r.edited.size)]);
  return `<h3 class="sec">${esc(t.howMade)}</h3><div class="card prov">${rows.map(([i, x]) => `<div class="row">${ico(i)}<span>${esc(x)}</span></div>`).join("")}</div>
    <div class="note">${ico("info")}<span>${esc(t.doctorNote)}</span></div>`;
}

function resultsTab() {
  const t = T(), r = S.report;
  if (!r.labs.length) return `<p class="mu">${esc(t.noLabs)}</p>`;
  const chips = [["all", t.filterAll], ["outside", t.filterOutside], ["normal", t.filterNormal]]
    .map(([k, x]) => `<button class="chip ${r.filter === k ? "on" : ""}" data-action="filter" data-f="${k}">${r.filter === k ? ico("check") : ""}${esc(x)}</button>`).join("");
  const keep = (f) => (r.filter === "outside" ? f === "high" || f === "low" : r.filter === "normal" ? f === "normal" : true);
  const cards = r.labs.map((l, i) => [l, i]).filter(([l]) => keep(l.flag)).map(([l, i]) => {
    const [name, sec] = t.labName(l.name);
    return `<button class="card res" data-action="detail" data-i="${i}">
      <div class="row start"><div class="grow"><b>${esc(name)}</b>${sec ? `<small class="mu">${esc(sec)}</small>` : ""}</div>${C.pill(l.flag, t.flag[l.flag])}</div>
      <div class="row base"><span class="big">${esc(g(l.value))}</span><span class="mu">${esc(l.unit)}</span><span class="grow"></span>
        <small class="mu">${esc(t.normalRange)}: ${esc(t.range(l.low != null ? g(l.low) : null, l.high != null ? g(l.high) : null))}</small></div>
      ${C.gauge(l)}${r.edited.has(i) ? `<small class="accent">${ico("edit")} ${esc(t.editedByYou)}</small>` : ""}</button>`;
  }).join("");
  return `<div class="chips">${chips}</div><div class="cards">${cards}</div><div class="note">${ico("info")}<span>${esc(t.doctorNote)}</span></div>`;
}

function detailSheet() {
  const t = T(), r = S.report, i = r.detail, l = r.labs[i], [name, sec] = t.labName(l.name), ed = r.editing;
  return `<div class="backdrop" data-action="closedetail"></div>
  <div class="sheet" role="dialog" aria-modal="true">
    <div class="row start"><div class="grow"><h2>${esc(name)}</h2>${sec ? `<div class="mu">${esc(sec)}</div>` : ""}</div>${C.pill(l.flag, t.flag[l.flag])}
      <button class="icon-btn" data-action="closedetail" aria-label="${esc(t.close)}">${ico("close")}</button></div>
    <div class="row base sp"><div><small class="mu">${esc(t.yourValue)}</small><div class="big">${esc(g(l.value))} <span class="mu">${esc(l.unit)}</span></div></div>
      <div class="right"><small class="mu">${esc(t.normalRange)}</small><div><b>${esc(t.range(l.low != null ? g(l.low) : null, l.high != null ? g(l.high) : null))}</b></div></div></div>
    ${C.gauge(l)}
    <p class="lead">${esc(t.meaning[l.flag])}</p><p class="mu">${esc(t.askDoctor)}</p><hr>
    ${ed ? `<label class="lbl">${esc(t.correctHint)}</label>
        <div class="row gap"><input class="inp" id="editval" inputmode="decimal" value="${esc(ed.value)}" data-bind="editval"><span class="mu">${esc(l.unit)}</span></div>
        ${ed.bad ? `<div class="err small">${esc(t.invalidNumber)}</div>` : ""}
        <div class="row end gap"><button class="btn text" data-action="editcancel">${esc(t.cancel)}</button><button class="btn primary" data-action="editsave">${esc(t.save)}</button></div>`
      : r.fromRecord ? "" : `<button class="btn outline" data-action="edit">${ico("edit")}<span>${esc(t.correct)}</span></button>`}
  </div>`;
}

function explainTab() {
  const t = T(), r = S.report, labs = r.labs;
  const text = template(labs, S.lang), lines = text.split("\n");
  return `<div class="col narrow">
    <div class="note tint">${C.statusIcon("normal", 22)}<div><b>${esc(t.explSource)}</b><p>${esc(t.explSourceBody)}</p></div></div>
    <div class="card expl">${lines.map((ln, k) => (k < labs.length ? `<p class="xl">${C.statusIcon(labs[k].flag, 20)}<span>${esc(ln)}</span></p>` : `<p class="xl last"><b>${esc(ln)}</b></p>`)).join("")}
      <div class="row end"><button class="btn text" data-action="copy" data-what="expl">${ico("copy")}<span>${esc(t.copy)}</span></button></div></div>
    <h3 class="sec">${esc(t.clearQ)}</h3>
    <div class="chips"><button class="chip ${r.feedback === true ? "on" : ""}" data-action="fb" data-v="1">${ico("thumb")}${esc(t.yes)}</button>
      <button class="chip ${r.feedback === false ? "on" : ""}" data-action="fb" data-v="0">${ico("warning")}${esc(t.no)}</button></div>
    ${r.feedback != null ? `<p class="mu">${esc(r.feedback ? t.thanksYes : t.thanksNo)}</p>` : ""}
    <div class="note">${ico("info")}<span>${esc(t.doctorNote)}</span></div></div>`;
}

const TAGRX = /\[([A-Z][A-Z_]*)\]/g;
function tagged(text) {
  const t = T();
  return esc(text).replace(TAGRX, (_, k) => `<mark class="tag">${esc(t.tag[k] ?? k)}</mark>`);
}

function privacyTab() {
  const t = T(), r = S.report;
  const prot = protectedText(r);
  const eff = r.fromRecord ? [] : effSpans(r);
  const counts = {};
  for (const s of eff) counts[s.label] = (counts[s.label] ?? 0) + 1;
  if (r.fromRecord) for (const m of prot.matchAll(TAGRX)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  const chips = Object.entries(counts).map(([k, n]) => `<span class="chip static">${ico("lock")}${esc(t.tag[k] ?? k)} × ${num(n)}</span>`).join("") || `<span class="mu">${esc(t.nothingFound)}</span>`;
  const right = `<div class="card pane"><div class="pane-h"><b>${esc(t.protected)}</b>
      <button class="btn text" data-action="copy" data-what="prot">${ico("copy")}<span>${esc(t.copyPrivate)}</span></button></div><pre class="mono">${tagged(prot)}</pre></div>`;
  if (r.fromRecord) return `<div class="row">${ico("shield", "big")}<div><h3>${esc(t.privTitle)}</h3><p class="mu">${esc(t.privBody)}</p></div></div><div class="chips">${chips}</div>${right}`;
  // original with all candidate spans (hidden, shown again, added by the user)
  const text = r.result.text;
  const marks = [...r.result.spans.map((s) => ({ ...s, kind: r.unhidden.has(key(s)) ? "shown" : "hid", k: key(s) })),
                 ...r.added.map((s, i) => ({ ...s, kind: "added", k: "a" + i }))].sort((a, b) => a.start - b.start);
  let html = "", pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;                                  // overlapping user selections: shown by the first one
    if (m.start > pos) html += `<span data-o="${pos}">${esc(text.slice(pos, m.start))}</span>`;
    const lab = m.kind === "added" ? t.tag.HIDDEN : t.tag[m.label] ?? m.label;
    html += `<span data-o="${m.start}" class="pii ${m.kind}" data-action="togglespan" data-k="${m.k}" title="${esc(m.kind === "shown" ? t.shownAgain : lab)}">${esc(text.slice(m.start, m.end))}</span>`;
    pos = m.end;
  }
  if (pos < text.length) html += `<span data-o="${pos}">${esc(text.slice(pos))}</span>`;
  return `<div class="row">${ico("shield", "big")}<div><h3>${esc(t.privTitle)}</h3><p class="mu">${esc(t.privBody)}</p></div></div>
    <div class="chips">${chips}</div>
    <p class="mu small">${esc(t.sideHint)}</p>
    <div class="side">
      <div class="card pane"><div class="pane-h"><b>${esc(t.original)}</b><span class="grow"></span>
        <button class="btn tonal sm" data-action="hidesel">${ico("lock")}<span>${esc(t.hideSel)}</span></button>
        ${r.unhidden.size || r.added.length ? `<button class="btn text sm" data-action="resetpriv">${esc(t.resetPriv)}</button>` : ""}</div>
        <pre class="mono" id="orig">${html}</pre></div>
      ${right}</div>`;
}

// ------------------------------------------------------------------------------------------------ summary (print)
function summaryView() {
  const t = T(), r = S.report, labs = r.labs;
  const abn = labs.filter((l) => l.flag === "high" || l.flag === "low"), nor = labs.filter((l) => !(l.flag === "high" || l.flag === "low"));
  const row = (l) => { const [n, s] = t.labName(l.name); return `<tr><td>${esc(n)}${s ? `<br><small>${esc(s)}</small>` : ""}</td><td>${esc(g(l.value))} ${esc(l.unit)}</td>
    <td>${esc(t.range(l.low != null ? g(l.low) : null, l.high != null ? g(l.high) : null))}</td><td>${C.pill(l.flag, t.flag[l.flag])}</td></tr>`; };
  const table = (ls_) => (ls_.length ? `<table><thead><tr><th>${t.table.test}</th><th>${t.table.value}</th><th>${t.table.range}</th><th>${t.table.status}</th></tr></thead><tbody>${ls_.map(row).join("")}</tbody></table>` : `<p class="mu">${esc(t.sumNone)}</p>`);
  const qs = [...abn.map((l) => t.qTest(t.labName(l.name)[0], `${g(l.value)} ${l.unit}`)), t.qRepeat, t.qPrev, t.qGeneral];
  const nick = r.nickname && r.showNick ? `<div><small>${esc(t.sumFor)}</small><b>${esc(r.nickname)}</b></div>` : "";
  return `<main class="wrap">
    <div class="backbar noprint"><button class="icon-btn" data-action="go" data-view="report">${ico("back")}</button><h1>${esc(t.actions.summary)}</h1><div class="grow"></div>
      ${r.nickname ? `<label class="check"><input type="checkbox" data-action="shownick" ${r.showNick ? "checked" : ""}><span>${esc(t.includeName)}</span></label>` : ""}
      <button class="btn primary" data-action="print">${ico("print")}<span>${esc(t.print)}</span></button></div>
    <article class="paper">
      <header class="p-head"><img src="img/logo.svg" width="40" height="40" alt=""><div><h1>${esc(t.sumTitle)}</h1><small>${esc(t.sumPrepared(fmtDate(today())))}</small></div></header>
      <div class="p-meta">${nick}<div><small>${esc(t.sumDate)}</small><b>${esc(fmtDate(r.reportDate ?? reportDateFrom(r)))}</b></div></div>
      <h2>${esc(t.sumOutside)}</h2>${table(abn)}
      <h2>${esc(t.sumNormal)}</h2>${table(nor)}
      <h2>${esc(t.sumQs)}</h2><ol>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
      <h2>${esc(t.sumNotes)}</h2><textarea class="notes" data-bind="notes" placeholder="${esc(t.sumNotesHint)}">${esc(r.notes ?? "")}</textarea>
      <footer>${esc(t.sumFooter)}</footer>
    </article></main>`;
}

// ------------------------------------------------------------------------------------------------ history
function historyView() {
  const t = T(), Vs = S.vault;
  if (!Vs.exists || !V.unlocked()) return `<main class="wrap">${backBar(t.history, "home")}${passForm(!Vs.exists)}</main>`;
  const recs = Vs.records;
  const people = [...new Map(recs.map((x) => [x.personId, x.personLabel])).entries()];
  const pid = Vs.person && people.some(([p]) => p === Vs.person) ? Vs.person : people[0]?.[0];
  const mine = recs.filter((x) => x.personId === pid);
  const list = mine.slice().reverse().map((x) => {
    const ab = x.labs.filter((l) => l.flag === "high" || l.flag === "low").length;
    return `<div class="card hrow"><div class="grow"><b>${esc(fmtDate(x.reportDate))}</b><small class="mu">${esc(x.id)} · ${esc(t.testsChecked(x.labs.length))}${ab ? " · " + num(ab) + " " + esc(t.outsideShort) : ""}</small></div>
      <button class="btn tonal sm" data-action="openrec" data-id="${x.id}">${esc(t.open)}</button><button class="btn text sm danger" data-action="delrec" data-id="${x.id}">${esc(t.del)}</button></div>`;
  }).join("");
  // trends: tests present in >= 2 reports of this person
  const byTest = new Map();
  for (const x of mine) for (const l of x.labs) {
    const k = l.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!byTest.has(k)) byTest.set(k, { name: l.name, unit: l.unit, pts: [] });
    byTest.get(k).pts.push({ date: x.reportDate, value: l.value, flag: l.flag, low: l.low, high: l.high });
  }
  const trends = [...byTest.values()].filter((v) => v.pts.length >= 2);
  const tr = trends.length ? trends.map((v) => `<div class="card trendcard"><div class="row"><b class="grow">${esc(t.labName(v.name)[0])}</b><small class="mu">${esc(v.unit)}</small>
      ${C.pill(v.pts[v.pts.length - 1].flag, t.flag[v.pts[v.pts.length - 1].flag])}</div>${C.trend(v.pts, v.unit, fmtDate)}</div>`).join("") : `<p class="mu">${esc(t.needTwo)}</p>`;
  return `<main class="wrap">${backBar(t.history, "home", `<button class="btn text" data-action="lock">${ico("lock")}<span>${esc(t.lock)}</span></button>`)}
    ${recs.length ? `<div class="chips">${people.map(([p, lab]) => `<button class="chip ${p === pid ? "on" : ""}" data-action="person" data-p="${p}">${ico("person")}${esc(lab)} · ${esc(t.reports(recs.filter((x) => x.personId === p).length))}</button>`).join("")}</div>
      <div class="grid2 hist"><div>${list}</div><div><h3 class="sec">${esc(t.trends)}</h3><p class="mu small">${esc(t.trendHint)}</p>${tr}</div></div>`
      : `<div class="card"><p>${esc(t.noReports)}</p></div>`}
    <p class="mu small center">${esc(t.pseudoNote)}</p>
    ${recs.length ? `<div class="center"><button class="btn text danger" data-action="delall">${esc(t.delAll)}</button></div>` : ""}
    <div class="tip" id="tip" hidden></div></main>`;
}
function passForm(isNew) {
  const t = T();
  return `<form class="card passform" data-form="${isNew ? "create" : "unlock"}">
    <div class="row">${ico("lock", "big")}<div><h2>${esc(isNew ? t.vaultNew : t.vaultOpen)}</h2>${isNew ? `<p class="mu">${esc(t.vaultNewBody)}</p>` : ""}</div></div>
    <label class="lbl">${esc(t.pass)}<input class="inp" type="password" name="p1" autocomplete="new-password" required></label>
    ${isNew ? `<label class="lbl">${esc(t.pass2)}<input class="inp" type="password" name="p2" autocomplete="new-password" required></label>` : ""}
    ${S.vault.error ? `<div class="err">${esc(S.vault.error)}</div>` : ""}
    <div class="row end"><button class="btn primary" type="submit">${esc(isNew ? t.create : t.unlock)}</button></div></form>`;
}

function saveModal() {
  const t = T(), m = S.modal;
  if (!S.vault.exists || !V.unlocked()) return modalWrap(t.saveTitle, passForm(!S.vault.exists));
  const people = [...new Map(S.vault.records.map((x) => [x.personId, x.personLabel])).entries()];
  return modalWrap(t.saveTitle, `<form data-form="save">
    <label class="lbl">${esc(t.whoFor)}</label>
    <div class="radios">${people.map(([p, lab]) => `<label class="radio"><input type="radio" name="who" value="${p}" ${m.who === p ? "checked" : ""}><span>${esc(lab)}</span></label>`).join("")}
      <label class="radio"><input type="radio" name="who" value="__new" ${m.who === "__new" ? "checked" : ""}><span>${esc(t.newPerson)}</span></label></div>
    <input class="inp" name="nick" placeholder="${esc(t.nickname)}" value="${esc(m.nick ?? "")}">
    <label class="lbl">${esc(t.reportDate)}<input class="inp" type="date" name="date" value="${esc(m.date)}" required></label>
    <p class="mu small">${esc(t.pseudoNote)}</p><p class="mu small">${esc(t.saveWhat)}</p>
    <div class="row end gap"><button type="button" class="btn text" data-action="closemodal">${esc(t.cancel)}</button><button class="btn primary" type="submit">${esc(t.save)}</button></div></form>`);
}
const modalWrap = (title, body) => `<div class="backdrop" data-action="closemodal"></div><div class="modal" role="dialog" aria-modal="true"><div class="row"><h2 class="grow">${esc(title)}</h2>
  <button class="icon-btn" data-action="closemodal">${ico("close")}</button></div>${body}</div>`;

function samplesModal() {
  const t = T();
  return modalWrap(t.chooseSample, `<p class="mu small">${esc(t.sampleNote)}</p><div class="samples">${S.samples.map((s, i) => `<button class="tile row" data-action="pick" data-i="${i}">${ico("doc")}<b>${esc(t.sampleTitle(s.title))}</b></button>`).join("")}</div>`);
}

// ------------------------------------------------------------------------------------------------ settings
function settingsView() {
  const t = T(), Ms = S.models;
  const st = (m) => (Ms.active && (m === "ner" ? S.pipeline.ner : S.pipeline.pii[m.slice(4)]) ? `<span class="ok">${ico("check")}${esc(t.modelsLoaded)}</span>`
    : Ms.status[m] ? `<span>${esc(t.modelsCached)}</span>` : `<span class="mu">${esc(t.modelsNone)}</span>`);
  const chk = (m) => { const c = Ms.checks[m]; if (!c) return ""; const p = [];
    if (c.tokenizer) p.push(`tokenizer ${c.tokenizer.n - c.tokenizer.diff}/${c.tokenizer.n}`);
    if (c.labels) p.push(`labels ${c.labels.words - c.labels.diff}/${c.labels.words} (max Δscore ${c.labels.maxScoreDiff.toExponential(1)})`);
    return p.length ? `<small class="mu"> · ${esc(t.checks)}: ${esc(p.join(", "))}</small>` : ""; };
  const anyCached = Object.values(Ms.status).some(Boolean);
  const self = S.selftest ? `<div class="mono small selftest">${S.selftest.running ? spinner() + " …" : Object.entries(S.selftest.res).map(([k, v]) => `${k}: ${v.n} — ${v.fails.length ? `<b class="bad">${v.fails.length} differences</b>` : "identical"}`).join("<br>") + `<br><b>${S.selftest.res && Object.values(S.selftest.res).every((v) => !v.fails.length) ? "ALL IDENTICAL" : ""}</b>`}</div>` : "";
  return `<main class="wrap narrow">${backBar(t.settings, "home")}
    <h3 class="sec">${esc(t.language)}</h3><div class="card">${[["bn", "বাংলা"], ["en", "English"]].map(([k, x]) => radio("lang", k, x, S.lang === k)).join("")}</div>
    <h3 class="sec">${esc(t.reader)}</h3><div class="card">${radio("reader", "auto", t.readerAuto, S.reader === "auto")}${radio("reader", "eng", t.readerEng, S.reader === "eng")}</div>
    <h3 class="sec">${esc(t.models)}</h3><div class="card"><p class="mu">${esc(t.modelsBody)}</p>
      <table class="mtable">${M.MODELS.map((m) => `<tr><td><code>${m}</code></td><td>${st(m)}${chk(m)}</td></tr>`).join("")}</table>
      ${Ms.loading ? `<div class="status">${spinner()}<span>${esc(t.loading)} ${esc(Ms.loading)}</span></div>` : ""}
      ${Ms.error ? `<div class="err small">${esc(Ms.error)}</div>` : ""}
      <div class="row gap wrapr"><label class="btn tonal">${ico("folder")}<span>${esc(t.modelsFolder)}</span><input type="file" webkitdirectory multiple data-models hidden></label>
        <button class="btn text" data-action="modelsite">${esc(t.modelsSite)}</button>
        ${anyCached ? `<button class="btn text danger" data-action="modelclear">${esc(t.modelsClear)}</button>` : ""}</div></div>
    <h3 class="sec">${esc(t.selfTest)}</h3><div class="card"><p class="mu">${esc(t.selfBody)}</p><button class="btn tonal" data-action="selftest">${ico("rule")}<span>${esc(t.selfTest)}</span></button>${self}</div>
    <h3 class="sec">${esc(t.about)}</h3><div class="card row"><img src="img/logo.svg" width="44" height="44" alt=""><div><b>${esc(t.appName)}</b><p class="mu">${esc(t.aboutBody)}</p></div></div>
  </main>`;
}
const radio = (name, v, label, on) => `<label class="radio"><input type="radio" name="${name}" value="${v}" data-action="radio" ${on ? "checked" : ""}><span>${esc(label)}</span></label>`;

function langGate() {
  return `<div class="gate"><div class="gate-in"><img src="img/logo.svg" width="88" height="88" alt="">
    <h1>ভাষা বেছে নিন</h1><p>Choose your language</p>
    <button class="lang-opt" data-action="lang" data-lang="bn"><b>বাংলা</b><span>অ্যাপের সব লেখা ও ব্যাখ্যা বাংলায়</span>${ico("next")}</button>
    <button class="lang-opt" data-action="lang" data-lang="en"><b>English</b><span>All screens and explanations in English</span>${ico("next")}</button>
    <small>পরে বদলাতে পারবেন · You can change this later</small></div></div>`;
}

// ------------------------------------------------------------------------------------------------ render
function render() {
  if (!S.lang) { root.innerHTML = langGate(); return; }
  document.documentElement.lang = S.lang;
  document.title = T().appName;
  const v = { home, review, report: reportView, summary: summaryView, history: historyView, settings: settingsView }[S.view] ?? home;
  const active = document.activeElement?.dataset?.bind;
  const sel = active ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  root.innerHTML = header() + v() + (S.modal?.type === "save" ? saveModal() : S.modal?.type === "samples" ? samplesModal() : "") +
    (S.toast ? `<div class="toast">${esc(S.toast)}</div>` : "");
  if (active) { const el = root.querySelector(`[data-bind="${active}"]`); if (el) { el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch { /* */ } } }
  C.animate(root);
}

// ------------------------------------------------------------------------------------------------ actions
async function handleImage(file) {
  if (!file) return;
  S.reading = true; S.error = null; render();
  try {
    const canvas = await loadImage(file);
    const out = await readImage(canvas, S.reader);
    S.ocrStarted = true;
    S.input = { text: out.text, photo: canvas.toDataURL("image/jpeg", 0.85), ocr: out, fromPhoto: true, confirmed: false };
    S.view = "review";
  } catch (e) {
    console.error(e); S.error = T().readFailed;
  } finally { S.reading = false; render(); }
}

async function analyse() {
  S.busy = true; render();
  const res = await S.pipeline.run(S.input.text, S.lang);
  S.report = { result: res, labs: res.labs.map((l) => ({ ...l })), edited: new Set(), unhidden: new Set(), added: [], feedback: null,
    tab: 0, filter: "all", detail: null, editing: null, fromPhoto: S.input.fromPhoto, savedId: null, models: S.models.active,
    reportDate: null, nickname: null, showNick: true, notes: "" };
  S.report.reportDate = reportDateFrom(S.report);
  S.busy = false; S.view = "report"; render(); window.scrollTo(0, 0);
}

async function refreshVault() { S.vault.exists = await V.exists(); S.vault.records = V.unlocked() ? await V.all() : []; }

async function openSave() {
  await refreshVault();
  const r = S.report, name = patientName(r);
  let who = "__new";
  if (V.unlocked() && name) { const pid = await V.personId("name:" + name); if (S.vault.records.some((x) => x.personId === pid)) who = pid; }
  S.modal = { type: "save", who, nick: "", date: r.reportDate };
  render();
}

async function doSave(form) {
  const t = T(), r = S.report, fd = new FormData(form);
  const who = fd.get("who") ?? "__new", nick = (fd.get("nick") || "").trim();
  let personId, personLabel;
  if (who === "__new") {
    if (!nick) { form.querySelector('[name="nick"]').focus(); return; }
    const name = patientName(r);
    personId = await V.personId(name ? "name:" + name : "nick:" + nick); personLabel = nick;
    const existing = S.vault.records.find((x) => x.personId === personId);
    if (existing) personLabel = existing.personLabel;
  } else { personId = who; personLabel = S.vault.records.find((x) => x.personId === who)?.personLabel ?? nick; }
  const rec = { id: V.newReportId(), personId, personLabel, reportDate: fd.get("date") || today(), savedAt: new Date().toISOString(),
    lang: S.lang, labs: r.labs.map(({ line, ...l }) => l), redacted: protectedText(r), fromPhoto: r.fromPhoto };
  await V.save(rec);
  r.savedId = rec.id; r.reportDate = rec.reportDate; r.nickname = personLabel; S.vault.person = personId;
  S.modal = null; await refreshVault(); toast(t.actions.saved + " · " + rec.id);
}

async function submitPass(form) {
  const t = T(), fd = new FormData(form), p1 = fd.get("p1"), kind = form.dataset.form;
  S.vault.error = null;
  if (kind === "create") {
    if (p1.length < 8) { S.vault.error = t.passShort; return render(); }
    if (p1 !== fd.get("p2")) { S.vault.error = t.passMismatch; return render(); }
    await V.create(p1);
  } else if (!(await V.unlock(p1))) { S.vault.error = t.wrongPass; return render(); }
  await refreshVault();
  if (S.modal?.type === "save") return openSave();
  render();
}

function openRecord(id) {
  const x = S.vault.records.find((r) => r.id === id);
  if (!x) return;
  S.report = { result: { text: x.redacted, redacted: x.redacted, spans: [], labs: x.labs }, labs: x.labs.map((l) => ({ ...l })), edited: new Set(),
    unhidden: new Set(), added: [], feedback: null, tab: 0, filter: "all", detail: null, editing: null, fromPhoto: x.fromPhoto, savedId: x.id,
    fromRecord: true, models: false, reportDate: x.reportDate, nickname: x.personLabel, showNick: true, notes: "" };
  S.view = "report"; render();
}

function hideSelection() {
  const t = T(), sel = window.getSelection(), pre = document.getElementById("orig");
  if (!sel || sel.isCollapsed || !pre?.contains(sel.anchorNode)) return toast(t.selectFirst);
  const off = (node, o) => { const el = (node.nodeType === 3 ? node.parentElement : node).closest("[data-o]"); return el ? +el.dataset.o + o : null; };
  let a = off(sel.anchorNode, sel.anchorOffset), b = off(sel.focusNode, sel.focusOffset);
  if (a == null || b == null) return toast(t.selectFirst);
  if (a > b) [a, b] = [b, a];
  const text = S.report.result.text;
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  if (b > a) S.report.added.push({ start: a, end: b, label: "HIDDEN" });
  sel.removeAllRanges(); render();
}

async function loadModels(files) {
  const t = T();
  S.models.error = null;
  try {
    if (files) { S.models.loading = "…"; render(); await M.cacheFiles(files); }
    S.config = await M.cachedConfig();
    S.models.loading = "ONNX"; render();
    const res = await M.loadTaggers(S.config);
    S.pipeline = new Pipeline(S.config, res.ner, res.pii);
    S.models.active = !!(res.ner || res.pii.bn || res.pii.en); S.models.checks = res.checks;
    ls.set("models", S.models.active ? "on" : "off");
  } catch (e) { console.error(e); S.models.error = String(e.message || e); }
  S.models.loading = null; S.models.status = await M.cachedStatus(S.config); render();
}

const actions = {
  go: (el) => { S.view = el.dataset.view; S.error = null; if (S.view === "history") refreshVault().then(render); if (S.view === "report" && !S.report) S.view = "home"; render(); window.scrollTo(0, 0); },
  lang: (el) => { S.lang = el.dataset.lang; ls.set("lang", S.lang); render(); },
  paste: async () => {
    let txt = "";
    try { txt = await navigator.clipboard.readText(); } catch { /* permission refused: type it */ }
    S.input = { text: txt, photo: null, ocr: null, fromPhoto: false, confirmed: true }; S.view = "review"; render();
    root.querySelector("#rtext")?.focus();
  },
  samples: () => { S.modal = { type: "samples" }; render(); },
  pick: (el) => { const s = S.samples[+el.dataset.i]; S.modal = null; S.input = { text: s.text, photo: null, ocr: null, fromPhoto: false, confirmed: true }; S.view = "review"; render(); },
  confirm: (el) => { S.input.confirmed = el.checked; render(); },
  analyse,
  tab: (el) => { S.report.tab = +el.dataset.tab; render(); },
  slice: (el) => { const f = el.dataset.flag; S.report.filter = f === "high" || f === "low" ? "outside" : f === "normal" ? "normal" : "all"; S.report.tab = 1; render(); },
  filter: (el) => { S.report.filter = el.dataset.f; render(); },
  detail: (el) => { S.report.detail = +el.dataset.i; S.report.editing = null; render(); },
  closedetail: () => { S.report.detail = null; S.report.editing = null; render(); },
  edit: () => { S.report.editing = { value: g(S.report.labs[S.report.detail].value), bad: false }; render(); root.querySelector("#editval")?.focus(); },
  editcancel: () => { S.report.editing = null; render(); },
  editsave: () => {
    const r = S.report, i = r.detail, l = r.labs[i];
    const v = Number(toAsciiDigits(String(r.editing.value).trim()).replace(",", "."));
    if (!String(r.editing.value).trim() || !Number.isFinite(v)) { r.editing.bad = true; return render(); }
    r.labs[i] = { ...l, value: v, flag: flagValue(v, l.low, l.high) }; r.edited.add(i); r.editing = null; r.savedId = r.fromRecord ? r.savedId : null; render();
  },
  fb: (el) => { S.report.feedback = el.dataset.v === "1"; render(); },
  copy: async (el) => {
    const r = S.report, txt = el.dataset.what === "expl" ? template(r.labs, S.lang) : protectedText(r).replace(TAGRX, (_, k) => `[${T().tag[k] ?? k}]`);
    try { await navigator.clipboard.writeText(txt); toast(T().copied); } catch { toast("—"); }
  },
  togglespan: (el) => {
    const r = S.report, k = el.dataset.k;
    if (k.startsWith("a")) r.added.splice(+k.slice(1), 1);
    else if (r.unhidden.has(k)) r.unhidden.delete(k); else r.unhidden.add(k);
    r.savedId = null; render();
  },
  hidesel: hideSelection,
  resetpriv: () => { S.report.unhidden.clear(); S.report.added = []; render(); },
  save: openSave,
  closemodal: () => { S.modal = null; render(); },
  new: () => { S.report = null; S.input = { text: "", photo: null, ocr: null, fromPhoto: false, confirmed: false }; S.view = "home"; render(); },
  print: () => window.print(),
  shownick: (el) => { S.report.showNick = el.checked; render(); },
  lock: () => { V.lock(); S.vault.records = []; render(); },
  person: (el) => { S.vault.person = el.dataset.p; render(); },
  openrec: (el) => openRecord(el.dataset.id),
  delrec: async (el) => { if (confirm(T().confirmDel)) { await V.remove(el.dataset.id); await refreshVault(); render(); } },
  delall: async () => { if (confirm(T().confirmDelAll)) { await V.destroy(); await refreshVault(); render(); } },
  radio: (el) => {
    if (el.name === "lang") { S.lang = el.value; ls.set("lang", S.lang); }
    if (el.name === "reader") { S.reader = el.value; ls.set("reader", S.reader); }
    render();
  },
  modelsite: async () => {
    try { S.models.loading = "models/…"; render(); const files = await M.filesFromSite(S.config, (f) => { S.models.loading = f; render(); }); await loadModels(files); }
    catch (e) { S.models.loading = null; S.models.error = String(e.message || e); render(); }
  },
  modelclear: async () => { await M.clearCache(); S.pipeline = new Pipeline(S.config); S.models.active = false; S.models.checks = {}; ls.set("models", "off"); S.models.status = await M.cachedStatus(S.config); render(); },
  selftest: async () => {
    S.selftest = { running: true }; render();
    const files = {};
    for (const f of ["core_golden.jsonl", "gate_golden.jsonl", "tagger_golden.jsonl", "group_golden.jsonl", "ocr_golden.jsonl"]) files[f] = await (await fetch("data/golden/" + f)).text();
    S.selftest = { running: false, res: await runGolden((n) => files[n]) }; render();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  if (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "radio") return;
  if (el.tagName === "A") e.preventDefault();
  actions[el.dataset.action]?.(el, e);
});
document.addEventListener("input", (e) => {
  const b = e.target.dataset?.bind;
  if (b === "text") { S.input.text = e.target.value; const r = root.querySelector("[data-rows]"); if (r) r.textContent = T().rowsFound(S.pipelineRows(e.target.value));
    const btn = root.querySelector('[data-action="analyse"]'); if (btn) btn.disabled = !((!S.input.fromPhoto || S.input.confirmed) && S.input.text.trim()); }
  if (b === "editval") S.report.editing.value = e.target.value;
  if (b === "notes") S.report.notes = e.target.value;
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-file]")) handleImage(e.target.files[0]);
  if (e.target.matches("[data-models]")) M.filesFromFolder(e.target.files, S.config).then((f) => (Object.keys(f).length ? loadModels(f) : (S.models.error = "No model folders (ner, pii_bn, pii_en) found in that folder.", render())));
  if (e.target.matches('input[name="who"]') && S.modal) S.modal.who = e.target.value;
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === "save") doSave(f); else submitPass(f);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (S.report?.detail != null) actions.closedetail(); else if (S.modal) actions.closemodal(); } });
// drag & drop an image onto the hero
document.addEventListener("dragover", (e) => { const z = e.target.closest?.("[data-drop]"); if (z) { e.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", (e) => e.target.closest?.("[data-drop]")?.classList.remove("over"));
document.addEventListener("drop", (e) => { const z = e.target.closest?.("[data-drop]"); if (z) { e.preventDefault(); z.classList.remove("over"); handleImage(e.dataTransfer.files[0]); } });
// trend tooltips
document.addEventListener("mouseover", (e) => {
  const p = e.target.closest?.(".t-pt"), tip = document.getElementById("tip");
  if (!tip) return;
  if (p) { tip.textContent = p.dataset.tip; tip.hidden = false; const r = p.getBoundingClientRect(); tip.style.left = r.left + r.width / 2 + window.scrollX + "px"; tip.style.top = r.top + window.scrollY - 8 + "px"; }
  else tip.hidden = true;
});

// ------------------------------------------------------------------------------------------------ start
(async function start() {
  const { parseLabLines } = await import("./core/rules.js");
  S.pipelineRows = (txt) => parseLabLines(txt).length;
  render();
  try { S.samples = (await (await fetch("data/samples.json")).json()).samples; } catch { S.samples = []; }
  try { S.config = await M.cachedConfig(); S.models.status = await M.cachedStatus(S.config); } catch { /* IndexedDB unavailable */ }
  try { S.vault.exists = await V.exists(); } catch { /* */ }
  if (ls.get("models", "off") === "on" && Object.values(S.models.status).some(Boolean)) loadModels(null);
  document.body.classList.add("ready");
  render();
})();
