// Writes data/timetable.json in the format of legrs.github.io/pre_tokuhen (its dat.js).
//
//   node scripts/export-legrs.mjs [output file]      (default: prints to stdout)
//
// dat.js declares, as plain top-level bindings read by its js.js:
//   koza_val  divisions in column order (column i is class i and division koza_val[i - 1])
//   color     color group per subject index (CSS variables --<group>0 / --<group>1)
//   classes   subject names; cells hold an index into this list
//   types     day layouts: per type, the lesson blocks as [first period, length, 0 = 講座 | 1 = 組]
//   dat       one entry per date: [["M.D", type, all-day event?], column 1, …, column 8],
//             where a column lists one subject index per block of its type.
//
// Subject indices and types 0–2 match the file legrs typed by hand, so its entries stay
// comparable; subjects and layouts that file doesn't have are appended.

import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../data/timetable.json", import.meta.url), "utf8"));

// The hand-typed list, in its order. [subject id, name, color group]
const SUBJECTS = [
  ["ja", "国語", "jap"],
  ["m1", "数(1)", "mat"],
  ["m2", "数(2)", "mat"],
  ["sci-ab", "理基AB", "che"],
  ["sci-bc", "理基BC", "che"],
  ["bio-b", "生物基礎", "che"],
  ["earth-b", "地学基礎", "che"],
  ["phys", "物理", "phy"],
  ["chem", "化学", "che"],
  ["bio", "生物", "phy"],
  ["soc-abn", "社ABN", "geo"],
  ["soc-bckl", "社BCKL", "geo"],
  ["geo", "地理", "geo"],
  ["geo-pol", "地理/政経", "geo"],
  ["jh", "日本史", "his"],
  ["en", "英語", "eng"],
  ["info", "情報", "inf"],
  ["pe-amo", "体AMO", "pe"],
  ["pe-ckn", "体CKN", "pe"],
  ["pe-bl", "体BL", "pe"],
  ["shr", "SHR", "shr"], // not in timetable.json; js.js adds it after the third period
  ["lhr", "LHR", "lhr"],
  ["jishu", "自習", "jishu"],
];
const GROUP_COLORS = { kokugo: "jap", math: "mat", english: "eng", social: "geo", science: "che", info: "inf", pe: "pe" };

const index = new Map(SUBJECTS.map(([id], i) => [id, i]));
function subjectIndex(id) {
  if (!index.has(id)) {
    const s = data.subjects[id];
    if (!s) throw new Error(`Unknown subject "${id}"`);
    index.set(id, SUBJECTS.length);
    SUBJECTS.push([id, s.ja, GROUP_COLORS[s.group] || s.group || id]);
  }
  return index.get(id);
}

// [first period, length, 0 = by division (講座), 1 = by class (組)]
const TYPES = [
  { note: "1,23,4,56 (most typical)", blocks: [[1, 1, 0], [2, 2, 1], [4, 1, 0], [5, 2, 1]] },
  { note: "12,3,4,5,6 (wed)", blocks: [[1, 2, 1], [3, 1, 0], [4, 1, 0], [5, 1, 0], [6, 1, 0]] },
  { note: "1,2,3,45,6 (fri)", blocks: [[1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 2, 1], [6, 1, 0]] },
  { note: "12,3,4,56 (午前特)", blocks: [[1, 2, 1], [3, 1, 1], [4, 1, 0], [5, 2, 1]] },
  { note: "1,2,3,45,6 with 6 by class (午後特)", blocks: [[1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 2, 1], [6, 1, 1]] },
  { note: "12,3 (午前特, last day)", blocks: [[1, 2, 1], [3, 1, 1]] },
  { note: "all-day event, no lessons", blocks: [] },
];
const sig = (blocks) => JSON.stringify(blocks);
function typeOf(blocks) {
  let t = TYPES.findIndex((type) => sig(type.blocks) === sig(blocks));
  if (t < 0) t = TYPES.push({ note: "added by export-legrs.mjs", blocks }) - 1;
  return t;
}

const columns = data.columns; // [{class: "1", division: "a"}, …] in the sheet's order
const md = (iso) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

const days = Object.entries(data.days)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, day]) => {
    const slots = day.slots || [];
    const blocks = slots.map((s) => [s.periods[0], s.periods.length, s.by === "class" ? 1 : 0]);
    const header = [md(date), typeOf(blocks)];
    if (day.event) header.push(data.events[day.event].ja);
    const cols = columns.map((col) =>
      slots.map((s) => {
        const id = s.cells[s.by === "class" ? col.class : col.division];
        if (id === undefined) throw new Error(`${date} ${s.periods}: no cell for ${s.by} ${col[s.by]}`);
        return subjectIndex(id);
      }),
    );
    return { header, cols };
  });

/* ---------- Output ---------- */

const q = (s) => JSON.stringify(s);
const pad = (s, n) => s + " ".repeat(Math.max(1, n - s.length));
const out = [];
out.push(`// Generated from ${data.title.ja} (data/timetable.json, updated ${data.updated})`);
out.push(`// by https://github.com/igarinpiano/pre-tokuhen/blob/main/scripts/export-legrs.mjs`);
out.push(`let koza_val=[\n${columns.map((c) => q(c.division)).join(",\n")}\n]`);
out.push(`let color=[\n${SUBJECTS.map(([, , c], i) => pad(`${q(c)},`, 10) + `//${i}`).join("\n")}\n]`);
out.push(
  `/*\ntype:\n${TYPES.map((t, i) => `${i}: ${t.note}`).join("\n")}\n*/\nconst types=[\n` +
    TYPES.map((t, i) => pad(`    ${q(t.blocks)},`, 56) + `//${i}`).join("\n") +
    `\n]`,
);
out.push(`let classes = [\n${SUBJECTS.map(([, name], i) => pad(`${q(name)},`, 12) + `//${i}`).join("\n")}\n]`);
out.push(
  `const dat=[\n` +
    days
      .map(({ header, cols }) => {
        const rows = [`        ${q(header)}, //header`];
        if (cols[0].length)
          cols.forEach((c, i) => rows.push(pad(`        ${q(c)},`, 32) + `//${columns[i].class}/${columns[i].division.toUpperCase()}`));
        return `    [\n${rows.join("\n")}\n    ],`;
      })
      .join("\n") +
    `\n]\n`,
);

const text = out.join("\n");
const file = process.argv[2];
if (file) {
  writeFileSync(file, text);
  console.error(`Wrote ${days.length} days to ${file}`);
} else process.stdout.write(text);
