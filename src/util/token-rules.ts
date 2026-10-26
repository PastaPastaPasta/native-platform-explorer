// Human-readable descriptions of a token configuration (rs-dpp
// `TokenConfigurationV0`, as serialised by the rc.2 WASM `toJSON()`). Enums are
// externally tagged: unit variants are strings (`"NoOne"`), others are
// single-key objects (`{ "Identity": "<base58>" }`, `{ "Group": 0 }`).

import { toRecord } from './contract';
import { removeTrailingZeros } from './numbers';


/** Split an externally tagged enum value into its variant name and payload. */
export function enumVariant(value: unknown): { variant: string; payload?: unknown } | null {
  if (typeof value === 'string') return { variant: value };
  const rec = toRecord(value);
  if (!rec) return null;
  const keys = Object.keys(rec).filter((k) => k !== '$formatVersion');
  if (keys.length !== 1) return null;
  return { variant: keys[0]!, payload: rec[keys[0]!] };
}

export interface ActionTakers {
  label: string;
  identityId?: string;
  groupPosition?: number;
}

/** rs-dpp `AuthorizedActionTakers`. */
export function describeActionTakers(value: unknown): ActionTakers {
  const v = enumVariant(value);
  switch (v?.variant) {
    case 'NoOne': return { label: 'No one' };
    case 'ContractOwner': return { label: 'Contract owner' };
    case 'MainGroup': return { label: 'Main control group' };
    case 'Identity': return { label: 'Identity', identityId: String(v.payload) };
    case 'Group': return { label: `Group #${String(v.payload)}`, groupPosition: Number(v.payload) };
    default: return { label: value === undefined || value === null ? '—' : String(JSON.stringify(value)) };
  }
}

export interface ChangeControlRow {
  key: string;
  label: string;
  /** Who may perform the action (or make the change). */
  authorized: ActionTakers;
  /** Who may change who is authorized. */
  admin: ActionTakers;
  changingAuthorizedToNoOneAllowed: boolean;
  changingAdminToNoOneAllowed: boolean;
  selfChangingAdminAllowed: boolean;
}

const RULES: Array<[path: string[], label: string]> = [
  [['manualMintingRules'], 'Mint'],
  [['manualBurningRules'], 'Burn'],
  [['freezeRules'], 'Freeze balances'],
  [['unfreezeRules'], 'Unfreeze balances'],
  [['destroyFrozenFundsRules'], 'Destroy frozen funds'],
  [['emergencyActionRules'], 'Emergency action (pause / resume)'],
  [['maxSupplyChangeRules'], 'Change max supply'],
  [['conventionsChangeRules'], 'Change conventions (names, decimals)'],
  [['distributionRules', 'perpetualDistributionRules'], 'Change perpetual distribution'],
  [['distributionRules', 'newTokensDestinationIdentityRules'], 'Change new-tokens destination'],
  [['distributionRules', 'mintingAllowChoosingDestinationRules'], 'Change whether minters choose a destination'],
  [['distributionRules', 'changeDirectPurchasePricingRules'], 'Set direct-purchase price'],
  [['marketplaceRules', 'tradeModeChangeRules'], 'Change trade mode'],
];

function at(config: Record<string, unknown> | undefined, path: string[]): unknown {
  let cur: unknown = config;
  for (const key of path) cur = toRecord(cur)?.[key];
  return cur;
}

export function changeControlRows(config: unknown): ChangeControlRow[] {
  const cfg = toRecord(config);
  const rows: ChangeControlRow[] = [];
  for (const [path, label] of RULES) {
    const rule = toRecord(at(cfg, path));
    if (!rule) continue;
    rows.push({
      key: path.join('.'),
      label,
      authorized: describeActionTakers(rule.authorizedToMakeChange),
      admin: describeActionTakers(rule.adminActionTakers),
      changingAuthorizedToNoOneAllowed: rule.changingAuthorizedActionTakersToNoOneAllowed === true,
      changingAdminToNoOneAllowed: rule.changingAdminActionTakersToNoOneAllowed === true,
      selfChangingAdminAllowed: rule.selfChangingAdminActionTakersAllowed === true,
    });
  }
  return rows;
}

const canAct = (config: Record<string, unknown> | undefined, key: string) => {
  const rule = toRecord(config?.[key]);
  return rule ? enumVariant(rule.authorizedToMakeChange)?.variant !== 'NoOne' : false;
};

/** Capability pills: an action is "on" when someone is authorized to perform it. */
export function tokenFlagsFromConfig(config: unknown) {
  const cfg = toRecord(config);
  return {
    mintable: canAct(cfg, 'manualMintingRules'),
    burnable: canAct(cfg, 'manualBurningRules'),
    freezable: canAct(cfg, 'freezeRules'),
    unfreezable: canAct(cfg, 'unfreezeRules'),
    destroyable: canAct(cfg, 'destroyFrozenFundsRules'),
    emergencyAction: canAct(cfg, 'emergencyActionRules'),
  };
}

// ── Perpetual distribution ─────────────────────────────────────────────

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return undefined;
  return typeof v === 'number' || typeof v === 'bigint' ? v.toString() : String(v);
};

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return `${ms} ms`;
  const units: Array<[number, string]> = [
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute'],
    [1_000, 'second'],
  ];
  for (const [size, unit] of units) {
    if (ms >= size && ms % size === 0) {
      const n = ms / size;
      return `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;
    }
  }
  return `${ms.toLocaleString('en-US')} ms`;
}

/** rs-dpp `RewardDistributionType`: when distributions happen. */
export function describeInterval(distributionType: unknown): string | null {
  const v = enumVariant(distributionType);
  const payload = toRecord(v?.payload);
  if (!v || !payload) return null;
  const interval = Number(payload.interval);
  switch (v.variant) {
    case 'BlockBasedDistribution': return `every ${interval.toLocaleString('en-US')} block${interval === 1 ? '' : 's'}`;
    case 'TimeBasedDistribution': return `every ${formatDuration(interval)}`;
    case 'EpochBasedDistribution': return `every ${interval.toLocaleString('en-US')} epoch${interval === 1 ? '' : 's'}`;
    default: return null;
  }
}

/** The variable `x` counts intervals of this kind. */
function intervalUnit(variant: string | undefined): string {
  if (variant === 'BlockBasedDistribution') return 'block intervals';
  if (variant === 'TimeBasedDistribution') return 'time intervals';
  if (variant === 'EpochBasedDistribution') return 'epoch intervals';
  return 'intervals';
}

function bounds(p: Record<string, unknown>): string {
  const min = num(p.min_value);
  const max = num(p.max_value);
  if (min && max) return `, clamped to [${min}, ${max}]`;
  if (min) return `, never below ${min}`;
  if (max) return `, never above ${max}`;
  return '';
}

/** rs-dpp `DistributionFunction`: how many tokens each interval emits. Raw
 *  amounts are in the token's smallest unit, as stored on chain. */
export function describeDistributionFunction(fn: unknown): string {
  const v = enumVariant(fn);
  if (!v) return 'Unknown function';
  const p = toRecord(v.payload) ?? {};
  switch (v.variant) {
    case 'FixedAmount':
      return `Fixed: ${num(p.amount)} per interval`;
    case 'Random':
      return `Random: between ${num(p.min)} and ${num(p.max)} per interval`;
    case 'StepDecreasingAmount': {
      const offset = num(p.start_decreasing_offset);
      const maxSteps = num(p.max_interval_count);
      return [
        `Step-decreasing: starts at ${num(p.distribution_start_amount)}`,
        `reduced by ${num(p.decrease_per_interval_numerator)}/${num(p.decrease_per_interval_denominator)} every ${num(p.step_count)} interval${p.step_count === 1 ? '' : 's'}`,
        offset ? `starting after interval ${offset}` : null,
        // rs-dpp DEFAULT_STEP_DECREASING_AMOUNT_MAX_CYCLES_BEFORE_TRAILING_DISTRIBUTION
        `for at most ${maxSteps ?? '128 (default)'} reductions`,
        `then ${num(p.trailing_distribution_interval_amount)} per interval`,
      ].filter(Boolean).join(', ') + bounds(p);
    }
    case 'Stepwise': {
      const steps = Object.entries(toRecord(v.payload) ?? {})
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([from, amount]) => `${num(amount)} from interval ${from}`);
      return `Stepwise: ${steps.join('; ')}`;
    }
    case 'Linear':
      return `Linear: f(x) = ${num(p.a)}·(x − ${num(p.start_step) ?? 'start'}) / ${num(p.d)} + ${num(p.starting_amount)}${bounds(p)}`;
    case 'Polynomial':
      return `Polynomial: f(x) = ${num(p.a)}·(x − s + ${num(p.o)})^(${num(p.m)}/${num(p.n)}) / ${num(p.d)} + ${num(p.b)}${bounds(p)}`;
    case 'Exponential':
      return `Exponential: f(x) = ${num(p.a)}·e^(${num(p.m)}·(x − s + ${num(p.o)}) / ${num(p.n)}) / ${num(p.d)} + ${num(p.b)}${bounds(p)}`;
    case 'Logarithmic':
      return `Logarithmic: f(x) = ${num(p.a)}·ln(${num(p.m)}·(x − s + ${num(p.o)}) / ${num(p.n)}) / ${num(p.d)} + ${num(p.b)}${bounds(p)}`;
    case 'InvertedLogarithmic':
      return `Inverted logarithmic: f(x) = ${num(p.a)}·ln(${num(p.n)} / (${num(p.m)}·(x − s + ${num(p.o)}))) / ${num(p.d)} + ${num(p.b)}${bounds(p)}`;
    default:
      return v.variant;
  }
}

export interface Recipient {
  label: string;
  identityId?: string;
}

/** rs-dpp `TokenDistributionRecipient`. */
export function describeRecipient(value: unknown): Recipient {
  const v = enumVariant(value);
  switch (v?.variant) {
    case 'ContractOwner': return { label: 'Contract owner' };
    case 'Identity': return { label: 'Identity', identityId: String(v.payload) };
    case 'EvonodesByParticipation': return { label: 'Evonodes, by block-production participation' };
    default: return { label: '—' };
  }
}

export interface PerpetualDistributionSummary {
  kind: 'block' | 'time' | 'epoch' | 'unknown';
  interval: string | null;
  intervalUnit: string;
  emission: string;
  recipient: Recipient;
}

export function describePerpetualDistribution(value: unknown): PerpetualDistributionSummary | null {
  const rec = toRecord(value);
  if (!rec) return null;
  const type = enumVariant(rec.distributionType);
  const kind = type?.variant === 'BlockBasedDistribution' ? 'block'
    : type?.variant === 'TimeBasedDistribution' ? 'time'
      : type?.variant === 'EpochBasedDistribution' ? 'epoch'
        : 'unknown';
  return {
    kind,
    interval: describeInterval(rec.distributionType),
    intervalUnit: intervalUnit(type?.variant),
    emission: describeDistributionFunction(toRecord(type?.payload)?.function),
    recipient: describeRecipient(rec.distributionRecipient),
  };
}

export interface PreProgrammedEntry {
  timestampMs: number;
  recipients: Array<{ identityId: string; amount: string }>;
}

/** rs-dpp `TokenPreProgrammedDistributionV0.distributions`: time → identity → amount. */
export function preProgrammedSchedule(value: unknown): PreProgrammedEntry[] {
  const distributions = toRecord(toRecord(value)?.distributions);
  if (!distributions) return [];
  return Object.entries(distributions)
    .map(([ts, recipients]) => ({
      timestampMs: Number(ts),
      recipients: Object.entries(toRecord(recipients) ?? {}).map(([identityId, amount]) => ({
        identityId,
        amount: num(amount) ?? '0',
      })),
    }))
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

/** rs-dpp `TokenTradeMode`; rc.2 only defines `NotTradeable`. */
export function describeTradeMode(value: unknown): string {
  const v = enumVariant(value);
  if (!v) return '—';
  if (v.variant === 'NotTradeable') return 'Not tradeable on the marketplace';
  return v.variant;
}

export const KEEPS_HISTORY_LABELS: Record<string, string> = {
  keepsTransferHistory: 'Transfers',
  keepsFreezingHistory: 'Freezes',
  keepsMintingHistory: 'Mints',
  keepsBurningHistory: 'Burns',
  keepsDirectPricingHistory: 'Price changes',
  keepsDirectPurchaseHistory: 'Direct purchases',
};

/** Raw on-chain amount scaled by the token's decimals. */
export function formatTokenAmount(raw: bigint | number | string, decimals: number | undefined): string {
  const value = typeof raw === 'bigint' ? raw : BigInt(String(raw));
  if (!decimals) return value.toLocaleString('en-US');
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = BigInt(digits.slice(0, -decimals)).toLocaleString('en-US');
  const fraction = removeTrailingZeros(`0.${digits.slice(-decimals)}`).slice(1);
  return `${negative ? '-' : ''}${whole}${fraction}`;
}
