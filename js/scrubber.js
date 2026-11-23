// The Time Machine-like strip: one tick per calendar day. Ticks near the pointer
// rise along a bell curve; the range on screen and today are colored.
import { lang, t } from "./i18n.js";
import { daysBetween, formatMedium, formatMonth, parseISO, todayISO } from "./format.js";

export function createScrubber(root, { model, days, onPick }) {
  const n = days.length;
  const today = todayISO();
  const nearestEntry = (date) => {
    let best = model.dates[0];
    let bestDist = Infinity;
    for (const d of model.dates) {
      const dist = Math.abs(daysBetween(date, d));
      if (dist < bestDist || (dist === bestDist && d > best)) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  };

  const kindOf = (date) => {
    if (model.event(date)) return "event";
    if (model.hasEntry(date)) return "school";
    return "off";
  };

  root.innerHTML = `
    <div class="scrub-bubble" aria-hidden="true" hidden></div>
    ${days.includes(today) ? `<span class="scrub-today" aria-hidden="true" style="left:${((days.indexOf(today) + 0.5) / n) * 100}%">${t.today}</span>` : ""}
    <div class="scrub-track">
      <div class="scrub-range"></div>
      ${days
        .map((d, i) => {
          const cls = ["tick", `tick-${kindOf(d)}`];
          if (d === today) cls.push("tick-today");
          if (parseISO(d).getDay() === 1) cls.push("tick-monday");
          return `<span class="${cls.join(" ")}" data-i="${i}"></span>`;
        })
        .join("")}
    </div>
    <div class="scrub-labels" aria-hidden="true">
      ${days
        .map((d, i) => {
          const nextStart = days.findIndex((x, j) => j > 0 && parseISO(x).getDate() === 1);
          const isMonthStart = (i === 0 && (nextStart === -1 || nextStart > 4)) || (i > 0 && parseISO(d).getDate() === 1);
          const parts = [];
          if (isMonthStart) parts.push(`<span class="scrub-month" style="left:${((i + 0.5) / n) * 100}%">${formatMonth(d)}</span>`);
          return parts.join("");
        })
        .join("")}
    </div>`;

  root.setAttribute("role", "slider");
  root.setAttribute("tabindex", "0");
  root.setAttribute("aria-label", t.pickDate);

  const track = root.querySelector(".scrub-track");
  const ticks = [...root.querySelectorAll(".tick")];
  const bubble = root.querySelector(".scrub-bubble");
  const range = root.querySelector(".scrub-range");
  let selected = null;
  let dragging = false;
  let lastPicked = null;
  let raf = 0;

  const indexAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * n - 0.5;
  };

  const describe = (date) => {
    const ev = model.event(date);
    if (ev) return `${formatMedium(date)} · ${ev[lang]}`;
    return formatMedium(date);
  };

  function swell(pos) {
    const sigma = Math.max(1.4, n / 34);
    ticks.forEach((tick, i) => {
      const d = i - pos;
      const s = 1 + 1.5 * Math.exp(-(d * d) / (2 * sigma * sigma));
      tick.style.setProperty("--s", s.toFixed(3));
    });
    const i = Math.max(0, Math.min(n - 1, Math.round(pos)));
    ticks.forEach((tick, j) => tick.classList.toggle("is-hover", j === i));
    bubble.hidden = false;
    bubble.textContent = describe(days[i]);
    const r = track.getBoundingClientRect();
    const rootR = root.getBoundingClientRect();
    const x = r.left - rootR.left + ((i + 0.5) / n) * r.width;
    const w = bubble.offsetWidth;
    const clamped = Math.max(w / 2, Math.min(rootR.width - w / 2, x));
    bubble.style.left = `${clamped}px`;
    bubble.style.setProperty("--tail", `${x - clamped}px`);
  }

  function settle() {
    ticks.forEach((tick) => {
      tick.style.removeProperty("--s");
      tick.classList.remove("is-hover");
    });
    bubble.hidden = true;
  }

  function pickAt(clientX) {
    const i = Math.max(0, Math.min(n - 1, Math.round(indexAt(clientX))));
    const date = nearestEntry(days[i]);
    if (date !== lastPicked) {
      lastPicked = date;
      onPick(date);
    }
  }

  root.addEventListener("pointermove", (e) => {
    const x = e.clientX;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      swell(indexAt(x));
      if (dragging) pickAt(x);
    });
  });
  root.addEventListener("pointerdown", (e) => {
    // Keyboard tools such as Vimium send synthetic clicks without a position.
    // Focus the strip instead, so the arrow keys move through the days.
    if (!e.isTrusted || !(e instanceof PointerEvent)) {
      root.focus();
      return;
    }
    dragging = true;
    lastPicked = null;
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    pickAt(e.clientX);
  });
  const end = () => {
    dragging = false;
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", () => {
    end();
    settle();
  });
  root.addEventListener("pointerleave", () => {
    if (!dragging) settle();
  });
  root.addEventListener("lostpointercapture", (e) => {
    end();
    if (e.pointerType !== "mouse") settle();
  });

  root.addEventListener("keydown", (e) => {
    if (!selected) return;
    let next = null;
    if (e.key === "ArrowLeft") next = model.stepEntry(selected, -1);
    else if (e.key === "ArrowRight") next = model.stepEntry(selected, 1);
    else if (e.key === "Home") next = model.first;
    else if (e.key === "End") next = model.last;
    if (next) {
      e.preventDefault();
      onPick(next);
    }
  });

  return {
    // Highlight the dates currently shown in the view.
    setRange(start, end, sel) {
      selected = sel;
      const a = Math.max(0, daysBetween(days[0], start));
      const b = Math.min(n - 1, daysBetween(days[0], end));
      range.style.left = `${(a / n) * 100}%`;
      range.style.width = `${((b - a + 1) / n) * 100}%`;
      ticks.forEach((tick, i) => tick.classList.toggle("in-range", i >= a && i <= b));
      root.setAttribute("aria-valuetext", formatMedium(sel));
    },
  };
}
