import { describe, expect, it } from 'vitest';
import { shortId } from '@util/identifier';
import {
  actionMatches,
  canUpdateConfig,
  claimProblem,
  duePreProgrammed,
  holderIdsFor,
  plausibleOperations,
  tokenOperationProblems,
  tokenOperationUnavailable,
} from '../checks';
import { pendingActionFromJson } from '../group-actions';
import type { TokenOperationOptions } from '../options';
import {
  ACTION_ID,
  MAX_SUPPLY_ACTION,
  MEMBER,
  OWNER,
  STRANGER,
  base,
  model,
  rules,
  snapshot,
  tokenConfig,
} from './fixtures';

const problems = (options: TokenOperationOptions, overrides = {}, config?: Record<string, unknown>) =>
  tokenOperationProblems(options, snapshot(overrides, config));

const pending = (signers: Array<[string, bigint]> = [[OWNER, 1n]]) =>
  pendingActionFromJson(ACTION_ID, 0, MAX_SUPPLY_ACTION, new Map(signers));

describe('token operation checks', () => {
  it('accepts valid inputs', () => {
    expect(problems({ ...base, kind: 'transfer', amount: 300_000_000n, recipientId: MEMBER })).toEqual([]);
    expect(problems({ ...base, kind: 'mint', amount: 1n, recipientId: MEMBER, chooseRecipient: true })).toEqual([]);
  });

  it('refuses inputs for another token or with changed conventions', () => {
    expect(problems({ ...base, tokenPosition: 1, kind: 'burn', amount: 1n })).toEqual([
      'The inputs name a different token than the one loaded.',
    ]);
    expect(problems({ ...base, decimals: 2, kind: 'burn', amount: 1n })[0]).toMatch(/conventions changed/);
  });

  describe('mint', () => {
    const mint = { ...base, kind: 'mint' as const, amount: 1n, recipientId: MEMBER, chooseRecipient: true };
    const fixed = tokenConfig({}, { mintingAllowChoosingDestination: false });

    it('applies the destination rules', () => {
      expect(problems(mint, {}, fixed)).toEqual(
        expect.arrayContaining([
          'This token does not let minters choose the recipient.',
          expect.stringMatching(/go to the token's destination identity/),
        ]),
      );
      expect(problems({ ...mint, recipientId: OWNER, chooseRecipient: false }, {}, fixed)).toEqual([]);
      expect(problems({ ...mint, recipientId: OWNER, chooseRecipient: false }, {}, tokenConfig({}, { mintingAllowChoosingDestination: false, newTokensDestinationIdentity: null }))).toContain(
        'No one can mint: the token has no destination identity and minters may not choose one.',
      );
    });

    it('checks the recipient and the max supply', () => {
      expect(problems({ ...mint, recipientId: STRANGER })).toContain(`Recipient ${shortId(STRANGER)} does not exist.`);
      const frozenRecipient = { holders: { [MEMBER]: { exists: true, balance: 0n, frozen: true } } };
      // Platform refuses a frozen recipient only when the token disallows transfers to frozen balances.
      expect(problems(mint, frozenRecipient)).toEqual([]);
      expect(problems(mint, frozenRecipient, tokenConfig({ allowTransferToFrozenBalance: false }))[0]).toMatch(/frozen balance/);
      expect(problems({ ...mint, amount: 100_000_000_000_000n })[0]).toMatch(/would exceed the max supply of 1,000,000/);
    });

    it('requires authority', () => {
      expect(problems({ ...mint, signerId: MEMBER })[0]).toMatch(/Only the contract owner/);
    });
  });

  it('checks balances for burns and transfers', () => {
    expect(problems({ ...base, kind: 'burn', amount: 101_150_000_001n })[0]).toMatch(/You hold only 1,011.5 npetok/);
    expect(problems({ ...base, kind: 'transfer', amount: 1n, recipientId: OWNER })).toContain('You cannot transfer tokens to yourself.');
    expect(problems({ ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER }, { paused: true })).toEqual([
      'The token is paused: transfers are stopped until it is resumed.',
    ]);
    const frozenSender = { holders: { [OWNER]: { exists: true, balance: 5n, frozen: true }, [MEMBER]: { exists: true, balance: 0n, frozen: true } } };
    expect(problems({ ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER }, frozenSender)).toEqual(['Your balance of this token is frozen.']);
    expect(problems({ ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER }, frozenSender, tokenConfig({ allowTransferToFrozenBalance: false }))).toContain(
      `Recipient ${shortId(MEMBER)} has a frozen balance, which this token does not let receive transfers.`,
    );
  });

  it('checks frozen state for freezes, unfreezes and destruction', () => {
    const frozen = { holders: { [MEMBER]: { exists: true, balance: 5n, frozen: true } } };
    expect(problems({ ...base, kind: 'freeze', targetIdentityId: MEMBER }, frozen)[0]).toMatch(/already frozen/);
    expect(problems({ ...base, kind: 'freeze', targetIdentityId: STRANGER })[0]).toMatch(/does not exist/);
    expect(problems({ ...base, kind: 'unfreeze', targetIdentityId: MEMBER })[0]).toMatch(/is not frozen/);
    expect(problems({ ...base, kind: 'destroyFrozen', targetIdentityId: MEMBER, frozenBalance: 5n }, frozen)).toEqual([]);
    expect(problems({ ...base, kind: 'destroyFrozen', targetIdentityId: MEMBER, frozenBalance: 5n })[0]).toMatch(/is not frozen/);
  });

  it('allows only the emergency action that changes the state', () => {
    expect(problems({ ...base, kind: 'emergencyAction', action: 'pause' }, { paused: true })).toEqual(['The token is already paused.']);
    expect(problems({ ...base, kind: 'emergencyAction', action: 'resume' })).toEqual(['The token is not paused.']);
  });

  it('requires identities a configuration change names to exist', () => {
    expect(problems({ ...base, kind: 'configUpdate', change: { item: 'newTokensDestinationIdentity', value: STRANGER } })).toEqual([
      `Identity ${shortId(STRANGER)} does not exist.`,
    ]);
    expect(problems({ ...base, kind: 'configUpdate', change: { item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'identity', identityId: MEMBER } } })).toEqual([]);
  });

  it('validates price schedules', () => {
    const setPrice = { ...base, kind: 'setPrice' as const };
    expect(problems({ ...setPrice, schedule: { type: 'single', price: 0n } })[0]).toMatch(/greater than zero/);
    expect(problems({ ...setPrice, schedule: { type: 'tiers', tiers: [] } })).toContain('Add at least one price tier.');
    expect(problems({ ...setPrice, schedule: { type: 'tiers', tiers: [{ minAmount: 5n, price: 1n }, { minAmount: 5n, price: 2n }] } })).toContain(
      'Each tier needs a different minimum amount.',
    );
    expect(problems({ ...setPrice, schedule: { type: 'none' } })).toEqual([]);
  });

  it('requires the agreed total to match the current price', () => {
    const purchase = { ...base, kind: 'directPurchase' as const, amount: 2n, maxTotalCost: 2n, reviewedPrice: { first: 1n, last: 1n } };
    expect(problems(purchase, { price: { first: 1n, last: 1n } })).toEqual([]);
    expect(problems(purchase)).toEqual(['This token is not for sale: no direct-purchase price is set.']);
    expect(problems({ ...purchase, maxTotalCost: 3n }, { price: { first: 1n, last: 1n } })[0]).toMatch(/the total is 2 credits; the agreed total must match/);
    const tiered = { ...purchase, reviewedPrice: { first: 3n, last: 1n } };
    expect(problems({ ...tiered, maxTotalCost: 6n }, { price: { first: 3n, last: 1n } })).toEqual([]);
    expect(problems({ ...tiered, maxTotalCost: 1n }, { price: { first: 3n, last: 1n } })[0]).toMatch(/for less than 2 credits/);
  });

  describe('group actions', () => {
    const propose = {
      ...base,
      kind: 'configUpdate' as const,
      change: { item: 'maxSupply' as const, value: 200_000_000_000_000n },
      group: { mode: 'propose' as const, groupPosition: 0 },
    };
    const cosign = { ...propose, signerId: MEMBER, group: { mode: 'cosign' as const, groupPosition: 0, actionId: ACTION_ID } };

    it('requires a group action where a group decides', () => {
      const { group: _group, ...alone } = propose;
      expect(problems(alone)[0]).toMatch(/Group #0 must approve this: propose it as a group action or co-sign a pending one \(your power 1 of 2 required\)/);
      expect(problems(propose)).toEqual([]);
      expect(problems({ ...propose, group: { mode: 'propose', groupPosition: 1 } })).toEqual(['This change is not governed by group #1.']);
      expect(problems({ ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER, group: { mode: 'propose', groupPosition: 0 } })).toContain(
        'This operation cannot be a group action.',
      );
    });

    it('requires the co-signed action to be pending, unsigned and identical', () => {
      expect(problems(cosign, { pending: pending() })).toEqual([]);
      expect(problems(cosign, { pending: null })).toEqual([`Group action ${shortId(ACTION_ID)} is no longer pending.`]);
      expect(problems(cosign, { pending: pending([[OWNER, 1n], [MEMBER, 1n]]) })).toEqual(
        expect.arrayContaining(['You have already signed this group action.', 'That group action is already complete.']),
      );
      expect(problems({ ...cosign, change: { item: 'maxSupply', value: 1n } }, { pending: pending() })).toContain(
        'The inputs differ from the pending group action; co-signers must repeat it exactly.',
      );
      expect(problems({ ...cosign, publicNote: 'x' }, { pending: pending() })).toContain('Only the proposer may attach a public note.');
    });

    it('matches an action to the inputs that proposed it', () => {
      expect(actionMatches(pending(), propose, 0)).toBe(true);
      expect(actionMatches(pending(), { ...propose, change: { item: 'maxSupply', value: 1n } }, 0)).toBe(false);
      expect(actionMatches(pending(), propose, 1)).toBe(false);
    });
  });

  it('checks who may claim each distribution', () => {
    const m = model();
    expect(claimProblem('perpetual', m, OWNER, 0)).toBeNull();
    expect(claimProblem('perpetual', m, MEMBER, 0)).toMatch(/pays the contract owner/);
    expect(claimProblem('oncePerIdentity', m, OWNER, 0)).toBe('This token has no once-per-identity distribution.');
    const toIdentity = model(tokenConfig({}, {
      perpetualDistribution: { distributionType: {}, distributionRecipient: { $type: 'identity', identity: MEMBER } },
      preProgrammedDistribution: { $formatVersion: '0', distributions: { 1000: { [OWNER]: 5 }, 3000: { [OWNER]: 7 } } },
    }));
    expect(claimProblem('perpetual', toIdentity, OWNER, 0)).toBe(`The perpetual distribution pays identity ${shortId(MEMBER)}, not you.`);
    expect(duePreProgrammed(toIdentity, OWNER, 2000)).toEqual({ due: 5n, next: 3000 });
    expect(claimProblem('preProgrammed', toIdentity, OWNER, 2000)).toBeNull();
    expect(claimProblem('preProgrammed', toIdentity, OWNER, 500)).toBe(`Your next pre-programmed release is at ${new Date(1000).toISOString()}.`);
    expect(claimProblem('preProgrammed', toIdentity, MEMBER, 5000)).toBe('The pre-programmed distribution has no release for you.');
  });

  it('lists the identities an operation depends on', () => {
    expect(holderIdsFor({ ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER })).toEqual([OWNER, MEMBER]);
    expect(holderIdsFor({ ...base, kind: 'configUpdate', change: { item: 'newTokensDestinationIdentity', value: STRANGER } })).toEqual([OWNER, STRANGER]);
    expect(holderIdsFor({ ...base, kind: 'configUpdate', change: { item: 'rule', rule: 'freeze', target: 'admin', takers: { type: 'identity', identityId: MEMBER } } })).toEqual([OWNER, MEMBER]);
  });

  it('explains when an operation is unavailable before any input', () => {
    const empty = snapshot({ holders: { [OWNER]: { exists: true, balance: 0n, frozen: false } } });
    expect(tokenOperationUnavailable('transfer', empty, OWNER)).toBe('You hold no npetok.');
    expect(tokenOperationUnavailable('burn', empty, OWNER)).toBe('You hold no npetok to burn.');
    expect(tokenOperationUnavailable('directPurchase', empty, OWNER)).toMatch(/not for sale/);
    expect(tokenOperationUnavailable('mint', empty, MEMBER)).toMatch(/Only the contract owner/);
    expect(tokenOperationUnavailable('claim', empty, MEMBER)).toMatch(/pays the contract owner/);
    expect(tokenOperationUnavailable('configUpdate', empty, STRANGER)).toMatch(/do not govern/);
    expect(tokenOperationUnavailable('mint', empty, OWNER)).toBeNull();
  });

  it('offers only operations the signer could plausibly perform', () => {
    const m = model();
    expect(plausibleOperations(m, OWNER, { balance: 5n, forSale: true, nowMs: 0 })).toEqual([
      'mint', 'burn', 'freeze', 'unfreeze', 'destroyFrozen', 'emergencyAction', 'setPrice', 'transfer', 'directPurchase', 'claim', 'configUpdate',
    ]);
    // A group member governs the max supply through the group, nothing else.
    expect(plausibleOperations(m, MEMBER, { balance: 0n, forSale: false, nowMs: 0 })).toEqual(['configUpdate']);
    expect(plausibleOperations(m, STRANGER, { balance: 0n, forSale: true, nowMs: 0 })).toEqual(['directPurchase']);
    expect(canUpdateConfig(model(tokenConfig({ maxSupplyChangeRules: rules({ $type: 'noOne' }, { $type: 'noOne' }) })), MEMBER)).toBe(false);
  });
});
