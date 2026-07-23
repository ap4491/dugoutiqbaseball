/* DugoutIQ service worker — offline-capable app shell.
   Strategy: NETWORK-FIRST for code & pages (always fresh when online,
   cache fallback offline). CACHE-FIRST for static assets (icons, fonts, CDN). */
const CACHE = "dugoutiq-v141";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./logo.png",
  "./icon-512.png",
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"
];

// paths that must always be fresh when the network is available
const FRESH = /(\/$|\.html$|app\.js$)/;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Never touch the live relay — spectators must always get fresh data.
  if (e.request.url.includes("/.netlify/functions/")) return;
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  const wantsFresh = e.request.mode === "navigate" || (url.origin === location.origin && FRESH.test(url.pathname));

  if (wantsFresh) {
    // network-first: fresh when online, cached shell offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() => caches.match("./index.html"))
    )
  );
});
