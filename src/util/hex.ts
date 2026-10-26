/** Bytes of an even-length hex string the caller has already validated. */
export function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
