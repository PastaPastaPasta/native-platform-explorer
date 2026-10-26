// What a token write needs to know about the token's configuration, read from
// `DataContract.toJSON()` (evo-sdk 5.0 tags enums internally with `$type`;
// `enumVariant` also reads rc.2's external tags). Authorization mirrors rs-dpp
// `AuthorizedActionTakers::allowed_for_action_taker` (Platform v5.0.0-rc.8).

import { normaliseContract, toRecord, tokenConfigAt } from '@util/contract';
import { enumVariant } from '@util/token-rules';
import { shortId } from '@util/identifier';
import type { ActionTakers, ChangeRule, TokenOperationKind } from './options';

export interface TokenGroup {
  position: number;
  /** Member identity → voting power. */
  members: Record<string, number>;
  requiredPower: number;
}

export interface ChangeControlRules {
  authorized: ActionTakers | null;
  admin: ActionTakers | null;
  authorizedToNoOneAllowed: boolean;
  adminToNoOneAllowed: boolean;
  selfChangingAdminAllowed: boolean;
}

export interface TokenModel {
  tokenId: string;
  contractId: string;
  position: number;
  contractOwnerId: string;
  name: string;
  decimals: number;
  maxSupply?: bigint;
  mainControlGroup?: number;
  mainControlGroupCanBeModified: ActionTakers | null;
  groups: Record<number, TokenGroup>;
  allowTransferToFrozenBalance: boolean;
  mintingAllowChoosingDestination: boolean;
  newTokensDestinationIdentity?: string;
  perpetualDistribution?: Record<string, unknown>;
  preProgrammedDistribution?: Record<string, unknown>;
  oncePerIdentityDistribution?: Record<string, unknown>;
  /** The raw token configuration JSON, for display and rule lookups. */
  config: Record<string, unknown>;
}

const toBigInt = (value: unknown): bigint | undefined => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
};

const optionalRecord = (value: unknown) => toRecord(value) ?? undefined;

export function parseActionTakers(value: unknown): ActionTakers | null {
  const variant = enumVariant(value);
  switch (variant?.variant) {
    case 'NoOne':
      return { type: 'noOne' };
    case 'ContractOwner':
      return { type: 'contractOwner' };
    case 'MainGroup':
      return { type: 'mainGroup' };
    case 'Identity':
      return typeof variant.payload === 'string'
        ? { type: 'identity', identityId: variant.payload }
        : null;
    case 'Group': {
      const position = Number(variant.payload);
      return Number.isInteger(position) && position >= 0 ? { type: 'group', position } : null;
    }
    default:
      return null;
  }
}

export function describeTakers(takers: ActionTakers | null): string {
  switch (takers?.type) {
    case 'noOne':
      return 'no one';
    case 'contractOwner':
      return 'the contract owner';
    case 'mainGroup':
      return 'the main control group';
    case 'identity':
      return `identity ${takers.identityId}`;
    case 'group':
      return `group #${takers.position}`;
    default:
      return 'an unrecognised authority';
  }
}

function parseRules(value: unknown): ChangeControlRules | null {
  const rules = toRecord(value);
  if (!rules) return null;
  return {
    authorized: parseActionTakers(rules.authorizedToMakeChange),
    admin: parseActionTakers(rules.adminActionTakers),
    authorizedToNoOneAllowed: rules.changingAuthorizedActionTakersToNoOneAllowed === true,
    adminToNoOneAllowed: rules.changingAdminActionTakersToNoOneAllowed === true,
    selfChangingAdminAllowed: rules.selfChangingAdminActionTakersAllowed === true,
  };
}

function parseGroups(value: unknown): Record<number, TokenGroup> {
  const groups: Record<number, TokenGroup> = {};
  for (const [key, raw] of Object.entries(toRecord(value) ?? {})) {
    const group = toRecord(raw);
    const position = Number(key);
    const required = Number(group?.requiredPower);
    if (!group || !Number.isInteger(position) || !Number.isInteger(required)) continue;
    const members: Record<string, number> = {};
    for (const [member, power] of Object.entries(toRecord(group.members) ?? {})) {
      const p = Number(power);
      if (Number.isInteger(p) && p > 0) members[member] = p;
    }
    groups[position] = { position, members, requiredPower: required };
  }
  return groups;
}

/** Build the model from a fetched DataContract (or its JSON). */
export function tokenModelFromContract(
  contract: unknown,
  target: { tokenId: string; contractId: string; position: number },
): TokenModel {
  const shape = normaliseContract(contract);
  const config = tokenConfigAt(shape, target.position);
  const raw = toRecord(config?.raw);
  if (!config || !raw)
    throw new Error(`Contract ${target.contractId} has no token at position ${target.position}.`);
  if (shape.id && shape.id !== target.contractId)
    throw new Error(`Fetched contract ${shape.id} instead of ${target.contractId}.`);
  if (!shape.ownerId) throw new Error(`Contract ${target.contractId} has no owner.`);
  if (config.decimals === undefined)
    throw new Error(`The token's conventions do not state its decimals.`);
  const distribution = toRecord(raw.distributionRules) ?? {};
  const mainControlGroup = Number(raw.mainControlGroup);
  const destination = distribution.newTokensDestinationIdentity;
  return {
    ...target,
    contractOwnerId: shape.ownerId,
    name: config.primaryName ?? `token #${target.position}`,
    decimals: config.decimals,
    maxSupply: toBigInt(raw.maxSupply),
    mainControlGroup:
      raw.mainControlGroup !== null && raw.mainControlGroup !== undefined && Number.isInteger(mainControlGroup)
        ? mainControlGroup
        : undefined,
    mainControlGroupCanBeModified: parseActionTakers(raw.mainControlGroupCanBeModified),
    groups: parseGroups(shape.groups),
    allowTransferToFrozenBalance: raw.allowTransferToFrozenBalance !== false,
    mintingAllowChoosingDestination: distribution.mintingAllowChoosingDestination === true,
    newTokensDestinationIdentity: typeof destination === 'string' ? destination : undefined,
    perpetualDistribution: optionalRecord(distribution.perpetualDistribution),
    preProgrammedDistribution: optionalRecord(distribution.preProgrammedDistribution),
    oncePerIdentityDistribution: optionalRecord(distribution.oncePerIdentityDistribution),
    config: raw,
  };
}

/** Where each rule sits in the token configuration JSON. */
const RULE_PATHS: Record<ChangeRule | 'directPurchasePricing', string[]> = {
  conventions: ['conventionsChangeRules'],
  maxSupply: ['maxSupplyChangeRules'],
  perpetualDistribution: ['distributionRules', 'perpetualDistributionRules'],
  newTokensDestinationIdentity: ['distributionRules', 'newTokensDestinationIdentityRules'],
  mintingAllowChoosingDestination: ['distributionRules', 'mintingAllowChoosingDestinationRules'],
  directPurchasePricing: ['distributionRules', 'changeDirectPurchasePricingRules'],
  marketplaceTradeMode: ['marketplaceRules', 'tradeModeChangeRules'],
  manualMinting: ['manualMintingRules'],
  manualBurning: ['manualBurningRules'],
  freeze: ['freezeRules'],
  unfreeze: ['unfreezeRules'],
  destroyFrozenFunds: ['destroyFrozenFundsRules'],
  emergencyAction: ['emergencyActionRules'],
};

export function ruleFor(model: TokenModel, rule: ChangeRule | 'directPurchasePricing'): ChangeControlRules | null {
  let current: unknown = model.config;
  for (const key of RULE_PATHS[rule]) current = toRecord(current)?.[key];
  return parseRules(current);
}

/** The rule that authorizes an operation, for operations governed by one. */
export const OPERATION_RULES: Partial<Record<TokenOperationKind, ChangeRule | 'directPurchasePricing'>> = {
  mint: 'manualMinting',
  burn: 'manualBurning',
  freeze: 'freeze',
  unfreeze: 'unfreeze',
  destroyFrozen: 'destroyFrozenFunds',
  emergencyAction: 'emergencyAction',
  setPrice: 'directPurchasePricing',
};

export type Authority =
  | { kind: 'denied'; reason: string }
  /** The signer may act alone, without a group action. */
  | { kind: 'direct' }
  /**
   * A group must approve. Members propose or co-sign; one whose power alone
   * meets the requirement may also act directly.
   */
  | { kind: 'group'; group: TokenGroup; signerPower: number; canActAlone: boolean };

/** Who may act under `takers`, for the signer. `action` completes "may … this token". */
export function authorize(
  takers: ActionTakers | null,
  model: Pick<TokenModel, 'contractOwnerId' | 'mainControlGroup' | 'groups'>,
  signerId: string,
  action: string,
): Authority {
  const deny = (reason: string): Authority => ({ kind: 'denied', reason });
  const viaGroup = (position: number | undefined, label: string): Authority => {
    const group = position === undefined ? undefined : model.groups[position];
    if (!group)
      return deny(
        position === undefined
          ? `Only the main control group may ${action} this token, and none is set.`
          : `Only ${label} may ${action} this token, and the contract has no group #${position}.`,
      );
    const signerPower = group.members[signerId] ?? 0;
    if (signerPower <= 0)
      return deny(
        `Only ${label} (group #${group.position}) may ${action} this token, and you are not a member.`,
      );
    return { kind: 'group', group, signerPower, canActAlone: signerPower >= group.requiredPower };
  };
  switch (takers?.type) {
    case 'noOne':
      return deny(`No one may ${action} this token.`);
    case 'contractOwner':
      return signerId === model.contractOwnerId
        ? { kind: 'direct' }
        : deny(
            `Only the contract owner (${shortId(model.contractOwnerId)}) may ${action} this token.`,
          );
    case 'identity':
      return signerId === takers.identityId
        ? { kind: 'direct' }
        : deny(`Only identity ${shortId(takers.identityId)} may ${action} this token.`);
    case 'mainGroup':
      return viaGroup(model.mainControlGroup, 'the main control group');
    case 'group':
      return viaGroup(takers.position, `group #${takers.position}`);
    default:
      return deny(`The rule for who may ${action} this token could not be read.`);
  }
}

const ACTION_VERBS: Record<TokenOperationKind, string> = {
  mint: 'mint',
  burn: 'burn',
  transfer: 'transfer',
  freeze: 'freeze balances of',
  unfreeze: 'unfreeze balances of',
  destroyFrozen: 'destroy frozen balances of',
  emergencyAction: 'pause or resume',
  setPrice: 'set the direct-purchase price of',
  directPurchase: 'buy',
  claim: 'claim',
  configUpdate: 'update the configuration of',
};

/** Authority for an operation governed by a single rule (mint, burn, freeze…). */
export function operationAuthority(
  kind: TokenOperationKind,
  model: TokenModel,
  signerId: string,
): Authority | null {
  const rule = OPERATION_RULES[kind];
  if (!rule) return null;
  return authorize(ruleFor(model, rule)?.authorized ?? null, model, signerId, ACTION_VERBS[kind]);
}
