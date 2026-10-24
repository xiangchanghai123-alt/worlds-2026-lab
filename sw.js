const CACHE_NAME = "worlds-lab-2026-v18";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20261024-16",
  "./data.js?v=20261024-16",
  "./app.js?v=20261024-16",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/teams/GEN.webp?v=20261024-square160",
  "./assets/teams/HLE.webp?v=20261024-square160",
  "./assets/teams/T1.webp?v=20261024-square160",
  "./assets/teams/DK.webp?v=20261024-square160",
  "./assets/teams/BLG.webp?v=20261024-square160",
  "./assets/teams/TES.webp?v=20261024-square160",
  "./assets/teams/AL.webp?v=20261024-square160",
  "./assets/teams/IG.webp?v=20261024-square160",
  "./assets/teams/KOI.webp?v=20261024-square160",
  "./assets/teams/KC.webp?v=20261024-square160",
  "./assets/teams/G2.webp?v=20261024-square160",
  "./assets/teams/LYON.webp?v=20261024-square160",
  "./assets/teams/TLAW.webp?v=20261024-square160",
  "./assets/teams/CFO.webp?v=20261024-square160",
  "./assets/teams/TSW.webp?v=20261024-square160",
  "./assets/teams/LOS.webp?v=20261024-square160"
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
