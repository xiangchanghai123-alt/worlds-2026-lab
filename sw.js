const CACHE_NAME = "worlds-lab-2026-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20261024-12",
  "./data.js?v=20261024-12",
  "./app.js?v=20261024-12",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/teams/GEN.webp",
  "./assets/teams/HLE.webp",
  "./assets/teams/T1.webp",
  "./assets/teams/DK.webp",
  "./assets/teams/BLG.webp",
  "./assets/teams/TES.webp",
  "./assets/teams/AL.webp",
  "./assets/teams/IG.webp",
  "./assets/teams/KOI.webp",
  "./assets/teams/KC.webp",
  "./assets/teams/G2.webp",
  "./assets/teams/LYON.webp",
  "./assets/teams/TLAW.webp",
  "./assets/teams/CFO.webp",
  "./assets/teams/TSW.webp",
  "./assets/teams/LOS.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
