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

  it('returns the trusted shape with the devnet short name and the configured quorumUrl', () => {
    // paloma ships an explicit `quorumUrl` override because the conventional
    // default (https://quorums.paloma.networks.dash.org) has no DNS record yet.
    expect(getDevnetSdkArgs('devnet-paloma', true)).toEqual({
      trusted: true,
      name: 'paloma',
      quorumUrl: 'http://44.238.203.84:8080',
    });
  });
});
