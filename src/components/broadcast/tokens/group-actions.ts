// Pending group actions, read from `GroupAction.toJSON()`: evo-sdk 5.0 emits
// `{ proposer_id, token_contract_position, event: { $kind: "tokenEvent",
// $type: "mint", amount, recipient, publicNote } }` (wasm-dpp2 TokenEvent);
// a configuration change is `{ $type: "maxSupply", value }`. Co-signers must
// repeat the proposal's parameters exactly (Drive rejects any change with
// ModificationOfGroupActionMainParametersNotPermitted), so the co-sign inputs
// are derived from the action rather than typed in.

import { toRecord } from '@util/contract';
import { idToString } from '@util/sdk-shape';
import { parseActionTakers } from './model';
import { toUnsignedBigInt } from '@util/numbers';
import {
  CHANGE_RULES,
  configChangeIdentityIds,
  ruleItemName,
  sortTiers,
  type ChangeRule,
  type TokenConfigChange,
  type TokenOperationKind,
  type TokenPriceSchedule,
} from './options';

export interface PendingGroupAction {
  actionId: string;
  groupPosition: number;
  tokenPosition?: number;
  proposerId?: string;
  /** The token event's `$type` (mint, burn, configUpdate…). */
  eventType?: string;
  fields: Record<string, unknown>;
  /** Member → power contributed so far. */
  signers: Record<string, number>;
  signedPower: number;
}

const EVENT_KINDS: Record<string, TokenOperationKind> = {
  mint: 'mint',
  burn: 'burn',
  freeze: 'freeze',
  unfreeze: 'unfreeze',
  destroyFrozenFunds: 'destroyFrozen',
  emergencyAction: 'emergencyAction',
  changePriceForDirectPurchase: 'setPrice',
  configUpdate: 'configUpdate',
};

export function pendingActionKind(action: PendingGroupAction): TokenOperationKind | undefined {
  return action.eventType ? EVENT_KINDS[action.eventType] : undefined;
}

export function pendingActionFromJson(
  actionId: string,
  groupPosition: number,
  json: unknown,
  signers: Map<unknown, unknown> | undefined,
): PendingGroupAction {
  const plain = toRecord(json) ?? {};
  const event = toRecord(plain.event) ?? {};
  // rc.2 nested the token event under `data`; 5.0 flattens it.
  const inner = typeof event.$kind === 'string' ? event : (toRecord(event.data) ?? {});
  const { $kind: _kind, $type, ...fields } = inner;
  const signerPowers: Record<string, number> = {};
  for (const [id, power] of signers ?? []) signerPowers[String(id)] = Number(power);
  const position = Number(plain.token_contract_position ?? plain.tokenContractPosition);
  return {
    actionId,
    groupPosition,
    tokenPosition: Number.isInteger(position) ? position : undefined,
    proposerId: idToString(plain.proposer_id ?? plain.proposerId),
    eventType: typeof $type === 'string' ? $type : typeof inner.type === 'string' ? inner.type : undefined,
    fields: fields as Record<string, unknown>,
    signers: signerPowers,
    signedPower: Object.values(signerPowers).reduce((sum, power) => sum + power, 0),
  };
}

const big = toUnsignedBigInt;

const id = (value: unknown): string | undefined => idToString(value) ?? undefined;

/**
 * rs-dpp `TokenPricingSchedule` JSON, internally tagged:
 * `{ $type: "singlePrice", price }` or `{ $type: "setPrices", prices }`; null
 * removes the price.
 */
export function parsePricingSchedule(value: unknown): TokenPriceSchedule | null {
  if (value === null || value === undefined) return { type: 'none' };
  const rec = toRecord(value);
  if (rec?.$type === 'singlePrice') {
    const price = big(rec.price);
    return price === undefined ? null : { type: 'single', price };
  }
  if (rec?.$type === 'setPrices') {
    const tiers = Object.entries(toRecord(rec.prices) ?? {}).map(([amount, price]) => ({
      minAmount: big(amount),
      price: big(price),
    }));
    if (tiers.length === 0 || tiers.some((t) => t.minAmount === undefined || t.price === undefined)) return null;
    return { type: 'tiers', tiers: sortTiers(tiers as Array<{ minAmount: bigint; price: bigint }>) };
  }
  return null;
}

const RULE_ITEM_NAMES = Object.fromEntries(
  CHANGE_RULES.flatMap((rule) =>
    (['authorized', 'admin'] as const).map((target) => [ruleItemName(rule, target), { rule, target }]),
  ),
) as Record<string, { rule: ChangeRule; target: 'authorized' | 'admin' }>;

/** rs-dpp `TokenConfigurationChangeItem` JSON → the change this UI can rebuild, or null. */
export function parseConfigChange(value: unknown): TokenConfigChange | null {
  const rec = toRecord(value);
  const type = typeof rec?.$type === 'string' ? rec.$type : undefined;
  if (!rec || !type) return null;
  const payload = rec.value;
  const ruleItem = RULE_ITEM_NAMES[type];
  if (ruleItem) {
    const takers = parseActionTakers(payload);
    return takers ? { item: 'rule', ...ruleItem, takers } : null;
  }
  switch (type) {
    case 'maxSupply': {
      if (payload === null || payload === undefined) return { item: 'maxSupply', value: null };
      const value = big(payload);
      return value === undefined ? null : { item: 'maxSupply', value };
    }
    case 'newTokensDestinationIdentity':
      return { item: 'newTokensDestinationIdentity', value: payload ? (id(payload) ?? null) : null };
    case 'mintingAllowChoosingDestination':
      return typeof payload === 'boolean' ? { item: 'mintingAllowChoosingDestination', value: payload } : null;
    case 'mainControlGroup':
      return payload === null || payload === undefined
        ? { item: 'mainControlGroup', value: null }
        : Number.isInteger(Number(payload))
          ? { item: 'mainControlGroup', value: Number(payload) }
          : null;
    case 'marketplaceTradeMode':
      return { item: 'marketplaceTradeMode', value: 'NotTradeable' };
    case 'conventions': {
      const conventions = toRecord(payload);
      const decimals = Number(conventions?.decimals);
      const localizations: Extract<TokenConfigChange, { item: 'conventions' }>['localizations'] = {};
      for (const [lang, raw] of Object.entries(toRecord(conventions?.localizations) ?? {})) {
        const l = toRecord(raw);
        if (!l || typeof l.singularForm !== 'string' || typeof l.pluralForm !== 'string') return null;
        localizations[lang] = {
          shouldCapitalize: l.shouldCapitalize === true,
          singularForm: l.singularForm,
          pluralForm: l.pluralForm,
        };
      }
      return Number.isInteger(decimals) ? { item: 'conventions', decimals, localizations } : null;
    }
    case 'perpetualDistribution': {
      if (payload === null || payload === undefined) return { item: 'perpetualDistribution', value: null };
      const distribution = toRecord(payload);
      const type = toRecord(distribution?.distributionType);
      const fn = toRecord(type?.function);
      const recipient = toRecord(distribution?.distributionRecipient);
      const intervalType =
        type?.$type === 'blockBasedDistribution' ? 'block'
          : type?.$type === 'timeBasedDistribution' ? 'time'
            : type?.$type === 'epochBasedDistribution' ? 'epoch' : undefined;
      const interval = big(type?.interval);
      const amount = big(fn?.amount);
      if (!intervalType || interval === undefined || fn?.$type !== 'fixedAmount' || amount === undefined) return null;
      const to =
        recipient?.$type === 'contractOwner' ? ({ type: 'contractOwner' } as const)
          : recipient?.$type === 'evonodesByParticipation' ? ({ type: 'evonodes' } as const)
            : recipient?.$type === 'identity' && id(recipient.identity)
              ? ({ type: 'identity', identityId: id(recipient.identity)! } as const)
              : undefined;
      return to ? { item: 'perpetualDistribution', value: { intervalType, interval, amount, recipient: to } } : null;
    }
    default:
      return null;
  }
}

/** The parameters a co-signer must repeat, from the pending action. */
export type CosignParameters =
  | { kind: 'mint'; amount: bigint; recipientId: string }
  | { kind: 'burn'; amount: bigint; burnFromId?: string }
  | { kind: 'freeze' | 'unfreeze'; targetIdentityId: string }
  | { kind: 'destroyFrozen'; targetIdentityId: string }
  | { kind: 'emergencyAction'; action: 'pause' | 'resume' }
  | { kind: 'setPrice'; schedule: TokenPriceSchedule }
  | { kind: 'configUpdate'; change: TokenConfigChange };

export function cosignParameters(action: PendingGroupAction): CosignParameters | null {
  const f = action.fields;
  switch (pendingActionKind(action)) {
    case 'mint': {
      const amount = big(f.amount);
      const recipientId = id(f.recipient ?? f.recipientId);
      return amount !== undefined && recipientId ? { kind: 'mint', amount, recipientId } : null;
    }
    case 'burn': {
      const amount = big(f.amount);
      return amount !== undefined ? { kind: 'burn', amount, burnFromId: id(f.burnFromIdentifier) } : null;
    }
    case 'freeze':
    case 'unfreeze': {
      const target = id(f.frozenIdentifier);
      return target ? { kind: pendingActionKind(action) as 'freeze' | 'unfreeze', targetIdentityId: target } : null;
    }
    case 'destroyFrozen': {
      const target = id(f.frozenIdentifier);
      return target ? { kind: 'destroyFrozen', targetIdentityId: target } : null;
    }
    case 'emergencyAction': {
      const action = String(f.action ?? '').toLowerCase();
      return action === 'pause' || action === 'resume' ? { kind: 'emergencyAction', action } : null;
    }
    case 'setPrice': {
      const schedule = parsePricingSchedule(f.pricingSchedule);
      return schedule ? { kind: 'setPrice', schedule } : null;
    }
    case 'configUpdate': {
      const change = parseConfigChange(f.configurationChange);
      return change ? { kind: 'configUpdate', change } : null;
    }
    default:
      return null;
  }
}

/** Identities a co-signed action names, whose balances and frozen state its checks read. */
export function cosignIdentityIds(parameters: CosignParameters | null): string[] {
  if (!parameters) return [];
  return [
    'recipientId' in parameters ? parameters.recipientId : undefined,
    'targetIdentityId' in parameters ? parameters.targetIdentityId : undefined,
    parameters.kind === 'burn' ? parameters.burnFromId : undefined,
    ...(parameters.kind === 'configUpdate' ? configChangeIdentityIds(parameters.change) : []),
  ].filter((id): id is string => !!id);
}
