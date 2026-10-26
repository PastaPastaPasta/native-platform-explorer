// Review copy: the exact effect of the reviewed inputs, with amounts in display
// units and base units.

import { describeTokenAmount } from './amount';
import { configChangeIsDestructive, describeConfigChange } from './config-change';
import type { TokenDistributionKind, TokenOperationKind, TokenOperationOptions, TokenPriceSchedule } from './options';

function credits(value: bigint): string {
  return `${value} credit${value === 1n ? '' : 's'}`;
}

function describeSchedule(schedule: TokenPriceSchedule, decimals: number, name: string): string {
  const perToken = (price: bigint) => `${price * 10n ** BigInt(decimals)} credits per whole ${name}`;
  switch (schedule.type) {
    case 'none':
      return `Removes the direct-purchase price: ${name} can no longer be bought directly.`;
    case 'single':
      return `Sets the direct-purchase price of ${name} to ${credits(schedule.price)} per base unit (${perToken(schedule.price)}).`;
    case 'tiers':
      return `Sets a tiered direct-purchase price for ${name}: ${schedule.tiers
        .map((t) => `from ${describeTokenAmount(t.minAmount, decimals, name)}, ${credits(t.price)} per base unit`)
        .join('; ')}.`;
  }
}

function groupSuffix(options: TokenOperationOptions): string {
  if (!options.group) return '';
  return options.group.mode === 'propose'
    ? ` Proposed as a new action of group #${options.group.groupPosition}; it takes effect once the group's required power has signed.`
    : ` Co-signs pending action ${options.group.actionId} of group #${options.group.groupPosition}; it takes effect if this signature completes the required power.`;
}

export function summariseTokenOperation(options: TokenOperationOptions): string {
  const { decimals, tokenName: name } = options;
  const amount = (value: bigint) => describeTokenAmount(value, decimals, name);
  let effect: string;
  switch (options.kind) {
    case 'mint':
      effect = `Mints ${amount(options.amount)} to ${options.recipientId}.`;
      break;
    case 'burn':
      effect =
        options.group?.mode === 'cosign'
          ? `Burns ${amount(options.amount)} from the proposer's balance.`
          : `Burns ${amount(options.amount)} from ${options.signerId}.`;
      break;
    case 'transfer':
      effect = `Transfers ${amount(options.amount)} from ${options.signerId} to ${options.recipientId}.`;
      break;
    case 'freeze':
      effect = `Freezes the ${name} balance of ${options.targetIdentityId}: it cannot send the token until unfrozen.`;
      break;
    case 'unfreeze':
      effect = `Unfreezes the ${name} balance of ${options.targetIdentityId}.`;
      break;
    case 'destroyFrozen':
      effect =
        `Destroys the entire frozen ${name} balance of ${options.targetIdentityId}, ` +
        `${amount(options.frozenBalance)} at review, removing it from the supply. This cannot be undone.`;
      break;
    case 'emergencyAction':
      effect =
        options.action === 'pause'
          ? `Pauses ${name}: transfers between holders stop until the token is resumed.`
          : `Resumes ${name}: transfers between holders are allowed again.`;
      break;
    case 'setPrice':
      effect = describeSchedule(options.schedule, decimals, name);
      break;
    case 'directPurchase': {
      const single = options.reviewedPrice.first === options.reviewedPrice.last;
      effect = single
        ? `Buys ${amount(options.amount)} for ${credits(options.maxTotalCost)} (${options.reviewedPrice.first} per base unit).`
        : `Buys ${amount(options.amount)} at the tiered price, paying at most ${credits(options.maxTotalCost)}; Platform charges the price of the tier the amount falls in.`;
      break;
    }
    case 'claim':
      effect = `Claims the ${CLAIMED[options.distributionType]} distribution of ${name} for ${options.signerId}.`;
      break;
    case 'configUpdate':
      effect = describeConfigChange(options.change, decimals, name);
      break;
  }
  return `${effect}${groupSuffix(options)} Token ${options.tokenId} (contract ${options.contractId}, position ${options.tokenPosition}).`;
}

const CLAIMED: Record<TokenDistributionKind, string> = {
  perpetual: 'perpetual',
  preProgrammed: 'due pre-programmed',
  oncePerIdentity: 'once-per-identity',
};

/** Operations that destroy tokens or stop trading, whatever their inputs. */
export const ALWAYS_DESTRUCTIVE: ReadonlySet<TokenOperationKind> = new Set(['burn', 'destroyFrozen', 'emergencyAction']);

/** Destroys tokens, stops trading, or gives up control of the token. */
export function tokenOperationIsDestructive(options: TokenOperationOptions): boolean {
  if (ALWAYS_DESTRUCTIVE.has(options.kind)) return true;
  return options.kind === 'configUpdate' && configChangeIsDestructive(options.change, options.decimals);
}
