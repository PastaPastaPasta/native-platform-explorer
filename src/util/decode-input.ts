/** Auto-detect hex / base64 / comma-separated-integers and decode to bytes. */

export type DecodeResult =
  | { ok: true; bytes: Uint8Array; format: 'hex' | 'base64' | 'csv' }
  | { ok: false; error: string };

function decodeHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return out;
}

export function decodeInput(raw: string): DecodeResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'No input provided' };

  // Comma-separated integers (e.g. "120,45,67,89")
  if (trimmed.includes(',')) {
    try {
      const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      const nums = parts.map((s) => {
        const n = Number(s);
        if (!Number.isInteger(n) || n < 0 || n > 255) {
          throw new Error(`Invalid byte value: ${s}`);
        }
        return n;
      });
      return { ok: true, bytes: new Uint8Array(nums), format: 'csv' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid CSV input' };
    }
  }

  // Hex string
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return { ok: true, bytes: decodeHex(trimmed), format: 'hex' };
  }

  // Base64
  try {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { ok: true, bytes, format: 'base64' };
  } catch {
    return { ok: false, error: 'Input is not valid hex, base64, or comma-separated integers' };
  }
}
