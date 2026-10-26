// Configuration updates: who governs each `TokenConfigurationChangeItem`, and
// what applying it means. Mirrors rs-dpp `can_apply_token_configuration_item`
// and `authorized_action_takers_for_configuration_item` (v5.0.0-rc.8): value
// items need the rule's `authorizedToMakeChange`; re-assigning who may act
// (control group) or who administers the rule (admin group) needs its
// `adminActionTakers`, subject to the rule's "to no one" and "self-changing
// admin" flags.

import { formatTokenAmount } from '@util/token-rules';
import { authorize, describeTakers, ruleFor, type Authority, type TokenModel } from './model';
import { MAX_DECIMALS } from './amount';
import type { ActionTakers, ChangeRule, TokenConfigChange } from './options';

export const CHANGE_RULE_LABELS: Record<ChangeRule, string> = {
  conventions: 'Conventions (names, decimals)',
  maxSupply: 'Max supply',
  perpetualDistribution: 'Perpetual distribution',
  newTokensDestinationIdentity: 'New-tokens destination identity',
  mintingAllowChoosingDestination: 'Minters choose the destination',
  marketplaceTradeMode: 'Marketplace trade mode',
  manualMinting: 'Minting',
  manualBurning: 'Burning',
  freeze: 'Freezing',
  unfreeze: 'Unfreezing',
  destroyFrozenFunds: 'Destroying frozen funds',
  emergencyAction: 'Emergency action (pause / resume)',
};

const sameTakers = (a: ActionTakers | null, b: ActionTakers): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Who may apply `change`, or why no one can. */
export function configChangeAuthority(
  change: TokenConfigChange,
  model: TokenModel,
  signerId: string,
): Authority {
  const deny = (reason: string): Authority => ({ kind: 'denied', reason });
  if (change.item === 'mainControlGroup')
    return authorize(model.mainControlGroupCanBeModified, model, signerId, 'change the main control group of');
  // A value item is governed by the rule of the same name.
  const ruleName: ChangeRule = change.item === 'rule' ? change.rule : change.item;
  const label = CHANGE_RULE_LABELS[ruleName].toLowerCase();
  const rule = ruleFor(model, ruleName);
  if (change.item !== 'rule') return authorize(rule?.authorized ?? null, model, signerId, `change the ${label} of`);
  if (!rule) return deny(`The token has no ${label} rule.`);
  if (change.target === 'authorized') {
    if (change.takers.type === 'noOne' && !rule.authorizedToNoOneAllowed)
      return deny(`This token's rules forbid setting who may act on ${label} to no one.`);
  } else {
    if (!rule.selfChangingAdminAllowed)
      return deny(`This token's rules forbid changing who administers ${label}.`);
    if (change.takers.type === 'noOne' && !rule.adminToNoOneAllowed)
      return deny(`This token's rules forbid setting the administrators of ${label} to no one.`);
  }
  return authorize(rule.admin, model, signerId, `change who governs ${label} on`);
}

/** Problems with the new value itself, independent of who applies it. */
export function configChangeProblems(
  change: TokenConfigChange,
  model: TokenModel,
  totalSupply: bigint,
): string[] {
  const problems: string[] = [];
  const takers =
    change.item === 'rule' ? change.takers : undefined;
  if (takers?.type === 'mainGroup' && model.mainControlGroup === undefined)
    problems.push('The token has no main control group, so it cannot be given authority.');
  if (takers?.type === 'group' && !model.groups[takers.position])
    problems.push(`The contract has no group #${takers.position}.`);
  if (change.item === 'rule') {
    const rule = ruleFor(model, change.rule);
    const current = change.target === 'authorized' ? rule?.authorized : rule?.admin;
    if (rule && sameTakers(current ?? null, change.takers))
      problems.push(`That is already the ${change.target === 'authorized' ? 'authority' : 'administrator'}.`);
  }
  switch (change.item) {
    case 'maxSupply':
      if (change.value !== null && change.value < totalSupply)
        problems.push(
          `The max supply cannot be below the current total supply of ${formatTokenAmount(totalSupply, model.decimals)}.`,
        );
      break;
    case 'mainControlGroup':
      if (change.value !== null && !model.groups[change.value])
        problems.push(`The contract has no group #${change.value}.`);
      break;
    case 'conventions':
      if (Object.keys(change.localizations).length === 0)
        problems.push('Keep at least one localization.');
      if (!Number.isInteger(change.decimals) || change.decimals < 0 || change.decimals > MAX_DECIMALS)
        problems.push(`Decimals must be a whole number from 0 to ${MAX_DECIMALS}.`);
      break;
    case 'perpetualDistribution':
      if (change.value && (change.value.interval <= 0n || change.value.amount <= 0n))
        problems.push('The interval and the amount per interval must be greater than zero.');
      break;
    default:
      break;
  }
  return problems;
}

/**
 * Whether the change may give up control or reinterpret balances: authority
 * handed to no one, administration of a rule handed over, the main control
 * group moved or cleared, a distribution or destination removed, or the
 * decimals changed (`decimals` is the token's current value).
 */
export function configChangeIsDestructive(change: TokenConfigChange, decimals: number): boolean {
  switch (change.item) {
    case 'rule':
      return change.takers.type === 'noOne' || change.target === 'admin';
    case 'mainControlGroup':
      return true;
    case 'perpetualDistribution':
    case 'newTokensDestinationIdentity':
      return change.value === null;
    case 'conventions':
      return change.decimals !== decimals;
    default:
      return false;
  }
}

export function describeConfigChange(change: TokenConfigChange, decimals: number, name: string): string {
  switch (change.item) {
    case 'conventions':
      return `Sets the conventions to ${change.decimals} decimal places with localizations ${Object.entries(
        change.localizations,
      )
        .map(([lang, l]) => `${lang}: "${l.singularForm}" / "${l.pluralForm}"`)
        .join(', ')}. Amounts are displayed with the new decimals afterwards.`;
    case 'maxSupply':
      return change.value === null
        ? 'Removes the max supply.'
        : `Sets the max supply to ${formatTokenAmount(change.value, decimals)} ${name} (${change.value} base units).`;
    case 'newTokensDestinationIdentity':
      return change.value === null
        ? 'Clears the new-tokens destination identity.'
        : `Sends newly minted tokens to identity ${change.value} by default.`;
    case 'mintingAllowChoosingDestination':
      return change.value
        ? 'Lets minters choose who receives minted tokens.'
        : 'Stops minters from choosing who receives minted tokens.';
    case 'perpetualDistribution': {
      const d = change.value;
      if (!d) return 'Removes the perpetual distribution.';
      const unit = d.intervalType === 'block' ? 'blocks' : d.intervalType === 'time' ? 'ms' : 'epochs';
      const to =
        d.recipient.type === 'identity'
          ? `identity ${d.recipient.identityId}`
          : d.recipient.type === 'evonodes'
            ? 'evonodes by participation'
            : 'the contract owner';
      return `Sets the perpetual distribution to ${formatTokenAmount(d.amount, decimals)} ${name} (${d.amount} base units) every ${d.interval} ${unit}, to ${to}.`;
    }
    case 'marketplaceTradeMode':
      return 'Sets the marketplace trade mode to not tradeable.';
    case 'mainControlGroup':
      return change.value === null
        ? 'Removes the main control group.'
        : `Makes group #${change.value} the main control group.`;
    case 'rule':
      return change.target === 'authorized'
        ? `Lets ${describeTakers(change.takers)} act on ${CHANGE_RULE_LABELS[change.rule].toLowerCase()}.`
        : `Makes ${describeTakers(change.takers)} the administrator of ${CHANGE_RULE_LABELS[change.rule].toLowerCase()}.`;
  }
}
