import { forcedLang, lang, t } from "./i18n.js";
import { config } from "./config.js";
import { icons } from "./icons.js";
import { Model } from "./model.js";
import { addDays, detectedCalendar, formatLong, formatUpdated, getCalendar, setCalendar, todayISO } from "./format.js";
import { createScrubber } from "./scrubber.js";
import { createCalendar } from "./calendar.js";
import { esc, renderDay, renderTimeline, renderWeek } from "./views.js";

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

function showBanner(message, actionLabel, action) {
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > 5 * 60 * 1000) checkForUpdate();
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
    if (!["class", "division", "lang", "cal", "vimium"].includes(k)) state.sel.electives[k] = v.toLowerCase();
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

function updateSel(patch) {
  const hadPersonal = state.sel.class && state.sel.division;
  Object.assign(state.sel, patch);
  cleanElectives();
  writeURL();
  renderPickers();
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

function setDate(date, { scroll = true } = {}) {
  state.date = date;
  $("date-btn").innerHTML = `${icons.calendar(18)}<span>${esc(formatLong(date))}</span>`;
  calendar.set(date);
  updateReport();
  if (state.view === "timeline" && timeline) {
    if (scroll) timeline.scrollTo(date, true);
  } else {
    renderView();
  }
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
    onOpenDay: (d) => {
      state.view = "day";
      store.set("tt:view", "day");
      renderTabs();
      setDate(d);
    },
    onVisibleRange: (a, b) => {
      const sel = state.date >= a && state.date <= b ? state.date : a;
      if (sel !== state.date) {
        state.date = sel;
        $("date-btn").innerHTML = `${icons.calendar(18)}<span>${esc(formatLong(sel))}</span>`;
        calendar.set(sel);
        updateReport();
      }
      scrubber.setRange(a, b, sel);
    },
  };
  if (state.view === "timeline") {
    timeline = renderTimeline(root, ctx);
    if (state.sel.class && state.sel.division) timeline.scrollTo(state.date);
    else scrubber.setRange(state.date, state.date, state.date);
  } else if (state.view === "week") {
    const { range } = renderWeek(root, ctx);
    scrubber.setRange(range[0], range[1], state.date);
  } else {
    const { range } = renderDay(root, ctx);
    scrubber.setRange(range[0], range[1], state.date);
  }
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
  renderSetupHint();
  renderShortcutButton();
  renderTabs();
  $("updated").textContent = model.data.updated ? t.updated(formatUpdated(model.data.updated)) : "";
  $("copyright").innerHTML = `© 2026 Igarin. <a href="${esc(config.repo)}/blob/main/LICENSE" target="_blank" rel="noopener">${esc(t.license)}</a>`;
  setDate(state.date, { scroll: false });
  renderView();
}

/* ---------- Global events ---------- */

$("view-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (!b || b.dataset.view === state.view) return;
  state.view = b.dataset.view;
  store.set("tt:view", state.view);
  renderTabs();
  renderView();
});
$("view-tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const order = ["timeline", "week", "day"];
  const i = order.indexOf(state.view) + (e.key === "ArrowRight" ? 1 : -1);
  const next = order[(i + order.length) % order.length];
  state.view = next;
  store.set("tt:view", next);
  renderTabs();
  renderView();
  $("view-tabs").querySelector(`[data-view="${next}"]`).focus();
});
$("shortcut-btn").addEventListener("click", openShortcutDialog);
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

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

document.documentElement.dataset.lang = lang;
boot();
