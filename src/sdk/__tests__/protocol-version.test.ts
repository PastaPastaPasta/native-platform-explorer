import { describe, expect, it, vi } from 'vitest';
import { assertWritableProtocolVersion, sessionProtocolVersion } from '../protocol-version';

const drive = (current: unknown) => ({ version: { protocol: { drive: { current } } } });
const sdk = (session: unknown, status: () => Promise<unknown>) =>
  ({ version: () => session, system: { status } }) as never;

describe('assertWritableProtocolVersion', () => {
  it('returns the version when the session matches the network', async () => {
    await expect(assertWritableProtocolVersion(sdk(14, async () => drive(14)))).resolves.toBe(14);
    await expect(assertWritableProtocolVersion(sdk(13, async () => drive(13n)))).resolves.toBe(13);
  });

  it('refuses a network on an older protocol than the session', async () => {
    await expect(assertWritableProtocolVersion(sdk(14, async () => drive(12)))).rejects.toThrow(
      /runs Platform protocol v12, but the SDK session uses v14 and cannot step down/,
    );
  });

  it('refuses a session still behind the network', async () => {
    await expect(assertWritableProtocolVersion(sdk(13, async () => drive(14)))).rejects.toThrow(
      /runs Platform protocol v14, but the SDK session uses v13\. .*not built/,
    );
  });

  it('refuses when either version is unknown', async () => {
    const status = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(assertWritableProtocolVersion(sdk(14, status))).rejects.toThrow(/Could not read/);
    await expect(assertWritableProtocolVersion(sdk(14, async () => ({})))).rejects.toThrow(/Could not confirm/);
    await expect(assertWritableProtocolVersion(sdk(undefined, async () => drive(14)))).rejects.toThrow(/Could not confirm/);
  });
});

describe('sessionProtocolVersion', () => {
  it('reads a positive integer and tolerates a freed session', () => {
    expect(sessionProtocolVersion({ version: () => 14 })).toBe(14);
    expect(sessionProtocolVersion({ version: () => 0 })).toBeNull();
    expect(sessionProtocolVersion(null)).toBeNull();
    expect(sessionProtocolVersion({ version: () => { throw new Error('null pointer passed to rust'); } })).toBeNull();
  });
});
