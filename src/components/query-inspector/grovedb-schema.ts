/**
 * Human-readable names for well-known GroveDB tree keys in Dash Platform.
 *
 * Source-of-truth references in /Users/pasta/workspace/platform:
 *   - packages/rs-drive/src/drive/mod.rs (RootTree enum)
 *   - packages/rs-drive/src/drive/identity/mod.rs (IdentityRootStructure)
 *   - packages/rs-drive/src/drive/tokens/paths.rs (TOKEN_* keys)
 *   - packages/rs-drive/src/drive/votes/paths.rs (Vote tree chars)
 *
 * Keys are stored here as lowercase hex byte values (single byte, no 0x prefix).
 * The proof parser prints keys as text when every byte is in
 * `[A-Za-z0-9_\-/\\[\]@]` and as `0x…` hex otherwise; see `normalizeKey`.
 */

export type GroveContext =
  | 'root'
  | 'identity'
  | 'tokens'
  | 'token-id'
  | 'votes'
  | 'pools'
  | 'misc'
  | 'data-contract'
  | 'contract-id'
  | 'contract-documents'
  | 'document-type'
  | 'document-primary'
  | 'index-property'
  | 'index-value'
  | 'index-references'
  | 'unknown';

interface KeyInfo {
  /** Human-readable name for this byte at this context. */
  name: string;
  /** When entering this key opens a nested subtree, the context to use for that subtree's children. */
  nextContext?: GroveContext;
  /** Optional one-line description for tooltips/annotations. */
  description?: string;
}

/**
 * GroveDB path under DataContractDocuments (root key 0x40):
 *   [0x40, contract_id (32B), 0x01, document_type_name, 0x00, document_id (32B)]
 *
 * So once we enter DataContractDocuments, the chain is:
 *   data-contract  → 32-byte contract ID
 *   contract-id    → 0x01 = documents tree
 *   contract-documents → document type name (variable-length UTF-8 string)
 *   document-type  → 0x00 = primary keys tree, or the first property name of an index
 *   document-primary → 32-byte document ID
 *
 * Index trees hang off the document-type tree, alternating property names and
 * values: [..., docType, prop1, value1, prop2, value2, 0x00]. The 0x00 key
 * under the last value terminates the index: a reference for unique indexes,
 * or a tree of references keyed by document ID.
 *   index-property → an encoded property value
 *   index-value    → the next index property name, or 0x00 = index terminator
 *   index-references → 32-byte document ID
 */

/** Indices into the root tree (single byte). */
const ROOT_TREE: Record<string, KeyInfo> = {
  '08': { name: 'NonUniquePublicKeyHashesToIdentities', description: 'Index from non-unique public key hashes (e.g. masternode keys) to identity IDs.' },
  '10': { name: 'Tokens', nextContext: 'token-id', description: 'Per-token subtrees: balances, info, statuses, distributions.' },
  '18': { name: 'UniquePublicKeyHashesToIdentities', description: 'Index from unique public key hashes to identity IDs.' },
  '20': { name: 'Identities', nextContext: 'identity', description: 'Per-identity subtrees: keys, nonce, contract info, revision.' },
  '24': { name: 'SavedBlockTransactions', description: 'Address-based transactions saved for sync purposes.' },
  '28': { name: 'PreFundedSpecializedBalances', description: 'Credit balances prefunded for specific state-transition criteria.' },
  '30': { name: 'Pools', nextContext: 'pools', description: 'Credit pools: epochs, fees, masternode rewards.' },
  '34': { name: 'ShieldedBalances', description: 'Shielded credit pools (sum tree).' },
  '38': { name: 'AddressBalances', description: 'Single-use key balances.' },
  '40': { name: 'DataContractDocuments (@)', nextContext: 'data-contract', description: 'Per-contract document storage and indexes. Path: [0x40, contractId, 0x01, docType, 0x00, docId].' },
  '48': { name: 'SpentAssetLockTransactions', description: 'Asset-lock transactions that have already been consumed.' },
  '50': { name: 'WithdrawalTransactions', description: 'Pending withdrawals from Platform back to Dash Core.' },
  '58': { name: 'GroupActions', description: 'Multi-sig group action state.' },
  '60': { name: 'Balances', description: 'Identity credit balances (sum tree).' },
  '68': { name: 'Misc', nextContext: 'misc', description: 'Catch-all: protocol-version votes, genesis info, etc.' },
  '70': { name: 'Votes', nextContext: 'votes', description: 'Contested-resource voting state.' },
  '78': { name: 'Versions', description: 'Protocol versions desired by proposers.' },
};

/** Subtree keys inside an Identity (after the 32-byte identity ID). */
const IDENTITY_TREE: Record<string, KeyInfo> = {
  '20': { name: 'ContractInfo', description: "Per-contract nonces and metadata for this identity's documents." },
  '40': { name: 'Nonce', description: 'Replay-protection counter for this identity.' },
  '60': { name: 'NegativeCredit', description: 'Owed processing fees.' },
  '80': { name: 'IdentityKeys', description: 'The public keys this identity controls.' },
  'a0': { name: 'IdentityKeyReferences', description: 'Lookup index from key purpose/security to key ID.' },
  'c0': { name: 'Revision', description: 'Monotonic revision counter for identity-level updates.' },
};

/** Subtree keys inside a per-token tree (after the 32-byte token ID). */
const TOKEN_TREE: Record<string, KeyInfo> = {
  '20': { name: 'Distributions', description: 'Distribution configurations (timed, perpetual, pre-programmed).' },
  '40': { name: 'Status', description: 'Token status: active, paused, frozen.' },
  '5c': { name: 'DirectSellPrice', description: 'Direct-purchase price configuration.' },
  '80': { name: 'Balances', description: 'Per-identity token balances (sum tree).' },
  'a0': { name: 'ContractInfo', description: 'Owning contract ID and position within that contract.' },
  'c0': { name: 'IdentityInfo', description: 'Per-identity token info (frozen status, etc.).' },
};

/** Keys directly inside a per-contract subtree (after the 32-byte contract ID). */
const CONTRACT_ID_TREE: Record<string, KeyInfo> = {
  '00': { name: 'Contract definition', description: 'The serialized DataContract schema, stored as a leaf here.' },
  '01': { name: 'Documents tree', nextContext: 'contract-documents', description: 'Holds one subtree per document type defined by this contract.' },
};

/** Keys inside the document-type subtree; any other key names an index property. */
const DOCUMENT_TYPE_TREE: Record<string, KeyInfo> = {
  '00': { name: 'Primary keys tree', nextContext: 'document-primary', description: 'Holds the document records keyed by their 32-byte primary key (document ID).' },
};

/** Keys inside an index value subtree; any other key names the next index property. */
const INDEX_VALUE_TREE: Record<string, KeyInfo> = {
  '00': { name: 'Index terminator', nextContext: 'index-references', description: 'Ends the index path: a reference to the document for unique indexes, or references keyed by document ID.' },
};

/** Votes tree uses ASCII character bytes. */
const VOTES_TREE: Record<string, KeyInfo> = {
  '63': { name: "'c' ContestedResource", description: 'Contested DPNS names and other contested document resources.' },
  '64': { name: "'d' VoteDecisions", description: 'Recorded vote decisions from masternodes.' },
  '65': { name: "'e' EndDateQueries", description: 'Index of vote polls by end date, for querying soon-to-close polls.' },
  '69': { name: "'i' IdentityVotes", description: 'Per-identity vote history.' },
  '70': { name: "'p' ActivePolls", description: 'Currently active vote polls.' },
};

/** Characters grovedb-query's `hex_to_ascii` prints as plain text. A key made
 *  only of these is printed verbatim (e.g. `@`, `domain`, `dash`); any other
 *  key is printed as `0x` + lowercase hex. An empty key prints as nothing. */
const PRINTABLE_KEY = /^[A-Za-z0-9_\-/\\[\]@]*$/;

/** Normalize a key emitted by the Rust parser to lowercase hex bytes.
 *  Returns null when the text cannot be a parser-printed key.
 *
 *  `0x` followed by an even number of hex digits is read as hex. A printable
 *  key that happens to look like that (the 4-byte text `0x40`) is
 *  indistinguishable in the printed form; hex is the likelier reading. */
function normalizeKey(raw: string): { hex: string; printedAsHex: boolean } | null {
  if (/^0x(?:[0-9a-fA-F]{2})+$/.test(raw)) return { hex: raw.slice(2).toLowerCase(), printedAsHex: true };
  if (!PRINTABLE_KEY.test(raw)) return null;
  let hex = '';
  for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
  return { hex, printedAsHex: false };
}

export interface DecodedKey {
  /** Original raw key string from the parser, for display. */
  raw: string;
  /** Human-readable name, if known. */
  name?: string;
  /** Description tooltip. */
  description?: string;
  /** Context for child layers. */
  nextContext?: GroveContext;
  /** True when the key looks like a 32-byte identifier (identity, contract, etc.). */
  isIdentifier: boolean;
}

/** Per-context label/next-context for 32-byte identifier keys.
 *  Contexts not listed fall through to a generic "32-byte identifier" label. */
const IDENTIFIER_BY_CONTEXT: Partial<Record<GroveContext, { name: string; nextContext?: GroveContext }>> = {
  tokens: { name: '32-byte token ID', nextContext: 'token-id' },
  'data-contract': { name: '32-byte contract ID', nextContext: 'contract-id' },
  identity: { name: '32-byte identity ID' },
  'document-primary': { name: '32-byte document ID' },
  'index-references': { name: '32-byte document ID' },
  'index-property': { name: '32-byte indexed value', nextContext: 'index-value' },
};

/** Single-byte key tables, keyed by context. Contexts without a table have no decodable keys. */
const TABLE_BY_CONTEXT: Partial<Record<GroveContext, Record<string, KeyInfo>>> = {
  root: ROOT_TREE,
  identity: IDENTITY_TREE,
  tokens: TOKEN_TREE,
  'token-id': TOKEN_TREE,
  votes: VOTES_TREE,
  'contract-id': CONTRACT_ID_TREE,
  'document-type': DOCUMENT_TYPE_TREE,
  'index-value': INDEX_VALUE_TREE,
};

/** Try to decode a hex string as an ASCII identifier (e.g. document type name). */
function asciiFromHex(hex: string): string | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    if (b < 0x20 || b >= 0x7f) return null;
    out += String.fromCharCode(b);
  }
  return out;
}

export function decodeGroveKey(raw: string, context: GroveContext): DecodedKey {
  const norm = normalizeKey(raw);

  // 32-byte identifiers (identity IDs, contract IDs, token IDs). Random IDs
  // essentially never consist only of printable key characters, so require
  // the hex form; a 32-character label or type name stays text.
  if (norm?.printedAsHex && norm.hex.length === 64) {
    const info = IDENTIFIER_BY_CONTEXT[context] ?? { name: '32-byte identifier' };
    return { raw, name: info.name, nextContext: info.nextContext, isIdentifier: true };
  }

  if (!norm) return { raw, isIdentifier: false };

  const info = TABLE_BY_CONTEXT[context]?.[norm.hex];
  if (info) {
    return {
      raw,
      name: info.name,
      description: info.description,
      nextContext: info.nextContext,
      isIdentifier: false,
    };
  }

  // Document type names and index property names are UTF-8 text such as
  // "domain" or "normalizedLabel"; the parser usually prints them verbatim.
  const ascii = asciiFromHex(norm.hex);
  if (context === 'contract-documents' && ascii) {
    return {
      raw,
      name: `'${ascii}' (document type)`,
      nextContext: 'document-type',
      description: `The "${ascii}" document type defined by this contract.`,
      isIdentifier: false,
    };
  }
  if ((context === 'document-type' || context === 'index-value') && ascii) {
    return {
      raw,
      name: `'${ascii}' (index property)`,
      nextContext: 'index-property',
      description: `Index level for the "${ascii}" property; its keys are the indexed values.`,
      isIdentifier: false,
    };
  }
  if (context === 'index-property') {
    return {
      raw,
      name: ascii ? `'${ascii}' (indexed value)` : 'indexed value',
      nextContext: 'index-value',
      description: 'An encoded property value. Documents with this value continue under it.',
      isIdentifier: false,
    };
  }

  return { raw, isIdentifier: false };
}

/** Human label for a context. */
export function contextLabel(c: GroveContext): string {
  switch (c) {
    case 'root': return 'root tree';
    case 'identity': return 'Identity subtree';
    case 'tokens': return 'Tokens subtree';
    case 'token-id': return 'per-token subtree';
    case 'votes': return 'Votes subtree';
    case 'pools': return 'Pools subtree';
    case 'misc': return 'Misc subtree';
    case 'data-contract': return 'DataContractDocuments subtree';
    case 'contract-id': return 'per-contract subtree';
    case 'contract-documents': return 'documents-by-type subtree';
    case 'document-type': return 'per-document-type subtree';
    case 'document-primary': return 'document primary keys tree';
    case 'index-property': return 'index property subtree';
    case 'index-value': return 'index value subtree';
    case 'index-references': return 'index references subtree';
    case 'unknown': return 'subtree';
  }
}
