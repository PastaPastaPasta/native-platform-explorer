'use client';

import { useEffect, useState } from 'react';
import {
  clearSavedEntities,
  getSavedEntities,
  removeSavedEntity,
  saveEntity,
  subscribeSavedEntities,
  type SavedEntity,
} from '@util/exploration';

export function useSavedEntities() {
  const [items, setItems] = useState<SavedEntity[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const refresh = () => setItems(getSavedEntities());
    const unsubscribe = subscribeSavedEntities(refresh);
    refresh();
    setReady(true);
    return unsubscribe;
  }, []);

  const mutate = (action: () => void): boolean => {
    try {
      action();
      setError(null);
      return true;
    } catch (cause) {
      setError(new Error(cause instanceof Error ? cause.message : 'Browser storage is unavailable.'));
      return false;
    }
  };

  return {
    items,
    ready,
    error,
    save: (entity: Pick<SavedEntity, 'kind' | 'id' | 'network'>) => mutate(() => saveEntity(entity)),
    remove: (entity: SavedEntity) => mutate(() => removeSavedEntity(entity)),
    clear: () => mutate(clearSavedEntities),
  };
}
