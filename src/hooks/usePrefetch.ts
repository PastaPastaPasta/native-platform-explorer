'use client';

import { useEffect, useMemo, useRef, type FocusEvent, type PointerEvent } from 'react';
import { useSdk } from '@sdk/hooks';

/** The entity whose page's primary query a link prefetches. */
export type PrefetchTarget =
  | { kind: 'identity'; id: string }
  | { kind: 'contract'; id: string }
  | { kind: 'token'; id: string }
  | { kind: 'dpns'; name: string }
  | { kind: 'epoch'; index: number }
  | { kind: 'address'; addr: string }
  | { kind: 'identityByPkh'; pkh: string };

export const PREFETCH_DELAY_MS = 150;
/** At most this many prefetches run at once; further hovers are ignored. */
export const MAX_ACTIVE_PREFETCHES = 4;

export function prefetchKey(target: PrefetchTarget): string {
  switch (target.kind) {
    case 'dpns': return `dpns:${target.name}`;
    case 'epoch': return `epoch:${target.index}`;
    case 'address': return `address:${target.addr}`;
    case 'identityByPkh': return `identityByPkh:${target.pkh}`;
    default: return `${target.kind}:${target.id}`;
  }
}

// Requests are rendered by <PrefetchHost/>, which mounts the page's own query
// hook for each target until that query settles. Prefetches therefore share
// the page's cache key, proof capture and session handling exactly.
let active = new Map<string, PrefetchTarget>();
const started = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribePrefetches(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getActivePrefetches(): Map<string, PrefetchTarget> {
  return active;
}

/** Queue a prefetch once per SDK session; returns false when skipped. */
export function requestPrefetch(target: PrefetchTarget, sessionId: number): boolean {
  const key = prefetchKey(target);
  const sessionKey = `${sessionId}:${key}`;
  if (started.has(sessionKey) || active.has(key) || active.size >= MAX_ACTIVE_PREFETCHES) return false;
  started.add(sessionKey);
  active = new Map(active).set(key, target);
  emit();
  return true;
}

export function finishPrefetch(key: string) {
  if (!active.has(key)) return;
  active = new Map(active);
  active.delete(key);
  emit();
}

export function resetPrefetchesForTests() {
  active = new Map();
  started.clear();
}

/**
 * Hover/focus handlers that prefetch `target` after a short pause. Touch
 * input never prefetches (a tap navigates anyway, and a scroll is not intent),
 * nor does anything happen before the SDK session is ready.
 */
export function usePrefetchProps(target: PrefetchTarget | null | undefined) {
  const { status, sessionId } = useSdk();
  const timer = useRef<number | undefined>(undefined);
  const ready = status === 'ready';
  const key = target ? prefetchKey(target) : null;
  // `key` identifies the target; the object itself may be recreated each render.
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useMemo(() => {
    const cancel = () => window.clearTimeout(timer.current);
    const schedule = () => {
      const current = targetRef.current;
      if (!ready || !current) return;
      cancel();
      timer.current = window.setTimeout(() => requestPrefetch(current, sessionId), PREFETCH_DELAY_MS);
    };
    if (!key) return {};
    return {
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') schedule();
      },
      onPointerLeave: cancel,
      onFocus: (event: FocusEvent) => {
        // Keyboard focus only; a touch tap also focuses the link.
        if ((event.target as Element).matches?.(':focus-visible')) schedule();
      },
      onBlur: cancel,
    };
  }, [key, ready, sessionId]);
}
