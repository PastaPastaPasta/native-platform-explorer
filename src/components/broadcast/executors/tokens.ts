// Token write executors. Each re-reads the token immediately before signing,
// re-runs the checks the form ran before review, and submits only if they all
// still pass (anything thrown before the SDK write call is "not submitted").
// After a confirmed write it re-reads the affected balances with a proof; a
// failed re-read does not turn a confirmed write into an unknown outcome.

import type * as EvoModule from '@dashevo/evo-sdk';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { extractErrorMessage } from '@sdk/errors';
import { formatTokenAmount } from '@util/token-rules';
import { resolveSigningCriteria } from '../capabilities';
import { withSigningMaterial, type ExecuteArgs } from '../executors';
import { BroadcastOutcomeUnknownError, type ReceiptEntities } from '../outcomes';
import type { SdkSigningMaterial } from '@/signer/types';
import { actionMatches, authorityFor, holderIdsFor, tokenOperationProblems } from '../tokens/checks';
import { cosignParameters } from '../tokens/group-actions';
import {
  tokenOperationId,
  type ActionTakers,
  type ChangeRule,
  type TokenConfigChange,
  type TokenOperationKind,
  type TokenOperationOptions,
} from '../tokens/options';
import {
  loadGroupActions,
  loadPendingAction,
  loadTokenSnapshot,
  readProvedBalances,
  resolveTokenTarget,
} from '../tokens/state';

type Evo = typeof EvoModule;

export interface TokenBalanceChange {
  identityId: string;
  /** Base units, proved immediately before signing. */
  before: string;
  /** Base units, proved after the write was confirmed. */
  after?: string;
  /** "before → after" in display units. */
  display: string;
}

export interface TokenResult {
  kind: 'token';
  action: TokenOperationKind;
  tokenId: string;
  contractId: string;
  tokenPosition: number;
  recipientId?: string;
  targetIdentityId?: string;
  message: string;
  group?: {
    mode: 'propose' | 'cosign';
    groupPosition: number;
    actionId?: string;
    requiredPower: number;
    /** Power the action holds after this signature, when the SDK reports it. */
    power?: number;
    status?: string;
  };
  balances?: TokenBalanceChange[];
  /** Block height the post-write balances were proved at. */
  balancesProvedAtHeight?: string;
  balancesError?: string;
}

/** Identities whose balance the operation changes. */
function affectedIdentities(options: TokenOperationOptions, burnFromId?: string): string[] {
  switch (options.kind) {
    case 'mint':
      return [options.recipientId];
    case 'burn':
      return [burnFromId ?? options.signerId];
    case 'transfer':
      return [options.signerId, options.recipientId];
    case 'destroyFrozen':
      return [options.targetIdentityId];
    case 'directPurchase':
    case 'claim':
      return [options.signerId];
    default:
      return [];
  }
}

function takersObject(evo: Evo, takers: ActionTakers) {
  const { AuthorizedActionTakers } = evo;
  switch (takers.type) {
    case 'noOne':
      return AuthorizedActionTakers.NoOne();
    case 'contractOwner':
      return AuthorizedActionTakers.ContractOwner();
    case 'mainGroup':
      return AuthorizedActionTakers.MainGroup();
    case 'identity':
      return AuthorizedActionTakers.Identity(takers.identityId);
    case 'group':
      return AuthorizedActionTakers.Group(takers.position);
  }
}

/** The SDK static that builds each (rule, target) change. */
const RULE_ITEM_BUILDERS: Record<ChangeRule, { authorized: string; admin: string }> = {
  conventions: { authorized: 'ConventionsControlGroupItem', admin: 'ConventionsAdminGroupItem' },
  maxSupply: { authorized: 'MaxSupplyControlGroupItem', admin: 'MaxSupplyAdminGroupItem' },
  perpetualDistribution: {
    authorized: 'PerpetualDistributionControlGroupItem',
    admin: 'PerpetualDistributionAdminGroupItem',
  },
  newTokensDestinationIdentity: {
    authorized: 'NewTokensDestinationIdentityControlGroupItem',
    admin: 'NewTokensDestinationIdentityAdminGroupItem',
  },
  mintingAllowChoosingDestination: {
    authorized: 'MintingAllowChoosingDestinationControlGroupItem',
    admin: 'MintingAllowChoosingDestinationAdminGroupItem',
  },
  marketplaceTradeMode: {
    authorized: 'MarketplaceTradeModeControlGroupItem',
    admin: 'MarketplaceTradeModeAdminGroupItem',
  },
  manualMinting: { authorized: 'ManualMintingItem', admin: 'ManualMintingAdminGroupItem' },
  manualBurning: { authorized: 'ManualBurningItem', admin: 'ManualBurningAdminGroupItem' },
  freeze: { authorized: 'FreezeItem', admin: 'FreezeAdminGroupItem' },
  unfreeze: { authorized: 'UnfreezeItem', admin: 'UnfreezeAdminGroupItem' },
  destroyFrozenFunds: { authorized: 'DestroyFrozenFundsItem', admin: 'DestroyFrozenFundsAdminGroupItem' },
  emergencyAction: { authorized: 'EmergencyActionItem', admin: 'EmergencyActionAdminGroupItem' },
};

export function buildConfigChangeItem(evo: Evo, change: TokenConfigChange) {
  const { TokenConfigurationChangeItem: Item } = evo;
  switch (change.item) {
    case 'conventions': {
      const localizations = Object.fromEntries(
        Object.entries(change.localizations).map(([lang, l]) => [
          lang,
          new evo.TokenConfigurationLocalization(l.shouldCapitalize, l.singularForm, l.pluralForm),
        ]),
      );
      return Item.conventionsItem(new evo.TokenConfigurationConvention(localizations, change.decimals));
    }
    case 'maxSupply':
      return Item.MaxSupplyItem(change.value);
    case 'newTokensDestinationIdentity':
      return Item.NewTokensDestinationIdentityItem(change.value ?? undefined);
    case 'mintingAllowChoosingDestination':
      return Item.MintingAllowChoosingDestinationItem(change.value);
    case 'marketplaceTradeMode':
      return Item.MarketplaceTradeModeItem(evo.TokenTradeMode.NotTradeable());
    case 'mainControlGroup':
      return Item.MainControlGroupItem(change.value);
    case 'perpetualDistribution': {
      const d = change.value;
      if (!d) return Item.PerpetualDistributionConfigurationItem(null);
      const fn = evo.DistributionFunction.FixedAmountDistribution(
        new evo.DistributionFixedAmount({ amount: d.amount }),
      );
      const type =
        d.intervalType === 'block'
          ? evo.RewardDistributionType.BlockBasedDistribution(d.interval, fn)
          : d.intervalType === 'time'
            ? evo.RewardDistributionType.TimeBasedDistribution(d.interval, fn)
            : evo.RewardDistributionType.EpochBasedDistribution(Number(d.interval), fn);
      const recipient =
        d.recipient.type === 'identity'
          ? evo.TokenDistributionRecipient.Identity(d.recipient.identityId)
          : d.recipient.type === 'evonodes'
            ? evo.TokenDistributionRecipient.EvonodesByParticipation()
            : evo.TokenDistributionRecipient.ContractOwner();
      return Item.PerpetualDistributionConfigurationItem(new evo.TokenPerpetualDistribution(type, recipient));
    }
    case 'rule': {
      const name = RULE_ITEM_BUILDERS[change.rule][change.target] as keyof typeof Item;
      const build = Item[name] as unknown as (takers: unknown) => ReturnType<typeof Item.noChangeItem>;
      return build(takersObject(evo, change.takers));
    }
  }
}

/** The SDK write for these inputs, signed with the reviewed key. */
function tokenWrite(
  evo: Evo,
  sdk: EvoSDK,
  options: TokenOperationOptions,
  material: SdkSigningMaterial,
): () => Promise<unknown> {
  const { Identifier, GroupStateTransitionInfoStatus } = evo;
  const signerId = Identifier.fromBase58(material.identityId);
  const base = {
    dataContractId: Identifier.fromBase58(options.contractId),
    tokenPosition: options.tokenPosition,
    identityKey: material.identityKey,
    signer: material.identitySigner,
    publicNote: options.publicNote || undefined,
  };
  const groupInfo = !options.group
    ? undefined
    : options.group.mode === 'propose'
      ? GroupStateTransitionInfoStatus.proposer(options.group.groupPosition)
      : GroupStateTransitionInfoStatus.otherSigner(options.group.groupPosition, options.group.actionId);
  const tokens = sdk.tokens;
  switch (options.kind) {
    case 'mint':
      return () =>
        tokens.mint({
          ...base,
          amount: options.amount,
          identityId: signerId,
          // Otherwise Platform sends the tokens to the token's destination identity.
          recipientId: options.chooseRecipient ? Identifier.fromBase58(options.recipientId) : undefined,
          groupInfo,
        });
    case 'burn':
      return () => tokens.burn({ ...base, amount: options.amount, identityId: signerId, groupInfo });
    case 'transfer':
      return () =>
        tokens.transfer({
          ...base,
          amount: options.amount,
          senderId: signerId,
          recipientId: Identifier.fromBase58(options.recipientId),
        });
    case 'freeze':
    case 'unfreeze': {
      const target = {
        ...base,
        authorityId: signerId,
        frozenIdentityId: Identifier.fromBase58(options.targetIdentityId),
        groupInfo,
      };
      return options.kind === 'freeze' ? () => tokens.freeze(target) : () => tokens.unfreeze(target);
    }
    case 'destroyFrozen':
      return () =>
        tokens.destroyFrozen({
          ...base,
          authorityId: signerId,
          frozenIdentityId: Identifier.fromBase58(options.targetIdentityId),
          groupInfo,
        });
    case 'emergencyAction':
      return () => tokens.emergencyAction({ ...base, authorityId: signerId, action: options.action, groupInfo });
    case 'setPrice': {
      const schedule = options.schedule;
      const pricing =
        schedule.type === 'tiers'
          ? { priceTiers: Object.fromEntries(schedule.tiers.map((t) => [t.minAmount.toString(), t.price])) }
          : { price: schedule.type === 'single' ? schedule.price : null };
      return () => tokens.setPrice({ ...base, authorityId: signerId, ...pricing, groupInfo });
    }
    case 'directPurchase': {
      const { publicNote: _note, ...purchase } = base;
      return () =>
        tokens.directPurchase({
          ...purchase,
          buyerId: signerId,
          amount: options.amount,
          maxTotalCost: options.maxTotalCost,
        });
    }
    case 'claim':
      return () => tokens.claim({ ...base, identityId: signerId, distributionType: options.distributionType });
    case 'configUpdate': {
      const configurationChangeItem = buildConfigChangeItem(evo, options.change);
      return () =>
        tokens.configUpdate({ ...base, identityId: signerId, configurationChangeItem, groupInfo });
    }
  }
}

function readGroupOutcome(result: unknown): { power?: number; status?: string } {
  try {
    const record = result as { groupPower?: unknown; groupActionStatus?: unknown } | null;
    const power = record?.groupPower;
    const status = record?.groupActionStatus;
    return {
      power: typeof power === 'number' ? power : undefined,
      status: typeof status === 'string' ? status : undefined,
    };
  } catch {
    return {};
  }
}

function release(value: unknown): void {
  try {
    (value as { free?: () => void } | null)?.free?.();
  } catch {
    /* already freed */
  }
}

const VERBS: Record<TokenOperationKind, string> = {
  mint: 'Minted',
  burn: 'Burned',
  transfer: 'Transferred',
  freeze: 'Froze',
  unfreeze: 'Unfroze',
  destroyFrozen: 'Destroyed frozen funds',
  emergencyAction: 'Applied the emergency action',
  setPrice: 'Set the direct-purchase price',
  directPurchase: 'Bought',
  claim: 'Claimed',
  configUpdate: 'Updated the configuration',
};

/** Retry policy for the post-write balance read; tests shorten it. */
export const POST_WRITE_READ = { attempts: 8, delayMs: 1500 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Proved balances after a confirmed write. A node may answer from a block
 * before the write, so wait for a proof newer than the pre-signing snapshot
 * and, for writes that must move a balance, for the balance to move.
 */
async function balanceChanges(
  sdk: EvoSDK,
  options: TokenOperationOptions,
  affected: string[],
  before: Record<string, bigint>,
  snapshotHeight: bigint | undefined,
): Promise<Pick<TokenResult, 'balances' | 'balancesProvedAtHeight' | 'balancesError'>> {
  const expectChange = !options.group;
  let after: Awaited<ReturnType<typeof readProvedBalances>> | undefined;
  let lastError: unknown;
  let settled = false;
  for (let attempt = 0; attempt < POST_WRITE_READ.attempts && !settled; attempt += 1) {
    if (attempt > 0) await sleep(POST_WRITE_READ.delayMs);
    try {
      after = await readProvedBalances(sdk, options.tokenId, affected);
    } catch (error) {
      lastError = error;
      continue;
    }
    const newer = snapshotHeight === undefined || (after.height !== undefined && after.height > snapshotHeight);
    const moved = affected.some((id) => after!.balances[id] !== before[id]);
    settled = newer && (!expectChange || moved);
  }
  const amount = (value: bigint) => formatTokenAmount(value, options.decimals);
  if (!after)
    return {
      balancesError: `The write was confirmed, but re-reading balances failed: ${extractErrorMessage(lastError)}`,
      balances: affected.map((id) => ({
        identityId: id,
        before: before[id]!.toString(),
        display: `${amount(before[id]!)} ${options.tokenName} before`,
      })),
    };
  return {
    balancesProvedAtHeight: after.height?.toString(),
    balancesError: settled
      ? undefined
      : 'These balances may predate the write: no node had proved a later block yet. Check the token page.',
    balances: affected.map((id) => ({
      identityId: id,
      before: before[id]!.toString(),
      after: after!.balances[id]!.toString(),
      display: `${amount(before[id]!)} → ${amount(after!.balances[id]!)} ${options.tokenName}`,
    })),
  };
}

/** IDs of active or closed group actions matching the inputs that the signer has signed. */
async function signedMatchingActions(sdk: EvoSDK, options: TokenOperationOptions): Promise<Set<string>> {
  const group = options.group!;
  const actions = (
    await Promise.all(
      (['ACTIVE', 'CLOSED'] as const).map((status) =>
        loadGroupActions(sdk, options.contractId, group.groupPosition, status),
      ),
    )
  ).flat();
  return new Set(
    actions
      .filter((action) => action.signers[options.signerId] !== undefined && actionMatches(action, options, options.tokenPosition))
      .map((action) => action.actionId),
  );
}

/**
 * The action that now carries the signer's signature, if exactly one is new.
 * The node answering may not have the write's block yet, so retry briefly.
 */
async function confirmGroupSignature(
  sdk: EvoSDK,
  options: TokenOperationOptions,
  signedBefore: Set<string>,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < POST_WRITE_READ.attempts; attempt += 1) {
    if (attempt > 0) await sleep(POST_WRITE_READ.delayMs);
    const signed = await signedMatchingActions(sdk, options).catch(() => undefined);
    if (!signed) continue;
    const added = [...signed].filter((id) => !signedBefore.has(id));
    if (options.group?.mode === 'cosign') {
      if (added.includes(options.group.actionId)) return options.group.actionId;
    } else if (added.length === 1) {
      return added[0];
    } else if (added.length > 1) {
      return undefined;
    }
  }
  return undefined;
}

export async function executeTokenOperation(args: ExecuteArgs<TokenOperationOptions>): Promise<TokenResult> {
  const { sdk, options } = args;
  const operationId = tokenOperationId(options.kind);
  return withSigningMaterial(
    args,
    () => resolveSigningCriteria(operationId, sdk, options),
    async (material, submit) => {
      if (material.identityId !== options.signerId)
        throw new Error('These inputs were built for another identity. Build and review the operation again.');
      // Re-derive the token ID from the reviewed contract and position.
      const target = await resolveTokenTarget(sdk, {
        tokenId: options.tokenId,
        contractId: options.contractId,
        position: options.tokenPosition,
      });
      const cosign = options.group?.mode === 'cosign' ? options.group : undefined;
      const pending = cosign
        ? await loadPendingAction(sdk, options.contractId, cosign.groupPosition, cosign.actionId)
        : undefined;
      const expected = pending ? cosignParameters(pending) : null;
      const burnFromId = expected?.kind === 'burn' ? expected.burnFromId : undefined;
      const snapshot = await loadTokenSnapshot(sdk, {
        target,
        holderIds: holderIdsFor(options, burnFromId),
        creditsOf: options.kind === 'directPurchase' ? options.signerId : undefined,
        cosign,
      });
      const problems = tokenOperationProblems(options, snapshot);
      if (problems.length > 0) throw new Error(problems.join(' '));

      const affected = affectedIdentities(options, burnFromId);
      const before = Object.fromEntries(affected.map((id) => [id, snapshot.holders[id]?.balance ?? 0n]));
      const authority = authorityFor(options, snapshot.model);
      // Group actions the signer already signed, to recognise a new signature afterwards.
      const signedBefore = options.group ? await signedMatchingActions(sdk, options) : undefined;
      const evo = await import('@dashevo/evo-sdk');
      const write = tokenWrite(evo, sdk, options, material);
      const entities: ReceiptEntities = {
        identityId: material.identityId,
        contractId: options.contractId,
        tokenId: options.tokenId,
        ...('recipientId' in options ? { recipientId: options.recipientId } : {}),
        ...('targetIdentityId' in options ? { targetIdentityId: options.targetIdentityId } : {}),
      };
      let raw: unknown;
      let confirmedActionId: string | undefined;
      try {
        raw = await submit(write, entities, args.assertCurrent);
      } catch (error) {
        // evo-sdk 5.0.0-rc.8 fails to verify some confirmed group proposals
        // ("Expected document in group action result"). A proved read showing
        // the signer's new signature on the matching action confirms the write;
        // anything less leaves the outcome unknown.
        if (!(error instanceof BroadcastOutcomeUnknownError) || !signedBefore) throw error;
        confirmedActionId = await confirmGroupSignature(sdk, options, signedBefore).catch(() => undefined);
        if (!confirmedActionId) throw error;
      }
      const outcome = readGroupOutcome(raw);
      release(raw);

      const result: TokenResult = {
        kind: 'token',
        action: options.kind,
        tokenId: options.tokenId,
        contractId: options.contractId,
        tokenPosition: options.tokenPosition,
        recipientId: 'recipientId' in options ? options.recipientId : undefined,
        targetIdentityId: 'targetIdentityId' in options ? options.targetIdentityId : undefined,
        message: `${VERBS[options.kind]} (${snapshot.model.name}).`,
      };
      if (options.group && authority?.kind === 'group') {
        result.group = {
          mode: options.group.mode,
          groupPosition: options.group.groupPosition,
          actionId: options.group.mode === 'cosign' ? options.group.actionId : confirmedActionId,
          requiredPower: authority.group.requiredPower,
          ...outcome,
        };
        result.message =
          options.group.mode === 'propose'
            ? `Proposed to group #${options.group.groupPosition}. It takes effect once members with ${authority.group.requiredPower} power have signed.`
            : `Co-signed group action ${options.group.actionId}.`;
        if (confirmedActionId)
          result.message +=
            ' The SDK could not verify the result proof, so a proved read of the group confirmed your signature on ' +
            `action ${confirmedActionId}.`;
      }
      if (affected.length > 0) Object.assign(result, await balanceChanges(sdk, options, affected, before, snapshot.height));
      return result;
    },
  );
}
