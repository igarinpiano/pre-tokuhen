// Reads data/timetable.json and resolves it for a given class, division and electives.
import { lang } from "./i18n.js";
import { addDays, mondayOf, weekday } from "./format.js";

export class Model {
  constructor(data) {
    this.data = data;
    this.subjects = data.subjects;
    this.electives = data.electives || {};
    this.classes = data.classes;
    this.divisions = data.divisions;
    this.days = data.days;
    this.dates = Object.keys(data.days).sort();
    this.first = this.dates[0];
    this.last = this.dates[this.dates.length - 1];
    this.subjectOrder = Object.keys(this.subjects);
    this.roomByClass = {};
    this.roomByDivision = {};
    for (const col of data.columns || []) {
      this.roomByClass[col.class] = col.room;
      this.roomByDivision[col.division] = col.room;
    }
  }

  day(date) {
    return this.days[date] || null;
  }

  hasEntry(date) {
    return Boolean(this.days[date]);
  }

  event(date) {
    const d = this.days[date];
    return d && d.event ? { id: d.event, ...this.data.events[d.event] } : null;
  }

  dayType(date) {
    const d = this.days[date];
    return d && d.type ? this.data.dayTypes[d.type][lang] : null;
  }

  // First date with an entry on or after `date` (or the last date).
  nextEntry(date) {
    return this.dates.find((d) => d >= date) || this.last;
  }

  prevEntry(date) {
    return [...this.dates].reverse().find((d) => d <= date) || this.first;
  }

  // A week earlier or later: the first school day of that week, skipping weeks without school.
  stepWeek(date, dir) {
    const mon = mondayOf(date);
    return dir > 0 ? this.nextEntry(addDays(mon, 7)) : this.nextEntry(mondayOf(this.prevEntry(addDays(mon, -1))));
  }

  stepEntry(date, dir) {
    const i = this.dates.indexOf(date);
    if (i === -1) return dir > 0 ? this.nextEntry(date) : this.prevEntry(date);
    return this.dates[Math.min(this.dates.length - 1, Math.max(0, i + dir))];
  }

  name(id) {
    const s = this.subjects[id];
    return s ? s[lang] : id;
  }

  // Shorter name for tight spaces (falls back to the full name).
  abbr(id) {
    const s = this.subjects[id];
    if (!s) return id;
    return (s.abbr && s.abbr[lang]) || s[lang];
  }

  // Elective subjects (e.g. 社会BCKL) that a division actually has.
  electivesFor(division) {
    if (!division) return [];
    const found = new Set();
    for (const date of this.dates) {
      for (const slot of this.days[date].slots || []) {
        if (slot.by !== "division") continue;
        const id = slot.cells[division];
        if (this.electives[id]) found.add(id);
      }
    }
    return this.subjectOrder.filter((id) => found.has(id));
  }

  label(id, sel) {
    const s = this.subjects[id];
    if (!s) return { name: id, detail: "", short: id, group: "other" };
    let detail = s.detail ? s.detail[lang] : "";
    let detailAbbr = detail;
    let short = s.short ? s.short[lang] : s[lang];
    const chosen = sel && sel.electives ? sel.electives[id] : null;
    if (this.electives[id] && chosen && this.subjects[chosen]) {
      detail = this.subjects[chosen][lang];
      detailAbbr = this.abbr(chosen);
      short = this.subjects[chosen].short ? this.subjects[chosen].short[lang] : detail;
    }
    return {
      name: s[lang],
      abbr: this.abbr(id),
      detail,
      detailAbbr,
      short,
      group: s.group,
      combined: Boolean(s.combined),
    };
  }

  // Returns the cells of a slot that apply to the selection.
  // Single result when the class/division is chosen; otherwise grouped cells for everyone.
  resolve(slot, sel) {
    const key = slot.by === "class" ? sel.class : sel.division;
    const changed = new Set(slot.changed || []);
    if (key) {
      const id = slot.cells[key];
      return {
        single: true,
        items: [{ keys: [key], subject: id, changed: changed.has(key), room: this.room(slot, key, id) }],
      };
    }
    const order = slot.by === "class" ? this.classes : this.divisions;
    const items = [];
    for (const k of order) {
      const id = slot.cells[k];
      const prev = items[items.length - 1];
      if (prev && prev.subject === id && prev.changed === changed.has(k)) prev.keys.push(k);
      else items.push({ keys: [k], subject: id, changed: changed.has(k) });
    }
    return { single: false, items };
  }

  room(slot, key, id) {
    const s = this.subjects[id];
    if (s && s.combined) return null; // students from several divisions spread across rooms
    return slot.by === "class" ? this.roomByClass[key] : this.roomByDivision[key];
  }

  keysLabel(keys, by) {
    if (by === "class") return keys.length === 1 ? keys[0] : `${keys[0]}–${keys[keys.length - 1]}`;
    return keys.map((k) => k.toUpperCase()).join("");
  }

  // Subjects the selected student takes, in the order of data.subjects.
  personalSubjects(sel) {
    const found = new Set();
    for (const date of this.dates) {
      for (const slot of this.days[date].slots || []) {
        const key = slot.by === "class" ? sel.class : sel.division;
        if (key) found.add(slot.cells[key]);
      }
    }
    return this.subjectOrder.filter((id) => found.has(id));
  }

  // [start, end] for the given periods, or null when bell times are not published yet.
  times(date, periods) {
    const d = this.days[date];
    const bells = this.data.bells && this.data.bells[(d && d.type) || "normal"];
    if (!bells) return null;
    const a = bells[String(periods[0])];
    const b = bells[String(periods[periods.length - 1])];
    return a && b ? [a[0], b[1]] : null;
  }

  // All weekdays of the term plus weekend days that have an entry.
  calendarDays(from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  isWeekend(date) {
    const wd = weekday(date);
    return wd === 0 || wd === 6;
  }
}
