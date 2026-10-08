type SdkPhase = 'module-load' | 'construct' | 'connect';
type Outcome = 'success' | 'error' | 'superseded';

const MAX_MEASURES_PER_PHASE = 20;

function beginTiming(): { clock: Performance; start: number } | null {
  try {
    if (typeof window === 'undefined') return null;
    const clock = window.performance;
    if (!clock?.measure || !clock.getEntriesByName || !clock.clearMeasures) return null;
    return { clock, start: clock.now() };
  } catch {
    return null;
  }
}

function recordTiming(
  clock: Performance,
  name: string,
  start: number,
  detail?: { sessionId: number; outcome: Outcome },
  once = false,
) {
  // Instrumentation must never change SDK behavior in browsers with partial
  // User Timing support. Keep the timeline bounded during repeated reconnects.
  try {
    const previous = clock.getEntriesByName(name, 'measure');
    if (once && previous.length > 0) return;
    if (previous.length >= MAX_MEASURES_PER_PHASE) clock.clearMeasures(name);
    clock.measure(name, { start, end: clock.now(), detail });
  } catch {
    // SDK operations and shell rendering do not depend on timing support.
  }
}

export async function measureSdkPhase<T>(
  phase: SdkPhase,
  sessionId: number,
  signal: AbortSignal,
  action: () => T | Promise<T>,
): Promise<T> {
  const timing = beginTiming();
  let outcome: Outcome = 'success';
  try {
    return await action();
  } catch (error) {
    outcome = 'error';
    throw error;
  } finally {
    if (timing) {
      recordTiming(timing.clock, `npe:sdk:${phase}`, timing.start, {
        sessionId,
        outcome: signal.aborted ? 'superseded' : outcome,
      });
    }
  }
}

/** Navigation-start to the first mounted application shell, once per document. */
export function recordShellReady() {
  const timing = beginTiming();
  if (timing) recordTiming(timing.clock, 'npe:app-shell', 0, undefined, true);
}
