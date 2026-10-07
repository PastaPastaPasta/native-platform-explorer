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

import type { EvoSDK } from '@dashevo/evo-sdk';
import { createLocalSigner, decodeWif, type ImportedPrivateKey } from './local';
import { isBase58Identifier } from '@util/identifier';
import type { ExplorerSigner } from './types';

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

  const identityId = typeof obj.identityId === 'string' ? obj.identityId.trim() : '';
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
    if (!Number.isSafeInteger(key.id) || Number(key.id) < 0) {
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
      id: key.id!,
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

  if (new Set(keys.map((key) => key.id)).size !== keys.length) {
    throw new Error('Backup contains duplicate identity key IDs.');
  }

  return {
    network: typeof obj.network === 'string' ? obj.network : undefined,
    identityId,
    keys,
  };
}

/** Import WIFs, then verify their actual public data against current on-chain keys. */
export async function createBackupSigner(
  sdk: EvoSDK,
  parsed: ParsedBridgeBackup,
): Promise<ExplorerSigner> {
  const imported: ImportedPrivateKey[] = [];
  try {
    for (const key of parsed.keys) {
      imported.push({ ...(await decodeWif(key.privateKeyWif)), keyId: key.id });
    }
    return await createLocalSigner(sdk, 'backup', parsed.identityId, imported);
  } catch (error) {
    imported.forEach((key) => key.bytes.fill(0));
    throw error;
  }
}
