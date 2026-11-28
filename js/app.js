import { forcedLang, lang, t } from "./i18n.js";
import { config } from "./config.js";
import { icons } from "./icons.js";
import { Model } from "./model.js";
import { addDays, mondayOf, detectedCalendar, formatLong, formatMedium, formatUpdated, getCalendar, setCalendar, todayISO } from "./format.js";
import { createScrubber } from "./scrubber.js";
import { createCalendar } from "./calendar.js";
import { esc, renderDay, renderTimeline, renderWeek, weekRange } from "./views.js";
import { setupXP, xpActive } from "./xp.js";

const $ = (id) => document.getElementById(id);
const DATA_URL = "data/timetable.json";
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
// ?vimium=1: the timeline scrolls the page sideways so Vimium's h/l keys can move it.
const vimiumMode = ["1", "true", "on"].includes((new URLSearchParams(location.search).get("vimium") || "").toLowerCase());
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

let model = null;
let scrubber = null;
let calendar = null;
let timeline = null;
const state = {
  sel: { class: null, division: null, electives: {} },
  view: null,
  date: null,
  settingsOpen: null, // phones: whether the pickers are shown under the settings button
};

/* ---------- Data loading and update notice ---------- */

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

async function fetchData() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  JSON.parse(text); // reject broken files before storing them
  return text;
}

let bannerTimer = 0;
function showBanner(message, actionLabel, action, { hideAfter = 0 } = {}) {
  clearTimeout(bannerTimer);
  const b = $("update-banner");
  b.innerHTML = `<span>${esc(message)}</span>${
    actionLabel ? `<button type="button" class="banner-btn">${icons.refresh(16)}${esc(actionLabel)}</button>` : ""
  }<button type="button" class="icon-btn banner-close" aria-label="${esc(t.dismiss)}">${icons.close(16)}</button>`;
  b.hidden = false;
  b.querySelector(".banner-btn")?.addEventListener("click", () => {
    b.hidden = true;
    action();
  });
  b.querySelector(".banner-close").addEventListener("click", () => (b.hidden = true));
  if (hideAfter) bannerTimer = setTimeout(() => (b.hidden = true), hideAfter);
}

let lastCheck = 0;
async function checkForUpdate() {
  lastCheck = Date.now();
  try {
    const text = await fetchData();
    if (hash(text) === store.get("tt:hash")) return;
    showBanner(t.updateReady, t.updateApply, () => applyData(text, true));
  } catch {
    /* stay quiet; we will try again later */
  }
}

function applyData(text, keepPosition = false) {
  store.set("tt:data", text);
  store.set("tt:hash", hash(text));
  model = new Model(JSON.parse(text));
  if (!keepPosition || !state.date) state.date = defaultDate();
  build();
}

async function boot() {
  $("logo").innerHTML = icons.logo(28);
  $("app-title").textContent = t.appTitle;
  $("title-full").textContent = t.appTitle;
  $("title-short").textContent = t.appTitleShort;
  // Size changes of the header, the date button or the title text (zoom, text size, web font).
  const ro = new ResizeObserver(scheduleFit);
  for (const el of [document.querySelector(".masthead-row"), document.querySelector(".masthead-actions"), $("title-full")]) ro.observe(el);
  window.addEventListener("resize", scheduleFit);
  phoneLayout.addEventListener?.("change", scheduleFit);
  document.fonts?.ready.then(scheduleFit);
  document.title = t.appTitle;
  readSelection();

  const cached = store.get("tt:data");
  if (cached) {
    applyData(cached);
    checkForUpdate();
  } else {
    try {
      applyData(await fetchData());
    } catch {
      $("view").innerHTML = `<div class="empty-state"><p>${esc(t.loadError)}</p></div>`;
      return;
    }
  }
  // A page left open overnight (or a Home Screen app resumed the next morning) jumps to the new day.
  let shownToday = todayISO();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck > 5 * 60 * 1000) checkForUpdate();
    if (model && todayISO() !== shownToday) {
      shownToday = todayISO();
      state.date = defaultDate();
      build();
    }
  });
  if (!navigator.onLine && cached) showBanner(t.offline);
}

/* ---------- Selection and URL ---------- */

function readSelection() {
  const params = new URLSearchParams(location.search);
  const has = ["class", "division"].some((k) => params.has(k));
  let source = params;
  // A Home Screen app may lose its query string; fall back to the last saved one.
  if (!has && isStandalone && store.get("tt:query")) source = new URLSearchParams(store.get("tt:query"));
  const c = source.get("class");
  const d = (source.get("division") || "").toLowerCase();
  state.sel.class = /^[1-8]$/.test(c || "") ? c : null;
  state.sel.division = /^[abcklmno]$/.test(d) ? d : null;
  state.sel.electives = {};
  for (const [k, v] of source) {
    if (!["class", "division", "lang", "cal", "vimium", "theme"].includes(k)) state.sel.electives[k] = v.toLowerCase();
  }
}

function cleanElectives() {
  const allowed = model.electivesFor(state.sel.division);
  for (const k of Object.keys(state.sel.electives)) {
    const v = state.sel.electives[k];
    if (!allowed.includes(k) || !(model.electives[k] || []).includes(v)) delete state.sel.electives[k];
  }
}

function queryString() {
  const p = new URLSearchParams();
  if (state.sel.class) p.set("class", state.sel.class);
  if (state.sel.division) p.set("division", state.sel.division);
  for (const k of model.electivesFor(state.sel.division)) {
    if (state.sel.electives[k]) p.set(k, state.sel.electives[k]);
  }
  if (forcedLang) p.set("lang", forcedLang);
  if (vimiumMode) p.set("vimium", "1");
  if (xpActive) p.set("theme", "xp");
  // Keep a calendar the browser could not detect, so bookmarks and Home Screen apps remember it.
  if (getCalendar() !== detectedCalendar) p.set("cal", getCalendar());
  return p.toString();
}

function writeURL() {
  const q = queryString();
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
  if (q) store.set("tt:query", q);
}

function isComplete() {
  if (!state.sel.class || !state.sel.division) return false;
  return model.electivesFor(state.sel.division).every((k) => state.sel.electives[k]);
}

/* ---------- Header controls ---------- */

function selectHTML(id, label, options, value) {
  return `<label class="picker${value ? " is-set" : ""}">
    <span class="picker-label">${esc(label)}</span>
    <select id="${id}">
      <option value="">${esc(t.unset)}</option>
      ${options.map(([v, text]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(text)}</option>`).join("")}
    </select>
  </label>`;
}

// The pickers are built once and then updated in place. Rebuilding a <select> while iOS is
// closing its menu (or focusing a new one, which reopens the menu) makes iPhones pick the wrong item.
function renderPickers() {
  const s = state.sel;
  const box = $("pickers");
  if (!$("pick-class")) {
    box.innerHTML = [
      selectHTML("pick-class", t.classLabel, model.classes.map((c) => [c, t.classOption(c)]), s.class),
      selectHTML("pick-division", t.divisionLabel, model.divisions.map((d) => [d, t.divisionOption(d.toUpperCase())]), s.division),
      `<span class="pickers" id="pick-electives"></span>`,
    ].join("");
  }
  setPicker("pick-class", s.class);
  setPicker("pick-division", s.division);

  const ids = model.electivesFor(s.division);
  const holder = $("pick-electives");
  if (holder.dataset.ids !== ids.join(",")) {
    holder.dataset.ids = ids.join(",");
    holder.innerHTML = ids
      .map((id) => selectHTML(`pick-${id}`, model.abbr(id), model.electives[id].map((o) => [o, model.name(o)]), s.electives[id] || null))
      .join("");
  }
  for (const id of ids) setPicker(`pick-${id}`, s.electives[id] || null);
}

function setPicker(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.value !== (value || "")) el.value = value || "";
  el.closest(".picker").classList.toggle("is-set", Boolean(value));
}

$("pickers").addEventListener("change", (e) => {
  const id = e.target.id;
  if (id === "pick-class") updateSel({ class: e.target.value || null });
  else if (id === "pick-division") updateSel({ division: e.target.value || null });
  else if (id.startsWith("pick-")) {
    const key = id.slice(5);
    const electives = { ...state.sel.electives };
    if (e.target.value) electives[key] = e.target.value;
    else delete electives[key];
    updateSel({ electives });
  }
});

// Phones: once class and division are set, the pickers fold into one button that shows the
// current settings. Until then the pickers stay open, so first-time visitors see them.
function renderSettingsChip() {
  const chip = $("settings-chip");
  const s = state.sel;
  const ready = Boolean(s.class && s.division);
  if (!ready) state.settingsOpen = true;
  else if (state.settingsOpen === null) state.settingsOpen = false;
  chip.hidden = !ready;
  const extra = model.electivesFor(s.division).map((id) => (s.electives[id] ? model.name(s.electives[id]) : ""));
  chip.innerHTML = `${icons.settings(18)}<span class="settings-chip-text">${esc(
    t.settingsSummary(s.class, s.division && s.division.toUpperCase(), extra),
  )}</span>${icons.chevronDown(16)}`;
  chip.setAttribute("aria-label", t.settings);
  chip.setAttribute("aria-expanded", String(state.settingsOpen));
  document.documentElement.classList.toggle("settings-collapsed", !state.settingsOpen);
}

function updateSel(patch) {
  const hadPersonal = state.sel.class && state.sel.division;
  Object.assign(state.sel, patch);
  cleanElectives();
  writeURL();
  renderPickers();
  renderSettingsChip();
  renderSetupHint();
  renderShortcutButton();
  if (!hadPersonal && state.sel.class && state.sel.division && !store.get("tt:view") && wide()) state.view = "timeline";
  renderTabs();
  renderView();
  updateReport();
}

function renderSetupHint() {
  const box = $("setup-hint");
  const q = queryString();
  if (!isComplete() || isStandalone || store.get("tt:hint-dismissed") === q) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<p>${esc(t.setupDone)}</p>
    <div class="hint-actions">
      <button type="button" class="text-btn" id="copy-link">${icons.link(16)}<span>${esc(t.copyLink)}</span></button>
      <button type="button" class="icon-btn" id="hint-close" aria-label="${esc(t.dismiss)}">${icons.close(16)}</button>
    </div>`;
  $("copy-link").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(location.href);
      btn.querySelector("span").textContent = t.copied;
    } catch {
      prompt(t.copyLink, location.href);
    }
  });
  $("hint-close").addEventListener("click", () => {
    store.set("tt:hint-dismissed", q);
    box.hidden = true;
  });
}

function renderShortcutButton() {
  const btn = $("shortcut-btn");
  if (!isApple) return;
  btn.hidden = false;
  btn.innerHTML = icons.shortcut(20);
  btn.setAttribute("aria-label", t.shortcut);
  btn.title = t.shortcut;
}

/* ---------- Printing ---------- */

function selectionSummary() {
  const s = state.sel;
  const parts = [];
  if (s.class) parts.push(t.classSummary(s.class));
  if (s.division) parts.push(t.divisionSummary(s.division.toUpperCase()));
  for (const id of model.electivesFor(s.division)) {
    if (s.electives[id]) parts.push(`${model.abbr(id)} ${model.name(s.electives[id])}`);
  }
  return parts.join("　");
}

function openPrintDialog() {
  const view = state.view === "week" ? "week" : "day";
  const mon = mondayOf(state.date);
  const from = view === "week" ? model.nextEntry(mon) : state.date;
  const to = view === "week" ? model.prevEntry(addDays(mon, 6)) : state.date;
  const options = (selected) =>
    model.dates.map((d) => `<option value="${d}" ${d === selected ? "selected" : ""}>${esc(formatMedium(d))}</option>`).join("");
  const dlg = $("print-dialog");
  dlg.innerHTML = `
    <form method="dialog" class="print-form">
      <div class="sheet-head">
        <h2>${esc(t.printTitle)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${esc(t.close)}">${icons.close()}</button>
      </div>
      <p>${esc(t.printBody(view))}</p>
      <div class="print-range">
        <label class="picker"><span class="picker-label">${esc(t.printFrom)}</span><select id="print-from">${options(from)}</select></label>
        <label class="picker"><span class="picker-label">${esc(t.printTo)}</span><select id="print-to">${options(to)}</select></label>
      </div>
      <div class="sheet-actions">
        <button type="submit" class="primary-btn">${icons.print(16)}<span>${esc(t.printGo)}</span></button>
        <button type="button" class="text-btn" data-close>${esc(t.cancel)}</button>
      </div>
    </form>`;
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  dlg.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    let a = $("print-from").value;
    let b = $("print-to").value;
    if (a > b) [a, b] = [b, a];
    dlg.close();
    printRange(view, a, b);
  });
  dlg.showModal();
}

function printRange(view, from, to) {
  endPrinting();
  const area = $("print-area");
  const noop = () => {};
  const ctxFor = (date) => ({ model, sel: state.sel, date, onSelect: noop, onOpenDay: noop, onPrint: noop });
  // Every printed page is built here, with its own header, so pages never depend on where the
  // browser would break a long flow of content.
  const newPage = (cls) => {
    const page = document.createElement("section");
    page.className = `print-page ${cls}`;
    const head = document.createElement("header");
    head.className = "print-head";
    head.innerHTML = `<strong>${esc(t.appTitle)}</strong><span>${esc(selectionSummary())}</span>`;
    page.append(head);
    area.append(page);
    return page;
  };
  if (view === "week") {
    for (let mon = mondayOf(from); mon <= to; mon = addDays(mon, 7)) {
      const first = model.nextEntry(mon);
      if (first > addDays(mon, 6)) continue; // a week without school (winter break)
      const body = document.createElement("div");
      body.className = "view view-week";
      newPage("print-week").append(body);
      renderWeek(body, ctxFor(first));
      // Let the day columns shrink to the paper width instead of keeping their screen minimum.
      const grid = body.querySelector(".wk-grid");
      const days = grid.querySelectorAll(".wk-date").length;
      grid.style.gridTemplateColumns = `1.6em repeat(${days}, minmax(0, 1fr))`;
    }
  } else {
    // Days flow in one list and the browser fits as many as the sheet holds, whatever its size
    // or orientation, moving a day that would be cut to the next sheet. Each day carries a small
    // header, so every sheet starts with one.
    const flow = document.createElement("section");
    flow.className = "print-flow";
    area.append(flow);
    for (const d of model.dates.filter((x) => x >= from && x <= to)) {
      const day = document.createElement("div");
      day.className = "print-day";
      day.innerHTML = `<header class="print-head"><strong>${esc(t.appTitle)}</strong><span>${esc(selectionSummary())}</span></header>`;
      const body = document.createElement("div");
      body.className = "view view-day";
      day.append(body);
      flow.append(day);
      renderDay(body, ctxFor(d));
    }
  }
  // Week view in landscape. Printouts are always on white (see the print styles).
  $("print-page-style").textContent = `@page { size: A4 ${view === "week" ? "landscape" : "portrait"}; margin: 15mm; }`;
  document.documentElement.classList.add("printing");
  // iPhone Safari can report the print as finished before it has drawn the preview, so the
  // printout is only cleared once the user is back on the page and touches it (or prints again).
  window.addEventListener(
    "afterprint",
    () => {
      window.addEventListener("pointerdown", endPrinting, { once: true });
      window.addEventListener("keydown", endPrinting, { once: true });
    },
    { once: true },
  );
  window.print();
}

function endPrinting() {
  document.documentElement.classList.remove("printing");
  $("print-area").innerHTML = "";
  $("print-page-style").textContent = "";
}

function openShortcutDialog() {
  const dlg = $("shortcut-dialog");
  const s = state.sel;
  const rows = [
    ["class", s.class || "—"],
    ["division", s.division || "—"],
    ...model.electivesFor(s.division).map((k) => [k, s.electives[k] || "—"]),
  ];
  dlg.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(t.shortcutTitle)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="${esc(t.close)}">${icons.close()}</button>
    </div>
    <p>${esc(t.shortcutBody)}</p>
    <h3>${esc(t.shortcutSettings)}</h3>
    <dl class="kv">${rows.map(([k, v]) => `<dt><code>${esc(k)}</code></dt><dd><code>${esc(v)}</code></dd>`).join("")}</dl>
    <h3>${esc(t.shortcutData)}</h3>
    <div class="url-row">
      <code class="url">${esc(config.dataUrl)}</code>
      <button type="button" class="text-btn" data-copy-url>${icons.link(16)}<span>${esc(t.copyLink)}</span></button>
    </div>
    <div class="sheet-actions">
      ${
        config.shortcutUrl
          ? `<a class="primary-btn" href="${esc(config.shortcutUrl)}" target="_blank" rel="noopener">${esc(t.shortcutGet)}</a>`
          : `<span class="muted">${esc(t.shortcutNotYet)}</span>`
      }
      <a class="text-btn" href="${esc(config.shortcutGuide)}" target="_blank" rel="noopener">${esc(t.shortcutHowTo)}</a>
    </div>`;
  dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
  dlg.querySelector("[data-copy-url]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(config.dataUrl);
      btn.querySelector("span").textContent = t.copied;
    } catch {
      prompt(t.copyLink, config.dataUrl);
    }
  });
  dlg.showModal();
}

function renderTabs() {
  const tabs = [
    ["timeline", t.viewTimeline],
    ["week", t.viewWeek],
    ["day", t.viewDay],
  ];
  $("view-tabs").innerHTML = tabs
    .map(
      ([v, label]) =>
        `<button type="button" role="tab" data-view="${v}" aria-selected="${state.view === v}" tabindex="${state.view === v ? 0 : -1}">${esc(label)}</button>`,
    )
    .join("");
}

function updateReport() {
  const p = new URLSearchParams({ template: config.issueTemplate });
  if (state.date) p.set("date", state.date);
  if (state.sel.class) p.set("class", state.sel.class);
  if (state.sel.division) p.set("division", state.sel.division.toUpperCase());
  const a = $("report-btn");
  a.href = `${config.repo}/issues/new?${p}`;
  a.innerHTML = `${icons.flag(16)}<span class="report-text"><span>${esc(t.report)}</span><small>${esc(t.reportNote)}</small></span>`;
}

/* ---------- Views ---------- */

const wide = () => window.matchMedia("(min-width: 900px)").matches;

function defaultView() {
  const saved = store.get("tt:view");
  if (["timeline", "week", "day"].includes(saved)) return saved;
  if (!wide()) return "day";
  return state.sel.class && state.sel.division ? "timeline" : "week";
}

function defaultDate() {
  const today = todayISO();
  if (today < model.first) return model.first;
  if (today > model.last) return model.last;
  return model.nextEntry(today);
}

// Keep the title and the date button on one line: show the full title, the short one
// (前期特編) or only the logo, whichever fits. The choice is recomputed from scratch, from hidden
// copies of both titles, whenever the header or anything in it changes size (window resizes,
// browser zoom, text-size changes, the web font arriving), so it never gets stuck.
const phoneLayout = window.matchMedia("(max-width: 640px), (hover: none) and (pointer: coarse)");
function fitMasthead() {
  // On phones the Shortcut button sits next to the settings button, leaving room for the date.
  const btn = $("shortcut-btn");
  const home = phoneLayout.matches ? $("settings-row") : document.querySelector(".masthead-actions");
  if (btn.parentElement !== home) home.append(btn);

  const row = document.querySelector(".masthead-row");
  const brand = document.querySelector(".brand");
  const actions = document.querySelector(".masthead-actions");
  const gap = (el) => parseFloat(getComputedStyle(el).columnGap) || 0;
  // Measure everything with getBoundingClientRect so zoomed and unzoomed sizes never mix.
  const width = (el) => el.getBoundingClientRect().width;
  const scale = width(row) / (row.clientWidth || 1); // CSS zoom factor, if any
  const room = width(row) - width(actions) - (gap(row) + gap(brand)) * scale - width($("logo"));
  const title = $("app-title");
  const fits = (el) => el.getBoundingClientRect().width <= room + 0.5;
  if (fits($("title-full"))) {
    title.textContent = t.appTitle;
    title.hidden = false;
  } else if (fits($("title-short"))) {
    title.textContent = t.appTitleShort;
    title.hidden = false;
  } else {
    title.hidden = true; // logo only; the page title still names the site
  }
}
let fitFrame = 0;
const scheduleFit = () => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitMasthead);
};

function showDate(date) {
  $("date-btn").innerHTML = `${icons.calendar(18)}<span>${esc(formatLong(date))}</span>`;
  fitMasthead();
}

function setDate(date, { scroll = true } = {}) {
  state.date = date;
  showDate(date);
  calendar.set(date);
  updateReport();
  if (state.view === "timeline" && timeline) {
    timeline.mark(date);
    if (scroll) timeline.scrollTo(date, true);
    xpUI?.update();
  } else {
    renderView();
  }
}

function openDay(date) {
  state.view = "day";
  store.set("tt:view", "day");
  renderTabs();
  setDate(date);
}

function renderView() {
  const root = $("view");
  timeline?.destroy();
  timeline = null;
  root.className = `view view-${state.view}`;
  const ctx = {
    model,
    pageScroll: vimiumMode,
    sel: state.sel,
    date: state.date,
    onSelect: (d) => setDate(d),
    onOpenDay: (d) => openDay(d),
    onPrint: () => openPrintDialog(),
    onVisibleRange: (a, b) => {
      const sel = state.date >= a && state.date <= b ? state.date : a;
      if (sel !== state.date) {
        state.date = sel;
        showDate(sel);
        calendar.set(sel);
        updateReport();
      }
      scrubber.setRange(a, b, sel);
      timeline?.mark(sel);
      xpUI?.update();
    },
  };
  if (state.view === "timeline") {
    timeline = renderTimeline(root, ctx);
    timeline.mark?.(state.date);
    if (state.sel.class && state.sel.division) timeline.scrollTo(state.date);
    else scrubber.setRange(state.date, state.date, state.date);
  } else if (state.view === "week") {
    const { range } = renderWeek(root, ctx);
    scrubber.setRange(range[0], range[1], state.date);
  } else {
    const { range } = renderDay(root, ctx);
    scrubber.setRange(range[0], range[1], state.date);
  }
  xpUI?.update();
}

function build() {
  cleanElectives();
  if (location.search || state.sel.class) writeURL();
  if (!state.view) state.view = defaultView();

  const days = [];
  for (let d = model.first; d <= model.last; d = addDays(d, 1)) days.push(d);
  // Start from a fresh element so listeners are not attached twice after a data update.
  const old = $("scrubber");
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  scrubber = createScrubber(fresh, { model, days, onPick: (d) => setDate(d) });
  if (!calendar) {
    calendar = createCalendar($("date-btn"), $("calendar"), {
      model,
      onPick: (d) => setDate(d),
      onCalendar: (c) => {
        setCalendar(c);
        build();
        writeURL();
      },
    });
  }

  renderPickers();
  renderSettingsChip();
  renderSetupHint();
  renderShortcutButton();
  renderTabs();
  $("updated").textContent = model.data.updated ? t.updated(formatUpdated(model.data.updated)) : "";
  $("copyright").innerHTML = `© 2026 Igarin. <a href="${esc(config.repo)}/blob/main/LICENSE" target="_blank" rel="noopener">${esc(t.license)}</a>`;
  setDate(state.date, { scroll: false });
  renderView();
}

/* ---------- Global events ---------- */

const VIEWS = ["timeline", "week", "day"];
function setView(view) {
  if (!model || view === state.view) return;
  state.view = view;
  store.set("tt:view", view);
  renderTabs();
  renderView();
}
$("view-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (b) setView(b.dataset.view);
});
$("view-tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const i = VIEWS.indexOf(state.view) + (e.key === "ArrowRight" ? 1 : -1);
  const next = VIEWS[(i + VIEWS.length) % VIEWS.length];
  setView(next);
  $("view-tabs").querySelector(`[data-view="${next}"]`).focus();
});
$("shortcut-btn").addEventListener("click", openShortcutDialog);
$("settings-chip").addEventListener("click", () => {
  state.settingsOpen = !state.settingsOpen;
  renderSettingsChip();
  if (state.settingsOpen) $("pick-class")?.focus({ preventScroll: true });
});

// Keyboard: ← → move by a school day (Shift: a week) in every view; Return opens the day view
// from the week or timeline. Keys typed into controls with their own arrow handling are left alone.
document.addEventListener("keydown", (e) => {
  if (!model || !state.date || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target instanceof Element ? e.target : document.body;
  if (target.closest("input, select, textarea, [contenteditable], #scrubber, #view-tabs, #calendar, dialog")) return;
  if ($("shortcut-dialog").open || !$("calendar").hidden) return;

  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    if (state.view === "timeline" && !(state.sel.class && state.sel.division)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    setDate(e.shiftKey ? model.stepWeek(state.date, dir) : model.stepEntry(state.date, dir));
  } else if (e.key === "Enter" && state.view !== "day" && !target.closest("button, a")) {
    e.preventDefault();
    openDay(state.date);
  }
});
// Close the dialog only when a press both starts and ends on the backdrop. A text selection
// that is dragged and released over the dialog's own padding also targets the dialog element.
{
  const dlg = $("shortcut-dialog");
  const onBackdrop = (e) => {
    if (e.target !== dlg) return false;
    const r = dlg.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dlg.addEventListener("pointerdown", (e) => (pressedOutside = onBackdrop(e)));
  dlg.addEventListener("click", (e) => {
    if (pressedOutside && onBackdrop(e)) dlg.close();
    pressedOutside = false;
  });
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  // When a new version of the app takes over an open page, reload once so it runs the new code.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------- XP theme (?theme=xp) ---------- */

// What the XP skin (js/xp.js) needs from the app. "Step" is what its previous/next buttons do:
// a school day in the day view, a week in the week and timeline views.
const repeat = (date, count, fn) => {
  let d = date;
  for (let i = 0; i < count; i++) d = fn(d);
  return d;
};
const xpUI = xpActive
  ? setupXP({
      get model() {
        return model;
      },
      get state() {
        return state;
      },
      stepUnit: () => (state.view === "day" ? "day" : "week"),
      canStep(dir) {
        if (!model || !state.date) return false;
        if (state.view === "timeline") return Boolean(timeline?.canStep?.(dir));
        if (state.view === "day") return dir < 0 ? state.date > model.first : state.date < model.last;
        const mon = mondayOf(state.date);
        return dir < 0 ? mon > model.first : addDays(mon, 7) <= model.last;
      },
      stepTarget(dir, count = 1) {
        if (state.view === "timeline") return timeline?.target?.(dir, count) || null;
        if (state.view === "day") return repeat(state.date, count, (d) => model.stepEntry(d, dir));
        return repeat(state.date, count, (d) => model.stepWeek(d, dir));
      },
      step(dir, count = 1) {
        if (state.view === "timeline") timeline?.step?.(dir, count);
        else setDate(this.stepTarget(dir, count));
      },
      stepWeek(dir, count = 1) {
        if (state.view === "timeline") timeline?.step?.(dir, count);
        else setDate(repeat(state.date, count, (d) => model.stepWeek(d, dir)));
      },
      stepDay(dir, count = 1) {
        setDate(repeat(state.date, count, (d) => model.stepEntry(d, dir)));
      },
      weekEdge(dir) {
        const days = weekRange(model, state.date).filter((d) => model.hasEntry(d));
        if (days.length) setDate(dir < 0 ? days[0] : days[days.length - 1]);
      },
      go: (date) => setDate(date),
      today: () => setDate(defaultDate()),
      views: VIEWS,
      vimium: vimiumMode,
      setView,
      openDay,
      openCalendar: () => $("date-btn").click(),
      print: () => openPrintDialog(),
      async copyLink() {
        try {
          await navigator.clipboard.writeText(location.href);
          showBanner(t.copied, null, null, { hideAfter: 2500 });
        } catch {
          prompt(t.copyLink, location.href);
        }
      },
      reportUrl: () => $("report-btn").href,
      selectionSummary: () => {
        const s = state.sel;
        if (!model) return "";
        const extra = model.electivesFor(s.division).map((id) => (s.electives[id] ? model.name(s.electives[id]) : ""));
        return t.settingsSummary(s.class, s.division && s.division.toUpperCase(), extra);
      },
    })
  : null;

document.documentElement.dataset.lang = lang;
boot();
