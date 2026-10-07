import { isBase58Identifier } from './identifier';

export type SavedEntityKind = 'identity' | 'contract' | 'token';

export interface SavedEntity {
  kind: SavedEntityKind;
  id: string;
  network: string;
  savedAt: number;
}

const KEY = 'npe:savedEntities';
const EVENT = 'npe:savedEntitiesChanged';
export const MAX_SAVED_ENTITIES = 100;

/** Preserve query parameters and fragments while binding a local link to a network. */
export function withNetwork(href: string, network: string): string {
  const url = new URL(href, 'https://explorer.invalid');
  url.searchParams.set('network', network);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Use the real browser URL so GitHub Pages prefixes are retained. */
export function shareUrl(href: string, network: string): string {
  const url = new URL(href);
  url.searchParams.set('network', network);
  return url.toString();
}

export function savedEntityHref(entity: Pick<SavedEntity, 'kind' | 'id' | 'network'>): string {
  return withNetwork(`/${entity.kind}/?id=${encodeURIComponent(entity.id)}`, entity.network);
}

export function sameEntity(a: Pick<SavedEntity, 'kind' | 'id' | 'network'>, b: Pick<SavedEntity, 'kind' | 'id' | 'network'>): boolean {
  return a.kind === b.kind && a.id === b.id && a.network === b.network;
}

function validEntity(value: unknown): value is SavedEntity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    (item.kind === 'identity' || item.kind === 'contract' || item.kind === 'token') &&
    typeof item.id === 'string' && isBase58Identifier(item.id) &&
    typeof item.network === 'string' && /^[a-z0-9-]{1,80}$/.test(item.network) &&
    typeof item.savedAt === 'number' && Number.isFinite(item.savedAt) && item.savedAt >= 0
  );
}

function readSavedEntities(): SavedEntity[] {
  const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(validEntity).filter((item, index, items) => (
    items.findIndex((other) => sameEntity(item, other)) === index
  )).slice(0, MAX_SAVED_ENTITIES);
}

export function getSavedEntities(): SavedEntity[] {
  if (typeof window === 'undefined') return [];
  try {
    return readSavedEntities();
  } catch {
    return [];
  }
}

function persist(items: SavedEntity[]): void {
  if (items.length === 0) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function saveEntity(entity: Pick<SavedEntity, 'kind' | 'id' | 'network'>): void {
  const item = { ...entity, savedAt: Date.now() };
  if (!validEntity(item)) throw new Error('This entity cannot be saved.');
  // Mutations must fail on unreadable storage rather than overwrite an
  // existing collection with the rendering getter's empty fallback.
  const current = readSavedEntities();
  if (current.some((other) => sameEntity(item, other))) return;
  if (current.length >= MAX_SAVED_ENTITIES) {
    throw new Error(`Remove a saved item before adding more (limit: ${MAX_SAVED_ENTITIES}).`);
  }
  persist([item, ...current]);
}

export function removeSavedEntity(entity: Pick<SavedEntity, 'kind' | 'id' | 'network'>): void {
  persist(readSavedEntities().filter((item) => !sameEntity(item, entity)));
}

export function clearSavedEntities(): void {
  persist([]);
}

export function subscribeSavedEntities(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
