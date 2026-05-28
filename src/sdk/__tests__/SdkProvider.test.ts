import { describe, expect, it } from 'vitest';
import { getDevnetSdkArgs } from '../SdkProvider';

describe('getDevnetSdkArgs', () => {
  it('returns the non-trusted shape with the devnet short name and explicit addresses', () => {
    expect(getDevnetSdkArgs('devnet-paloma', false)).toMatchObject({
      trusted: false,
      name: 'paloma',
      addresses: expect.arrayContaining(['https://68.67.122.198:1443']),
    });
  });

  it('returns the trusted shape with the devnet short name and no addresses (SDK discovers them)', () => {
    // No `quorumUrl` override: the SDK derives
    // https://quorums.paloma.networks.dash.org from `devnetName`.
    expect(getDevnetSdkArgs('devnet-paloma', true)).toEqual({
      trusted: true,
      name: 'paloma',
    });
  });
});
