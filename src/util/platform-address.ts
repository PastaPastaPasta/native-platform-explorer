// Client-side checks for Platform addresses (bech32m, "dash1…" on mainnet and
// "tdash1…" elsewhere) before a lookup is sent to the SDK.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
/** Type byte + 20-byte hash. */
const ADDRESS_BYTES = 21;

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i]!;
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/** Decode a bech32m string, or null when the checksum or format is wrong. */
export function decodeBech32m(input: string): { hrp: string; bytes: Uint8Array } | null {
  if (input.length > 90 || (input !== input.toLowerCase() && input !== input.toUpperCase())) return null;
  const s = input.toLowerCase();
  const sep = s.lastIndexOf('1');
  if (sep < 1 || sep + 7 > s.length) return null;
  const hrp = s.slice(0, sep);
  const words: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return null;
    words.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...words]) !== BECH32M_CONST) return null;
  // 5-bit groups → bytes, rejecting non-zero padding.
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const word of words.slice(0, -6)) {
    acc = (acc << 5) | word;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return null;
  return { hrp, bytes: Uint8Array.from(bytes) };
}

export function platformAddressHrp(network: string): 'dash' | 'tdash' {
  return network === 'mainnet' ? 'dash' : 'tdash';
}

/** Null when `value` is a well-formed Platform address for `network`,
 *  otherwise a reason suitable for an input's error message. */
export function platformAddressError(value: string, network: string): string | null {
  const decoded = decodeBech32m(value.trim());
  if (!decoded || (decoded.hrp !== 'dash' && decoded.hrp !== 'tdash')) {
    return 'Expected a bech32m Platform address (dash1… or tdash1…).';
  }
  if (decoded.bytes.length !== ADDRESS_BYTES) return 'This address has the wrong length.';
  const expected = platformAddressHrp(network);
  if (decoded.hrp !== expected) {
    return `${decoded.hrp}1… addresses belong to ${decoded.hrp === 'dash' ? 'mainnet' : 'testnet and devnets'}; switch networks or use a ${expected}1… address.`;
  }
  return null;
}
