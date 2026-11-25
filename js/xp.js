// Windows XP-style skin, used only with ?theme=xp (index.html sets html.xp before anything draws).
// It wraps the regular page in a window with a menu bar, a task pane and a status bar, replaces
// the date strip with a taskbar of two full-width previous/next buttons, adds Vim-style keys and,
// on phones, turns each sideways swipe over the week or day timetable into one step back or
// forward.
import { t } from "./i18n.js";
import { formatLong, formatMedium, todayISO } from "./format.js";
import { icons } from "./icons.js";
import { esc } from "./views.js";

export const xpActive = document.documentElement.classList.contains("xp");

const $ = (id) => document.getElementById(id);
const phone = window.matchMedia("(max-width: 640px), (hover: none) and (pointer: coarse)");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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

const svg = (body, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" class="icon">${body}</svg>`;
const xpIcons = {
  close: svg(`<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="square"/>`, 13),
  max: svg(`<rect x="3" y="3" width="10" height="10" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M3 4h10" stroke="#fff" stroke-width="2.6"/>`, 13),
  restore: svg(
    `<rect x="5.5" y="2.5" width="8" height="7" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M5.5 3.2h8" stroke="#fff" stroke-width="1.8"/><rect x="2.5" y="6.5" width="8" height="7" fill="#2a5fe0" stroke="#fff" stroke-width="1.2"/><path d="M2.5 7.2h8" stroke="#fff" stroke-width="1.8"/>`,
    13,
  ),
  back: svg(`<path d="M9.5 3.5L5 8l4.5 4.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`, 16),
  forward: svg(`<path d="M6.5 3.5L11 8l-4.5 4.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`, 16),
  chevron: svg(`<path d="M4.5 4l3.5 3.5L11.5 4M4.5 8.5L8 12l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5"/>`, 12),
  today: svg(
    `<rect x="1.5" y="2.5" width="13" height="12" rx="1" fill="#fff" stroke="#3a6bc7"/><rect x="1.5" y="2.5" width="13" height="3.5" fill="#3a6bc7"/><rect x="6" y="8" width="4" height="4" fill="#e3462b"/>`,
  ),
  print: svg(
    `<rect x="4" y="1.5" width="8" height="5" fill="#fff" stroke="#555"/><rect x="1.5" y="6" width="13" height="6" rx="1" fill="#c9c6b8" stroke="#555"/><rect x="4" y="10" width="8" height="4.5" fill="#fff" stroke="#555"/><circle cx="12.5" cy="8" r=".8" fill="#2fa83a"/>`,
  ),
  link: svg(
    `<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5L8.6 3.9M9 7a2.5 2.5 0 0 0-3.5 0L3 9.5A2.5 2.5 0 0 0 6.5 13l.9-.9" fill="none" stroke="#3a6bc7" stroke-width="1.6" stroke-linecap="round"/>`,
  ),
  report: svg(`<path d="M3.5 15V2" stroke="#555" stroke-width="1.4"/><path d="M4 2.5h9l-2 3 2 3H4z" fill="#e3462b" stroke="#a52a16"/>`),
  keys: svg(
    `<rect x=".5" y="3.5" width="15" height="9" rx="1.5" fill="#fff" stroke="#666"/><path d="M3 6.5h1.5M5.75 6.5h1.5M8.5 6.5H10M11.5 6.5H13M4 9.5h8" stroke="#666" stroke-width="1.4"/>`,
  ),
  leave: svg(`<rect x="2" y="2" width="12" height="12" rx="2" fill="#fff" stroke="#3a6bc7"/><path d="M5 8h6M8 5l-3 3 3 3" fill="none" stroke="#3a6bc7" stroke-width="1.5"/>`),
};

/* ---------- Window chrome ---------- */

function wrap() {
  const body = document.body;
  const masthead = document.querySelector(".masthead");
  const view = $("view");
  const foot = document.querySelector(".foot");

  const desktop = document.createElement("div");
  desktop.className = "xp-desktop";
  const win = document.createElement("div");
  win.className = "xp-window";
  win.innerHTML = `
    <div class="xp-titlebar">
      <span class="xp-title-icon">${icons.logo(16)}</span>
      <span class="xp-title-text" id="xp-title">${esc(t.appTitle)}</span>
      <span class="xp-title-buttons">
        <button type="button" class="xp-tb xp-tb-max" id="xp-max"></button>
        <button type="button" class="xp-tb xp-tb-close" id="xp-leave" aria-label="${esc(t.xpLeave)}" title="${esc(t.xpLeave)}">${xpIcons.close}</button>
      </span>
    </div>
    <div class="xp-menubar" id="xp-menubar" role="menubar"></div>`;
  win.append(masthead);

  const main = document.createElement("div");
  main.className = "xp-body";
  main.innerHTML = `<aside class="xp-taskpane" id="xp-taskpane"></aside><div class="xp-main" id="xp-main"></div>`;
  main.querySelector(".xp-main").append(view);
  win.append(main, foot);
  desktop.append(win);

  const taskbar = document.createElement("nav");
  taskbar.className = "xp-taskbar";
  taskbar.id = "xp-taskbar";
  taskbar.setAttribute("aria-label", t.xpNav);
  taskbar.innerHTML = [-1, 1]
    .map(
      (dir) => `<button type="button" class="xp-task-btn" data-dir="${dir}">
        <span class="xp-go">${dir < 0 ? xpIcons.back : xpIcons.forward}</span>
        <span class="xp-task-text"><span class="xp-task-label"></span><small class="xp-task-sub"></small></span>
        <kbd>${dir < 0 ? "h" : "l"}</kbd>
      </button>`,
    )
    .join("");

  const banner = $("update-banner");
  banner.after(desktop, taskbar);

  // The view tabs join the date button on the toolbar row.
  const toolbar = masthead.querySelector(".masthead-row");
  toolbar.insertBefore(masthead.querySelector(".nav-row"), toolbar.querySelector(".masthead-actions"));
  // An "address bar" label in front of the pickers.
  const label = document.createElement("span");
  label.className = "xp-addr-label";
  label.textContent = t.xpSettings;
  masthead.querySelector(".controls").prepend(label);

  // Status bar: a pane for typed Vim counts and a hint for the key list.
  foot.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="xp-status-keys" data-act="help">${esc(t.xpKeysHint)}</button><span class="xp-showcmd" id="xp-showcmd" aria-live="polite"></span>`,
  );

  // Phone status bars take the title bar's blue.
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#0a5ae8";
  document.head.append(meta);
  body.classList.add("xp-ready");
}

/* ---------- Setup ---------- */

export function setupXP(app) {
  // ?vimium=1: the page itself scrolls (down and, in the timeline, sideways) instead of the
  // window's content area, because Vimium's h/j/k/l only move the page and vertical areas.
  const flow = Boolean(app.vimium);
  document.documentElement.classList.toggle("xp-flow", flow);
  wrap();
  const scroller = flow ? window : $("xp-main");
  const view = $("view");

  /* Maximize (wide screens) and leaving the theme */
  const maxBtn = $("xp-max");
  const setMax = (on) => {
    document.documentElement.classList.toggle("xp-max", on);
    maxBtn.innerHTML = on ? xpIcons.restore : xpIcons.max;
    const label = on ? t.xpRestore : t.xpMaximize;
    maxBtn.setAttribute("aria-label", label);
    maxBtn.title = label;
  };
  setMax(store.get("tt:xp-max") === "1");
  maxBtn.addEventListener("click", () => {
    const on = !document.documentElement.classList.contains("xp-max");
    store.set("tt:xp-max", on ? "1" : "0");
    setMax(on);
  });
  document.querySelector(".xp-titlebar").addEventListener("dblclick", (e) => {
    if (!e.target.closest("button") && !phone.matches) maxBtn.click();
  });
  const leave = () => {
    const p = new URLSearchParams(location.search);
    p.delete("theme");
    const q = p.toString();
    location.href = q ? `?${q}` : location.pathname;
  };
  $("xp-leave").addEventListener("click", leave);

  /* Taskbar */
  const taskbar = $("xp-taskbar");
  taskbar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dir]");
    if (b && !b.disabled) app.step(Number(b.dataset.dir));
  });

  /* Actions shared by the menus, the task pane and the keys */
  const actions = {
    today: () => app.today(),
    print: () => app.print(),
    copy: () => app.copyLink(),
    report: () => window.open(app.reportUrl(), "_blank", "noopener"),
    help: () => openHelp(),
    leave,
    prev: (n) => app.step(-1, n),
    next: (n) => app.step(1, n),
    prevWeek: (n) => app.stepWeek(-1, n),
    nextWeek: (n) => app.stepWeek(1, n),
    prevDay: (n) => app.stepDay(-1, n),
    nextDay: (n) => app.stepDay(1, n),
    weekStart: () => app.weekEdge(-1),
    weekEnd: () => app.weekEdge(1),
    first: () => app.go(app.model.first),
    last: () => app.go(app.model.last),
    date: () => app.openCalendar(),
    down: (n) => scroll(n),
    up: (n) => scroll(-n),
    nextView: (n) => cycleView(n),
    prevView: (n) => cycleView(-n),
    open: () => app.state.view !== "day" && app.openDay(app.state.date),
    view: (v) => app.setView(v),
  };
  const scroll = (n) => scroller.scrollBy({ top: n * 72, behavior: reduceMotion.matches ? "auto" : "smooth" });
  const cycleView = (n) => {
    const v = app.views;
    const i = v.indexOf(app.state.view);
    app.setView(v[(((i + n) % v.length) + v.length) % v.length]);
  };
  const stepWords = () =>
    app.stepUnit() === "day" ? [t.prevDay, t.nextDay] : [t.prevWeek, t.nextWeek];

  // The key list, used by the menus and the help window.
  const keyList = () => {
    const [prev, next] = stepWords();
    return [
      ["h", prev, "prev"],
      ["l", next, "next"],
      ["H", t.prevWeek, "prevWeek"],
      ["L", t.nextWeek, "nextWeek"],
      ["b", t.xpPrevSchoolDay, "prevDay"],
      ["w", t.xpNextSchoolDay, "nextDay"],
      ["0", t.xpWeekStart, "weekStart"],
      ["$", t.xpWeekEnd, "weekEnd"],
      ["t", t.today, "today"],
      ["gg", t.xpFirstDay, "first"],
      ["G", t.xpLastDay, "last"],
      ["/", t.xpGoToDate, "date"],
      ["j", t.xpScrollDown, "down"],
      ["k", t.xpScrollUp, "up"],
      ["gt", t.xpNextView, "nextView"],
      ["gT", t.xpPrevView, "prevView"],
      ["o / Enter", t.xpOpenDay, "open"],
      ["?", t.xpKeys, "help"],
      ["Esc", t.xpCancel, null],
    ];
  };
  const keyOf = (act) => keyList().find((k) => k[2] === act)?.[0] || "";

  /* ---------- Menu bar ---------- */

  const menubar = $("xp-menubar");
  const menus = () => {
    const [prev, next] = stepWords();
    const s = app.state;
    const item = (label, act, extra = {}) => ({ label, act, key: extra.key ?? keyOf(act), ...extra });
    return [
      {
        id: "file",
        label: t.xpMenuFile,
        access: "F",
        items: [
          item(t.xpPrint, "print", { key: "" }),
          item(t.copyLink, "copy", { key: "" }),
          "-",
          item(t.report, "report", { key: "" }),
          "-",
          item(t.xpLeave, "leave", { key: "" }),
        ],
      },
      {
        id: "view",
        label: t.xpMenuView,
        access: "V",
        items: [
          ...app.views.map((v) =>
            item({ timeline: t.viewTimeline, week: t.viewWeek, day: t.viewDay }[v], "view", { arg: v, radio: s.view === v, key: "" }),
          ),
          "-",
          item(t.xpNextView, "nextView"),
          item(t.xpPrevView, "prevView"),
        ],
      },
      {
        id: "go",
        label: t.xpMenuGo,
        access: "G",
        items: [
          item(prev, "prev", { disabled: !app.canStep(-1) }),
          item(next, "next", { disabled: !app.canStep(1) }),
          "-",
          item(t.xpPrevSchoolDay, "prevDay"),
          item(t.xpNextSchoolDay, "nextDay"),
          item(t.xpWeekStart, "weekStart"),
          item(t.xpWeekEnd, "weekEnd"),
          "-",
          item(t.today, "today"),
          item(t.xpFirstDay, "first"),
          item(t.xpLastDay, "last"),
          item(t.xpGoToDate, "date"),
        ],
      },
      {
        id: "help",
        label: t.xpMenuHelp,
        access: "H",
        items: [item(t.xpKeys, "help"), "-", item(t.report, "report", { key: "" })],
      },
    ];
  };

  let openMenu = null; // id of the open menu
  const renderMenubar = () => {
    menubar.innerHTML = menus()
      .map(
        (m) => `<div class="xp-menu">
          <button type="button" class="xp-menu-btn" role="menuitem" aria-haspopup="true" aria-expanded="false" data-menu="${m.id}">${esc(m.label)}<span class="xp-access">(<u>${m.access}</u>)</span></button>
        </div>`,
      )
      .join("");
  };
  renderMenubar();

  const closeMenu = (focusButton = false) => {
    if (!openMenu) return;
    const btn = menubar.querySelector(`[data-menu="${openMenu}"]`);
    menubar.querySelector(".xp-popup")?.remove();
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("is-open");
    openMenu = null;
    if (focusButton) btn.focus();
  };
  const showMenu = (id, focusFirst = false) => {
    closeMenu();
    const m = menus().find((x) => x.id === id);
    const btn = menubar.querySelector(`[data-menu="${id}"]`);
    const pop = document.createElement("div");
    pop.className = "xp-popup";
    pop.setAttribute("role", "menu");
    pop.innerHTML = m.items
      .map((it) =>
        it === "-"
          ? `<div class="xp-sep" role="separator"></div>`
          : `<button type="button" class="xp-item" role="${it.radio === undefined ? "menuitem" : "menuitemradio"}" ${it.radio !== undefined ? `aria-checked="${it.radio}"` : ""} data-act="${it.act}" ${it.arg ? `data-arg="${it.arg}"` : ""} ${it.disabled ? "disabled" : ""}>
              <span class="xp-check">${it.radio ? "●" : ""}</span><span>${esc(it.label)}</span><kbd>${esc(it.key)}</kbd></button>`,
      )
      .join("");
    btn.parentElement.append(pop);
    // Keep the popup on screen.
    const r = pop.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) pop.style.left = `${window.innerWidth - 4 - r.right}px`;
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("is-open");
    openMenu = id;
    if (focusFirst) pop.querySelector(".xp-item:not(:disabled)")?.focus();
  };
  menubar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-menu]");
    if (b) {
      if (openMenu === b.dataset.menu) closeMenu();
      else showMenu(b.dataset.menu, e.detail === 0);
      return;
    }
    const it = e.target.closest(".xp-item");
    if (it && !it.disabled) {
      closeMenu();
      run(it.dataset.act, it.dataset.arg);
    }
  });
  // As on the desktop: once a menu is open, pointing at another opens that one.
  menubar.addEventListener("pointerover", (e) => {
    const b = e.target.closest("[data-menu]");
    if (b && openMenu && openMenu !== b.dataset.menu) showMenu(b.dataset.menu);
  });
  menubar.addEventListener("keydown", (e) => {
    const ids = menus().map((m) => m.id);
    const current = openMenu || e.target.closest("[data-menu]")?.dataset.menu;
    if (!current) return;
    const items = [...menubar.querySelectorAll(".xp-item:not(:disabled)")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!openMenu) return showMenu(current, true);
      const d = e.key === "ArrowDown" ? 1 : -1;
      items[(i + d + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const j = ids.indexOf(current) + (e.key === "ArrowRight" ? 1 : -1);
      const next = ids[(j + ids.length) % ids.length];
      if (openMenu) showMenu(next, true);
      else menubar.querySelector(`[data-menu="${next}"]`).focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (openMenu && !menubar.contains(e.target)) closeMenu();
  });

  /* ---------- Task pane ---------- */

  const pane = $("xp-taskpane");
  const collapsed = new Set((store.get("tt:xp-pane") || "").split(",").filter(Boolean));
  const link = (act, icon, label) =>
    `<li><button type="button" class="xp-tp-link" data-act="${act}">${icon}<span>${esc(label)}</span></button></li>`;
  pane.innerHTML = `
    <section class="xp-tp-box is-special" data-box="tasks">
      <button type="button" class="xp-tp-head" aria-expanded="true"><span>${esc(t.xpTasks)}</span><span class="xp-chev">${xpIcons.chevron}</span></button>
      <ul class="xp-tp-body">
        ${link("today", xpIcons.today, t.xpShowToday)}
        ${link("print", xpIcons.print, t.xpPrintView)}
        ${link("copy", xpIcons.link, t.copyLink)}
        ${link("report", xpIcons.report, t.report)}
      </ul>
    </section>
    <section class="xp-tp-box" data-box="other">
      <button type="button" class="xp-tp-head" aria-expanded="true"><span>${esc(t.xpMenuHelp)}</span><span class="xp-chev">${xpIcons.chevron}</span></button>
      <ul class="xp-tp-body">
        ${link("help", xpIcons.keys, t.xpKeys)}
        ${link("leave", xpIcons.leave, t.xpLeave)}
      </ul>
    </section>
    <section class="xp-tp-box" data-box="details">
      <button type="button" class="xp-tp-head" aria-expanded="true"><span>${esc(t.xpDetails)}</span><span class="xp-chev">${xpIcons.chevron}</span></button>
      <div class="xp-tp-body xp-details" id="xp-details"></div>
    </section>`;
  const applyCollapsed = () => {
    for (const box of pane.querySelectorAll("[data-box]")) {
      const shut = collapsed.has(box.dataset.box);
      box.classList.toggle("is-collapsed", shut);
      box.querySelector(".xp-tp-head").setAttribute("aria-expanded", String(!shut));
    }
  };
  applyCollapsed();
  pane.addEventListener("click", (e) => {
    const head = e.target.closest(".xp-tp-head");
    if (head) {
      const id = head.closest("[data-box]").dataset.box;
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      store.set("tt:xp-pane", [...collapsed].join(","));
      applyCollapsed();
    }
  });
  // Task pane links and the status bar's key hint.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && (pane.contains(b) || b.classList.contains("xp-status-keys"))) run(b.dataset.act);
  });

  function run(act, arg) {
    if (!app.model) return;
    const fn = actions[act];
    if (fn) fn(act === "view" ? arg : 1);
  }

  /* ---------- Help window ---------- */

  const help = document.createElement("dialog");
  help.className = "sheet xp-help";
  document.body.append(help);
  function openHelp() {
    closeMenu();
    help.innerHTML = `
      <div class="sheet-head">
        <h2>${esc(t.xpKeys)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${esc(t.close)}">${icons.close(14)}</button>
      </div>
      <table class="xp-keytable"><tbody>
        ${keyList()
          .map(([k, label]) => `<tr><td>${k.split(" / ").map((x) => `<kbd>${esc(x)}</kbd>`).join(" ")}</td><td>${esc(label)}</td></tr>`)
          .join("")}
      </tbody></table>
      <p>${esc(t.xpKeysNote)}</p>
      ${phone.matches ? `<p>${esc(t.xpSwipe)}</p>` : ""}
      <div class="sheet-actions"><button type="button" class="primary-btn" data-close>OK</button></div>`;
    help.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => help.close()));
    help.showModal();
    help.querySelector(".primary-btn").focus();
  }
  help.addEventListener("click", (e) => {
    if (e.target === help) help.close();
  });

  /* ---------- Vim keys ---------- */

  const showcmd = $("xp-showcmd");
  let count = "";
  let pending = "";
  const showPending = () => (showcmd.textContent = count + pending);
  const clearPending = () => {
    count = "";
    pending = "";
    showPending();
  };
  const KEYMAP = {
    h: "prev",
    l: "next",
    H: "prevWeek",
    L: "nextWeek",
    b: "prevDay",
    w: "nextDay",
    0: "weekStart",
    "^": "weekStart",
    $: "weekEnd",
    t: "today",
    gg: "first",
    G: "last",
    "/": "date",
    j: "down",
    k: "up",
    gt: "nextView",
    gT: "prevView",
    o: "open",
    "?": "help",
  };
  document.addEventListener("keydown", (e) => {
    if (!app.model || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (["Shift", "CapsLock", "Control", "Alt", "Meta"].includes(e.key)) return;
    if (openMenu) return; // the menu bar handles its own keys
    const target = e.target instanceof Element ? e.target : document.body;
    if (target.closest("input, select, textarea, [contenteditable], dialog, #calendar")) return;
    if (document.querySelector("dialog[open]") || !$("calendar").hidden) return;

    const k = e.key;
    if (k === "Escape") return clearPending();
    if (/^[0-9]$/.test(k) && !pending && (k !== "0" || count)) {
      count = (count + k).slice(-3);
      showPending();
      e.preventDefault();
      return;
    }
    if (k === "g" && !pending) {
      pending = "g";
      showPending();
      e.preventDefault();
      return;
    }
    const act = KEYMAP[pending + k];
    const n = Math.max(1, Math.min(99, parseInt(count || "1", 10)));
    clearPending();
    if (!act) return;
    e.preventDefault();
    if (act === "prev" || act === "next") {
      if (!app.canStep(act === "prev" ? -1 : 1)) return;
      flash(act === "prev" ? -1 : 1);
    }
    actions[act](n);
  });

  // Show the taskbar button pressing when h / l are used.
  function flash(dir) {
    const b = taskbar.querySelector(`[data-dir="${dir}"]`);
    b.classList.add("is-pressed");
    setTimeout(() => b.classList.remove("is-pressed"), 140);
  }

  /* ---------- Swipe (phones) ---------- */

  setupSwipe(view, app);

  /* ---------- Updates from the app ---------- */

  function update() {
    const { model, state } = app;
    if (!model || !state.date) return;
    const viewName = { timeline: t.viewTimeline, week: t.viewWeek, day: t.viewDay }[state.view];
    $("xp-title").textContent = `${viewName} - ${t.appTitle}`;

    const [prev, next] = stepWords();
    for (const b of taskbar.querySelectorAll("[data-dir]")) {
      const dir = Number(b.dataset.dir);
      const can = app.canStep(dir);
      b.disabled = !can;
      b.querySelector(".xp-task-label").textContent = dir < 0 ? prev : next;
      const target = can ? app.stepTarget(dir) : null;
      b.querySelector(".xp-task-sub").textContent = target ? formatMedium(target) : "";
    }

    const d = state.date;
    const type = model.dayType(d);
    const ev = model.event(d);
    const summary = app.selectionSummary();
    $("xp-details").innerHTML = `
      <strong>${esc(formatLong(d))}</strong>
      ${d === todayISO() ? `<span class="xp-today">${esc(t.today)}</span>` : ""}
      ${type ? `<span>${esc(type)}</span>` : ""}
      ${ev ? `<span>${esc(ev[document.documentElement.lang === "ja" ? "ja" : "en"])}</span>` : ""}
      <span class="xp-details-sel">${esc(summary || t.xpNotSet)}</span>`;
    if (openMenu) showMenu(openMenu);
  }

  phone.addEventListener?.("change", () => app.model && update());
  return { update };
}

/* ---------- Swipe ---------- */

// Week and day views: one swipe, one step. The timetable follows the finger, and on release it
// either slides away and the previous or next day or week slides in, or springs back. Vertical
// scrolling stays with the browser (touch-action: pan-y in xp.css). The timeline keeps its
// ordinary sideways scrolling.
function setupSwipe(view, app) {
  let start = null;
  let dx = 0;
  let swiping = false;
  let busy = false;
  let suppressClick = false;

  const enabled = () =>
    phone.matches && app.model && app.state.date && !busy && (app.state.view === "week" || app.state.view === "day");
  const animate = (frames, opts) =>
    reduceMotion.matches || !view.animate ? Promise.resolve() : view.animate(frames, { fill: "forwards", ...opts }).finished;
  const reset = () => {
    view.getAnimations?.().forEach((a) => a.cancel());
    view.style.transform = "";
    view.style.opacity = "";
    view.classList.remove("is-swiping");
  };

  view.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary || !enabled()) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, time: e.timeStamp };
    dx = 0;
    swiping = false;
  });
  view.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.x;
    const my = e.clientY - start.y;
    if (!swiping) {
      if (Math.abs(mx) < 12 && Math.abs(my) < 12) return;
      if (Math.abs(mx) < Math.abs(my) * 1.3) {
        start = null; // a vertical scroll
        return;
      }
      swiping = true;
      view.classList.add("is-swiping");
      try {
        view.setPointerCapture(e.pointerId);
      } catch {
        /* capture is optional */
      }
    }
    dx = mx;
    const dir = dx < 0 ? 1 : -1;
    // Past the first or last day the timetable only gives a little, so the end is felt.
    const give = app.canStep(dir) ? 1 : 0.2;
    view.style.transform = `translateX(${dx * give}px)`;
    view.style.opacity = String(1 - Math.min(0.35, (Math.abs(dx * give) / view.clientWidth) * 0.5));
  });

  const finish = async (e, cancelled) => {
    if (!start || e.pointerId !== start.id) return;
    const elapsed = Math.max(1, e.timeStamp - start.time);
    start = null;
    if (!swiping) return;
    swiping = false;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 350);

    const dir = dx < 0 ? 1 : -1;
    const width = view.clientWidth || window.innerWidth;
    const far = Math.abs(dx) > Math.min(90, width * 0.22);
    const flick = Math.abs(dx) > 30 && Math.abs(dx) / elapsed > 0.45;
    const current = view.style.transform || "none";
    if (cancelled || !(far || flick) || !app.canStep(dir)) {
      busy = true;
      await animate([{ transform: current, opacity: view.style.opacity || 1 }, { transform: "none", opacity: 1 }], {
        duration: 180,
        easing: "cubic-bezier(.2,.8,.3,1)",
      });
      reset();
      busy = false;
      return;
    }
    busy = true;
    await animate([{ transform: current, opacity: view.style.opacity || 1 }, { transform: `translateX(${-dir * width}px)`, opacity: 0 }], {
      duration: 150,
      easing: "ease-in",
    });
    reset();
    app.step(dir);
    await animate([{ transform: `translateX(${dir * width * 0.4}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], {
      duration: 200,
      easing: "cubic-bezier(.2,.8,.3,1)",
    });
    reset();
    busy = false;
  };
  view.addEventListener("pointerup", (e) => finish(e, false));
  view.addEventListener("pointercancel", (e) => finish(e, true));
  // A swipe that ends on a date heading must not open that day.
  view.addEventListener(
    "click",
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
