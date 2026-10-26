import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createMockSdk } from '@/test/sdk';
import { IdentityVotesTab, contestedDetailHref, identityVoteRows } from '../IdentityVotesTab';
import { IdentityDpnsNames } from '../IdentityDpnsNames';
import { IdentityContractLookup, contractKeysFor } from '../IdentityContractLookup';
import { IdentityTokensTab } from '../IdentityTokensTab';

const VOTER = 'G8vg4AuaYbXXuCRfpnyXFvqKHKyGJpW35BaeL4YcWJB';
const CONTENDER = 'AQpvvwgR1Tx16ChXXcKcmXsXrZJvd5Qk7AS3xCqtde2h';
const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const TOKEN = '8RsBCPSDUwWMnvLTDooh7ZcfZmnRb5tecsagsrdAFrrd';

// Getter-backed objects shaped like rc.2 ResourceVote / VotePoll / ResourceVoteChoice.
const id = (s: string) => ({ toString: () => s, toJSON: () => s });
function resourceVote(label: string, voteType: string, towards?: string) {
  const poll = Object.create({ contractId: id(DPNS), documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', label] });
  const choice = Object.create({ voteType, value: towards ? id(towards) : undefined });
  return Object.create({ poll, choice });
}

describe('identity votes', () => {
  it('reads Map, array and plain-record results', () => {
    const vote = resourceVote('a1pha', 'TowardsIdentity', CONTENDER);
    const fromMap = identityVoteRows(new Map([['vote1', vote]]));
    expect(fromMap).toEqual([{
      voteId: 'vote1', choice: 'towardsIdentity', towardsIdentity: CONTENDER,
      contractId: DPNS, documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'a1pha'],
    }]);
    expect(identityVoteRows({ vote1: vote })).toEqual(fromMap);
    expect(identityVoteRows([vote])[0]).toMatchObject({ voteId: '0', choice: 'towardsIdentity' });
    expect(identityVoteRows(new Map([['x', undefined]]))).toEqual([]);
    // Live rc.2: the `poll.indexValues` getter yields serialized Value bytes;
    // toJSON() carries the decoded strings.
    const encoded = Object.create({
      poll: Object.create({ contractId: id(DPNS), documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: [new Uint8Array([18, 4, 100, 97, 115, 104])] }),
      choice: Object.create({ voteType: 'Lock' }),
      toJSON: () => ({
        votePoll: { type: 'contestedDocumentResourceVotePoll', data: { contractId: DPNS, documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'n1ke'] } },
        resourceVoteChoice: { type: 'lock' },
      }),
    });
    expect(identityVoteRows(new Map([['v', encoded]]))[0]).toMatchObject({ choice: 'lock', indexValues: ['dash', 'n1ke'] });
    const getterOnly = Object.create({ poll: Object.create({ indexValues: [new Uint8Array([1])] }), choice: Object.create({ voteType: 'Lock' }) });
    expect(identityVoteRows(new Map([['v', getterOnly]]))[0]!.indexValues).toBeUndefined();
    expect(identityVoteRows(null)).toEqual([]);
    // toJSON() form of a vote.
    expect(identityVoteRows({ v: {
      votePoll: { type: 'contestedDocumentResourceVotePoll', data: { contractId: DPNS, documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'b0st0n'] } },
      resourceVoteChoice: { type: 'lock' },
    } })[0]).toMatchObject({ choice: 'lock', indexValues: ['dash', 'b0st0n'] });
  });

  it('reads the evo-sdk 5.0 toJSON() form', () => {
    // Live mainnet 5.0.0-rc.8 ResourceVote.toJSON(): poll fields flattened into
    // `votePoll`, the choice tagged with `$type`.
    const lock = { toJSON: () => ({
      $formatVersion: '0',
      votePoll: { $type: 'contestedDocumentResourceVotePoll', contractId: DPNS, documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'n1ke'] },
      resourceVoteChoice: { $type: 'lock' },
    }) };
    expect(identityVoteRows(new Map([['v', lock]]))).toEqual([{
      voteId: 'v', choice: 'lock', towardsIdentity: undefined,
      contractId: DPNS, documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'n1ke'],
    }]);
    const towards = {
      votePoll: { $type: 'contestedDocumentResourceVotePoll', contractId: DPNS, documentTypeName: 'domain', indexName: 'parentNameAndLabel', indexValues: ['dash', 'a1pha'] },
      resourceVoteChoice: { $type: 'towardsIdentity', identity: CONTENDER },
    };
    expect(identityVoteRows({ v: towards })[0]).toMatchObject({ choice: 'towardsIdentity', towardsIdentity: CONTENDER, indexValues: ['dash', 'a1pha'] });
  });

  it('links each resource to its contested-resource page', async () => {
    const votes = new Map([['vote1', resourceVote('a1pha', 'TowardsIdentity', CONTENDER)], ['vote2', resourceVote('b0st0n', 'Abstain')]]);
    const sdk = createMockSdk({ voting: {
      contestedResourceIdentityVotes: vi.fn().mockResolvedValue(votes),
      contestedResourceIdentityVotesWithProof: vi.fn().mockResolvedValue({ data: votes }),
    } });
    renderWithProviders(<IdentityVotesTab identityId={VOTER} />, { sdk: { sdk } });
    const link = await screen.findByRole('link', { name: 'domain · dash / a1pha' });
    const href = new URL(link.getAttribute('href')!, 'https://x.invalid');
    expect(href.searchParams.get('contract')).toBe(DPNS);
    expect(href.searchParams.get('indexValues')).toBe('["dash","a1pha"]');
    expect(href.searchParams.get('network')).toBe('testnet');
    expect(screen.getByRole('link', { name: 'domain · dash / b0st0n' })).toBeVisible();
    expect(contestedDetailHref({ voteId: 'x', choice: 'lock' })).toBeNull();
  });
});

describe('IdentityDpnsNames', () => {
  it('marks every name registered and flags contested-class labels', async () => {
    const sdk = createMockSdk({ dpns: {
      isContestedUsername: vi.fn(async (label: string) => label === 'alice'),
    } });
    renderWithProviders(<IdentityDpnsNames names={['alice.dash', 'alice-wonderland-2026.dash']} />, { sdk: { sdk } });
    expect(screen.getAllByText('registered')).toHaveLength(2);
    expect(await screen.findByText('contested name')).toBeVisible();
    expect(screen.getAllByText('contested name')).toHaveLength(1);
  });

  it('keeps the empty state', () => {
    renderWithProviders(<IdentityDpnsNames names={[]} />);
    expect(screen.getByText('No DPNS names registered for this identity.')).toBeVisible();
  });
});

describe('IdentityContractLookup', () => {
  it('fetches the contract nonce and contract-bound keys together', async () => {
    const key = Object.create({ keyId: 3, purpose: 'ENCRYPTION', keyType: 'ECDSA_SECP256K1', securityLevel: 'MEDIUM', data: 'ab', disabledAt: undefined, isReadOnly: false });
    const keys = [Object.create({ identityId: id(VOTER), keys: [key] })];
    expect(contractKeysFor(keys)).toEqual([key]);
    const identities = {
      contractNonce: vi.fn().mockResolvedValue(7n),
      contractNonceWithProof: vi.fn().mockResolvedValue({ data: 7n }),
      contractKeys: vi.fn().mockResolvedValue(keys),
      contractKeysWithProof: vi.fn().mockResolvedValue({ data: keys }),
    };
    renderWithProviders(<IdentityContractLookup identityId={VOTER} />, { sdk: { sdk: createMockSdk({ identities }) } });
    fireEvent.change(screen.getByLabelText('Contract ID for nonce and key lookup'), { target: { value: DPNS } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('7')).toBeVisible();
    expect(await screen.findByText('ENCRYPTION')).toBeVisible();
    const call = [...identities.contractKeys.mock.calls, ...identities.contractKeysWithProof.mock.calls][0]!;
    expect(call[0]).toEqual({ identityIds: [VOTER], contractId: DPNS });
  });
});

describe('IdentityTokensTab', () => {
  it('shows frozen state from identityTokenInfos beside the balance', async () => {
    const infos = new Map([[TOKEN, Object.create({ isFrozen: true })]]);
    const tokens = {
      identityBalances: vi.fn().mockResolvedValue(new Map([[TOKEN, 50n]])),
      identityBalancesWithProof: vi.fn().mockResolvedValue({ data: new Map([[TOKEN, 50n]]) }),
      identityTokenInfos: vi.fn().mockResolvedValue(infos),
      identityTokenInfosWithProof: vi.fn().mockResolvedValue({ data: infos }),
    };
    renderWithProviders(<IdentityTokensTab identityId={VOTER} />, { sdk: { sdk: createMockSdk({ tokens }) } });
    fireEvent.change(screen.getByPlaceholderText('Add token ID (base58 Identifier)'), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const row = (await screen.findByText('50')).closest('tr')!;
    expect(await within(row).findByText('frozen')).toBeVisible();
  });
});
