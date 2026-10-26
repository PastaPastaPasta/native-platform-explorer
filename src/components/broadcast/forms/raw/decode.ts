// Local decoding of a signed state transition before it is broadcast.

import { freeAll } from '@/signer/form-keys';

export interface DecodedStateTransition {
  /** Canonical hex of the transition; this exact encoding is broadcast. */
  hex: string;
  type: string;
  /** SHA-256 of the serialized transition: the hash /state-transition looks up. */
  hash: string;
  ownerId?: string;
  signaturePublicKeyId?: number;
  identityNonce?: string;
  identityContractNonce?: string;
  userFeeIncrease: number;
}

const HEX = /^(?:[0-9a-f]{2})+$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Bytes of a pasted transition in hex or base64 (whitespace ignored). */
export function stateTransitionBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  if (!clean) throw new Error('Paste a state transition.');
  if (HEX.test(clean)) return Uint8Array.from(clean.match(/.{2}/g)!, (byte) => parseInt(byte, 16));
  if (BASE64.test(clean) && clean.length % 4 === 0) {
    const binary = atob(clean);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  throw new Error('Expected hex or base64.');
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return toHex(new Uint8Array(digest));
}

/**
 * Decode a signed transition with the SDK. The SDK's re-serialization must
 * equal the pasted bytes, so the hash shown is the hash of what is broadcast.
 */
export async function decodeStateTransition(text: string): Promise<DecodedStateTransition> {
  const bytes = stateTransitionBytes(text);
  const { StateTransition } = await import('@dashevo/evo-sdk');
  let transition: ReturnType<typeof StateTransition.fromBytes>;
  try {
    transition = StateTransition.fromBytes(bytes);
  } catch {
    throw new Error('The SDK could not decode these bytes as a state transition.');
  }
  try {
    const hex = transition.toHex();
    if (hex !== toHex(bytes))
      throw new Error('The transition does not re-encode to the same bytes; it was not broadcast.');
    const hash = await sha256Hex(bytes);
    if (transition.hash(false) !== hash)
      throw new Error('The SDK computed a different transition hash.');
    const owner = transition.ownerId;
    try {
      return {
        hex,
        type: transition.actionType,
        hash,
        ...(owner ? { ownerId: owner.toBase58() } : {}),
        ...(transition.signaturePublicKeyId !== undefined
          ? { signaturePublicKeyId: transition.signaturePublicKeyId }
          : {}),
        ...(transition.identityNonce !== undefined
          ? { identityNonce: String(transition.identityNonce) }
          : {}),
        ...(transition.identityContractNonce !== undefined
          ? { identityContractNonce: String(transition.identityContractNonce) }
          : {}),
        userFeeIncrease: transition.userFeeIncrease,
      };
    } finally {
      freeAll(owner);
    }
  } finally {
    freeAll(transition);
  }
}
