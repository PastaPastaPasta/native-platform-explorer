'use client';

import type { WellKnown } from '@constants/well-known';
import { useWellKnownRegistry } from './useWellKnownRegistry';

export function useWellKnownName(id: string | undefined): WellKnown | undefined {
  const { entries } = useWellKnownRegistry();
  if (!id) return undefined;
  return entries.find((entry) => entry.id === id);
}
