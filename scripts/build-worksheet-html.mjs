// Generates a self-contained, fillable HTML form from the markdown worksheet.
//
//   node scripts/build-worksheet-html.mjs
//
// Reads  docs/TREATER_LINE2_WORKSHEET.md  (the source of truth)
// Writes docs/TREATER_LINE2_WORKSHEET.html (double-click to open, no server,
//        no internet). Real checkboxes + text fields, autosaves to the browser,
//        and exports filled answers back to markdown so they flow into the repo.
//
// The markdown stays canonical: edit the .md, re-run this script, reopen the html.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const mdPath = join(root, "docs", "TREATER_LINE2_WORKSHEET.md");
const htmlPath = join(root, "docs", "TREATER_LINE2_WORKSHEET.html");

const raw = readFileSync(mdPath, "utf8");

// ---- tokenize: join 2-space-indented continuation lines into the prior line ----
const rawLines = raw.split(/\r?\n/);
const lines = [];
for (const ln of rawLines) {
  if (/^\s{2,}\S/.test(ln) && lines.length && lines[lines.length - 1] !== "") {
    lines[lines.length - 1] += " " + ln.trim();
  } else {
    lines.push(ln.replace(/\s+$/, ""));
  }
}

// ---- parse into a model ----
const model = { title: "Worksheet", intro: [], sections: [] };
let section = null;
let machine = null;
let mode = null; // 'confirm' | 'info' | 'notes' | null
let inIntro = false;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function endMachine() {
  if (machine) section.machines.push(machine);
  machine = null;
  mode = null;
}
function endSection() {
  endMachine();
  if (section) model.sections.push(section);
  section = null;
}

for (const line of lines) {
  if (line.startsWith("# ")) {
    model.title = line.slice(2).trim();
    inIntro = true;
    continue;
  }
  if (line.startsWith("## ")) {
    inIntro = false;
    endSection();
    const title = line.slice(3).trim();
    let kind = "questions";
    if (/sheet 52-1\d/i.test(title)) kind = "machines";
    if (/^after the meeting/i.test(title)) kind = "static";
    section = { id: slug(title), title, kind, machines: [], questions: [], static: [] };
    continue;
  }
  if (inIntro) {
    model.intro.push(line);
    continue;
  }
  if (!section) continue;

  if (line.startsWith("### ")) {
    endMachine();
    const m = line.slice(4).trim().match(/^(\d+)\.\s*(.*)$/);
    machine = {
      num: m ? m[1] : "",
      name: m ? m[2] : line.slice(4).trim(),
      status: "",
      sheet: "",
      hasScope: false,
      confirm: [],
      info: [],
      hasNotes: false,
      notesLines: 0,
    };
    mode = null;
    continue;
  }

  if (section.kind !== "machines") {
    // question / static bullet sections
    const b = line.match(/^-\s+(.*)$/);
    if (b) {
      if (section.kind === "static") section.static.push(b[1].trim());
      else section.questions.push(b[1].trim());
    } else if (line.trim() && section.kind === "static") {
      section.static.push(line.trim());
    }
    continue;
  }

  if (!machine) continue;

  const statusMatch = line.match(/^Status:\s*(.*?)\s{2,}Sheet:\s*(.*)$/);
  if (statusMatch) {
    machine.status = statusMatch[1].trim();
    machine.sheet = statusMatch[2].trim();
    continue;
  }
  if (/^Part of this line\?/i.test(line)) {
    machine.hasScope = true;
    continue;
  }
  if (/^Details to confirm or correct:/i.test(line)) { mode = "confirm"; continue; }
  if (/^Information required:/i.test(line)) { mode = "info"; continue; }
  if (/^Notes:/i.test(line)) { mode = "notes"; machine.hasNotes = true; continue; }

  if (mode === "notes") {
    if (line.startsWith(">")) machine.notesLines += 1;
    continue;
  }

  const cb = line.match(/^-\s*\[ \]\s+(.*)$/);
  if (cb) { machine.confirm.push(cb[1].trim()); continue; }

  const item = line.match(/^-\s+(.*)$/);
  if (item) {
    let label = item[1].trim().replace(/:?\s*_{3,}\s*$/, "");
    if (mode === "info") machine.info.push(label);
    else machine.confirm.push(label); // fallback
    continue;
  }
}
endSection();

// fold consecutive non-bullet intro lines into paragraphs; keep bullets separate
const introBlocks = [];
let para = [];
for (const ln of model.intro) {
  if (ln.startsWith("- ")) {
    if (para.length) { introBlocks.push({ t: "p", text: para.join(" ") }); para = []; }
    introBlocks.push({ t: "li", text: ln.slice(2).trim() });
  } else if (ln.trim() === "") {
    if (para.length) { introBlocks.push({ t: "p", text: para.join(" ") }); para = []; }
  } else {
    para.push(ln.trim());
  }
}
if (para.length) introBlocks.push({ t: "p", text: para.join(" ") });

const data = { title: model.title, intro: introBlocks, sections: model.sections };

// ---- client script (no template literals here, to keep this file simple) ----
const clientJs = [
'const STORE_KEY = "treaterWorksheet:" + location.pathname;',
'const app = document.getElementById("app");',
'const el = (tag, props, kids) => {',
'  const n = document.createElement(tag);',
'  if (props) for (const k in props) {',
'    if (k === "class") n.className = props[k];',
'    else if (k === "text") n.textContent = props[k];',
'    else n.setAttribute(k, props[k]);',
'  }',
'  if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c => c && n.appendChild(c));',
'  return n;',
'};',
'const fields = [];',
'',
'function addField(id, kind) { fields.push({ id: id, kind: kind }); }',
'',
'function render() {',
'  const intro = el("div", { class: "intro" });',
'  data.intro.forEach(function (b) {',
'    if (b.t === "li") intro.appendChild(el("div", { class: "intro-li", text: "• " + b.text }));',
'    else intro.appendChild(el("p", { text: b.text }));',
'  });',
'  app.appendChild(intro);',
'',
'  data.sections.forEach(function (s) {',
'    const sec = el("section", { id: s.id, class: "sec" });',
'    sec.appendChild(el("h2", { text: s.title }));',
'    if (s.kind === "static") {',
'      const ul = el("ul", { class: "static" });',
'      s.static.forEach(function (t) { ul.appendChild(el("li", { text: t })); });',
'      sec.appendChild(ul);',
'    } else if (s.kind === "questions") {',
'      s.questions.forEach(function (q, i) {',
'        const id = "q_" + s.id + "_" + i;',
'        const card = el("div", { class: "qcard" });',
'        card.appendChild(el("label", { class: "qlabel", text: q }));',
'        const ta = el("textarea", { id: id, rows: "2", placeholder: "answer / notes" });',
'        addField(id, "text");',
'        card.appendChild(ta);',
'        sec.appendChild(card);',
'      });',
'    } else {',
'      s.machines.forEach(function (m) { sec.appendChild(machineCard(m)); });',
'    }',
'    app.appendChild(sec);',
'  });',
'}',
'',
'function machineCard(m) {',
'  const card = el("div", { class: "machine" });',
'  card.appendChild(el("h3", { text: m.num + ". " + m.name }));',
'  const meta = [];',
'  if (m.status) meta.push("Status: " + m.status);',
'  if (m.sheet) meta.push("Sheet: " + m.sheet);',
'  if (meta.length) card.appendChild(el("div", { class: "meta", text: meta.join("   \\u00b7   ") }));',
'',
'  if (m.hasScope) {',
'    const id = "m" + m.num + "_scope";',
'    const wrap = el("div", { class: "scope" });',
'    wrap.appendChild(el("span", { class: "scope-q", text: "Part of this line?" }));',
'    ["Yes", "No"].forEach(function (v) {',
'      const lab = el("label", { class: "pill" });',
'      const r = el("input", { type: "radio", name: id, value: v.toLowerCase() });',
'      lab.appendChild(r);',
'      lab.appendChild(el("span", { text: v }));',
'      wrap.appendChild(lab);',
'    });',
'    addField(id, "radio");',
'    card.appendChild(wrap);',
'  }',
'',
'  if (m.confirm.length) {',
'    card.appendChild(el("div", { class: "subh", text: "Confirm or correct" }));',
'    m.confirm.forEach(function (t, i) {',
'      const id = "m" + m.num + "_c" + i;',
'      const row = el("label", { class: "check" });',
'      row.appendChild(el("input", { type: "checkbox", id: id }));',
'      row.appendChild(el("span", { text: t }));',
'      addField(id, "check");',
'      card.appendChild(row);',
'    });',
'  }',
'',
'  if (m.info.length) {',
'    card.appendChild(el("div", { class: "subh", text: "Information required" }));',
'    m.info.forEach(function (t, i) {',
'      const id = "m" + m.num + "_i" + i;',
'      const row = el("div", { class: "field" });',
'      row.appendChild(el("label", { class: "flabel", for: id, text: t }));',
'      row.appendChild(el("input", { type: "text", id: id, placeholder: "type here" }));',
'      addField(id, "text");',
'      card.appendChild(row);',
'    });',
'  }',
'',
'  if (m.hasNotes) {',
'    const id = "m" + m.num + "_notes";',
'    card.appendChild(el("div", { class: "subh", text: "Notes" }));',
'    const ta = el("textarea", { id: id, rows: "2", placeholder: "notes" });',
'    addField(id, "text");',
'    card.appendChild(ta);',
'  }',
'  return card;',
'}',
'',
'function getVal(f) {',
'  if (f.kind === "check") { const n = document.getElementById(f.id); return n ? n.checked : false; }',
'  if (f.kind === "radio") { const n = document.querySelector("input[name=\\"" + f.id + "\\"]:checked"); return n ? n.value : ""; }',
'  const n = document.getElementById(f.id); return n ? n.value : "";',
'}',
'function setVal(f, v) {',
'  if (f.kind === "check") { const n = document.getElementById(f.id); if (n) n.checked = !!v; return; }',
'  if (f.kind === "radio") { const n = document.querySelector("input[name=\\"" + f.id + "\\"][value=\\"" + v + "\\"]"); if (n) n.checked = true; return; }',
'  const n = document.getElementById(f.id); if (n) n.value = v;',
'}',
'',
'let saveTimer = null;',
'function save() {',
'  const out = {};',
'  fields.forEach(function (f) { const v = getVal(f); if (v !== "" && v !== false) out[f.id] = v; });',
'  try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (e) {}',
'  const s = document.getElementById("status");',
'  const d = new Date();',
'  const pad = function (x) { return (x < 10 ? "0" : "") + x; };',
'  s.textContent = "Saved " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());',
'  updateProgress();',
'}',
'function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }',
'function restore() {',
'  let stored = {};',
'  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch (e) {}',
'  fields.forEach(function (f) { if (f.id in stored) setVal(f, stored[f.id]); });',
'  updateProgress();',
'}',
'function updateProgress() {',
'  let filled = 0;',
'  fields.forEach(function (f) { const v = getVal(f); if (v !== "" && v !== false) filled += 1; });',
'  document.getElementById("progress").textContent = filled + " / " + fields.length + " fields filled";',
'}',
'',
'function exportMd() {',
'  const L = [];',
'  L.push("# " + data.title);',
'  L.push("");',
'  data.sections.forEach(function (s) {',
'    L.push("## " + s.title);',
'    if (s.kind === "static") { s.static.forEach(function (t) { L.push("- " + t); }); L.push(""); return; }',
'    if (s.kind === "questions") {',
'      s.questions.forEach(function (q, i) {',
'        L.push("- " + q);',
'        const v = getVal({ id: "q_" + s.id + "_" + i, kind: "text" });',
'        L.push("  Answer: " + (v || ""));',
'      });',
'      L.push("");',
'      return;',
'    }',
'    s.machines.forEach(function (m) {',
'      L.push("### " + m.num + ". " + m.name);',
'      const meta = [];',
'      if (m.status) meta.push("Status: " + m.status);',
'      if (m.sheet) meta.push("Sheet: " + m.sheet);',
'      if (meta.length) L.push(meta.join("     "));',
'      if (m.hasScope) { const v = getVal({ id: "m" + m.num + "_scope", kind: "radio" }); L.push("Part of this line? " + (v ? (v === "yes" ? "Yes" : "No") : "(unanswered)")); }',
'      if (m.confirm.length) {',
'        L.push("Confirm or correct:");',
'        m.confirm.forEach(function (t, i) { const c = getVal({ id: "m" + m.num + "_c" + i, kind: "check" }); L.push("- [" + (c ? "x" : " ") + "] " + t); });',
'      }',
'      if (m.info.length) {',
'        L.push("Information required:");',
'        m.info.forEach(function (t, i) { const v = getVal({ id: "m" + m.num + "_i" + i, kind: "text" }); L.push("- " + t + ": " + (v || "")); });',
'      }',
'      if (m.hasNotes) {',
'        const v = getVal({ id: "m" + m.num + "_notes", kind: "text" });',
'        L.push("Notes:");',
'        (v ? v.split(/\\n/) : [""]).forEach(function (ln) { L.push("> " + ln); });',
'      }',
'      L.push("");',
'    });',
'  });',
'  const blob = new Blob([L.join("\\n")], { type: "text/markdown" });',
'  const a = document.createElement("a");',
'  a.href = URL.createObjectURL(blob);',
'  const d = new Date();',
'  const pad = function (x) { return (x < 10 ? "0" : "") + x; };',
'  a.download = "treater-line2-filled-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".md";',
'  document.body.appendChild(a); a.click(); document.body.removeChild(a);',
'}',
'',
'function buildNav() {',
'  const sel = document.getElementById("nav");',
'  data.sections.forEach(function (s) {',
'    const o = document.createElement("option"); o.value = s.id; o.textContent = s.title; sel.appendChild(o);',
'  });',
'  sel.addEventListener("change", function () { const t = document.getElementById(sel.value); if (t) t.scrollIntoView({ behavior: "smooth" }); });',
'}',
'',
'render();',
'buildNav();',
'restore();',
'document.addEventListener("input", queueSave);',
'document.addEventListener("change", queueSave);',
'document.getElementById("export").addEventListener("click", exportMd);',
'document.getElementById("print").addEventListener("click", function () { window.print(); });',
].join("\n");

const css = `
:root { --ink:#1c1a16; --muted:#6b6457; --line:#d9d2c4; --bg:#f4f1ea; --card:#fffdf8; --accent:#a8812a; --accentbg:#f3e7c8; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
#bar { position:sticky; top:0; z-index:10; background:var(--card); border-bottom:1px solid var(--line); padding:10px 16px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
#bar h1 { font-size:15px; margin:0; flex:1 1 240px; font-weight:600; }
#bar select, #bar button { font:inherit; padding:7px 11px; border-radius:7px; border:1px solid var(--line); background:#fff; cursor:pointer; }
#bar button { background:var(--accentbg); border-color:var(--accent); color:#5c4612; font-weight:600; }
#bar #progress, #bar #status { font-size:12px; color:var(--muted); }
main { max-width:860px; margin:0 auto; padding:18px 16px 120px; }
.intro { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-bottom:22px; color:var(--muted); }
.intro p { margin:6px 0; } .intro-li { margin:3px 0; }
.sec { margin:30px 0; }
.sec > h2 { font-size:13px; letter-spacing:1.5px; text-transform:uppercase; color:var(--accent); border-bottom:2px solid var(--line); padding-bottom:6px; }
.machine { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:14px 0; }
.machine h3 { margin:0 0 4px; font-size:16px; }
.meta { font-size:12px; color:var(--muted); margin-bottom:10px; }
.subh { font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); margin:12px 0 6px; }
.scope { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 2px; }
.scope-q { font-size:13px; color:var(--muted); }
.pill { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line); border-radius:20px; padding:4px 12px; cursor:pointer; }
.check { display:flex; gap:9px; align-items:flex-start; margin:5px 0; cursor:pointer; }
.check input { margin-top:3px; width:17px; height:17px; flex:none; accent-color:var(--accent); }
.field { margin:7px 0; }
.flabel { display:block; font-size:13px; color:var(--ink); margin-bottom:3px; }
.field input[type=text] { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:7px; background:#fff; font:inherit; }
textarea { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:7px; background:#fff; font:inherit; resize:vertical; }
.qcard { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:10px 0; }
.qlabel { display:block; margin-bottom:6px; }
ul.static { color:var(--muted); }
input:focus, textarea:focus { outline:2px solid var(--accent); outline-offset:0; border-color:var(--accent); }
@media print {
  #bar { display:none; }
  body { background:#fff; }
  .machine, .qcard, .intro { break-inside:avoid; border-color:#bbb; }
  input[type=text], textarea { border:none; border-bottom:1px solid #999; border-radius:0; }
}
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${data.title}</title>
<style>${css}</style>
</head>
<body>
<div id="bar">
  <h1>${data.title}</h1>
  <span id="progress"></span>
  <span id="status">autosaving</span>
  <select id="nav" aria-label="Jump to section"><option value="">Jump to...</option></select>
  <button id="export" type="button">Export filled (.md)</button>
  <button id="print" type="button">Print</button>
</div>
<main id="app"></main>
<script>const data = ${JSON.stringify(data)};</script>
<script>${clientJs}</script>
</body>
</html>
`;

writeFileSync(htmlPath, html, "utf8");

const counts = data.sections.reduce(
  (a, s) => { a.machines += s.machines.length; a.questions += s.questions.length; return a; },
  { machines: 0, questions: 0 }
);
console.log("Wrote " + htmlPath);
console.log("  machines: " + counts.machines + ", question fields: " + counts.questions);
