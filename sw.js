// Service Worker — Jadwal Keberangkatan
// Tujuan: (1) memenuhi syarat wajib PWA agar app bisa di-"Install"/"Add to Home Screen" di HP,
// (2) menyimpan app-shell di cache supaya app tetap bisa dibuka meski koneksi internet putus.
const CACHE_NAME = 'jadwal-berangkat-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => { /* kalau salah satu gagal (mis. offline saat install pertama), abaikan */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategi: coba jaringan dulu (biar selalu dapat versi terbaru saat online), kalau gagal
// (offline) baru jatuh ke cache. Untuk request GET saja — request lain (POST dll) dilewatkan
// langsung ke jaringan seperti biasa.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 &&
            (networkRes.type === 'basic' || networkRes.type === 'cors')) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return networkRes;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
