import { describe, expect, it, vi } from 'vitest';
import {
  assertWritableProtocolVersion,
  networkProtocolVersion,
  protocolVersionMismatch,
  sessionProtocolVersion,
} from '../protocol-version';

const proved = (protocolVersion: unknown) => ({ data: 1n, metadata: { protocolVersion } });
const sdk = (session: unknown, totalCreditsInPlatformWithProof: () => Promise<unknown>) =>
  ({ version: () => session, system: { totalCreditsInPlatformWithProof } }) as never;

describe('assertWritableProtocolVersion', () => {
  it('returns the version when the session matches the proved network version', async () => {
    await expect(assertWritableProtocolVersion(sdk(14, async () => proved(14)))).resolves.toBe(14);
    await expect(assertWritableProtocolVersion(sdk(13, async () => proved(13)))).resolves.toBe(13);
  });

  it('reads the session version after the proved read, which ratchets it', async () => {
    let session = 13;
    const read = vi.fn(async () => { session = 14; return proved(14); });
    const ratcheting = { version: () => session, system: { totalCreditsInPlatformWithProof: read } } as never;
    await expect(assertWritableProtocolVersion(ratcheting)).resolves.toBe(14);
  });

  it('refuses a network on an older protocol than the session, pointing at the cache', async () => {
    await expect(assertWritableProtocolVersion(sdk(14, async () => proved(12)))).rejects.toThrow(
      /runs Platform protocol v12, but the SDK session uses v14 and cannot step down.*clear the SDK cache/,
    );
  });

  it('refuses a network newer than the session can follow', async () => {
    await expect(assertWritableProtocolVersion(sdk(14, async () => proved(15)))).rejects.toThrow(
      /runs Platform protocol v15, but the SDK session uses v14\. .*not built/,
    );
  });

  it('refuses when either version is unknown', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(assertWritableProtocolVersion(sdk(14, failing))).rejects.toThrow(/Could not read/);
    await expect(assertWritableProtocolVersion(sdk(14, async () => ({ data: 1n })))).rejects.toThrow(/Could not confirm/);
    await expect(assertWritableProtocolVersion(sdk(undefined, async () => proved(14)))).rejects.toThrow(/Could not confirm/);
  });
});

describe('protocol version readers', () => {
  it('reads the network version from system.status', () => {
    const status = (current: unknown) => ({ toJSON: () => ({ version: { protocol: { drive: { current, latest: current } } } }) });
    expect(networkProtocolVersion(status(14))).toBe(14);
    expect(networkProtocolVersion(status(13n))).toBe(13);
    expect(networkProtocolVersion({ chain: {} })).toBeNull();
    expect(networkProtocolVersion(undefined)).toBeNull();
  });

  it('reads the session version and tolerates a freed session', () => {
    expect(sessionProtocolVersion({ version: () => 14 })).toBe(14);
    expect(sessionProtocolVersion({ version: () => 0 })).toBeNull();
    expect(sessionProtocolVersion(null)).toBeNull();
    expect(sessionProtocolVersion({ version: () => { throw new Error('null pointer passed to rust'); } })).toBeNull();
  });
});

describe('protocolVersionMismatch', () => {
  it('flags networks the session cannot follow, in either direction', () => {
    expect(protocolVersionMismatch(14, 14, 15)).toBe('network-newer');
    expect(protocolVersionMismatch(14, 14, 13)).toBe('network-older');
    expect(protocolVersionMismatch(14, 14, 12)).toBe('network-older');
    // A fresh session below a supported network catches up on its first proved read.
    expect(protocolVersionMismatch(14, 13, 14)).toBeNull();
    expect(protocolVersionMismatch(14, 13, 13)).toBeNull();
    expect(protocolVersionMismatch(14, 14, null)).toBeNull();
    expect(protocolVersionMismatch(null, null, 13)).toBeNull();
  });
});
