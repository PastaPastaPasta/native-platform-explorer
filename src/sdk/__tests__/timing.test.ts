import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureSdkPhase, recordShellReady } from '../timing';

function mockClock() {
  const entries: Record<string, object[]> = {};
  const clock = {
    now: vi.fn().mockReturnValue(10),
    getEntriesByName: vi.fn((name: string) => entries[name] ?? []),
    clearMeasures: vi.fn((name: string) => { entries[name] = []; }),
    measure: vi.fn((name: string, options: unknown) => {
      entries[name] ??= [];
      entries[name]!.push(options as object);
    }),
  };
  vi.stubGlobal('window', { performance: clock });
  return clock;
}

afterEach(() => vi.unstubAllGlobals());

describe('startup timing', () => {
  it('keeps shell hydration separate from session-scoped SDK measurements', async () => {
    const clock = mockClock();
    recordShellReady();
    recordShellReady(); // Strict Mode or a remount does not count twice.
    const controller = new AbortController();
    expect(await measureSdkPhase('module-load', 7, controller.signal, () => 'loaded')).toBe('loaded');
    expect(clock.measure.mock.calls).toEqual([
      ['npe:app-shell', { start: 0, end: 10, detail: undefined }],
      ['npe:sdk:module-load', { start: 10, end: 10, detail: { sessionId: 7, outcome: 'success' } }],
    ]);
  });

  it('preserves the original error and records failed phases', async () => {
    const clock = mockClock();
    const failure = new Error('SDK connection failed');
    await expect(measureSdkPhase('connect', 8, new AbortController().signal, () => {
      throw failure;
    })).rejects.toBe(failure);
    expect(clock.measure).toHaveBeenCalledWith('npe:sdk:connect', {
      start: 10, end: 10, detail: { sessionId: 8, outcome: 'error' },
    });
  });

  it('identifies a completed phase whose session was superseded', async () => {
    const clock = mockClock();
    const controller = new AbortController();
    let resolve!: (value: string) => void;
    const pending = measureSdkPhase('connect', 9, controller.signal, () => new Promise<string>((yes) => { resolve = yes; }));
    controller.abort();
    resolve('connected');
    expect(await pending).toBe('connected');
    expect(clock.measure).toHaveBeenCalledWith('npe:sdk:connect', {
      start: 10, end: 10, detail: { sessionId: 9, outcome: 'superseded' },
    });
  });

  it('bounds retained User Timing entries through repeated reconnects', async () => {
    const clock = mockClock();
    for (let sessionId = 1; sessionId <= 21; sessionId += 1) {
      await measureSdkPhase('construct', sessionId, new AbortController().signal, () => undefined);
    }
    expect(clock.clearMeasures).toHaveBeenCalledOnce();
    expect(clock.clearMeasures).toHaveBeenCalledWith('npe:sdk:construct');
    expect(clock.getEntriesByName('npe:sdk:construct')).toHaveLength(1);
  });

  it('continues SDK actions without a browser or supported timing API', async () => {
    vi.stubGlobal('window', undefined);
    recordShellReady();
    expect(await measureSdkPhase('connect', 10, new AbortController().signal, () => 'ready')).toBe('ready');
    vi.stubGlobal('window', { performance: {} });
    expect(await measureSdkPhase('connect', 11, new AbortController().signal, () => 'ready')).toBe('ready');
  });

  it('never lets a timing API failure change SDK results or errors', async () => {
    const clock = mockClock();
    clock.measure.mockImplementation(() => { throw new Error('Unsupported measure options'); });
    recordShellReady();
    expect(await measureSdkPhase('connect', 12, new AbortController().signal, () => 'ready')).toBe('ready');
    const failure = new Error('original failure');
    await expect(measureSdkPhase('connect', 13, new AbortController().signal, () => Promise.reject(failure))).rejects.toBe(failure);
  });
});
