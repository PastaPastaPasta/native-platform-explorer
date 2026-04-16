'use client';

import { findWellKnown, type WellKnown } from '@constants/well-known';

export function useWellKnownName(id: string | undefined): WellKnown | undefined {
  if (!id) return undefined;
  return findWellKnown(id);
}
