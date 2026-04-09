self.addEventListener('install', event => {
  self.skipWaiting(); // Skip waiting phase to activate immediately
});

self.addEventListener('activate', event => {
  // Completely clear any existing cache stored in the user's phone
  // so that the previous version gets purged permanently.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Empty fetch listener.
  // This satisfies the PWA installability requirement for Chrome/Android
  // without artificially caching any assets or files offline!
  // All resources will bypass service worker and hit the network.
});
