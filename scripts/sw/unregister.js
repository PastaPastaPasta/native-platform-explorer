/* Kill switch for the Native Platform Explorer service worker.
 *
 * A build with NEXT_PUBLIC_SERVICE_WORKER=off ships this file as sw.js.
 * Browsers that installed the caching worker fetch it at their next update
 * check (each navigation, bypassing the HTTP cache), install it, and it removes
 * this scope's caches and registration. Pages load from the network from the
 * next navigation on; nothing is reloaded under the user.
 */

const CACHE_PREFIX = `npe:${new URL(self.registration.scope).pathname}:`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
    await self.registration.unregister();
  })());
});
