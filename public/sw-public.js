/**
 * Service Worker minimale — installabilità PWA sito pubblico (nessuna cache aggressiva).
 */
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
    // Network-only: non intercettiamo le richieste e-commerce.
});
