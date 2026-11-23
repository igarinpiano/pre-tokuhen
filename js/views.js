// The three views: timeline (subjects × periods), week and day.
import { lang, t } from "./i18n.js";
import {
  addDays,
  formatLong,
  formatMedium,
  formatShort,
  mondayOf,
  todayISO,
  weekday,
} from "./format.js";
import { icons } from "./icons.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const periodLabel = (periods) =>
  periods.length === 1 ? String(periods[0]) : `${periods[0]}–${periods[periods.length - 1]}`;

const keyName = (model, keys, by) => {
  const label = model.keysLabel(keys, by);
  if (lang === "ja") return by === "class" ? `${label}組` : label;
  return by === "class" ? `Cl. ${label}` : label;
};

function subjectBlock(model, item, sel, { showRoom = true } = {}) {
  const l = model.label(item.subject, sel);
  return `
    <span class="subj-name">${esc(l.name)}</span>
    ${l.detail ? `<span class="subj-detail">${esc(l.detail)}</span>` : ""}
    ${showRoom && item.room ? `<span class="subj-room">${esc(t.room(item.room))}</span>` : ""}
    ${item.changed ? `<span class="badge-changed" title="${esc(t.changedNote)}">${esc(t.changed)}</span>` : ""}`;
}

function groupedList(model, resolved, by, sel) {
  return `<ul class="groups">${resolved.items
    .map((item) => {
      const l = model.label(item.subject, sel);
      return `<li class="g-${l.group}${item.changed ? " is-changed" : ""}">
        <span class="group-keys">${esc(keyName(model, item.keys, by))}</span>
        <span class="group-subj">${esc(l.name)}${item.changed ? ` <span class="badge-changed">${esc(t.changed)}</span>` : ""}</span>
      </li>`;
    })
    .join("")}</ul>`;
}

function eventCard(ev, compact = false) {
  return `<div class="event-card${compact ? " is-compact" : ""}">
    <strong class="event-title">${esc(ev[lang])}</strong>
    ${ev.note ? `<p class="event-note">${esc(ev.note[lang])}</p>` : ""}
  </div>`;
}

/* ---------------- Timeline ---------------- */

export function renderTimeline(root, ctx) {
  const { model, sel } = ctx;
  if (!sel.class || !sel.division) {
    root.innerHTML = `<div class="empty-state"><p>${esc(t.pickToSee)}</p></div>`;
    return { scrollTo() {}, destroy() {} };
  }

  const rows = model.personalSubjects(sel);
  const today = todayISO();
  const blocks = []; // {type:'day'|'event'|'gap', date|dates}
  let gap = [];
  const flushGap = () => {
    if (!gap.length) return;
    const weekdayOff = gap.some((d) => !model.isWeekend(d));
    blocks.push({ type: "gap", dates: gap, labeled: weekdayOff, long: gap.length > 5 });
    gap = [];
  };
  for (let d = model.first; d <= model.last; d = addDays(d, 1)) {
    if (!model.hasEntry(d)) {
      gap.push(d);
      continue;
    }
    flushGap();
    blocks.push({ type: model.event(d) ? "event" : "day", date: d });
  }
  flushGap();

  const cols = ["var(--label-w)"];
  let col = 2;
  for (const b of blocks) {
    b.col = col;
    if (b.type === "gap") {
      cols.push(b.labeled ? "var(--gap-wide)" : "var(--gap-thin)");
      col += 1;
    } else {
      cols.push("repeat(6, var(--pw))");
      col += 6;
    }
  }
  const lastRow = rows.length + 3;
  const rowIndex = Object.fromEntries(rows.map((id, i) => [id, i + 3]));

  const parts = [];
  parts.push(`<div class="tl-corner" style="grid-row:1/3;grid-column:1"></div>`);
  rows.forEach((id, i) => {
    const l = model.label(id, sel);
    parts.push(`<div class="tl-label g-${l.group}" style="grid-row:${i + 3};grid-column:1">
      <span class="tl-label-name">${esc(l.name)}</span>
      ${l.detail ? `<span class="tl-label-detail">${esc(l.detail)}</span>` : ""}
    </div>`);
  });

  blocks.forEach((b, bi) => {
    if (b.type === "gap") {
      const label = b.labeled ? (b.long ? t.winterBreak : t.holiday) : "";
      parts.push(`<div class="tl-gap${b.labeled ? " is-labeled" : ""}" style="grid-row:1/${lastRow};grid-column:${b.col}">
        ${label ? `<span>${esc(label)}</span>` : ""}</div>`);
      return;
    }
    const d = b.date;
    const span = `${b.col}/${b.col + 6}`;
    const isToday = d === today;
    const type = model.dayType(d);
    parts.push(`<button type="button" class="tl-date${isToday ? " is-today" : ""}" data-day="${bi}" data-date="${d}" style="grid-row:1;grid-column:${span}">
      ${esc(formatShort(d))}${type ? ` <span class="daytype">${esc(type)}</span>` : ""}</button>`);
    parts.push(`<div class="tl-bg${isToday ? " is-today" : ""}" data-day="${bi}" style="grid-row:3/${lastRow};grid-column:${span}"></div>`);

    if (b.type === "event") {
      const ev = model.event(d);
      parts.push(`<div class="tl-periods${isToday ? " is-today" : ""}" data-day="${bi}" style="grid-row:2;grid-column:${span}"></div>`);
      parts.push(`<div class="tl-event" data-day="${bi}" style="grid-row:3/${lastRow};grid-column:${span}">
        <span>${esc(ev[lang])}</span></div>`);
      return;
    }
    for (let p = 1; p <= 6; p++) {
      parts.push(`<div class="tl-period${p === 1 ? " is-first" : ""}${isToday ? " is-today" : ""}" data-day="${bi}" style="grid-row:2;grid-column:${b.col + p - 1}">${p}</div>`);
    }
    for (const slot of model.day(d).slots) {
      const r = model.resolve(slot, sel);
      const item = r.items[0];
      const row = rowIndex[item.subject];
      if (!row) continue;
      const l = model.label(item.subject, sel);
      const c0 = b.col + slot.periods[0] - 1;
      const title = `${formatMedium(d)} ${t.period(periodLabel(slot.periods))}: ${l.name}${l.detail ? ` (${l.detail})` : ""}${item.changed ? ` — ${t.changed}` : ""}`;
      parts.push(`<div class="tl-cell g-${l.group}${item.changed ? " is-changed" : ""}" data-day="${bi}" title="${esc(title)}"
        style="grid-row:${row};grid-column:${c0}/${c0 + slot.periods.length}">${esc(l.short)}</div>`);
    }
  });

  root.innerHTML = `<div class="tl-scroll" tabindex="0">
      <div class="tl-grid" style="grid-template-columns:${cols.join(" ")};grid-template-rows:var(--h1) var(--h2) repeat(${rows.length}, var(--rh))">${parts.join("")}</div>
    </div>
    <style class="tl-hover-style"></style>`;

  const scroller = root.querySelector(".tl-scroll");
  const hoverStyle = root.querySelector(".tl-hover-style");
  const headers = [...root.querySelectorAll(".tl-date")];
  let hovered = null;

  root.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-day]");
    const day = el ? el.dataset.day : null;
    if (day === hovered) return;
    hovered = day;
    hoverStyle.textContent = day === null ? "" : `.tl-grid [data-day="${day}"]{--hov:inset 0 0 0 999px var(--hover-tint)}`;
  });
  root.addEventListener("pointerleave", () => {
    hovered = null;
    hoverStyle.textContent = "";
  });
  root.addEventListener("click", (e) => {
    const h = e.target.closest(".tl-date");
    if (h) ctx.onOpenDay(h.dataset.date);
  });

  const labelWidth = () => root.querySelector(".tl-label")?.offsetWidth || 0;

  let raf = 0;
  const report = () => {
    const left = scroller.scrollLeft + labelWidth();
    const right = scroller.scrollLeft + scroller.clientWidth;
    const visible = headers.filter((h) => h.offsetLeft + h.offsetWidth * 0.5 >= left && h.offsetLeft + h.offsetWidth * 0.5 <= right);
    if (visible.length) ctx.onVisibleRange(visible[0].dataset.date, visible[visible.length - 1].dataset.date);
  };
  scroller.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(report);
  });
  const ro = new ResizeObserver(report);
  ro.observe(scroller);

  return {
    scrollTo(date, smooth = false) {
      const h = headers.find((x) => x.dataset.date >= date) || headers[headers.length - 1];
      if (!h) return;
      const target = Math.max(0, h.offsetLeft - labelWidth());
      scroller.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
      requestAnimationFrame(report);
    },
    destroy() {
      ro.disconnect();
    },
  };
}

/* ---------------- Week ---------------- */

export function weekRange(model, date) {
  const mon = mondayOf(date);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    if (d > model.last) break;
    if (i >= 5 && !model.hasEntry(d)) continue;
    days.push(d);
  }
  return days;
}

export function renderWeek(root, ctx) {
  const { model, sel, date } = ctx;
  const days = weekRange(model, date);
  const today = todayISO();
  const parts = [];
  parts.push(`<div class="wk-corner" style="grid-row:1;grid-column:1"></div>`);
  for (let p = 1; p <= 6; p++) {
    parts.push(`<div class="wk-period" style="grid-row:${p + 1};grid-column:1">${p}</div>`);
  }
  days.forEach((d, i) => {
    const c = i + 2;
    const type = model.dayType(d);
    const cls = ["wk-date"];
    if (d === today) cls.push("is-today");
    if (d === date) cls.push("is-selected");
    parts.push(`<button type="button" class="${cls.join(" ")}" data-date="${d}" style="grid-row:1;grid-column:${c}">
      <span>${esc(formatShort(d))}</span>${type ? `<span class="daytype">${esc(type)}</span>` : ""}</button>`);
    const ev = model.event(d);
    if (ev) {
      parts.push(`<div class="wk-event" style="grid-row:2/8;grid-column:${c}">${eventCard(ev, true)}</div>`);
      return;
    }
    if (!model.hasEntry(d)) {
      parts.push(`<div class="wk-off" style="grid-row:2/8;grid-column:${c}"><span>${esc(t.noClasses)}</span></div>`);
      return;
    }
    for (const slot of model.day(d).slots) {
      const r = model.resolve(slot, sel);
      const rows = `${slot.periods[0] + 1}/${slot.periods[slot.periods.length - 1] + 2}`;
      if (r.single) {
        const item = r.items[0];
        const l = model.label(item.subject, sel);
        parts.push(`<div class="wk-cell g-${l.group}${item.changed ? " is-changed" : ""}" style="grid-row:${rows};grid-column:${c}">
          ${subjectBlock(model, item, sel, { showRoom: false })}</div>`);
      } else {
        parts.push(`<div class="wk-cell is-multi" style="grid-row:${rows};grid-column:${c}">${groupedList(model, r, slot.by, sel)}</div>`);
      }
    }
  });

  const label = `${formatMedium(days[0])} – ${formatMedium(days[days.length - 1])}`;
  root.innerHTML = `
    <div class="view-head">
      <h2 class="view-title">${esc(label)}</h2>
      <div class="stepper">
        <button type="button" class="icon-btn" data-step="-1" aria-label="${esc(t.prevWeek)}" ${mondayOf(date) <= model.first ? "disabled" : ""}>${icons.left()}</button>
        <button type="button" class="icon-btn" data-step="1" aria-label="${esc(t.nextWeek)}" ${addDays(mondayOf(date), 7) > model.last ? "disabled" : ""}>${icons.right()}</button>
      </div>
    </div>
    <div class="wk-scroll">
      <div class="wk-grid" style="grid-template-columns:var(--wk-period-w) repeat(${days.length}, minmax(var(--wk-col-min), 1fr))">${parts.join("")}</div>
    </div>`;

  root.querySelector(".stepper").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    const mon = mondayOf(date);
    if (Number(b.dataset.step) > 0) {
      ctx.onSelect(model.nextEntry(addDays(mon, 7)));
    } else {
      const prev = model.prevEntry(addDays(mon, -1));
      ctx.onSelect(model.nextEntry(mondayOf(prev)));
    }
  });
  root.querySelector(".wk-grid").addEventListener("click", (e) => {
    const h = e.target.closest(".wk-date");
    if (h) ctx.onOpenDay(h.dataset.date);
  });
  return { range: [days[0], days[days.length - 1]] };
}

/* ---------------- Day ---------------- */

function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function renderDay(root, ctx) {
  const { model, sel, date } = ctx;
  const type = model.dayType(date);
  const ev = model.event(date);
  const entry = model.day(date);
  const isToday = date === todayISO();
  let body = "";

  if (ev) {
    body = eventCard(ev);
  } else if (!entry) {
    const next = model.nextEntry(date);
    body = `<div class="empty-state"><p>${esc(t.noClasses)}</p>
      ${next > date ? `<button type="button" class="text-btn" data-go="${next}">${esc(t.nextSchoolDay)}: ${esc(formatMedium(next))}</button>` : ""}</div>`;
  } else {
    const now = nowMinutes();
    body = `<ol class="day-list">${entry.slots
      .map((slot) => {
        const r = model.resolve(slot, sel);
        const times = model.times(date, slot.periods);
        const live = isToday && times && now >= toMin(times[0]) && now < toMin(times[1]);
        const pl = periodLabel(slot.periods);
        const head = `<div class="day-period">
            <span class="day-period-num">${esc(pl)}</span>
            ${times ? `<span class="day-time">${esc(times[0])}–${esc(times[1])}</span>` : ""}
            ${live ? `<span class="day-now">${esc(t.now)}</span>` : ""}
          </div>`;
        if (r.single) {
          const item = r.items[0];
          const l = model.label(item.subject, sel);
          return `<li class="day-slot g-${l.group}${item.changed ? " is-changed" : ""}${live ? " is-live" : ""}${slot.periods.length > 1 ? " is-double" : ""}"
            aria-label="${esc(t.period(pl))}">${head}<div class="day-subject">${subjectBlock(model, item, sel)}</div></li>`;
        }
        return `<li class="day-slot is-multi${live ? " is-live" : ""}${slot.periods.length > 1 ? " is-double" : ""}" aria-label="${esc(t.period(pl))}">
          ${head}<div class="day-subject">${groupedList(model, r, slot.by, sel)}</div></li>`;
      })
      .join("")}</ol>`;
  }

  root.innerHTML = `
    <div class="view-head">
      <h2 class="view-title">${esc(formatLong(date))}${type ? ` <span class="daytype">${esc(type)}</span>` : ""}${isToday ? ` <span class="today-pill">${esc(t.today)}</span>` : ""}</h2>
      <div class="stepper">
        <button type="button" class="icon-btn" data-step="-1" aria-label="${esc(t.prevDay)}" ${date <= model.first ? "disabled" : ""}>${icons.left()}</button>
        <button type="button" class="icon-btn" data-step="1" aria-label="${esc(t.nextDay)}" ${date >= model.last ? "disabled" : ""}>${icons.right()}</button>
      </div>
    </div>
    ${body}`;

  root.querySelector(".stepper").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (b) ctx.onSelect(model.stepEntry(date, Number(b.dataset.step)));
  });
  root.querySelector("[data-go]")?.addEventListener("click", (e) => ctx.onSelect(e.currentTarget.dataset.go));
  return { range: [date, date] };
}

export { weekday };
