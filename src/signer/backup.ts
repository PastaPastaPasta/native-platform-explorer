// Backup-file signer: loads a mainnet-bridge JSON backup, cross-references the
// embedded WIFs against the on-chain identity's public keys, and exposes
// `prepareSdk(criteria)` so the SDK facade methods can be called directly.
//
// Bridge backup shape (create mode):
//   {
//     network: "testnet" | "mainnet" | "devnet-...",
//     identityId: "<base58>",
//     mnemonic: "...",
//     identityKeys: [
//       { id, name, keyType, purpose, securityLevel, privateKeyWif,
//         privateKeyHex, publicKeyHex, derivationPath },
//       ...
//     ],
//     ...
//   }
//
// Top-up backups don't include identityKeys; they're not usable for signing
// state transitions and we reject them up-front.

import { IdentitySigner } from '@dashevo/evo-sdk';
import type { EvoSDK, IdentityPublicKey, Identity } from '@dashevo/evo-sdk';
import { isBase58Identifier } from '@util/identifier';
import type {
  ExplorerSigner,
  KeySelectionCriteria,
  SdkSigningMaterial,
  SignerKeyDescriptor,
} from './types';
import { SignerUnavailableError } from './types';

export interface BridgeBackupKey {
  id: number;
  name?: string;
  keyType?: string;
  purpose: string;
  securityLevel: string;
  privateKeyWif: string;
  privateKeyHex?: string;
  publicKeyHex?: string;
  derivationPath?: string;
}

export interface BridgeBackup {
  network?: string;
  identityId: string;
  identityKeys: BridgeBackupKey[];
  mnemonic?: string;
  mode?: string;
}

export interface ParsedBridgeBackup {
  network?: string;
  identityId: string;
  keys: BridgeBackupKey[];
}

const SECURITY_LEVEL_RANK: Record<string, number> = {
  MASTER: 0,
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
};

/** Parse and validate a bridge backup JSON payload. Throws with a useful
 *  message if the file is not usable for signing (e.g. top-up only). */
export function parseBridgeBackup(input: unknown): ParsedBridgeBackup {
  if (!input || typeof input !== 'object') {
    throw new Error('Backup is not a JSON object.');
  }
  const obj = input as Partial<BridgeBackup> & { targetIdentityId?: string };

  if (obj.mode === 'topup' || obj.targetIdentityId) {
    throw new Error(
      'This backup file is from a top-up — it contains only the one-time funding key, ' +
        'not identity keys. Use the "Create" backup from the bridge instead.',
    );
  }

  const identityId =
    typeof obj.identityId === 'string' ? obj.identityId.trim() : '';
  if (!isBase58Identifier(identityId)) {
    throw new Error('Backup does not contain a valid identityId.');
  }

  const rawKeys = obj.identityKeys;
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
    throw new Error('Backup does not contain any identityKeys.');
  }

  const keys: BridgeBackupKey[] = rawKeys.map((k, i) => {
    if (!k || typeof k !== 'object') {
      throw new Error(`identityKeys[${i}] is not an object.`);
    }
    const key = k as Partial<BridgeBackupKey>;
    if (typeof key.id !== 'number') {
      throw new Error(`identityKeys[${i}].id is missing or not a number.`);
    }
    if (typeof key.privateKeyWif !== 'string' || key.privateKeyWif.length === 0) {
      throw new Error(`identityKeys[${i}].privateKeyWif is missing.`);
    }
    if (typeof key.purpose !== 'string') {
      throw new Error(`identityKeys[${i}].purpose is missing.`);
    }
    if (typeof key.securityLevel !== 'string') {
      throw new Error(`identityKeys[${i}].securityLevel is missing.`);
    }
    return {
      id: key.id,
      name: key.name,
      keyType: key.keyType,
      purpose: key.purpose,
      securityLevel: key.securityLevel,
      privateKeyWif: key.privateKeyWif,
      privateKeyHex: key.privateKeyHex,
      publicKeyHex: key.publicKeyHex,
      derivationPath: key.derivationPath,
    };
  });

  return {
    network: typeof obj.network === 'string' ? obj.network : undefined,
    identityId,
    keys,
  };
}

function meetsMinSecurity(
  keyLevel: string,
  min: KeySelectionCriteria['minSecurityLevel'],
): boolean {
  if (!min) return true;
  const got = SECURITY_LEVEL_RANK[keyLevel.toUpperCase()];
  const need = SECURITY_LEVEL_RANK[min];
  if (got === undefined || need === undefined) return true;
  return got <= need;
}

function pickKey(
  keys: BridgeBackupKey[],
  criteria: KeySelectionCriteria | undefined,
): BridgeBackupKey {
  if (criteria?.keyId !== undefined) {
    const exact = keys.find((k) => k.id === criteria.keyId);
    if (!exact) {
      throw new Error(`No backup key with id ${criteria.keyId}.`);
    }
    return exact;
  }

  const purposeFilter = criteria?.purpose?.toUpperCase();
  const matches = keys.filter((k) => {
    if (purposeFilter && k.purpose.toUpperCase() !== purposeFilter) return false;
    if (!meetsMinSecurity(k.securityLevel, criteria?.minSecurityLevel)) return false;
    return true;
  });

  const pool = matches.length > 0 ? matches : keys;
  // Prefer the strongest security level available within the candidate pool.
  pool.sort((a, b) => {
    const ra = SECURITY_LEVEL_RANK[a.securityLevel.toUpperCase()] ?? 99;
    const rb = SECURITY_LEVEL_RANK[b.securityLevel.toUpperCase()] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.id - b.id;
  });
  const chosen = pool[0];
  if (!chosen) {
    throw new Error('No keys available for selection.');
  }
  return chosen;
}

/** Build a backup signer. Fetches the on-chain identity to resolve each
 *  backup key to its `IdentityPublicKey`, so signing material can be produced
 *  later without another round-trip. */
export async function createBackupSigner(
  sdk: EvoSDK,
  parsed: ParsedBridgeBackup,
): Promise<ExplorerSigner> {
  if (!isBase58Identifier(parsed.identityId)) {
    throw new SignerUnavailableError('Invalid identityId in backup.');
  }

  const identity: Identity | undefined = await sdk.identities.fetch(parsed.identityId);
  if (!identity) {
    throw new SignerUnavailableError(
      `Identity ${parsed.identityId} not found on the current network. ` +
        'Pick the network the identity was created on, then re-import.',
    );
  }

  // Build a working copy of the WIF map — we zero it out on destroy().
  let keysByIdRef: Map<number, BridgeBackupKey> | null = new Map(
    parsed.keys.map((k) => [k.id, k]),
  );

  // Sanity-check: every backup key id must exist on-chain.
  const onChainIds = new Set<number>();
  for (const pk of identity.publicKeys) {
    onChainIds.add(pk.keyId);
  }
  const missing = parsed.keys.filter((k) => !onChainIds.has(k.id));
  if (missing.length === parsed.keys.length) {
    throw new SignerUnavailableError(
      'None of the backup key ids exist on this identity. The backup may be ' +
        'from a different network or identity.',
    );
  }

  const descriptors: SignerKeyDescriptor[] = parsed.keys
    .filter((k) => onChainIds.has(k.id))
    .map((k) => ({
      id: k.id,
      purpose: k.purpose,
      type: k.keyType,
      securityLevel: k.securityLevel,
    }));

  return {
    kind: 'backup',
    identityId: parsed.identityId,
    async availableKeys() {
      return descriptors;
    },
    async sign(): Promise<Uint8Array> {
      throw new SignerUnavailableError(
        'Backup signer does not support raw-preimage signing. ' +
          'Use prepareSdk() and the SDK facade methods.',
      );
    },
    async prepareSdk(criteria?: KeySelectionCriteria): Promise<SdkSigningMaterial> {
      if (!keysByIdRef) {
        throw new SignerUnavailableError('Backup signer has been destroyed.');
      }

      // Filter to keys that exist on-chain — those are the only ones we can use.
      const usableKeys = Array.from(keysByIdRef.values()).filter((k) =>
        onChainIds.has(k.id),
      );
      if (usableKeys.length === 0) {
        throw new SignerUnavailableError(
          'No backup keys match on-chain identity public keys.',
        );
      }

      const chosen = pickKey(usableKeys, criteria);

      const identityKey: IdentityPublicKey | undefined = identity.getPublicKeyById(
        chosen.id,
      );
      if (!identityKey) {
        throw new SignerUnavailableError(
          `Identity has no public key with id ${chosen.id}.`,
        );
      }

      const identitySigner = new IdentitySigner();
      identitySigner.addKeyFromWif(chosen.privateKeyWif);

      return {
        identityKey,
        identitySigner,
        identityId: parsed.identityId,
        keyId: chosen.id,
      };
    },
    destroy() {
      if (keysByIdRef) {
        for (const key of keysByIdRef.values()) {
          // Best-effort wipe of WIF strings. JS doesn't let us zero string memory,
          // but we drop the reference so the GC can collect it.
          (key as { privateKeyWif?: string }).privateKeyWif = undefined;
        }
        keysByIdRef.clear();
        keysByIdRef = null;
      }
    },
  };
}
