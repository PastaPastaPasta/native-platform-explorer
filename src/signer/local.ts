import type { EvoSDK, IdentityPublicKey } from '@dashevo/evo-sdk';
import { isBase58Identifier } from '@util/identifier';
import { selectSigningKey } from './keys';
import type {
  ExplorerSigner,
  KeySelectionCriteria,
  SignerKeyDescriptor,
  SignerKind,
} from './types';
import { SignerUnavailableError } from './types';

export interface ImportedPrivateKey {
  bytes: Uint8Array;
  network: 'mainnet' | 'testnet';
  /** Backup keys must match this exact on-chain ID. WIF imports match by public data. */
  keyId?: number;
}

function descriptor(key: IdentityPublicKey): SignerKeyDescriptor {
  return {
    id: key.keyId,
    purpose: key.purpose,
    type: key.keyType,
    securityLevel: key.securityLevel,
    disabledAt: key.disabledAt,
  };
}

/** Takes ownership of the input byte arrays and wipes them on failure or destroy. */
export async function createLocalSigner(
  sdk: EvoSDK,
  kind: Exclude<SignerKind, 'extension'>,
  identityId: string,
  imported: ImportedPrivateKey[],
): Promise<ExplorerSigner> {
  let privateKeys: ImportedPrivateKey[] | null = imported;
  const destroy = () => {
    privateKeys?.forEach((key) => key.bytes.fill(0));
    privateKeys = null;
  };
  const assertLive = () => {
    if (!privateKeys)
      throw new SignerUnavailableError('Signer has been disconnected. Reconnect before signing.');
    return privateKeys;
  };

  async function matchedKeys() {
    assertLive();
    const identity = await sdk.identities.fetch(identityId);
    if (!identity)
      throw new SignerUnavailableError(
        'Identity not found on the current network. Check the identity ID and network.',
      );
    const keys = identity.publicKeys;
    try {
      const secrets = assertLive();
      const matched = keys.flatMap((publicKey) => {
        if (
          publicKey.disabledAt !== undefined ||
          !['ECDSA_SECP256K1', 'ECDSA_HASH160'].includes(publicKey.keyType)
        )
          return [];
        const secret = secrets.find(
          (key) =>
            (key.keyId === undefined || key.keyId === publicKey.keyId) &&
            publicKey.validatePrivateKey(key.bytes, key.network),
        );
        return secret ? [{ ...descriptor(publicKey), publicKey, secret }] : [];
      });
      keys
        .filter((key) => !matched.some((match) => match.publicKey === key))
        .forEach((key) => key.free());
      return matched;
    } catch (error) {
      keys.forEach((key) => key.free());
      throw error;
    } finally {
      identity.free();
    }
  }

  try {
    if (!isBase58Identifier(identityId))
      throw new SignerUnavailableError('Enter a valid identity ID.');
    const initial = await matchedKeys();
    initial.forEach((key) => key.publicKey.free());
    if (!initial.length)
      throw new SignerUnavailableError(
        'The imported private keys do not match any enabled ECDSA key on this identity. Check the identity, network, and derivation path.',
      );
  } catch (error) {
    destroy();
    throw error;
  }

  return {
    kind,
    identityId,
    sdk,
    async availableKeys() {
      const keys = await matchedKeys();
      try {
        return keys.map(({ publicKey }) => descriptor(publicKey));
      } finally {
        keys.forEach((key) => key.publicKey.free());
      }
    },
    async sign() {
      throw new SignerUnavailableError(
        'Raw-preimage signing is unavailable. Use an operation supported by the SDK signing interface.',
      );
    },
    async prepareSdk(criteria?: KeySelectionCriteria) {
      const { IdentitySigner, PrivateKey } = await import('@dashevo/evo-sdk');
      const keys = await matchedKeys();
      let selected: (typeof keys)[number] | undefined;
      let identitySigner: InstanceType<typeof IdentitySigner> | undefined;
      try {
        selected = selectSigningKey(keys, criteria);
        assertLive();
        identitySigner = new IdentitySigner();
        const privateKey = PrivateKey.fromBytes(selected.secret.bytes, selected.secret.network);
        try {
          identitySigner.addKey(privateKey);
        } finally {
          privateKey.free();
        }
        const material = {
          identityKey: selected.publicKey,
          identitySigner,
          identityId,
          keyId: selected.id,
        };
        let released = false;
        return {
          ...material,
          release() {
            if (released) return;
            released = true;
            material.identitySigner.free();
            material.identityKey.free();
          },
        };
      } catch (error) {
        identitySigner?.free();
        selected = undefined;
        throw error;
      } finally {
        keys.filter((key) => key !== selected).forEach((key) => key.publicKey.free());
      }
    },
    destroy,
  };
}

export async function decodeWif(wif: string): Promise<ImportedPrivateKey> {
  const { wallet } = await import('@dashevo/evo-sdk');
  const pair = await wallet.keyPairFromWif(wif);
  try {
    if (pair.network !== 'mainnet' && pair.network !== 'testnet') {
      throw new SignerUnavailableError('The WIF uses an unsupported network.');
    }
    const hex = pair.privateKeyHex;
    if (!/^[a-f0-9]{64}$/i.test(hex))
      throw new SignerUnavailableError('The SDK returned an invalid private key.');
    return {
      bytes: Uint8Array.from(hex.match(/.{2}/g)!, (byte) => parseInt(byte, 16)),
      network: pair.network,
    };
  } finally {
    pair.free();
  }
}
