// Cross-checks independent transcriptions of the printed timetable.
//
// Every source is reduced to the same "cells": one per date, period block and column, where a
// column is a class ("class:3") for 120-minute blocks and a division ("division:l") for
// 55-minute ones, holding a subject id from data/timetable.json. Cells on which the sources
// disagree are listed with the majority value, so each can be checked against the paper.
//
// Usage:
//   node scripts/compare-sources.mjs [--gemini <file.html>] [--legrs <js file or URL>] [--all]
// Defaults: the Gemini transcription and legrs's last hand-typed dat.js, both pinned to the
// commits before they were generated from data/timetable.json (10eed3b and c2dd43e).
// --all also prints the cells where every source agrees.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const showAll = args.includes("--all");

const ours = JSON.parse(readFileSync(new URL("../data/timetable.json", import.meta.url), "utf8"));
const SHEET_DIVISIONS = ["a", "b", "c", "o", "n", "m", "l", "k"]; // column order on the printed sheet

/* ---------- Subject names → ids ---------- */

const ALIASES = {
  国語: "ja",
  "数①": "m1",
  "数(1)": "m1",
  "数学①": "m1",
  "数②": "m2",
  "数(2)": "m2",
  "数学②": "m2",
  英語: "en",
  理基AB: "sci-ab",
  理基BC: "sci-bc",
  地理: "geo",
  "地理/政経": "geo-pol",
  "地理／政経": "geo-pol",
  日本史: "jh",
  社ABN: "soc-abn",
  社BCKL: "soc-bckl",
  生物基礎: "bio-b",
  地学基礎: "earth-b",
  化学基礎: "chem-b",
  物理: "phys",
  化学: "chem",
  生物: "bio",
  情報: "info",
  体AMO: "pe-amo",
  体BL: "pe-bl",
  体CKN: "pe-ckn",
  LHR: "lhr",
  自習: "jishu",
};
function subjectId(name) {
  const key = String(name).replace(/\s/g, "").replace(/[：:].*$/, ""); // "理基AB：化, 生, 地" → "理基AB"
  return ALIASES[key] || `?${name}`;
}
const label = (id) => (ours.subjects[id] ? ours.subjects[id].ja : id);

/* ---------- Helpers ---------- */

const iso = (md) => {
  const [m, d] = md.split(/[./]/).map(Number);
  return `${m >= 4 ? 2026 : 2027}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const block = (from, span) => (span > 1 ? `${from}-${from + span - 1}` : String(from));

// Runs a page script with a do-nothing DOM and returns the named top-level bindings.
// Rendering code may still fail on the fake DOM; the data is declared before it, and
// top-level bindings outlive the error, so they are read in a second step.
function runScript(code, names) {
  const stub = new Proxy(function () {}, {
    get: (_, prop) => (prop === Symbol.toPrimitive ? () => "1" : stub),
    set: () => true,
    apply: () => stub,
    construct: () => stub,
  });
  const context = vm.createContext({ document: stub, window: stub, console: { log() {} }, Date, Number, String, parseInt });
  try {
    vm.runInContext(code, context, { timeout: 2000 });
  } catch {
    /* only the data matters */
  }
  return vm.runInContext(`({ ${names.join(", ")} })`, context);
}

async function readText(source) {
  if (/^https?:/.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
    return res.text();
  }
  return readFileSync(source, "utf8");
}

/* ---------- Sources ---------- */

function fromOurs() {
  const cells = new Map();
  const events = new Map();
  const changed = new Set();
  for (const [date, day] of Object.entries(ours.days)) {
    if (day.event) events.set(date, day.event);
    for (const slot of day.slots || []) {
      for (const [key, id] of Object.entries(slot.cells)) {
        const k = `${date} ${block(slot.periods[0], slot.periods.length)} ${slot.by}:${key}`;
        cells.set(k, id);
        if ((slot.changed || []).includes(key)) changed.add(k);
      }
    }
  }
  return { name: "Claude (data/timetable.json)", cells, events, changed };
}

function fromGemini(html) {
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const { WEEKS } = runScript(code, ["WEEKS"]);
  const cells = new Map();
  const events = new Map();
  for (const week of WEEKS) {
    for (const day of week.days) {
      if (day.emptyDay) continue;
      const date = iso(day.d);
      for (const slot of day.slots || []) {
        const b = block(slot.s, slot.span);
        if (slot.type === "exam") events.set(date, slot.title);
        else if (slot.type === "lhr") for (let c = 1; c <= 8; c++) cells.set(`${date} ${b} class:${c}`, "lhr");
        else
          slot.data.forEach((name, i) => {
            const key = slot.type === "class" ? `class:${i + 1}` : `division:${SHEET_DIVISIONS[i]}`;
            cells.set(`${date} ${b} ${key}`, subjectId(name));
          });
      }
    }
    for (const a of week.after || []) events.set(iso(a.d.split(" ")[0]), a.title);
  }
  return { name: "Gemini (original transcription)", cells, events };
}

// Day layouts used by legrs.github.io/pre_tokuhen: per column, the subjects in slot order.
const LEGRS_LAYOUTS = {
  0: [[1, 1, "d"], [2, 2, "c"], [4, 1, "d"], [5, 2, "c"]], // Mon, Tue, Thu
  1: [[1, 2, "c"], [3, 1, "d"], [4, 1, "d"], [5, 1, "d"], [6, 1, "d"]], // Wed
  2: [[1, 1, "d"], [2, 1, "d"], [3, 1, "d"], [4, 2, "c"], [6, 1, "d"]], // Fri
};
function fromLegrs(code) {
  const { dat, classes } = runScript(code, ["dat", "classes"]);
  const cells = new Map();
  for (const day of dat) {
    const [md, type] = day[0];
    const date = iso(md);
    const layout = LEGRS_LAYOUTS[type];
    if (!layout) continue;
    for (let col = 1; col <= 8; col++) {
      layout.forEach(([from, span, kind], i) => {
        const key = kind === "c" ? `class:${col}` : `division:${SHEET_DIVISIONS[col - 1]}`;
        cells.set(`${date} ${block(from, span)} ${key}`, subjectId(classes[day[col][i]]));
      });
    }
  }
  return { name: "legrs (hand-typed)", cells, events: new Map() };
}

/* ---------- Compare ---------- */

const sources = [fromOurs()];
try {
  sources.push(fromGemini(await readText(opt("gemini", "https://raw.githubusercontent.com/igarinpiano/pre-tokuhen/10eed3b5e036e738f7883621cd087f0b62c08e9d/comparison/%E5%80%8B%E4%BA%BA%E6%99%82%E9%96%93%E5%89%B2%E8%A1%A8.html"))));
} catch (e) {
  console.error(`Skipping Gemini: ${e.message}`);
}
try {
  sources.push(fromLegrs(await readText(opt("legrs", "https://raw.githubusercontent.com/legrs/pre_tokuhen/c2dd43e80752d52c1d24a9604651d439e3137803/dat.js"))));
} catch (e) {
  console.error(`Skipping legrs: ${e.message}`);
}

const datesOf = (s) => new Set([...s.cells.keys()].map((k) => k.split(" ")[0]));
const dateSets = sources.map(datesOf);
console.log("# Timetable cross-check\n");
console.log("| Source | Dates | Cells |\n| --- | --- | --- |");
sources.forEach((s, i) => {
  const dates = [...dateSets[i]].sort();
  console.log(`| ${s.name} | ${dates.length} (${dates[0]} … ${dates[dates.length - 1]}) | ${s.cells.size} |`);
});

const keys = new Set(sources.flatMap((s) => [...s.cells.keys()]));
const rows = [];
let compared = 0;
for (const key of [...keys].sort()) {
  const date = key.split(" ")[0];
  // Only sources that cover this date take part; a source missing a cell on a covered date
  // means its period blocks differ there, which is reported too.
  const present = sources.map((s, i) => (dateSets[i].has(date) ? s.cells.get(key) ?? "(none)" : undefined));
  const voters = present.filter((v) => v !== undefined);
  if (voters.length < 2) continue;
  compared++;
  const counts = {};
  voters.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  const [majority, votes] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const agree = Object.keys(counts).length === 1;
  if (agree && !showAll) continue;
  rows.push({ key, present, majority: votes > voters.length / 2 ? majority : null, agree });
}

console.log(`\nCompared ${compared} cells covered by at least two sources.`);
const disagreements = rows.filter((r) => !r.agree);
console.log(`Disagreements: ${disagreements.length}\n`);
if (rows.length) {
  console.log(`| Date | Periods | Column | ${sources.map((s) => s.name.split(" ")[0]).join(" | ")} | Majority |`);
  console.log(`| --- | --- | --- | ${sources.map(() => "---").join(" | ")} | --- |`);
  for (const r of rows) {
    const [date, periods, column] = r.key.split(" ");
    const cells = r.present.map((v) => {
      if (v === undefined) return "";
      const text = label(v);
      return !r.agree && r.majority && v !== r.majority ? `**${text}**` : text;
    });
    const col = column.replace("class:", "Class ").replace(/division:(\w)/, (_, d) => `Div. ${d.toUpperCase()}`);
    console.log(`| ${date} | ${periods} | ${col} | ${cells.join(" | ")} | ${r.majority ? label(r.majority) : "no majority"} |`);
  }
}

/* ---------- Checks that need only one source ---------- */
// 1. Over the whole term every class gets the same number of each class-taught subject
//    (Japanese, Math, English, LHR). A single misread 120-minute cell breaks the tie.
//    Only checked for sources that cover the whole term: single weeks legitimately differ.
// 2. 55-minute (division) cells repeat every week: the same weekday, periods and division
//    normally hold the same subject. Cells that differ from the most common value are listed;
//    real changes (such as the shaded cells in the final week) show up here too.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
console.log("\n## Consistency within each source");
const fullTerm = new Set(Object.keys(ours.days).filter((d) => ours.days[d].slots));
for (const s of sources) {
  const coversTerm = [...fullTerm].every((d) => datesOf(s).has(d));
  const issues = [];
  const perClass = {};
  const pattern = {};
  for (const [key, id] of s.cells) {
    const [date, periods, column] = key.split(" ");
    if (column.startsWith("class:")) {
      const c = (perClass[column] ||= {});
      c[id] = (c[id] || 0) + 1;
    } else {
      const wd = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
      (pattern[`${wd} ${periods} ${column}`] ||= []).push([date, id, key]);
    }
  }
  const profiles = Object.entries(perClass).map(([col, c]) => [col, JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]))]);
  const common = {};
  profiles.forEach(([, p]) => (common[p] = (common[p] || 0) + 1));
  const usual = Object.entries(common).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!coversTerm) issues.push("- (Class totals not checked: this source does not cover the whole term yet.)");
  else for (const [col, p] of profiles) {
    if (p !== usual) {
      const counts = JSON.parse(p).map(([k, n]) => `${label(k)} ${n}`).join(", ");
      issues.push(`- ${col.replace("class:", "Class ")} has different totals: ${counts}`);
    }
  }
  for (const [slot, list] of Object.entries(pattern)) {
    if (list.length < 3) continue; // need a clear majority
    const counts = {};
    list.forEach(([, id]) => (counts[id] = (counts[id] || 0) + 1));
    const [mode] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    for (const [date, id, key] of list) {
      if (id === mode) continue;
      const note = s.changed?.has(key) ? " — marked as changed in the data" : "";
      issues.push(`- ${date} ${slot.replace("division:", "Div. ")}: ${label(id)} (other weeks: ${label(mode)})${note}`);
    }
  }
  console.log(`\n### ${s.name}\n`);
  console.log(issues.length ? issues.sort().join("\n") : "No issues found.");
}

// Events (mock exams, Common Test) are compared by date only.
const eventDates = new Set(sources.flatMap((s) => [...s.events.keys()]));
const eventIssues = [...eventDates].sort().filter((d) => sources.filter((s, i) => dateSets[i].size && s.events.size).some((s) => !s.events.has(d)));
if (eventIssues.length) console.log(`\nEvent dates not in every source that lists events: ${eventIssues.join(", ")}`);

process.exitCode = disagreements.length ? 1 : 0;
