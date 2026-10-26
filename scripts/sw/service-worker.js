/* Native Platform Explorer service worker (PRD §14.3).
 *
 * scripts/harden-export.mjs prepends `const CONFIG = {...}` to this file and
 * writes it to out/sw.js:
 *   release  the build this worker belongs to: the build ID plus a digest
 *            of its static files; every page names it in <meta name="npe-release">
 *   buildId  Next's build ID (the git commit), which its RSC payloads carry
 *   version  build ID plus a digest of every exported file; names the caches
 *   shell    scope-relative URLs precached at install: the home and offline
 *            pages and the static assets their HTML references
 *   assets   scope-relative path → SRI hash of every /_next/static file
 *
 * Only same-origin GETs inside the scope are handled. DAPI, the quorum
 * service, rate APIs and every other cross-origin request bypass the worker.
 * Navigations and other unhashed files are network-first, so an online visit
 * always gets the deployed HTML; the cache only answers when the network
 * fails, and it only keeps pages and payloads that name this build. /_next/static files are cache-first, stored on first use (the ~12 MB
 * SDK chunk and the WASM are never precached). They are keyed by their SRI
 * hash and stored only if their bytes match it, so the cache holds exactly
 * this build's files whatever the server or an older cache returns.
 *
 * A new worker waits until a page asks it to take over (the page shows a
 * reload prompt, see src/util/service-worker.ts), then deletes the previous
 * build's caches.
 */
/* global CONFIG */

const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `npe:${SCOPE.pathname}:`;
const PAGES = `${CACHE_PREFIX}pages:${CONFIG.version}`;
const STATIC = `${CACHE_PREFIX}static:${CONFIG.version}`;
const STATIC_PATH = new URL('_next/static/', SCOPE).pathname;
const OFFLINE_URL = new URL('offline/', SCOPE).href;
const RELEASE_META = `<meta name="npe-release" content="${CONFIG.release}"/>`;
const ASSETS = new Map(Object.entries(CONFIG.assets).map(([path, sri]) => [new URL(path, SCOPE).pathname, sri]));

/** A static host ignores the query string, so it is not part of a page's
 *  cache key (Next adds `?_rsc=` cache busters to its segment payloads). */
function pageKey(url) {
  const key = new URL(url);
  key.search = '';
  key.hash = '';
  return key.href;
}

/** This build's static asset at `pathname`, or null for any other file. */
function asset(pathname) {
  const sri = ASSETS.get(pathname);
  return sri ? { sri, key: `${SCOPE.origin}${pathname}?sri=${encodeURIComponent(sri)}` } : null;
}

function cacheable(response) {
  return response.ok && response.type === 'basic' && !response.redirected;
}

async function matchesSri(response, sri) {
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}` === sri;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

async function precache() {
  const [pages, statics] = await Promise.all([caches.open(PAGES), caches.open(STATIC)]);
  await carryOverUnchangedAssets(statics);
  await Promise.all(CONFIG.shell.map(async (path) => {
    const url = new URL(path, SCOPE);
    const file = asset(url.pathname);
    if (file && (await statics.match(file.key))) return;
    const response = await fetch(url, { cache: file ? 'default' : 'no-cache' });
    if (!cacheable(response)) throw new Error(`Precache failed for ${url.pathname}: HTTP ${response.status}`);
    // The site may have been redeployed since this worker was fetched. Never
    // store another build's files: install fails and is retried later.
    if (file ? !(await matchesSri(response, file.sri)) : !(await response.clone().text()).includes(RELEASE_META)) {
      throw new Error(`${url.pathname} belongs to a different build`);
    }
    await (file ? statics.put(file.key, response) : pages.put(url.href, response));
  }));
}

/** Files that are byte-identical in both builds (same path and SRI hash) are
 *  copied from the previous build's cache instead of downloaded again. */
async function carryOverUnchangedAssets(statics) {
  for (const name of await caches.keys()) {
    if (!name.startsWith(`${CACHE_PREFIX}static:`) || name === STATIC) continue;
    const previous = await caches.open(name);
    for (const request of await previous.keys()) {
      if (asset(new URL(request.url).pathname)?.key !== request.url || (await statics.match(request))) continue;
      const response = await previous.match(request);
      if (response) await statics.put(request, response);
    }
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const current = new Set([PAGES, STATIC]);
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && !current.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'npe:get-release') event.ports[0]?.postMessage({ release: CONFIG.release });
  if (message?.type === 'npe:activate') self.skipWaiting();
  if (message?.type === 'npe:cache-loaded') event.waitUntil(cacheLoaded(message));
});

/** On a first visit the page loads before this worker controls it, so the
 *  page reports what it fetched without the worker (its own HTML, the SDK
 *  chunk, …) and this build's files among them are cached now. */
async function cacheLoaded({ page, assets }) {
  const inScope = (href) => {
    const url = new URL(href);
    return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname) ? url : null;
  };
  const statics = await caches.open(STATIC);
  for (const href of Array.isArray(assets) ? assets : []) {
    const url = inScope(href);
    const file = url && asset(url.pathname);
    if (!file || (await statics.match(file.key))) continue;
    try {
      const response = await fetch(href);
      if (cacheable(response)) await storeAsset(file, response);
    } catch {
      // Offline again: the file is cached on its next use.
    }
  }
  const pageUrl = typeof page === 'string' && inScope(page);
  if (!pageUrl || pageUrl.pathname.startsWith(STATIC_PATH)) return;
  try {
    const response = await fetch(pageUrl, { cache: 'no-cache' });
    if (cacheable(response)) await storePage(pageUrl.href, response, RELEASE_META);
  } catch {
    // As above.
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
  } else if (url.pathname.startsWith(STATIC_PATH)) {
    // Another build's file (an old tab after an update) is passed through.
    const file = asset(url.pathname);
    if (file) event.respondWith(cacheFirst(event, file));
  } else {
    event.respondWith(networkFirst(event));
  }
});

async function navigate(event) {
  const { request } = event;
  try {
    // Revalidate: the HTTP cache must not hand back HTML that references
    // chunks a newer deploy has removed. The copy keeps redirect: 'manual'.
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (cacheable(response)) event.waitUntil(storePage(request.url, response.clone(), RELEASE_META));
    return response;
  } catch (error) {
    const pages = await caches.open(PAGES);
    const key = pageKey(request.url);
    const cached = (await pages.match(key))
      ?? (key.endsWith('/') ? undefined : await pages.match(`${key}/`))
      ?? (await pages.match(OFFLINE_URL));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(event, file) {
  const statics = await caches.open(STATIC);
  const cached = await statics.match(file.key);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (cacheable(response)) event.waitUntil(storeAsset(file, response.clone()));
  return response;
}

async function networkFirst(event) {
  const { request } = event;
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    // Next's segment payloads all carry the build ID.
    if (cacheable(response)) event.waitUntil(storePage(request.url, response.clone(), CONFIG.buildId));
    return response;
  } catch (error) {
    const cached = await (await caches.open(PAGES)).match(pageKey(request.url), { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function storeAsset(file, response) {
  try {
    if (await matchesSri(response, file.sri)) await (await caches.open(STATIC)).put(file.key, response);
  } catch {
    // Quota, or a cache deleted by a newer worker: the response was served anyway.
  }
}

/** Store a page or payload only if it names this build (`marker`): after a
 *  deploy, the old worker must not keep the new build's HTML, whose chunks it
 *  cannot serve offline. */
async function storePage(url, response, marker) {
  try {
    if (!(await response.clone().text()).includes(marker)) return;
    await (await caches.open(PAGES)).put(pageKey(url), response);
  } catch {
    // Quota, or a cache deleted by a newer worker: the response was served anyway.
  }
}
