// Rewrites the timetable in comparison/個人時間割表.html from data/timetable.json.
//
//   node scripts/export-comparison.mjs [html file]      (default: comparison/個人時間割表.html)
//
// Only the data is replaced: COURSE_BASE and WEEKS in the page script, and the week tabs.
// The page's styles and rendering code stay as they are.
//
// COURSE_BASE holds the usual division (講座) cells for each weekday and period; a slot that
// differs from it lists its own cells, with `chg` marking the ones data/timetable.json marks as
// changed. Start times come from `bells` once published; until then the times already in the
// page (1/7 and 1/8) are kept, since data/timetable.json has none.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const data = JSON.parse(readFileSync(new URL("../data/timetable.json", import.meta.url), "utf8"));
const file = process.argv[2] || fileURLToPath(new URL("../comparison/個人時間割表.html", import.meta.url));
const html = readFileSync(file, "utf8");

// Names as the page writes them; anything else uses the subject's Japanese name.
const NAMES = {
  "m1": "数①",
  "m2": "数②",
  "sci-ab": "理基AB：化, 生, 地",
  "sci-bc": "理基BC：生, 地",
  "geo-pol": "地理/政経",
  "soc-abn": "社ABN",
  "soc-bckl": "社BCKL",
  "pe-amo": "体AMO",
  "pe-bl": "体BL",
  "pe-ckn": "体CKN",
};
const name = (id) => NAMES[id] || data.subjects[id]?.ja || id;
const TAGS = { a: "A特", p: "P特" };
const EVENT_KINDS = { scoring: "selfcheck" };
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const KEY_DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const columns = data.columns; // sheet order: room, class, division
const q = (v) => JSON.stringify(v);
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso, n) => new Date(dateOf(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
const dow = (iso) => dateOf(iso).getUTCDay();
const cellsOf = (slot) => columns.map((c) => name(slot.cells[slot.by === "class" ? c.class : c.division]));

// Times already in the page, by "M/D start period".
const oldTimes = new Map();
try {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dataPart = script.slice(0, script.indexOf("const classSel"));
  const ctx = vm.createContext({});
  vm.runInContext(dataPart, ctx);
  for (const w of vm.runInContext("WEEKS", ctx))
    for (const day of w.days) for (const s of day.slots || []) if ("time" in s) oldTimes.set(`${day.d} ${s.s}`, s.time);
} catch {
  /* no times to keep */
}
function timeOf(iso, day, period) {
  const bells = data.bells[day.type || "normal"];
  if (bells?.[period]) return `${bells[period][0].replace(/^0/, "")}〜`;
  return oldTimes.get(`${md(iso)} ${period}`);
}

const dates = Object.keys(data.days).sort();
const lessonDates = dates.filter((d) => data.days[d].slots?.length);
const lastLesson = lessonDates[lessonDates.length - 1];

// COURSE_BASE: the most common division cells for each weekday and period.
const counts = new Map();
for (const d of lessonDates)
  for (const s of data.days[d].slots)
    if (s.by === "division") {
      const key = `${KEY_DOW[dow(d)]}${s.periods[0]}`;
      const cells = q(cellsOf(s));
      if (!counts.has(key)) counts.set(key, new Map());
      counts.get(key).set(cells, (counts.get(key).get(cells) || 0) + 1);
    }
const base = new Map(
  [...counts]
    .sort(([a], [b]) => KEY_DOW.indexOf(a.slice(0, 3)) - KEY_DOW.indexOf(b.slice(0, 3)) || a.slice(3) - b.slice(3))
    .map(([key, m]) => [key, [...m].sort((x, y) => y[1] - x[1])[0][0]]),
);

// Weeks (Monday to Friday) holding the term's school days; days after the last lesson
// (Common Test, self-scoring) and weekend events are listed under their week instead.
const weeks = [];
for (const d of dates) {
  const monday = addDays(d, -((dow(d) + 6) % 7));
  const after = d > lastLesson || dow(d) === 0 || dow(d) === 6;
  let w = weeks.find((x) => x.monday === monday) || (after && weeks[weeks.length - 1]);
  if (!w) weeks.push((w = { monday, days: [], after: [] }));
  (after ? w.after : w.days).push(d);
}

function slotLine(iso, day, s) {
  const head = `s: ${s.periods[0]}, span: ${s.periods.length}, `;
  if (s.by === "class" && Object.values(s.cells).every((id) => id === "lhr")) return `{ ${head}type: "lhr" }`;
  const time = timeOf(iso, day, s.periods[0]);
  const type = s.by === "class" ? `type: "class",  ` : `type: "course", `;
  const timePart = time === undefined ? "" : `time: ${`${q(time)},`.padEnd(9)} `;
  if (s.by === "class") return `{ ${head}${type}${timePart}data: [${cellsOf(s).map(q).join(",")}] }`;
  const cells = cellsOf(s);
  const chg = columns.map((c, i) => ((s.changed || []).includes(c.division) ? i : -1)).filter((i) => i >= 0);
  const key = `${KEY_DOW[dow(iso)]}${s.periods[0]}`;
  const ref = base.get(key) === q(cells) && !chg.length ? `COURSE_BASE.${key}` : `[${cells.map(q).join(",")}]`;
  return `{ ${head}${type}${timePart}data: ${ref}${chg.length ? `, chg: [${chg.join(",")}]` : ""} }`;
}

const out = [];
out.push(`const COURSE_BASE = {`);
for (const [key, cells] of base) out.push(`  ${key}: [${JSON.parse(cells).map(q).join(", ")}],`);
out.push(`};`, ``, `// Each slot has start (1..6) and span (1, 2, or 6)`, `const WEEKS = [`);
weeks.forEach((w, wi) => {
  const shown = [...w.days, ...w.after];
  const range = `${md(w.days.find((d) => data.days[d]) || shown[0])}〜${md(shown[shown.length - 1])}`;
  const title = wi === weeks.length - 1 ? `最終週（第${wi + 1}週）` : `第${wi + 1}週`;
  out.push(`  {`, `    title: ${q(title)}, range: ${q(range)},`, `    days: [`);
  const lastDow = Math.max(5, ...w.days.map(dow));
  for (let i = 0; i < lastDow; i++) {
    const iso = addDays(w.monday, i);
    const day = data.days[iso];
    const head = `{ d: ${q(md(iso))}, dow: ${q(DOW[dow(iso)])}`;
    if (!day || !w.days.includes(iso)) {
      if (iso <= lastLesson) out.push(`      ${head}, emptyDay: true },`);
      continue;
    }
    const tag = TAGS[day.type] ? `, tag: ${q(TAGS[day.type])}` : "";
    out.push(`      ${head}${tag}, slots: [`);
    if (day.event) {
      const ev = data.events[day.event];
      out.push(`        { s: 1, span: 6, type: "exam", title: ${q(ev.ja)}, note: ${q(ev.note?.ja || "")} }`);
    } else for (const s of day.slots) out.push(`        ${slotLine(iso, day, s)},`);
    out.push(`      ]},`);
  }
  out.push(`    ]${w.after.length ? "," : ""}`);
  if (w.after.length) {
    out.push(`    after: [`);
    for (const iso of w.after) {
      const ev = data.events[data.days[iso].event];
      out.push(`      { d: ${q(`${md(iso)} ${DOW[dow(iso)]}`)}, title: ${q(ev.ja)}, note: ${q(ev.note?.ja || "")}, kind: ${q(EVENT_KINDS[data.days[iso].event] || "")} },`);
    }
    out.push(`    ]`);
  }
  out.push(`  }${wi < weeks.length - 1 ? "," : ""}`);
});
out.push(`];`, ``);

const start = html.indexOf("const COURSE_BASE = {");
const end = html.indexOf("const classSel");
if (start < 0 || end < start) throw new Error(`${file}: COURSE_BASE … WEEKS not found`);
let page = html.slice(0, start) + out.join("\n") + "\n" + html.slice(end);

const tabs = weeks.map((_, i) => `    <button class="w-tab" data-week="${i}">${i === weeks.length - 1 ? "最終週" : `第${i + 1}週`}</button>`);
page = page.replace(
  /(<nav class="week-tabs"[^>]*>\n)[\s\S]*?(\n  <\/nav>)/,
  (_, open, close) => `${open}    <button class="w-tab active" data-week="all">すべて</button>\n${tabs.join("\n")}${close}`,
);

writeFileSync(file, page);
console.error(`Wrote ${weeks.length} weeks to ${file}`);
