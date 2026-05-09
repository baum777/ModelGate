const CACHE_NAME = "mosaicstacked-shell-v5";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/manifest-light.webmanifest",
  "/manifest-dark.webmanifest",
  "/icons/favicon.svg",
  "/favicon/favicon-transparent-16.png",
  "/favicon/favicon-transparent-32.png",
  "/icons/light/apple-touch-icon-light-180.png",
  "/icons/light/icon-light-192.png",
  "/icons/light/icon-light-512.png",
  "/icons/light/pwa-maskable-light-192.png",
  "/icons/light/pwa-maskable-light-512.png",
  "/icons/dark/apple-touch-icon-dark-180.png",
  "/icons/dark/icon-dark-192.png",
  "/icons/dark/icon-dark-512.png",
  "/icons/dark/pwa-maskable-dark-192.png",
  "/icons/dark/pwa-maskable-dark-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (
    url.pathname.startsWith("/api/")
    || url.pathname === "/health"
    || url.pathname === "/models"
    || url.pathname === "/chat"
    || url.pathname === "/diagnostics"
    || url.pathname === "/journal/recent"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put("/index.html", response.clone());
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/index.html")) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  })());
});
