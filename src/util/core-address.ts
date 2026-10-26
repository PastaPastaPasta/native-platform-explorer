// Dash Core (L1) addresses: base58check with a one-byte version, P2PKH or P2SH.

import type { CoreScript } from '@dashevo/evo-sdk';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const VERSIONS = {
  mainnet: { p2pkh: 0x4c, p2sh: 0x10 },
  testnet: { p2pkh: 0x8c, p2sh: 0x13 },
} as const;

function base58Decode(text: string): Uint8Array | null {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const char of text) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/**
 * The version byte and 20-byte hash of a Dash address for `network`, or null.
 * The checksum is left to the SDK (`wallet.validateAddress`), and
 * `coreScriptForAddress` checks the script round-trips to the same address.
 */
export function decodeCoreAddress(
  address: string,
  network: 'mainnet' | 'testnet',
): { type: 'p2pkh' | 'p2sh'; hash: Uint8Array } | null {
  const bytes = base58Decode(address.trim());
  if (!bytes || bytes.length !== 25) return null;
  const versions = VERSIONS[network];
  const type = bytes[0] === versions.p2pkh ? 'p2pkh' : bytes[0] === versions.p2sh ? 'p2sh' : null;
  return type ? { type, hash: bytes.slice(1, 21) } : null;
}

/** The output script that pays `address`, verified to encode back to it. */
export async function coreScriptForAddress(
  address: string,
  network: 'mainnet' | 'testnet',
): Promise<CoreScript> {
  const { CoreScript, wallet } = await import('@dashevo/evo-sdk');
  const trimmed = address.trim();
  const decoded = decodeCoreAddress(trimmed, network);
  if (!decoded || !(await wallet.validateAddress(trimmed, network)))
    throw new Error(`${trimmed} is not a valid ${network} Dash address.`);
  const script =
    decoded.type === 'p2pkh'
      ? CoreScript.fromP2PKH(decoded.hash)
      : CoreScript.fromP2SH(decoded.hash);
  if (script.toAddress(network) !== trimmed) {
    script.free();
    throw new Error(`Could not build an output script for ${trimmed}.`);
  }
  return script;
}

/** Whether `address` is a valid Dash address for `network` that a withdrawal can pay. */
export async function isCoreAddress(
  address: string,
  network: 'mainnet' | 'testnet',
): Promise<boolean> {
  try {
    (await coreScriptForAddress(address, network)).free();
    return true;
  } catch {
    return false;
  }
}
