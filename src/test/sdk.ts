import { vi } from 'vitest';
import type { EvoSDK } from '@dashevo/evo-sdk';
import type { SdkContextValue } from '@sdk/SdkProvider';
import type { Network } from '@sdk/networks';

export function createMockSdk(overrides: Record<string, unknown> = {}): EvoSDK {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue(1),
    system: {
      status: vi.fn().mockResolvedValue({ chain: { latestBlockHeight: 1 } }),
      totalCreditsInPlatform: vi.fn().mockResolvedValue(100n),
      totalCreditsInPlatformWithProof: vi.fn().mockResolvedValue({
        data: 100n,
        metadata: { height: 1, coreChainLockedHeight: 1, epoch: 1, timeMs: 1, protocolVersion: 1, chainId: 'evo1' },
        proof: { grovedbProof: new Uint8Array([1]), quorumHash: new Uint8Array(), signature: new Uint8Array(), round: 0, blockIdHash: new Uint8Array(), quorumType: 0 },
      }),
      currentQuorumsInfo: vi.fn().mockResolvedValue([]),
    },
    epoch: {
      current: vi.fn().mockResolvedValue({ index: 1 }),
      currentWithProof: vi.fn().mockResolvedValue({ data: { index: 1 } }),
      evonodesProposedBlocksByRange: vi.fn().mockResolvedValue(new Map()),
    },
    protocol: {
      versionUpgradeState: vi.fn().mockResolvedValue({ currentProtocolVersion: 1 }),
      versionUpgradeStateWithProof: vi.fn().mockResolvedValue({ data: { currentProtocolVersion: 1 } }),
    },
    voting: {
      votePollsByEndDate: vi.fn().mockResolvedValue([]),
      votePollsByEndDateWithProof: vi.fn().mockResolvedValue({ data: [] }),
    },
    dpns: {
      username: vi.fn().mockResolvedValue(null),
      usernameWithProof: vi.fn().mockResolvedValue({ data: null }),
    },
    ...overrides,
  } as unknown as EvoSDK;
}

export function createSdkContextValue(
  overrides: Partial<SdkContextValue> = {},
): SdkContextValue {
  return {
    sdk: createMockSdk(),
    status: 'ready',
    network: 'testnet' as Network,
    trusted: true,
    error: null,
    setNetwork: vi.fn(),
    setTrusted: vi.fn(),
    reconnect: vi.fn(),
    ...overrides,
  };
}
