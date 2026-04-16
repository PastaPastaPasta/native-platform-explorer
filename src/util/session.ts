// Tiny localStorage-backed LRU of recently-viewed identity IDs. Opt-in; the
// store remains empty until the caller explicitly records an id (typically
// the IdentityView after the user accepts the first-visit banner).

const KEY = 'npe:viewedIdentities';
const CONSENT_KEY = 'npe:viewedIdentitiesConsent';
const MAX = 50;

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasConsent(): boolean {
  return safeLocalStorage()?.getItem(CONSENT_KEY) === '1';
}

export function setConsent(consent: boolean) {
  const ls = safeLocalStorage();
  if (!ls) return;
  if (consent) ls.setItem(CONSENT_KEY, '1');
  else ls.removeItem(CONSENT_KEY);
}

export function getViewedIdentities(): string[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const raw = ls.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function recordViewedIdentity(id: string): string[] {
  if (!hasConsent()) return getViewedIdentities();
  const ls = safeLocalStorage();
  if (!ls) return [];
  const current = getViewedIdentities().filter((x) => x !== id);
  current.unshift(id);
  const trimmed = current.slice(0, MAX);
  ls.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearViewedIdentities() {
  safeLocalStorage()?.removeItem(KEY);
}
