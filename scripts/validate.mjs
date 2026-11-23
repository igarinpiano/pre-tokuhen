// Validates data/timetable.json. Run with: node scripts/validate.mjs
import { readFileSync } from "node:fs";

const path = new URL("../data/timetable.json", import.meta.url);
const errors = [];
const fail = (msg) => errors.push(msg);

let data;
try {
  data = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`timetable.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const classes = data.classes ?? [];
const divisions = data.divisions ?? [];
const subjects = data.subjects ?? {};
const events = data.events ?? {};
const dayTypes = data.dayTypes ?? {};
const timeRe = /^\d{2}:\d{2}$/;

for (const [id, s] of Object.entries(subjects)) {
  if (!s.ja || !s.en) fail(`subject "${id}": needs both "ja" and "en" names`);
}

for (const [id, options] of Object.entries(data.electives ?? {})) {
  if (!subjects[id]) fail(`electives: "${id}" is not a subject`);
  for (const o of options) if (!subjects[o]) fail(`electives.${id}: option "${o}" is not a subject`);
}

for (const [type, bells] of Object.entries(data.bells ?? {})) {
  if (bells === null) continue;
  for (const [p, range] of Object.entries(bells)) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every((t) => timeRe.test(t))) {
      fail(`bells.${type}.${p}: expected ["HH:MM", "HH:MM"]`);
    }
  }
}

let prev = "";
for (const [date, day] of Object.entries(data.days ?? {})) {
  const where = `days.${date}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail(`${where}: bad date key`);
  if (date <= prev) fail(`${where}: dates must be in ascending order`);
  prev = date;

  if (day.event !== undefined) {
    if (!events[day.event]) fail(`${where}: unknown event "${day.event}"`);
    continue;
  }
  if (day.type !== undefined && !dayTypes[day.type]) fail(`${where}: unknown day type "${day.type}"`);
  if (!Array.isArray(day.slots) || day.slots.length === 0) {
    fail(`${where}: needs "slots" or "event"`);
    continue;
  }

  const used = new Set();
  day.slots.forEach((slot, i) => {
    const at = `${where}.slots[${i}]`;
    const periods = slot.periods ?? [];
    if (!periods.length || !periods.every((p) => Number.isInteger(p) && p >= 1 && p <= 6)) {
      fail(`${at}: "periods" must list numbers 1-6`);
    }
    for (let j = 1; j < periods.length; j++) {
      if (periods[j] !== periods[j - 1] + 1) fail(`${at}: periods must be consecutive`);
    }
    for (const p of periods) {
      if (used.has(p)) fail(`${at}: period ${p} appears twice in the day`);
      used.add(p);
    }
    const keys = slot.by === "class" ? classes : slot.by === "division" ? divisions : null;
    if (!keys) {
      fail(`${at}: "by" must be "class" or "division"`);
      return;
    }
    const cells = slot.cells ?? {};
    for (const k of keys) {
      if (!(k in cells)) fail(`${at}: missing cell "${k}"`);
      else if (!subjects[cells[k]]) fail(`${at}: cell "${k}" has unknown subject "${cells[k]}"`);
    }
    for (const k of Object.keys(cells)) if (!keys.includes(k)) fail(`${at}: unexpected cell "${k}"`);
    for (const k of slot.changed ?? []) if (!keys.includes(k)) fail(`${at}: "changed" lists unknown key "${k}"`);
  });
}

if (errors.length) {
  console.error(`Found ${errors.length} problem(s) in timetable.json:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`timetable.json OK (${Object.keys(data.days).length} days)`);
