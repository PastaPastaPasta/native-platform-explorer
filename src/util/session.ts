// Tiny localStorage-backed LRU of recently-viewed identity IDs. Opt-in; the
// store remains empty until the caller explicitly records an id (typically
// the IdentityView after the user accepts the first-visit banner).

const KEY = 'npe:viewedIdentities';
const CONSENT_KEY = 'npe:viewedIdentitiesConsent';
const CHANGE_EVENT = 'npe:viewedIdentitiesChanged';
const MAX = 50;

// If a browser refuses a removal, keep the current tab private until a
// successful write or an update from another tab replaces that value.
let revokedStorage: Storage | null = null;
let clearedStorage: Storage | null = null;

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readItem(ls: Storage, key: string): string | null {
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}

function removeItem(ls: Storage, key: string): boolean {
  try {
    ls.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function notifyChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Subscribe to updates from this page and other tabs using localStorage. */
export function subscribeViewedIdentities(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== safeLocalStorage()) return;
    if (event.key !== null && event.key !== KEY && event.key !== CONSENT_KEY) return;
    if (event.key === null || event.key === CONSENT_KEY) revokedStorage = null;
    if (event.key === null || event.key === KEY) clearedStorage = null;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function hasConsent(): boolean {
  const ls = safeLocalStorage();
  return ls !== null && ls !== revokedStorage && readItem(ls, CONSENT_KEY) === '1';
}

export function setConsent(consent: boolean): boolean {
  const ls = safeLocalStorage();
  let saved = false;
  if (ls) {
    if (consent) {
      // Old history without consent must not return when the user opts in.
      if (!hasConsent()) {
        if (!removeItem(ls, KEY)) {
          clearedStorage = ls;
          notifyChange();
          return false;
        }
        clearedStorage = null;
      }
      try {
        ls.setItem(CONSENT_KEY, '1');
        revokedStorage = null;
        saved = true;
      } catch {
        // A failed opt-in must not enable recording.
      }
    } else {
      const consentRemoved = removeItem(ls, CONSENT_KEY);
      const historyRemoved = removeItem(ls, KEY);
      revokedStorage = consentRemoved ? null : ls;
      clearedStorage = historyRemoved ? null : ls;
      saved = consentRemoved && historyRemoved;
    }
  }
  notifyChange();
  return saved;
}

export function getViewedIdentities(): string[] {
  const ls = safeLocalStorage();
  if (!ls || ls === clearedStorage || !hasConsent()) return [];
  try {
    return readHistory(ls);
  } catch {
    return [];
  }
}

function readHistory(ls: Storage): string[] {
  const raw = ls.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function recordViewedIdentity(id: string): string[] {
  if (!hasConsent()) return [];
  const ls = safeLocalStorage();
  if (!ls) return [];
  let current: string[];
  try {
    current = (ls === clearedStorage ? [] : readHistory(ls)).filter((x) => x !== id);
  } catch {
    // Preserve existing history if a transient read failed before a write.
    return [];
  }
  current.unshift(id);
  const trimmed = current.slice(0, MAX);
  try {
    ls.setItem(KEY, JSON.stringify(trimmed));
    clearedStorage = null;
  } catch {
    return getViewedIdentities();
  }
  notifyChange();
  return trimmed;
}

export function clearViewedIdentities(): boolean {
  const ls = safeLocalStorage();
  const cleared = ls !== null && removeItem(ls, KEY);
  if (ls) clearedStorage = cleared ? null : ls;
  notifyChange();
  return cleared;
}
