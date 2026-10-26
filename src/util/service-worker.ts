/**
 * Page side of the offline service worker (PRD §14.3; the worker itself is
 * scripts/sw/service-worker.js). A new worker never takes over by itself:
 * - If it belongs to this page's build (the page was fetched from the network
 *   after a deploy while the old worker still controlled it), it is activated
 *   silently. Nothing on the page changes.
 * - Otherwise the page offers a reload. Accepting activates the worker, which
 *   deletes the old build's caches, and reloads once it controls the page.
 * Pages of an older build that a newer worker takes over (another tab
 * accepted the update) are offered a reload as well.
 */

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60_000;
const VISIBLE_CHECK_THROTTLE_MS = 5 * 60_000;
const RELEASE_QUERY_TIMEOUT_MS = 3_000;
const ACTIVATION_TIMEOUT_MS = 5_000;

export interface ServiceWorkerOptions {
  container: ServiceWorkerContainer;
  scriptUrl: string;
  scope: string;
  /** This page's release (its <meta name="npe-release">); the worker reports
   *  the release it was generated for. */
  release: string;
  /** False unregisters a worker installed by an earlier deploy. */
  enabled: boolean;
  /** A newer build is ready; call `apply` to switch to it (it reloads the page). */
  onUpdate: (apply: () => void) => void;
  reload: () => void;
}

/** The release a worker serves, or null if it does not answer. */
export function askWorkerRelease(worker: ServiceWorker, timeoutMs = RELEASE_QUERY_TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<{ release?: unknown }>) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(typeof event.data?.release === 'string' ? event.data.release : null);
    };
    worker.postMessage({ type: 'npe:get-release' }, [channel.port2]);
  });
}

/** Report what the page fetched before a worker controlled it (a first visit:
 *  the page itself, the SDK chunk, …) so the worker can cache it. Resource
 *  Timing marks those loads with workerStart 0. */
function reportLoadsOutsideWorker(container: ServiceWorkerContainer): () => void {
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('resource')) {
    return () => undefined;
  }
  const post = (message: { page?: string; assets: string[] }) => {
    container.ready
      .then((registration) => registration.active?.postMessage({ type: 'npe:cache-loaded', ...message }))
      .catch(() => undefined);
  };
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (navigation && navigation.workerStart === 0) post({ page: window.location.href, assets: [] });
  const observer = new PerformanceObserver((list) => {
    const assets = list.getEntries()
      .filter((entry) => (entry as PerformanceResourceTiming).workerStart === 0 && entry.name.includes('/_next/static/'))
      .map((entry) => entry.name);
    if (assets.length > 0) post({ assets });
  });
  observer.observe({ type: 'resource', buffered: true });
  return () => observer.disconnect();
}

/** Register the worker and watch for updates. Returns a cleanup function. */
export function startServiceWorker(options: ServiceWorkerOptions): () => void {
  const { container, scriptUrl, scope, release, enabled, onUpdate } = options;
  if (!enabled) {
    container.getRegistration(scope)
      .then((registration) => registration?.unregister())
      .catch(() => undefined);
    return () => undefined;
  }

  let disposed = false;
  let reloadRequested = false;
  let reloaded = false;
  const cleanups: Array<() => void> = [];
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    options.reload();
  };

  const offerUpdate = (waiting: ServiceWorker | null) => {
    onUpdate(() => {
      if (!waiting || waiting.state !== 'installed') {
        reload();
        return;
      }
      reloadRequested = true;
      waiting.postMessage({ type: 'npe:activate' });
      // controllerchange normally reloads first; this covers a worker that
      // never activates (e.g. it was replaced by an even newer one).
      setTimeout(reload, ACTIVATION_TIMEOUT_MS);
    });
  };

  const inspectWaiting = async (worker: ServiceWorker) => {
    const theirs = await askWorkerRelease(worker);
    if (disposed) return;
    if (theirs === release) worker.postMessage({ type: 'npe:activate' });
    else offerUpdate(worker);
  };

  const onControllerChange = async () => {
    if (reloadRequested) {
      reload();
      return;
    }
    const controller = container.controller;
    if (!controller) return;
    const theirs = await askWorkerRelease(controller);
    if (!disposed && theirs !== null && theirs !== release) offerUpdate(null);
  };
  container.addEventListener('controllerchange', onControllerChange);
  cleanups.push(() => container.removeEventListener('controllerchange', onControllerChange));

  const watch = (registration: ServiceWorkerRegistration) => {
    // An update only matters to a page an older worker controls. On the
    // first install there is no controller and the worker activates by itself.
    if (registration.waiting && container.controller) void inspectWaiting(registration.waiting);
    const onUpdateFound = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && container.controller) void inspectWaiting(worker);
      });
    };
    registration.addEventListener('updatefound', onUpdateFound);

    let lastCheck = Date.now();
    const check = () => {
      lastCheck = Date.now();
      registration.update().catch(() => undefined);
    };
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > VISIBLE_CHECK_THROTTLE_MS) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    cleanups.push(() => {
      registration.removeEventListener('updatefound', onUpdateFound);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    });
  };

  container.register(scriptUrl, { scope, updateViaCache: 'none' })
    .then((registration) => {
      if (disposed) return;
      watch(registration);
      cleanups.push(reportLoadsOutsideWorker(container));
    })
    // Blocked (private mode, browser policy) or no sw.js: the site works without it.
    .catch(() => undefined);

  return () => {
    disposed = true;
    for (const cleanup of cleanups) cleanup();
  };
}
