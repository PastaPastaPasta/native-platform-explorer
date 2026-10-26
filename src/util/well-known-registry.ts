import { onNetwork, type WellKnown, type WellKnownKind } from '@constants/well-known';
import { proTxHashToBase58, proTxHashToHex } from './protx';

export type WellKnownSource = 'bundled' | 'remote' | 'local';
export type RegistryEntry = WellKnown & { source: WellKnownSource };

/** Upper bounds for the remote registry (`NEXT_PUBLIC_WELL_KNOWN_URL`). */
export const MAX_REMOTE_BYTES = 256 * 1024;
export const MAX_REMOTE_ENTRIES = 500;
export const MAX_LOCAL_ENTRIES = 100;
export const LOCAL_REGISTRY_KEY = 'npe:wellKnownLocal';

const KINDS: readonly WellKnownKind[] = ['contract', 'token', 'identity'];
const ENTRY_KEYS = new Set(['id', 'kind', 'name', 'description', 'url', 'tags', 'network']);
const NETWORK_RE = /^[a-z0-9-]{1,48}$/;
const TAG_RE = /^[a-z0-9-]{1,32}$/;
// Printable text only: no control characters, bidi overrides or line breaks.
const UNSAFE_TEXT_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;

export class RegistryError extends Error {
  override name = 'RegistryError';
}

/** A canonical base58 Identifier: exactly 32 bytes, encoded as the SDK prints it. */
export function isCanonicalIdentifier(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(value)) return false;
  const hex = proTxHashToHex(value);
  return !!hex && proTxHashToBase58(hex) === value;
}

function text(raw: unknown, field: string, max: number, required: boolean): string | undefined {
  if (raw === undefined && !required) return undefined;
  if (typeof raw !== 'string') throw new RegistryError(`${field} must be a string.`);
  const value = raw.trim();
  if (!value) throw new RegistryError(`${field} must not be empty.`);
  if (value.length > max) throw new RegistryError(`${field} is longer than ${max} characters.`);
  if (UNSAFE_TEXT_RE.test(value)) throw new RegistryError(`${field} contains control characters.`);
  return value;
}

function httpsUrl(raw: unknown, field: string): string | undefined {
  const value = text(raw, field, 2048, false);
  if (value === undefined) return undefined;
  let url: URL;
  try { url = new URL(value); } catch { throw new RegistryError(`${field} is not an absolute URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new RegistryError(`${field} must be an https:// URL without credentials.`);
  }
  return url.toString();
}

/** Validate one registry entry. Unknown keys are rejected so a typo cannot
 *  silently drop data. Throws a RegistryError naming the problem. */
export function parseRegistryEntry(raw: unknown, label = 'entry'): WellKnown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RegistryError(`${label} must be an object.`);
  }
  const item = raw as Record<string, unknown>;
  const unknownKey = Object.keys(item).find((key) => !ENTRY_KEYS.has(key));
  if (unknownKey) throw new RegistryError(`${label} has an unsupported field "${unknownKey}".`);
  if (typeof item.id !== 'string' || !isCanonicalIdentifier(item.id)) {
    throw new RegistryError(`${label}.id must be a 32-byte base58 identifier.`);
  }
  if (typeof item.kind !== 'string' || !KINDS.includes(item.kind as WellKnownKind)) {
    throw new RegistryError(`${label}.kind must be one of ${KINDS.join(', ')}.`);
  }
  const entry: WellKnown = {
    id: item.id,
    kind: item.kind as WellKnownKind,
    name: text(item.name, `${label}.name`, 64, true)!,
  };
  const description = text(item.description, `${label}.description`, 280, false);
  if (description) entry.description = description;
  const url = httpsUrl(item.url, `${label}.url`);
  if (url) entry.url = url;
  if (item.tags !== undefined) {
    if (!Array.isArray(item.tags) || item.tags.length > 8 || !item.tags.every((tag) => typeof tag === 'string' && TAG_RE.test(tag))) {
      throw new RegistryError(`${label}.tags must be up to 8 lowercase tags (a-z, 0-9, -).`);
    }
    entry.tags = [...new Set(item.tags as string[])];
  }
  if (item.network !== undefined) {
    if (typeof item.network !== 'string' || !NETWORK_RE.test(item.network)) {
      throw new RegistryError(`${label}.network must be a network name such as mainnet or testnet.`);
    }
    entry.network = item.network;
  }
  return entry;
}

/** Parse a remote registry document: `{ "version": 1, "entries": [ … ] }`.
 *  Strict: one invalid entry rejects the whole document. */
export function parseRegistryDocument(raw: unknown): WellKnown[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RegistryError('The registry must be a JSON object with "version" and "entries".');
  }
  const doc = raw as Record<string, unknown>;
  const unknownKey = Object.keys(doc).find((key) => key !== 'version' && key !== 'entries');
  if (unknownKey) throw new RegistryError(`The registry has an unsupported field "${unknownKey}".`);
  if (doc.version !== 1) throw new RegistryError('Unsupported registry version (expected 1).');
  if (!Array.isArray(doc.entries)) throw new RegistryError('"entries" must be an array.');
  if (doc.entries.length > MAX_REMOTE_ENTRIES) {
    throw new RegistryError(`The registry has more than ${MAX_REMOTE_ENTRIES} entries.`);
  }
  const entries = doc.entries.map((entry, index) => parseRegistryEntry(entry, `entries[${index}]`));
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.network ?? '*'}:${entry.id}`;
    if (seen.has(key)) throw new RegistryError(`Duplicate entry ${entry.id}.`);
    seen.add(key);
  }
  return entries;
}

/** Fetch and validate the remote registry. Sizes are checked before and
 *  after reading, since Content-Length may be absent. */
export async function fetchRemoteRegistry(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<WellKnown[]> {
  let resolved: URL;
  try {
    resolved = new URL(url, typeof window === 'undefined' ? undefined : window.location.href);
  } catch {
    throw new RegistryError('NEXT_PUBLIC_WELL_KNOWN_URL is not a valid URL.');
  }
  const sameOrigin = typeof window !== 'undefined' && resolved.origin === window.location.origin;
  if (resolved.protocol !== 'https:' && !sameOrigin) {
    throw new RegistryError('The registry URL must use https://.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(resolved.toString(), {
      signal: controller.signal,
      credentials: 'omit',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new RegistryError(`The registry request failed with HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_REMOTE_BYTES) throw new RegistryError(`The registry is larger than ${MAX_REMOTE_BYTES / 1024} KiB.`);
    const body = await response.text();
    if (new TextEncoder().encode(body).length > MAX_REMOTE_BYTES) {
      throw new RegistryError(`The registry is larger than ${MAX_REMOTE_BYTES / 1024} KiB.`);
    }
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new RegistryError('The registry is not valid JSON.'); }
    return parseRegistryDocument(json);
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    if (controller.signal.aborted) throw new RegistryError(`The registry did not load within ${timeoutMs / 1000} s.`);
    throw new RegistryError(`The registry could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Merge registry sources for one network. On a duplicate ID the earlier
 *  source wins: bundled, then remote, then local. */
export function mergeRegistry(
  sources: { bundled: WellKnown[]; remote: WellKnown[]; local: WellKnown[] },
  network?: string,
): RegistryEntry[] {
  const out: RegistryEntry[] = [];
  const seen = new Set<string>();
  const add = (entries: WellKnown[], source: WellKnownSource) => {
    for (const entry of entries) {
      if (!onNetwork(entry, network)) continue;
      const key = network ? entry.id : `${entry.network ?? '*'}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...entry, source });
    }
  };
  add(sources.bundled, 'bundled');
  add(sources.remote, 'remote');
  add(sources.local, 'local');
  return out;
}

/** Local entries from browser storage. Invalid stored entries are dropped. */
export function readLocalRegistry(): WellKnown[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LOCAL_REGISTRY_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const out: WellKnown[] = [];
    for (const item of parsed.slice(0, MAX_LOCAL_ENTRIES)) {
      try { out.push(parseRegistryEntry(item)); } catch { /* skip a corrupted entry */ }
    }
    return out;
  } catch {
    return [];
  }
}

export function writeLocalRegistry(entries: WellKnown[]): void {
  if (entries.length === 0) window.localStorage.removeItem(LOCAL_REGISTRY_KEY);
  else window.localStorage.setItem(LOCAL_REGISTRY_KEY, JSON.stringify(entries));
}

/** Validate and append a local entry. Throws on invalid input, a duplicate
 *  of any existing entry on the same network, or a full list. */
export function addLocalEntry(current: WellKnown[], raw: unknown, existing: RegistryEntry[]): WellKnown[] {
  const entry = parseRegistryEntry(raw);
  const clash = existing.find((other) => other.id === entry.id
    && (!other.network || !entry.network || other.network === entry.network));
  if (clash) throw new RegistryError(`${entry.id} is already in the registry as "${clash.name}" (${clash.source}).`);
  if (current.length >= MAX_LOCAL_ENTRIES) {
    throw new RegistryError(`Remove a local entry before adding more (limit: ${MAX_LOCAL_ENTRIES}).`);
  }
  return [...current, entry];
}
