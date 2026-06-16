// Self-destroying "kill-switch" service worker.
//
// MentaAgent does NOT use a service worker. But localhost:3000 is shared in
// dev with the sibling Mentapath app, which registers one — and a stale
// Mentapath worker keeps intercepting/caching/buffering requests for this app
// on the same origin (it buffers the live SSE chat stream, and serves cached
// JS so code changes never appear). Browsers re-fetch the SW script on
// navigation (bypassing the HTTP cache), so serving THIS replaces the old
// worker with one that unregisters itself and clears all caches.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      // Reload any open tabs so they load fresh, worker-free.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch (e) {
          /* ignore */
        }
      }
    })()
  );
});

// Pass-through: never cache or intercept while we're still around.
self.addEventListener("fetch", () => {});
