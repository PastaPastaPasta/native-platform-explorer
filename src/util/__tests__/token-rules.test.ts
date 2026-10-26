import { describe, expect, it } from 'vitest';
import {
  changeControlRows,
  describeActionTakers,
  describeDistributionFunction,
  describePerpetualDistribution,
  describeTradeMode,
  formatTokenAmount,
  preProgrammedSchedule,
  tokenFlagsFromConfig,
} from '../token-rules';

const rule = (authorized: unknown, admin: unknown = 'NoOne') => ({
  $formatVersion: '0',
  authorizedToMakeChange: authorized,
  adminActionTakers: admin,
  changingAuthorizedActionTakersToNoOneAllowed: false,
  changingAdminActionTakersToNoOneAllowed: true,
  selfChangingAdminActionTakersAllowed: false,
});

// Shapes copied from the rc.2 WASM `DataContract.toJSON()` of live testnet and
// mainnet tokens (DUSD on mainnet; xwWhSsv…, 4xd9us… on testnet).
const config = {
  $formatVersion: '0',
  baseSupply: 100000000,
  maxSupply: null,
  startAsPaused: false,
  manualMintingRules: rule('ContractOwner', 'ContractOwner'),
  manualBurningRules: rule({ Identity: '3sL6q6eVCR6y8Ld6Gr14cedhJWNBPmBp3S5VtRcckxzE' }),
  freezeRules: rule('NoOne'),
  unfreezeRules: rule('NoOne'),
  destroyFrozenFundsRules: rule('NoOne'),
  emergencyActionRules: rule('MainGroup'),
  distributionRules: {
    $formatVersion: '0',
    perpetualDistribution: {
      $formatVersion: '0',
      distributionType: {
        TimeBasedDistribution: {
          interval: 600000,
          function: {
            StepDecreasingAmount: {
              step_count: 1,
              decrease_per_interval_numerator: 1,
              decrease_per_interval_denominator: 100,
              start_decreasing_offset: null,
              max_interval_count: null,
              distribution_start_amount: 100000000,
              trailing_distribution_interval_amount: 1,
              min_value: null,
            },
          },
        },
      },
      distributionRecipient: 'ContractOwner',
    },
    perpetualDistributionRules: rule('NoOne'),
    changeDirectPurchasePricingRules: rule({ Group: 1 }),
  },
  marketplaceRules: { $formatVersion: '0', tradeMode: 'NotTradeable', tradeModeChangeRules: rule('ContractOwner') },
};

describe('action takers', () => {
  it('names every AuthorizedActionTakers variant', () => {
    expect(describeActionTakers('NoOne').label).toBe('No one');
    expect(describeActionTakers('ContractOwner').label).toBe('Contract owner');
    expect(describeActionTakers('MainGroup').label).toBe('Main control group');
    expect(describeActionTakers({ Identity: 'abc' })).toEqual({ label: 'Identity', identityId: 'abc' });
    expect(describeActionTakers({ Group: 2 })).toEqual({ label: 'Group #2', groupPosition: 2 });
  });

  it('lists change-control rules, including nested distribution and marketplace rules', () => {
    const rows = changeControlRows(config);
    expect(rows.map((r) => r.key)).toEqual([
      'manualMintingRules',
      'manualBurningRules',
      'freezeRules',
      'unfreezeRules',
      'destroyFrozenFundsRules',
      'emergencyActionRules',
      'distributionRules.perpetualDistributionRules',
      'distributionRules.changeDirectPurchasePricingRules',
      'marketplaceRules.tradeModeChangeRules',
    ]);
    const burn = rows.find((r) => r.key === 'manualBurningRules')!;
    expect(burn.authorized.identityId).toBe('3sL6q6eVCR6y8Ld6Gr14cedhJWNBPmBp3S5VtRcckxzE');
    expect(burn.changingAdminToNoOneAllowed).toBe(true);
    expect(rows.find((r) => r.key === 'distributionRules.changeDirectPurchasePricingRules')!.authorized.label).toBe('Group #1');
  });

  it('derives capability pills from who may act, not from token status', () => {
    expect(tokenFlagsFromConfig(config)).toEqual({
      mintable: true,
      burnable: true,
      freezable: false,
      unfreezable: false,
      destroyable: false,
      emergencyAction: true,
    });
  });
});

describe('perpetual distribution', () => {
  it('describes interval, emission and recipient', () => {
    const d = describePerpetualDistribution(config.distributionRules.perpetualDistribution)!;
    expect(d.kind).toBe('time');
    expect(d.interval).toBe('every 10 minutes');
    expect(d.emission).toBe(
      'Step-decreasing: starts at 100000000, reduced by 1/100 every 1 interval, for at most 128 (default) reductions, then 1 per interval',
    );
    expect(d.recipient).toEqual({ label: 'Contract owner' });
  });

  it('formats block and epoch intervals and identity / evonode recipients', () => {
    expect(describePerpetualDistribution({
      distributionType: { BlockBasedDistribution: { interval: 100, function: { FixedAmount: { amount: 5 } } } },
      distributionRecipient: { Identity: 'id1' },
    })).toMatchObject({ kind: 'block', interval: 'every 100 blocks', emission: 'Fixed: 5 per interval', recipient: { identityId: 'id1' } });
    expect(describePerpetualDistribution({
      distributionType: { EpochBasedDistribution: { interval: 1, function: { Random: { min: 1, max: 9 } } } },
      distributionRecipient: 'EvonodesByParticipation',
    })).toMatchObject({ interval: 'every 1 epoch', emission: 'Random: between 1 and 9 per interval', recipient: { label: 'Evonodes, by block-production participation' } });
    expect(describePerpetualDistribution(null)).toBeNull();
  });

  it('describes stepwise and formula functions', () => {
    expect(describeDistributionFunction({ Stepwise: { '10': 50, '0': 100 } })).toBe('Stepwise: 100 from interval 0; 50 from interval 10');
    expect(describeDistributionFunction({ Linear: { a: -2, d: 1, start_step: null, starting_amount: 100, min_value: 10, max_value: null } }))
      .toBe('Linear: f(x) = -2·(x − start) / 1 + 100, never below 10');
    expect(describeDistributionFunction({ Exponential: { a: 1, d: 1, m: 2, n: 1, o: 0, start_moment: null, b: 10, min_value: null, max_value: 500 } }))
      .toBe('Exponential: f(x) = 1·e^(2·(x − s + 0) / 1) / 1 + 10, never above 500');
  });
});

describe('evo-sdk 5.0 internally tagged enums', () => {
  // Shapes from the 5.0.0-rc.8 WASM `DataContract.toJSON()` of live testnet
  // token stt-99 (contract Afk9QSj9…) and rs-dpp's 5.0 serializers.
  it('names action takers and recipients', () => {
    expect(describeActionTakers({ $type: 'noOne' }).label).toBe('No one');
    expect(describeActionTakers({ $type: 'contractOwner' }).label).toBe('Contract owner');
    expect(describeActionTakers({ $type: 'mainGroup' }).label).toBe('Main control group');
    expect(describeActionTakers({ $type: 'identity', identity: 'abc' })).toEqual({ label: 'Identity', identityId: 'abc' });
    expect(describeActionTakers({ $type: 'group', position: 2 })).toEqual({ label: 'Group #2', groupPosition: 2 });
    expect(tokenFlagsFromConfig({
      manualMintingRules: rule({ $type: 'contractOwner' }),
      manualBurningRules: rule({ $type: 'noOne' }),
    })).toMatchObject({ mintable: true, burnable: false });
  });

  it('reports a capability as unknown, not on, when its action takers cannot be read', () => {
    expect(tokenFlagsFromConfig({
      manualMintingRules: rule({ kind: 'future', two: 'keys' }),
      manualBurningRules: rule({ $type: 'someoneNew' }),
      freezeRules: rule(42),
      unfreezeRules: rule({ $type: 'noOne' }),
    })).toMatchObject({ mintable: 'unknown', burnable: 'unknown', freezable: 'unknown', unfreezable: false, destroyable: false });
  });

  it('describes a perpetual distribution', () => {
    expect(describePerpetualDistribution({
      $formatVersion: '0',
      distributionType: { $type: 'blockBasedDistribution', interval: 100, function: { $type: 'fixedAmount', amount: 1 } },
      distributionRecipient: { $type: 'contractOwner' },
    })).toEqual({ kind: 'block', interval: 'every 100 blocks', intervalUnit: 'block intervals', emission: 'Fixed: 1 per interval', recipient: { label: 'Contract owner' } });
    expect(describePerpetualDistribution({
      distributionType: { $type: 'timeBasedDistribution', interval: 600000, function: { $type: 'stepwise', '10': 50, '0': 100 } },
      distributionRecipient: { $type: 'identity', identity: 'id1' },
    })).toMatchObject({ interval: 'every 10 minutes', emission: 'Stepwise: 100 from interval 0; 50 from interval 10', recipient: { identityId: 'id1' } });
    expect(describeDistributionFunction({ $type: 'linear', a: -2, d: 1, start_step: null, starting_amount: 100, min_value: 10, max_value: null }))
      .toBe('Linear: f(x) = -2·(x − start) / 1 + 100, never below 10');
    expect(describeTradeMode('NotTradeable')).toBe('Not tradeable on the marketplace');
  });
});

describe('other rules', () => {
  it('sorts a pre-programmed schedule by release time', () => {
    expect(preProgrammedSchedule({
      $formatVersion: '0',
      distributions: { '1800000000000': { a: 2 }, '1700000000000': { b: 500, c: '9007199254740993' } },
    })).toEqual([
      { timestampMs: 1700000000000, recipients: [{ identityId: 'b', amount: '500' }, { identityId: 'c', amount: '9007199254740993' }] },
      { timestampMs: 1800000000000, recipients: [{ identityId: 'a', amount: '2' }] },
    ]);
    expect(preProgrammedSchedule(null)).toEqual([]);
  });

  it('describes the rc.2 trade mode', () => {
    expect(describeTradeMode('NotTradeable')).toBe('Not tradeable on the marketplace');
  });

  it('formats raw token amounts with decimals', () => {
    expect(formatTokenAmount(5600000000n, 6)).toBe('5,600');
    expect(formatTokenAmount('2100000000000001', 8)).toBe('21,000,000.00000001');
    expect(formatTokenAmount(12, 0)).toBe('12');
    expect(formatTokenAmount(5, 3)).toBe('0.005');
  });
});
