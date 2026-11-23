// Date picker popover: one small month grid per month of the term.
import { t } from "./i18n.js";
import { addDays, formatDayNum, formatLong, formatMonthYear, formatWeekdayNarrow, parseISO, toISO, todayISO } from "./format.js";
import { esc } from "./views.js";

export function createCalendar(button, popover, { model, onPick }) {
  let open = false;
  let current = null;

  function render() {
    const today = todayISO();
    const start = parseISO(model.first);
    const end = parseISO(model.last);
    const months = [];
    for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      months.push(new Date(m));
    }
    // Weekday header from a known Sunday.
    const heads = Array.from({ length: 7 }, (_, i) => formatWeekdayNarrow(addDays("2026-11-29", i)));
    popover.innerHTML = months
      .map((m) => {
        const first = toISO(m);
        const lead = m.getDay();
        const daysIn = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < lead; i++) cells.push(`<span></span>`);
        for (let d = 1; d <= daysIn; d++) {
          const iso = toISO(new Date(m.getFullYear(), m.getMonth(), d));
          const has = model.hasEntry(iso);
          const cls = ["cal-day"];
          if (model.event(iso)) cls.push("is-event");
          if (iso === today) cls.push("is-today");
          if (iso === current) cls.push("is-selected");
          cells.push(
            has
              ? `<button type="button" class="${cls.join(" ")}" data-date="${iso}" aria-label="${esc(formatLong(iso))}" ${iso === current ? 'aria-current="date"' : ""}>${formatDayNum(iso)}</button>`
              : `<span class="${cls.join(" ")} is-off">${formatDayNum(iso)}</span>`,
          );
        }
        return `<section class="cal-month">
          <h3>${esc(formatMonthYear(first))}</h3>
          <div class="cal-grid">${heads.map((h) => `<span class="cal-head">${esc(h)}</span>`).join("")}${cells.join("")}</div>
        </section>`;
      })
      .join("");
  }

  function show() {
    render();
    popover.hidden = false;
    open = true;
    button.setAttribute("aria-expanded", "true");
    (popover.querySelector(".is-selected") || popover.querySelector("button"))?.focus();
  }
  function hide(focusButton = false) {
    popover.hidden = true;
    open = false;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  }

  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", t.pickDate);
  button.addEventListener("click", () => (open ? hide() : show()));
  popover.addEventListener("click", (e) => {
    const b = e.target.closest("[data-date]");
    if (!b) return;
    onPick(b.dataset.date);
    hide(true);
  });
  document.addEventListener("pointerdown", (e) => {
    if (open && !popover.contains(e.target) && !button.contains(e.target)) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (open && e.key === "Escape") hide(true);
  });

  return {
    set(date) {
      current = date;
      if (open) render();
    },
  };
}
