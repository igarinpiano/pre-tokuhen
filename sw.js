// Offline support. App files: served from cache, refreshed in the background.
// Timetable data is never cached here; the app keeps its own copy and asks before updating.
const CACHE = "tokuhen-v1";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/calendar.js",
  "js/config.js",
  "js/format.js",
  "js/i18n.js",
  "js/icons.js",
  "js/model.js",
  "js/scrubber.js",
  "js/views.js",
  "icons/icon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes("/data/")) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === "navigate" ? "index.html" : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
