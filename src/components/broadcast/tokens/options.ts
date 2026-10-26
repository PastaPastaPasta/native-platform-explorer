// Reviewed inputs of the token write operations. They are plain data so the
// review binding can fingerprint them; amounts are integer base units.

export const TOKEN_OPERATION_KINDS = [
  'mint',
  'burn',
  'transfer',
  'freeze',
  'unfreeze',
  'destroyFrozen',
  'emergencyAction',
  'setPrice',
  'directPurchase',
  'claim',
  'configUpdate',
] as const;

export type TokenOperationKind = (typeof TOKEN_OPERATION_KINDS)[number];

/** Propose a new group action, or co-sign a pending one (rs-dpp `GroupStateTransitionInfoStatus`). */
export type TokenGroupAction =
  | { mode: 'propose'; groupPosition: number }
  | { mode: 'cosign'; groupPosition: number; actionId: string };

/** rs-dpp `AuthorizedActionTakers`. */
export type ActionTakers =
  | { type: 'noOne' }
  | { type: 'contractOwner' }
  | { type: 'mainGroup' }
  | { type: 'identity'; identityId: string }
  | { type: 'group'; position: number };

interface TokenOperationBase {
  tokenId: string;
  contractId: string;
  tokenPosition: number;
  /** The identity the inputs were built for; the executor refuses any other signer. */
  signerId: string;
  /** Conventions shown at review. The executor refuses to sign if Platform reports others. */
  decimals: number;
  tokenName: string;
  group?: TokenGroupAction;
  publicNote?: string;
}

export interface TokenMintOptions extends TokenOperationBase {
  kind: 'mint';
  amount: bigint;
  /** Where the tokens go: the chosen recipient or the token's destination identity. */
  recipientId: string;
  /** Pass `recipientId` to Platform (only when the token lets minters choose). */
  chooseRecipient: boolean;
}

export interface TokenBurnOptions extends TokenOperationBase {
  kind: 'burn';
  amount: bigint;
}

export interface TokenTransferOptions extends TokenOperationBase {
  kind: 'transfer';
  amount: bigint;
  recipientId: string;
}

export interface TokenFreezeOptions extends TokenOperationBase {
  kind: 'freeze' | 'unfreeze';
  targetIdentityId: string;
}

export interface TokenDestroyFrozenOptions extends TokenOperationBase {
  kind: 'destroyFrozen';
  targetIdentityId: string;
  /** The frozen balance shown at review; Platform destroys the whole balance. */
  frozenBalance: bigint;
}

export interface TokenEmergencyActionOptions extends TokenOperationBase {
  kind: 'emergencyAction';
  action: 'pause' | 'resume';
}

export type TokenPriceSchedule =
  | { type: 'none' }
  | { type: 'single'; price: bigint }
  /** `minAmount` in base units → credits per base unit. */
  | { type: 'tiers'; tiers: Array<{ minAmount: bigint; price: bigint }> };

export interface TokenSetPriceOptions extends TokenOperationBase {
  kind: 'setPrice';
  schedule: TokenPriceSchedule;
}

export interface TokenDirectPurchaseOptions extends TokenOperationBase {
  kind: 'directPurchase';
  amount: bigint;
  /** The most the buyer agrees to pay; Platform charges the schedule's price. */
  maxTotalCost: bigint;
  /** The price seen at review (credits per base unit, first and last tier). */
  reviewedPrice: { first: bigint; last: bigint };
}

export type TokenDistributionKind = 'perpetual' | 'preProgrammed' | 'oncePerIdentity';

export interface TokenClaimOptions extends TokenOperationBase {
  kind: 'claim';
  distributionType: TokenDistributionKind;
}

/** Rules a configuration update can re-assign, keyed like the token config JSON. */
export const CHANGE_RULES = [
  'conventions',
  'maxSupply',
  'perpetualDistribution',
  'newTokensDestinationIdentity',
  'mintingAllowChoosingDestination',
  'marketplaceTradeMode',
  'manualMinting',
  'manualBurning',
  'freeze',
  'unfreeze',
  'destroyFrozenFunds',
  'emergencyAction',
] as const;
export type ChangeRule = (typeof CHANGE_RULES)[number];

export interface PerpetualDistributionInput {
  intervalType: 'block' | 'time' | 'epoch';
  /** Blocks, milliseconds, or epochs. */
  interval: bigint;
  /** Base units emitted per interval (a fixed-amount function). */
  amount: bigint;
  recipient: { type: 'contractOwner' } | { type: 'identity'; identityId: string } | { type: 'evonodes' };
}

/** One `TokenConfigurationChangeItem` the SDK can build. */
export type TokenConfigChange =
  | {
      item: 'conventions';
      decimals: number;
      localizations: Record<string, { shouldCapitalize: boolean; singularForm: string; pluralForm: string }>;
    }
  | { item: 'maxSupply'; value: bigint | null }
  | { item: 'newTokensDestinationIdentity'; value: string | null }
  | { item: 'mintingAllowChoosingDestination'; value: boolean }
  | { item: 'perpetualDistribution'; value: PerpetualDistributionInput | null }
  | { item: 'marketplaceTradeMode'; value: 'NotTradeable' }
  | { item: 'mainControlGroup'; value: number | null }
  /** Who may act under a rule (`authorized`), or who may change that (`admin`). */
  | { item: 'rule'; rule: ChangeRule; target: 'authorized' | 'admin'; takers: ActionTakers };

export interface TokenConfigUpdateOptions extends TokenOperationBase {
  kind: 'configUpdate';
  change: TokenConfigChange;
}

export type TokenOperationOptions =
  | TokenMintOptions
  | TokenBurnOptions
  | TokenTransferOptions
  | TokenFreezeOptions
  | TokenDestroyFrozenOptions
  | TokenEmergencyActionOptions
  | TokenSetPriceOptions
  | TokenDirectPurchaseOptions
  | TokenClaimOptions
  | TokenConfigUpdateOptions;

export type TokenOptionsOf<K extends TokenOperationKind> = Extract<TokenOperationOptions, { kind: K }>;

/** Operations whose single-transition batch also accepts a TRANSFER key. */
export const TRANSFER_KEY_OPERATIONS: ReadonlySet<TokenOperationKind> = new Set(['transfer', 'claim']);

/** Operations Platform lets a group govern (they take `groupInfo`). */
export const GROUP_OPERATIONS: ReadonlySet<TokenOperationKind> = new Set([
  'mint',
  'burn',
  'freeze',
  'unfreeze',
  'destroyFrozen',
  'emergencyAction',
  'setPrice',
  'configUpdate',
]);

export function tokenOperationId(kind: TokenOperationKind): string {
  return `token.${kind}`;
}

export function tokenKindFromOperationId(id: string): TokenOperationKind | undefined {
  const kind = id.startsWith('token.') ? id.slice('token.'.length) : '';
  return (TOKEN_OPERATION_KINDS as readonly string[]).includes(kind)
    ? (kind as TokenOperationKind)
    : undefined;
}
