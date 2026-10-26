// Turns what the form holds (display strings) into reviewed inputs (integer
// base units), or explains what is missing. Kept pure so the conversion is
// tested apart from React.

import { isBase58Identifier } from '@util/identifier';
import { parseDecimalBigInt } from '../forms/amount';
import { parseTokenAmount } from './amount';
import type { CosignParameters } from './group-actions';
import type { TokenModel } from './model';
import {
  sortTiers,
  type TokenConfigChange,
  type TokenDistributionKind,
  type TokenGroupAction,
  type TokenOperationKind,
  type TokenOperationOptions,
  type TokenPriceSchedule,
} from './options';

export interface PriceScheduleFields {
  type: TokenPriceSchedule['type'];
  /** Credits per base unit. */
  price: string;
  /** Minimum amount in display units → credits per base unit. */
  tiers: Array<{ minAmount: string; price: string }>;
}

export interface TokenFormFields {
  amount: string;
  recipient: string;
  target: string;
  action: 'pause' | 'resume';
  schedule: PriceScheduleFields;
  maxTotal: string;
  distributionType: TokenDistributionKind;
  note: string;
  /** Built by the configuration fields, or the reason it cannot be. */
  change: TokenConfigChange | string | null;
}

export const EMPTY_FIELDS: TokenFormFields = {
  amount: '',
  recipient: '',
  target: '',
  action: 'pause',
  schedule: { type: 'single', price: '', tiers: [{ minAmount: '', price: '' }] },
  maxTotal: '',
  distributionType: 'perpetual',
  note: '',
  change: null,
};

export type GroupChoice =
  | { mode: 'direct' }
  | { mode: 'propose'; groupPosition: number }
  | { mode: 'cosign'; groupPosition: number; actionId: string; parameters: CosignParameters | null };

export interface DraftContext {
  model: TokenModel;
  signerId: string;
  group: GroupChoice;
  /** Frozen balance of the target, for destroyFrozen. */
  targetBalance?: bigint;
  /** Current price (credits per base unit), for directPurchase. */
  price?: { first: bigint; last: bigint };
}

export type Draft = { options: TokenOperationOptions; errors: [] } | { options: null; errors: string[] };

function credits(text: string, label: string): { value?: bigint; error?: string } {
  if (!text.trim()) return { error: `Enter the ${label}.` };
  const value = parseDecimalBigInt(text);
  return value === null ? { error: `The ${label} must be a whole number of credits.` } : { value };
}

export function parsePriceSchedule(
  fields: PriceScheduleFields,
  decimals: number,
): { schedule?: TokenPriceSchedule; error?: string } {
  if (fields.type === 'none') return { schedule: { type: 'none' } };
  if (fields.type === 'single') {
    const price = credits(fields.price, 'price per base unit');
    return price.error ? { error: price.error } : { schedule: { type: 'single', price: price.value! } };
  }
  const tiers: Array<{ minAmount: bigint; price: bigint }> = [];
  for (const [index, tier] of fields.tiers.entries()) {
    const amount = parseTokenAmount(tier.minAmount, decimals);
    if (amount.value === undefined) return { error: `Tier ${index + 1} minimum: ${amount.error}` };
    const price = credits(tier.price, `tier ${index + 1} price`);
    if (price.error) return { error: price.error };
    tiers.push({ minAmount: amount.value, price: price.value! });
  }
  return { schedule: { type: 'tiers', tiers: sortTiers(tiers) } };
}

export function buildTokenDraft(kind: TokenOperationKind, fields: TokenFormFields, context: DraftContext): Draft {
  const { model, signerId, group } = context;
  const errors: string[] = [];
  const fail = (): Draft => ({ options: null, errors });
  const groupAction: TokenGroupAction | undefined =
    group.mode === 'propose'
      ? { mode: 'propose', groupPosition: group.groupPosition }
      : group.mode === 'cosign'
        ? { mode: 'cosign', groupPosition: group.groupPosition, actionId: group.actionId }
        : undefined;
  const cosign = group.mode === 'cosign' ? group.parameters : undefined;
  if (group.mode === 'cosign' && (!cosign || cosign.kind !== kind)) {
    errors.push('This explorer cannot rebuild the parameters of that group action, so it cannot co-sign it.');
    return fail();
  }
  const base = {
    tokenId: model.tokenId,
    contractId: model.contractId,
    tokenPosition: model.position,
    signerId,
    decimals: model.decimals,
    tokenName: model.name,
    ...(groupAction ? { group: groupAction } : {}),
    ...(fields.note.trim() && group.mode !== 'cosign' ? { publicNote: fields.note.trim() } : {}),
  };
  const amount = (): bigint | undefined => {
    if (!fields.amount.trim()) {
      errors.push('Enter an amount.');
      return undefined;
    }
    const parsed = parseTokenAmount(fields.amount, model.decimals);
    if (parsed.error) errors.push(parsed.error);
    return parsed.value;
  };
  const identity = (text: string, label: string): string | undefined => {
    const id = text.trim();
    if (!id) errors.push(`Enter the ${label}.`);
    else if (!isBase58Identifier(id)) errors.push(`The ${label} is not a valid identity ID.`);
    else return id;
    return undefined;
  };

  switch (kind) {
    case 'mint': {
      if (cosign?.kind === 'mint')
        return {
          options: {
            ...base,
            kind,
            amount: cosign.amount,
            recipientId: cosign.recipientId,
            chooseRecipient: model.mintingAllowChoosingDestination,
          },
          errors: [],
        };
      const value = amount();
      const recipient = model.mintingAllowChoosingDestination
        ? identity(fields.recipient, 'recipient identity')
        : model.newTokensDestinationIdentity;
      if (!recipient && !model.mintingAllowChoosingDestination)
        errors.push('No one can mint: the token has no destination identity and minters may not choose one.');
      if (errors.length || value === undefined || !recipient) return fail();
      return {
        options: { ...base, kind, amount: value, recipientId: recipient, chooseRecipient: model.mintingAllowChoosingDestination },
        errors: [],
      };
    }
    case 'burn': {
      const value = cosign?.kind === 'burn' ? cosign.amount : amount();
      if (errors.length || value === undefined) return fail();
      return { options: { ...base, kind, amount: value }, errors: [] };
    }
    case 'transfer': {
      const value = amount();
      const recipient = identity(fields.recipient, 'recipient identity');
      if (errors.length || value === undefined || !recipient) return fail();
      return { options: { ...base, kind, amount: value, recipientId: recipient }, errors: [] };
    }
    case 'freeze':
    case 'unfreeze': {
      const target =
        cosign && 'targetIdentityId' in cosign ? cosign.targetIdentityId : identity(fields.target, 'identity');
      if (errors.length || !target) return fail();
      return { options: { ...base, kind, targetIdentityId: target }, errors: [] };
    }
    case 'destroyFrozen': {
      const target =
        cosign?.kind === 'destroyFrozen' ? cosign.targetIdentityId : identity(fields.target, 'identity');
      if (errors.length || !target) return fail();
      if (context.targetBalance === undefined) {
        errors.push('Loading the frozen balance…');
        return fail();
      }
      return {
        options: { ...base, kind, targetIdentityId: target, frozenBalance: context.targetBalance },
        errors: [],
      };
    }
    case 'emergencyAction': {
      const action = cosign?.kind === 'emergencyAction' ? cosign.action : fields.action;
      return { options: { ...base, kind, action }, errors: [] };
    }
    case 'setPrice': {
      if (cosign?.kind === 'setPrice') return { options: { ...base, kind, schedule: cosign.schedule }, errors: [] };
      const parsed = parsePriceSchedule(fields.schedule, model.decimals);
      if (parsed.error) errors.push(parsed.error);
      if (!parsed.schedule) return fail();
      return { options: { ...base, kind, schedule: parsed.schedule }, errors: [] };
    }
    case 'directPurchase': {
      const value = amount();
      const price = context.price;
      if (!price) errors.push('This token is not for sale: no direct-purchase price is set.');
      if (errors.length || value === undefined || !price) return fail();
      let maxTotalCost: bigint;
      if (price.first === price.last) {
        maxTotalCost = price.first * value;
      } else {
        const max = credits(fields.maxTotal, 'maximum total');
        if (max.error) {
          errors.push(max.error);
          return fail();
        }
        maxTotalCost = max.value!;
      }
      const { publicNote: _note, ...purchase } = base;
      return {
        options: { ...purchase, kind, amount: value, maxTotalCost, reviewedPrice: price },
        errors: [],
      };
    }
    case 'claim':
      return { options: { ...base, kind, distributionType: fields.distributionType }, errors: [] };
    case 'configUpdate': {
      const change = cosign?.kind === 'configUpdate' ? cosign.change : fields.change;
      if (!change || typeof change === 'string') {
        errors.push(typeof change === 'string' ? change : 'Choose the configuration change.');
        return fail();
      }
      return { options: { ...base, kind, change }, errors: [] };
    }
  }
}
