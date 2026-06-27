import { vi } from 'vitest';
import type { ExplorerSigner, SdkSigningMaterial } from '@/signer/types';

export function createSigningMaterial(
  overrides: Partial<SdkSigningMaterial> = {},
): SdkSigningMaterial {
  return {
    identityId: 'identity-1',
    keyId: 0,
    identityKey: { keyId: 0 } as SdkSigningMaterial['identityKey'],
    identitySigner: { free: vi.fn() } as unknown as SdkSigningMaterial['identitySigner'],
    ...overrides,
  };
}

export function createMockSigner(overrides: Partial<ExplorerSigner> = {}): ExplorerSigner {
  return {
    kind: 'wif',
    identityId: 'identity-1',
    availableKeys: vi.fn().mockResolvedValue([{ id: 0 }]),
    sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    prepareSdk: vi.fn().mockResolvedValue(createSigningMaterial()),
    destroy: vi.fn(),
    ...overrides,
  };
}

