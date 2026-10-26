import { describe, expect, it } from 'vitest';
import {
  MAX_TOKEN_AMOUNT,
  MAX_TOKEN_SUPPLY,
  describeTokenAmount,
  parseTokenAmount,
  publicNoteError,
} from '../amount';
import { authorize, operationAuthority, parseActionTakers, ruleFor } from '../model';
import {
  configChangeAuthority,
  configChangeIsDestructive,
  configChangeProblems,
  describeConfigChange,
} from '../config-change';
import {
  cosignParameters,
  parseConfigChange,
  parsePricingSchedule,
  pendingActionFromJson,
  pendingActionKind,
} from '../group-actions';
import { summariseTokenOperation, tokenOperationIsDestructive } from '../review';
import { buildTokenDraft, EMPTY_FIELDS, parsePriceSchedule } from '../draft';
import { tokenKindFromOperationId, tokenOperationId } from '../options';
import {
  ACTION_ID,
  CONTRACT_ID,
  MAX_SUPPLY_ACTION,
  MEMBER,
  OWNER,
  STRANGER,
  TOKEN_ID,
  base,
  model,
  rules,
  tokenConfig,
} from './fixtures';

describe('token amounts', () => {
  it.each([
    ['1.5', 8, 150_000_000n],
    ['0.00000001', 8, 1n],
    ['1', 0, 1n],
    ['007.10', 2, 710n],
    ['2814749.76710655', 8, MAX_TOKEN_AMOUNT],
  ])('converts %s with %i decimals exactly', (text, decimals, value) => {
    expect(parseTokenAmount(text, decimals)).toEqual({ value });
  });

  it.each([
    ['0', 8, /greater than zero/],
    ['0.000000001', 8, /at most 8 digits/],
    ['1.5', 0, /no decimal places/],
    ['-1', 8, /positive decimal/],
    ['1e5', 8, /positive decimal/],
    ['0x10', 8, /positive decimal/],
    ['1,000', 8, /positive decimal/],
    ['', 8, /positive decimal/],
    ['2814749.76710656', 8, /at most 2,814,749.76710655/],
  ])('rejects %s with %i decimals', (text, decimals, error) => {
    expect(parseTokenAmount(text, decimals).error).toMatch(error);
  });

  it('never rounds through floating point', () => {
    // 0.1 + 0.2 style inputs stay exact, and huge values do not lose digits.
    expect(parseTokenAmount('0.30000000', 8).value).toBe(30_000_000n);
    expect(parseTokenAmount('92233720368.54775807', 8, MAX_TOKEN_SUPPLY).value).toBe(MAX_TOKEN_SUPPLY);
  });

  it('describes amounts in display and base units', () => {
    expect(describeTokenAmount(150_000_000n, 8, 'TOK')).toBe('1.5 TOK (150000000 base units)');
    expect(describeTokenAmount(1n, 0, 'TOK')).toBe('1 TOK (1 base unit)');
  });

  it('limits public notes to 2048 UTF-8 bytes', () => {
    expect(publicNoteError('a'.repeat(2048))).toBeNull();
    expect(publicNoteError('é'.repeat(1025))).toMatch(/2050 bytes/);
  });
});

describe('token authorization', () => {
  const m = model();

  it.each([
    [{ $type: 'noOne' }, { type: 'noOne' }],
    [{ $type: 'contractOwner' }, { type: 'contractOwner' }],
    [{ $type: 'mainGroup' }, { type: 'mainGroup' }],
    [{ $type: 'identity', identity: MEMBER }, { type: 'identity', identityId: MEMBER }],
    [{ $type: 'group', position: 3 }, { type: 'group', position: 3 }],
    // rc.2's external tags
    ['ContractOwner', { type: 'contractOwner' }],
    [{ Identity: MEMBER }, { type: 'identity', identityId: MEMBER }],
    [{ Group: 0 }, { type: 'group', position: 0 }],
  ])('reads action takers %j', (json, takers) => {
    expect(parseActionTakers(json)).toEqual(takers);
  });

  it('reads the token model from the contract JSON', () => {
    expect(m).toMatchObject({
      tokenId: TOKEN_ID,
      contractId: CONTRACT_ID,
      contractOwnerId: OWNER,
      name: 'npetok',
      decimals: 8,
      maxSupply: 100_000_000_000_000n,
      mainControlGroup: 0,
      mintingAllowChoosingDestination: true,
      newTokensDestinationIdentity: OWNER,
      groups: { 0: { position: 0, members: { [OWNER]: 1, [MEMBER]: 1 }, requiredPower: 2 } },
    });
    expect(ruleFor(m, 'maxSupply')?.authorized).toEqual({ type: 'mainGroup' });
  });

  it('authorizes each kind of action taker', () => {
    const verb = 'mint';
    expect(authorize({ type: 'contractOwner' }, m, OWNER, verb)).toEqual({ kind: 'direct' });
    expect(authorize({ type: 'contractOwner' }, m, MEMBER, verb)).toMatchObject({ kind: 'denied', reason: expect.stringMatching(/contract owner/) });
    expect(authorize({ type: 'noOne' }, m, OWNER, verb)).toMatchObject({ kind: 'denied', reason: 'No one may mint this token.' });
    expect(authorize({ type: 'identity', identityId: MEMBER }, m, MEMBER, verb)).toEqual({ kind: 'direct' });
    expect(authorize({ type: 'identity', identityId: MEMBER }, m, OWNER, verb).kind).toBe('denied');
    expect(authorize({ type: 'mainGroup' }, m, MEMBER, verb)).toMatchObject({ kind: 'group', signerPower: 1, canActAlone: false });
    expect(authorize({ type: 'group', position: 0 }, m, STRANGER, verb)).toMatchObject({ kind: 'denied', reason: expect.stringMatching(/not a member/) });
    expect(authorize({ type: 'group', position: 7 }, m, OWNER, verb)).toMatchObject({ kind: 'denied', reason: expect.stringMatching(/no group #7/) });
    expect(authorize({ type: 'mainGroup' }, { ...m, mainControlGroup: undefined }, OWNER, verb)).toMatchObject({ kind: 'denied', reason: expect.stringMatching(/none is set/) });
    expect(authorize(null, m, OWNER, verb).kind).toBe('denied');
  });

  it('lets a member whose power meets the requirement act alone', () => {
    const strong = { ...m, groups: { 0: { position: 0, members: { [OWNER]: 2, [MEMBER]: 1 }, requiredPower: 2 } } };
    expect(authorize({ type: 'mainGroup' }, strong, OWNER, 'mint')).toMatchObject({ kind: 'group', canActAlone: true });
  });

  it('uses the rule that governs each operation', () => {
    const frozenByGroup = model(tokenConfig({ freezeRules: rules({ $type: 'group', position: 0 }) }));
    expect(operationAuthority('freeze', frozenByGroup, OWNER)?.kind).toBe('group');
    expect(operationAuthority('mint', frozenByGroup, OWNER)?.kind).toBe('direct');
    expect(operationAuthority('setPrice', frozenByGroup, MEMBER)?.kind).toBe('denied');
    expect(operationAuthority('transfer', frozenByGroup, OWNER)).toBeNull();
  });
});

describe('configuration changes', () => {
  const m = model();

  it('governs value items by the rule and re-assignments by its admins', () => {
    expect(configChangeAuthority({ item: 'maxSupply', value: 1n }, m, OWNER).kind).toBe('group');
    expect(configChangeAuthority({ item: 'mintingAllowChoosingDestination', value: false }, m, OWNER).kind).toBe('direct');
    // Who may change the max supply is decided by its admins (the owner), not the group.
    expect(configChangeAuthority({ item: 'rule', rule: 'maxSupply', target: 'authorized', takers: { type: 'contractOwner' } }, m, OWNER).kind).toBe('direct');
    expect(configChangeAuthority({ item: 'rule', rule: 'manualMinting', target: 'authorized', takers: { type: 'noOne' } }, m, MEMBER).kind).toBe('denied');
    expect(configChangeAuthority({ item: 'mainControlGroup', value: null }, m, OWNER).kind).toBe('direct');
  });

  it('applies the rule flags for no-one and self-changing admins', () => {
    const strict = model(tokenConfig({ freezeRules: rules(undefined, undefined, false) }));
    expect(configChangeAuthority({ item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'noOne' } }, strict, OWNER)).toMatchObject({ kind: 'denied', reason: expect.stringMatching(/to no one/) });
    expect(configChangeAuthority({ item: 'rule', rule: 'freeze', target: 'admin', takers: { type: 'contractOwner' } }, strict, OWNER)).toMatchObject({ kind: 'denied', reason: expect.stringMatching(/administers/) });
    expect(configChangeAuthority({ item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'identity', identityId: MEMBER } }, strict, OWNER).kind).toBe('direct');
  });

  it('checks the new value', () => {
    expect(configChangeProblems({ item: 'maxSupply', value: 1n }, m, 5n)[0]).toMatch(/below the current total supply/);
    expect(configChangeProblems({ item: 'maxSupply', value: 5n }, m, 5n)).toEqual([]);
    expect(configChangeProblems({ item: 'mainControlGroup', value: 4 }, m, 0n)[0]).toMatch(/no group #4/);
    expect(configChangeProblems({ item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'group', position: 9 } }, m, 0n)).toContain('The contract has no group #9.');
    expect(configChangeProblems({ item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'contractOwner' } }, m, 0n)).toEqual(['That is already the authority.']);
  });

  it('marks changes that give up control as destructive', () => {
    expect(configChangeIsDestructive({ item: 'rule', rule: 'freeze', target: 'admin', takers: { type: 'noOne' } })).toBe(true);
    expect(configChangeIsDestructive({ item: 'perpetualDistribution', value: null })).toBe(true);
    expect(configChangeIsDestructive({ item: 'mainControlGroup', value: null })).toBe(true);
    expect(configChangeIsDestructive({ item: 'newTokensDestinationIdentity', value: null })).toBe(true);
    expect(configChangeIsDestructive({ item: 'maxSupply', value: null })).toBe(false);
    expect(configChangeIsDestructive({ item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'mainGroup' } })).toBe(false);
  });

  it('describes each change', () => {
    expect(describeConfigChange({ item: 'maxSupply', value: 200_000_000_000_000n }, 8, 'npetok')).toBe(
      'Sets the max supply to 2,000,000 npetok (200000000000000 base units).',
    );
    expect(describeConfigChange({ item: 'rule', rule: 'emergencyAction', target: 'authorized', takers: { type: 'noOne' } }, 8, 'npetok')).toBe(
      'Lets no one act on emergency action (pause / resume).',
    );
  });
});

describe('group actions', () => {
  const signers = new Map([[OWNER, 1n]]);
  const action = pendingActionFromJson(ACTION_ID, 0, MAX_SUPPLY_ACTION, signers);

  it('reads the 5.0 GroupAction JSON', () => {
    expect(action).toMatchObject({ actionId: ACTION_ID, groupPosition: 0, tokenPosition: 0, proposerId: OWNER, eventType: 'configUpdate', signedPower: 1, signers: { [OWNER]: 1 } });
    expect(pendingActionKind(action)).toBe('configUpdate');
    expect(cosignParameters(action)).toEqual({ kind: 'configUpdate', change: { item: 'maxSupply', value: 200_000_000_000_000n } });
  });

  it.each([
    [{ $type: 'mint', amount: 5, recipient: MEMBER, publicNote: null }, { kind: 'mint', amount: 5n, recipientId: MEMBER }],
    [{ $type: 'burn', amount: '7', burnFromIdentifier: OWNER }, { kind: 'burn', amount: 7n, burnFromId: OWNER }],
    [{ $type: 'freeze', frozenIdentifier: MEMBER }, { kind: 'freeze', targetIdentityId: MEMBER }],
    [{ $type: 'unfreeze', frozenIdentifier: MEMBER }, { kind: 'unfreeze', targetIdentityId: MEMBER }],
    [{ $type: 'destroyFrozenFunds', frozenIdentifier: MEMBER, amount: 3 }, { kind: 'destroyFrozen', targetIdentityId: MEMBER }],
    [{ $type: 'emergencyAction', action: 'Pause' }, { kind: 'emergencyAction', action: 'pause' }],
    [{ $type: 'changePriceForDirectPurchase', pricingSchedule: { $type: 'singlePrice', value: 9 } }, { kind: 'setPrice', schedule: { type: 'single', price: 9n } }],
  ])('rebuilds co-sign parameters of %j', (event, parameters) => {
    const pending = pendingActionFromJson(ACTION_ID, 0, { token_contract_position: 0, event: { $kind: 'tokenEvent', ...event } }, undefined);
    expect(cosignParameters(pending)).toEqual(parameters);
  });

  it('refuses events it cannot rebuild', () => {
    const pending = pendingActionFromJson(ACTION_ID, 0, { event: { $kind: 'tokenEvent', $type: 'mint', amount: -1 } }, undefined);
    expect(cosignParameters(pending)).toBeNull();
  });

  it.each([
    [{ $type: 'manualMinting', value: { $type: 'group', position: 0 } }, { item: 'rule', rule: 'manualMinting', target: 'authorized', takers: { type: 'group', position: 0 } }],
    [{ $type: 'maxSupplyControlGroup', value: { $type: 'noOne' } }, { item: 'rule', rule: 'maxSupply', target: 'authorized', takers: { type: 'noOne' } }],
    [{ $type: 'freezeAdminGroup', value: { $type: 'contractOwner' } }, { item: 'rule', rule: 'freeze', target: 'admin', takers: { type: 'contractOwner' } }],
    [{ $type: 'maxSupply', value: null }, { item: 'maxSupply', value: null }],
    [{ $type: 'mainControlGroup', value: 1 }, { item: 'mainControlGroup', value: 1 }],
    [{ $type: 'mintingAllowChoosingDestination', value: false }, { item: 'mintingAllowChoosingDestination', value: false }],
    [{ $type: 'newTokensDestinationIdentity', value: MEMBER }, { item: 'newTokensDestinationIdentity', value: MEMBER }],
    [
      { $type: 'perpetualDistribution', value: { distributionType: { $type: 'blockBasedDistribution', interval: 5, function: { $type: 'fixedAmount', amount: 10 } }, distributionRecipient: { $type: 'identity', identity: MEMBER } } },
      { item: 'perpetualDistribution', value: { intervalType: 'block', interval: 5n, amount: 10n, recipient: { type: 'identity', identityId: MEMBER } } },
    ],
    [
      { $type: 'conventions', value: { decimals: 2, localizations: { en: { singularForm: 'a', pluralForm: 'as', shouldCapitalize: true } } } },
      { item: 'conventions', decimals: 2, localizations: { en: { singularForm: 'a', pluralForm: 'as', shouldCapitalize: true } } },
    ],
  ])('reads configuration change %j', (json, change) => {
    expect(parseConfigChange(json)).toEqual(change);
  });

  it('reads pricing schedules', () => {
    expect(parsePricingSchedule(null)).toEqual({ type: 'none' });
    expect(parsePricingSchedule({ $type: 'setPrices', value: { 500: 1, 100: 2 } })).toEqual({
      type: 'tiers',
      tiers: [{ minAmount: 100n, price: 2n }, { minAmount: 500n, price: 1n }],
    });
    expect(parsePricingSchedule({ $type: 'other' })).toBeNull();
  });
});

describe('review copy', () => {
  it('states the exact effect in display and base units', () => {
    expect(summariseTokenOperation({ ...base, kind: 'burn', amount: 150_000_000n })).toBe(
      `Burns 1.5 npetok (150000000 base units) from ${OWNER}. Token ${TOKEN_ID} (contract ${CONTRACT_ID}, position 0).`,
    );
    expect(summariseTokenOperation({ ...base, kind: 'mint', amount: 1_000_000_000n, recipientId: MEMBER, chooseRecipient: true, group: { mode: 'propose', groupPosition: 0 } })).toMatch(
      /^Mints 10 npetok \(1000000000 base units\) to 7ysN\S+\. Proposed as a new action of group #0/,
    );
    expect(summariseTokenOperation({ ...base, kind: 'destroyFrozen', targetIdentityId: MEMBER, frozenBalance: 500_000_000n })).toMatch(
      /Destroys the entire frozen npetok balance of 7ysN\S+, 5 npetok \(500000000 base units\) at review/,
    );
    expect(summariseTokenOperation({ ...base, kind: 'directPurchase', amount: 200_000_000n, maxTotalCost: 200_000_000n, reviewedPrice: { first: 1n, last: 1n } })).toMatch(
      /^Buys 2 npetok \(200000000 base units\) for 200000000 credits \(1 per base unit\)\./,
    );
    expect(summariseTokenOperation({ ...base, kind: 'setPrice', schedule: { type: 'single', price: 1n } })).toMatch(
      /1 credit per base unit \(100000000 credits per whole npetok\)/,
    );
  });

  it('marks burns, destruction, emergency actions and control loss as destructive', () => {
    expect(tokenOperationIsDestructive({ ...base, kind: 'burn', amount: 1n })).toBe(true);
    expect(tokenOperationIsDestructive({ ...base, kind: 'emergencyAction', action: 'resume' })).toBe(true);
    expect(tokenOperationIsDestructive({ ...base, kind: 'transfer', amount: 1n, recipientId: MEMBER })).toBe(false);
    expect(tokenOperationIsDestructive({ ...base, kind: 'configUpdate', change: { item: 'rule', rule: 'freeze', target: 'authorized', takers: { type: 'noOne' } } })).toBe(true);
    expect(tokenOperationIsDestructive({ ...base, kind: 'configUpdate', change: { item: 'maxSupply', value: 5n } })).toBe(false);
  });
});

describe('form drafts', () => {
  const m = model();
  const direct = { model: m, signerId: OWNER, group: { mode: 'direct' } as const };

  it('converts display amounts to base units', () => {
    expect(buildTokenDraft('transfer', { ...EMPTY_FIELDS, amount: '3', recipient: MEMBER }, direct)).toEqual({
      options: { ...base, kind: 'transfer', amount: 300_000_000n, recipientId: MEMBER },
      errors: [],
    });
    expect(buildTokenDraft('transfer', { ...EMPTY_FIELDS, amount: '3.123456789', recipient: 'x' }, direct).errors).toEqual([
      'This token has 8 decimal places; use at most 8 digits after the point.',
      'The recipient identity is not a valid identity ID.',
    ]);
  });

  it('sends minted tokens to the destination when minters may not choose', () => {
    const fixed = model(tokenConfig({}, { mintingAllowChoosingDestination: false }));
    expect(buildTokenDraft('mint', { ...EMPTY_FIELDS, amount: '1', recipient: MEMBER }, { ...direct, model: fixed }).options).toMatchObject({
      recipientId: OWNER,
      chooseRecipient: false,
    });
  });

  it('prices a single-price purchase exactly and requires a maximum for tiers', () => {
    expect(buildTokenDraft('directPurchase', { ...EMPTY_FIELDS, amount: '2' }, { ...direct, price: { first: 3n, last: 3n } }).options).toMatchObject({
      maxTotalCost: 600_000_000n,
      reviewedPrice: { first: 3n, last: 3n },
    });
    expect(buildTokenDraft('directPurchase', { ...EMPTY_FIELDS, amount: '2' }, { ...direct, price: { first: 3n, last: 1n } }).errors).toEqual(['Enter the maximum total.']);
    expect(buildTokenDraft('directPurchase', { ...EMPTY_FIELDS, amount: '2', note: 'x' }, { ...direct, price: { first: 3n, last: 3n } }).options).not.toHaveProperty('publicNote');
  });

  it('repeats a pending action when co-signing and drops the note', () => {
    const parameters = { kind: 'mint' as const, amount: 5n, recipientId: MEMBER };
    const draft = buildTokenDraft('mint', { ...EMPTY_FIELDS, amount: '999', note: 'mine' }, {
      ...direct,
      signerId: MEMBER,
      group: { mode: 'cosign', groupPosition: 0, actionId: ACTION_ID, parameters },
    });
    expect(draft.options).toMatchObject({ amount: 5n, recipientId: MEMBER, group: { mode: 'cosign', actionId: ACTION_ID } });
    expect(draft.options).not.toHaveProperty('publicNote');
    expect(buildTokenDraft('burn', EMPTY_FIELDS, { ...direct, group: { mode: 'cosign', groupPosition: 0, actionId: ACTION_ID, parameters } }).errors[0]).toMatch(/cannot rebuild/);
  });

  it('parses tiered price schedules in display units', () => {
    expect(parsePriceSchedule({ type: 'tiers', price: '', tiers: [{ minAmount: '5', price: '1' }, { minAmount: '1', price: '2' }] }, 8)).toEqual({
      schedule: { type: 'tiers', tiers: [{ minAmount: 100_000_000n, price: 2n }, { minAmount: 500_000_000n, price: 1n }] },
    });
    expect(parsePriceSchedule({ type: 'single', price: '1.5', tiers: [] }, 8).error).toMatch(/whole number of credits/);
    expect(parsePriceSchedule({ type: 'none', price: '', tiers: [] }, 8)).toEqual({ schedule: { type: 'none' } });
  });

  it('names operations by kind', () => {
    expect(tokenOperationId('destroyFrozen')).toBe('token.destroyFrozen');
    expect(tokenKindFromOperationId('token.claim')).toBe('claim');
    expect(tokenKindFromOperationId('token.unknown')).toBeUndefined();
    expect(tokenKindFromOperationId('document.create')).toBeUndefined();
  });
});
