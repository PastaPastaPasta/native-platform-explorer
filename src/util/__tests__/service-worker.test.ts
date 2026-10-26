import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServiceWorker, UPDATE_CHECK_INTERVAL_MS, type ServiceWorkerOptions } from '../service-worker';

/** A worker that answers the release query like scripts/sw/service-worker.js. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  messages: unknown[] = [];
  constructor(readonly release: string | null) { super(); }
  postMessage(message: { type: string }, transfer?: MessagePort[]) {
    this.messages.push(message.type);
    if (message.type === 'npe:get-release' && this.release !== null) transfer?.[0]?.postMessage({ release: this.release });
  }
  setState(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
  unregister = vi.fn(async () => true);
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  registration = new FakeRegistration();
  register = vi.fn(async () => this.registration);
  getRegistration = vi.fn(async () => this.registration);
  takeOver(worker: FakeWorker) {
    this.controller = worker;
    this.dispatchEvent(new Event('controllerchange'));
  }
}

function start(container: FakeContainer, overrides: Partial<ServiceWorkerOptions> = {}) {
  const onUpdate = vi.fn<(apply: () => void) => void>();
  const reload = vi.fn();
  const stop = startServiceWorker({
    container: container as unknown as ServiceWorkerContainer,
    scriptUrl: '/app/sw.js',
    scope: '/app/',
    release: 'page-build',
    enabled: true,
    onUpdate,
    reload,
    ...overrides,
  });
  return { onUpdate, reload, stop };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('startServiceWorker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('registers the worker at the base path scope, bypassing the HTTP cache', async () => {
    const container = new FakeContainer();
    start(container);
    await settle();
    expect(container.register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/', updateViaCache: 'none' });
  });

  it('unregisters a worker from an earlier deploy when disabled', async () => {
    const container = new FakeContainer();
    start(container, { enabled: false });
    await settle();
    expect(container.register).not.toHaveBeenCalled();
    expect(container.getRegistration).toHaveBeenCalledWith('/app/');
    expect(container.registration.unregister).toHaveBeenCalledOnce();
  });

  it('deletes only this scope\'s caches when disabled', async () => {
    const names = ['npe:/app/:pages:b1', 'npe:/app/:static:b1', 'npe:/other/:static:b1', 'unrelated'];
    const cacheStorage = {
      keys: vi.fn(async () => [...names]),
      delete: vi.fn(async (_name: string) => true),
    } as unknown as CacheStorage;
    start(new FakeContainer(), { enabled: false, cacheStorage });
    await settle();
    expect(cacheStorage.delete).toHaveBeenCalledTimes(2);
    expect(cacheStorage.delete).toHaveBeenCalledWith('npe:/app/:pages:b1');
    expect(cacheStorage.delete).toHaveBeenCalledWith('npe:/app/:static:b1');
  });

  it('follows a worker that was already installing before the page started watching', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    const installing = new FakeWorker('next-build');
    installing.state = 'installing';
    container.registration.installing = installing;
    const { onUpdate } = start(container);
    await settle();
    expect(onUpdate).not.toHaveBeenCalled();
    installing.setState('installed');
    await settle();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('offers a reload for a waiting worker of another build and activates it on request', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    const waiting = new FakeWorker('next-build');
    container.registration.waiting = waiting;
    const { onUpdate, reload } = start(container);
    await settle();
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(waiting.messages).toEqual(['npe:get-release']);
    expect(reload).not.toHaveBeenCalled();

    onUpdate.mock.calls[0]![0]();
    expect(waiting.messages).toEqual(['npe:get-release', 'npe:activate']);
    expect(reload).not.toHaveBeenCalled();
    container.takeOver(waiting);
    await settle();
    expect(reload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('activates a waiting worker of the page’s own build silently', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('old-build');
    const waiting = new FakeWorker('page-build');
    container.registration.waiting = waiting;
    const { onUpdate, reload } = start(container);
    await settle();
    expect(waiting.messages).toEqual(['npe:get-release', 'npe:activate']);
    container.takeOver(waiting);
    await settle();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('treats a worker that does not answer as another build', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    container.registration.waiting = new FakeWorker(null);
    const { onUpdate } = start(container);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('ignores the first install, which has no controller to replace', async () => {
    const container = new FakeContainer();
    const { onUpdate, reload } = start(container);
    await settle();
    const installing = new FakeWorker('page-build');
    installing.state = 'installing';
    container.registration.installing = installing;
    container.registration.dispatchEvent(new Event('updatefound'));
    installing.setState('installed');
    container.takeOver(installing);
    await settle();
    expect(installing.messages).toEqual(['npe:get-release']);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('inspects a worker found by a later update check', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    const { onUpdate } = start(container);
    await settle();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(container.registration.update).toHaveBeenCalledOnce();
    const installing = new FakeWorker('next-build');
    installing.state = 'installing';
    container.registration.installing = installing;
    container.registration.dispatchEvent(new Event('updatefound'));
    installing.setState('installed');
    await settle();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('offers a reload when another tab activated a newer build', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    const { onUpdate, reload } = start(container);
    await settle();
    container.takeOver(new FakeWorker('next-build'));
    await settle();
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    onUpdate.mock.calls[0]![0]();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('falls back to reloading when the worker never takes over', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    container.registration.waiting = new FakeWorker('next-build');
    const { onUpdate, reload } = start(container);
    await settle();
    onUpdate.mock.calls[0]![0]();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('stops watching after cleanup', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('page-build');
    const { onUpdate, stop } = start(container);
    await settle();
    stop();
    container.takeOver(new FakeWorker('next-build'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.registration.update).not.toHaveBeenCalled();
  });
});
