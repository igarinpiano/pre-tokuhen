// Date helpers. Dates are handled as "YYYY-MM-DD" strings in local time.
import { lang } from "./i18n.js";

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function weekday(iso) {
  return parseISO(iso).getDay(); // 0 = Sunday
}

export function mondayOf(iso) {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function todayISO() {
  return toISO(new Date());
}

export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// Follow the user's calendar setting (e.g. the Japanese imperial calendar on iOS),
// but keep the UI language for month and weekday names.
function buildLocale() {
  let calendar = "gregory";
  try {
    const c = new Intl.DateTimeFormat().resolvedOptions().calendar;
    if (c === "japanese") calendar = "japanese";
  } catch {
    /* keep gregory */
  }
  const sys = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  const base = sys.toLowerCase().startsWith(lang) ? sys : lang === "ja" ? "ja-JP" : "en-US";
  try {
    return new Intl.Locale(base, { calendar }).toString();
  } catch {
    return `${lang === "ja" ? "ja-JP" : "en-US"}-u-ca-${calendar}`;
  }
}

const locale = buildLocale();
const fmtCache = new Map();
function fmt(options) {
  const key = JSON.stringify(options);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat(locale, options));
  return fmtCache.get(key);
}

export const formatLong = (iso) =>
  fmt({ weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(parseISO(iso));
export const formatMedium = (iso) => fmt({ weekday: "short", month: "short", day: "numeric" }).format(parseISO(iso));
export const formatShort = (iso) =>
  lang === "ja"
    ? fmt({ month: "numeric", day: "numeric", weekday: "short" }).format(parseISO(iso))
    : fmt({ weekday: "short", month: "numeric", day: "numeric" }).format(parseISO(iso));
export const formatMonthYear = (iso) => fmt({ year: "numeric", month: "long" }).format(parseISO(iso));
export const formatMonth = (iso) => fmt({ month: "short" }).format(parseISO(iso));
export const formatDayNum = (iso) => String(parseISO(iso).getDate());
export const formatWeekdayNarrow = (iso) => fmt({ weekday: "narrow" }).format(parseISO(iso));
export const formatWeekdayShort = (iso) => fmt({ weekday: "short" }).format(parseISO(iso));
export const formatUpdated = (iso) => fmt({ year: "numeric", month: "short", day: "numeric" }).format(parseISO(iso));
