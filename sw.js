/* Service worker — offline shell for The Path training PWA */
const CACHE = "thepath-training-v11";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/program.js",
  "./manifest.json",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Network-first for the HTML doc so updates land fast; cache-first for static assets.
  const url = new URL(req.url);
  const isYouTube = url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com") || url.hostname.endsWith("ytimg.com");
  if (isYouTube) return; // let the network handle video embeds
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
