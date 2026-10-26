import type { QueryKey } from '@tanstack/react-query';
import type { Network } from './networks';

/** Every SDK-backed cache key is `['npe', network, trusted, sessionId, ...]`. */
export function getSdkQueryKey(
  { network, trusted, sessionId }: { network: Network; trusted: boolean; sessionId: number },
  key: QueryKey,
): QueryKey {
  return ['npe', network, trusted, sessionId, ...key];
}

/** True for an SDK session key that belongs to any session but `current`.
 * Session IDs are never reused, so such entries can never be read again.
 * Network-scoped keys without a session (Core status, rates) are kept. */
export function isRetiredSessionKey(key: QueryKey, current: number): boolean {
  return key[0] === 'npe'
    && typeof key[2] === 'boolean'
    && typeof key[3] === 'number'
    && key[3] !== current;
}
