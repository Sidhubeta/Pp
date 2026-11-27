// Minimal Standalone PWA Service Worker for Android WebAPK & iOS PWA
// Intentionally never caches /_serverFn, /api/, /login, /zimadmin, or HTML routes
// so authentication cookies, live sessions, and instant admin logout stay 100% real-time.

const CACHE_NAME = "phonepe-pwa-static-v2";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept RPC, API, auth, admin, media, or HTML document navigations
  if (
    req.mode === "navigate" ||
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/zimadmin") ||
    url.pathname.startsWith("/login")
  ) {
    return;
  }

  // Serve small static PWA icons/manifest network-first with cache fallback
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
  }
});
