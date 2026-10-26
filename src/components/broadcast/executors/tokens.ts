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
import { BroadcastOutcomeUnknownError, receiptEntities } from '../outcomes';
import type { SdkSigningMaterial } from '@/signer/types';
import { actionMatches, authorityFor, holderIdsFor, tokenOperationProblems } from '../tokens/checks';
import { cosignParameters, type PendingGroupAction } from '../tokens/group-actions';
import {
  ruleItemName,
  tokenOperationId,
  type ActionTakers,
  type TokenConfigChange,
  type TokenOperationKind,
  type TokenOperationOptions,
} from '../tokens/options';
import {
  loadGroupActions,
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
      // ManualMintingItem, MaxSupplyControlGroupItem, FreezeAdminGroupItem…
      const base = ruleItemName(change.rule, change.target);
      const name = `${base.charAt(0).toUpperCase()}${base.slice(1)}Item` as keyof typeof Item;
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
  // Everything is built here, before submission starts: a failure is "not submitted".
  const signerId = Identifier.fromBase58(material.identityId);
  const recipientId = 'recipientId' in options ? Identifier.fromBase58(options.recipientId) : undefined;
  const targetId = 'targetIdentityId' in options ? Identifier.fromBase58(options.targetIdentityId) : undefined;
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
          recipientId: options.chooseRecipient ? recipientId : undefined,
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
          recipientId: recipientId!,
        });
    case 'freeze':
    case 'unfreeze': {
      const target = {
        ...base,
        authorityId: signerId,
        frozenIdentityId: targetId!,
        groupInfo,
      };
      return options.kind === 'freeze' ? () => tokens.freeze(target) : () => tokens.unfreeze(target);
    }
    case 'destroyFrozen':
      return () =>
        tokens.destroyFrozen({
          ...base,
          authorityId: signerId,
          frozenIdentityId: targetId!,
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

/** Read what a write result reports about its group action, then free it. */
function consumeResult(result: unknown): { power?: number; status?: string } {
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
  } finally {
    try {
      (result as { free?: () => void } | null)?.free?.();
    } catch {
      /* already freed */
    }
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

/** Retry policy for the post-write reads; tests shorten it. */
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
  const balances = affected.map((id) => {
    const was = before[id]!;
    const now = after?.balances[id];
    return now === undefined
      ? { identityId: id, before: was.toString(), display: `${amount(was)} ${options.tokenName} before` }
      : { identityId: id, before: was.toString(), after: now.toString(), display: `${amount(was)} → ${amount(now)} ${options.tokenName}` };
  });
  if (!after)
    return { balances, balancesError: `The write was confirmed, but re-reading balances failed: ${extractErrorMessage(lastError)}` };
  return {
    balances,
    balancesProvedAtHeight: after.height?.toString(),
    balancesError: settled
      ? undefined
      : 'These balances may predate the write: no node had proved a later block yet. Check the token page.',
  };
}

/** Matching group actions the signer has signed, from proved reads of both statuses. */
interface SignedActions {
  /** Proposer of each matching action the signer has signed. */
  signed: Map<string, string | undefined>;
  /** Of those, still-pending actions the signer proposed. */
  ownPending: string[];
  /** Lowest height the two reads were proved at, if both reported one. */
  height?: bigint;
  /** Neither page was full, so no matching action can be missing. */
  complete: boolean;
}

async function signedMatchingActions(sdk: EvoSDK, options: TokenOperationOptions): Promise<SignedActions> {
  const group = options.group!;
  const keep = (action: PendingGroupAction) => actionMatches(action, options, options.tokenPosition);
  const [active, closed] = await Promise.all(
    (['ACTIVE', 'CLOSED'] as const).map((status) =>
      loadGroupActions(sdk, options.contractId, group.groupPosition, status, keep),
    ),
  );
  const mine = (actions: PendingGroupAction[]) => actions.filter((a) => a.signers[options.signerId] !== undefined);
  const heights = [active!.height, closed!.height];
  return {
    signed: new Map([...mine(active!.actions), ...mine(closed!.actions)].map((a) => [a.actionId, a.proposerId])),
    ownPending: mine(active!.actions).filter((a) => a.proposerId === options.signerId).map((a) => a.actionId),
    height: heights.every((h) => h !== undefined) ? (heights[0]! < heights[1]! ? heights[0] : heights[1]) : undefined,
    complete: active!.complete && closed!.complete,
  };
}

/**
 * The action that now carries the signer's signature: the reviewed action
 * when co-signing, or exactly one new action the signer proposed. Only reads
 * proved at a later block than `before`, on complete pages, count; a node may
 * not have the write's block yet, so retry briefly.
 */
async function confirmGroupSignature(
  sdk: EvoSDK,
  options: TokenOperationOptions,
  before: SignedActions,
): Promise<string | undefined> {
  if (!before.complete || before.height === undefined) return undefined;
  for (let attempt = 0; attempt < POST_WRITE_READ.attempts; attempt += 1) {
    if (attempt > 0) await sleep(POST_WRITE_READ.delayMs);
    const after = await signedMatchingActions(sdk, options).catch(() => undefined);
    if (!after?.complete || after.height === undefined || after.height <= before.height) continue;
    const added = [...after.signed].filter(([id]) => !before.signed.has(id));
    const group = options.group;
    if (group?.mode === 'cosign') return added.some(([id]) => id === group.actionId) ? group.actionId : undefined;
    const proposed = added.filter(([, proposer]) => proposer === options.signerId);
    return proposed.length === 1 ? proposed[0]![0] : undefined;
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
      const snapshot = await loadTokenSnapshot(sdk, {
        target,
        holderIds: holderIdsFor(options),
        creditsOf: options.kind === 'directPurchase' ? options.signerId : undefined,
        cosign: options.group?.mode === 'cosign' ? options.group : undefined,
      });
      const problems = tokenOperationProblems(options, snapshot);
      if (problems.length > 0) throw new Error(problems.join(' '));

      const cosigned = snapshot.pending ? cosignParameters(snapshot.pending) : null;
      const affected = affectedIdentities(options, cosigned?.kind === 'burn' ? cosigned.burnFromId : undefined);
      const before = Object.fromEntries(affected.map((id) => [id, snapshot.holders[id]?.balance ?? 0n]));
      const authority = authorityFor(options, snapshot.model);
      // Group actions the signer already signed, to recognise a new signature
      // afterwards and to refuse proposing the same action twice.
      const signedBefore = options.group ? await signedMatchingActions(sdk, options) : undefined;
      if (options.group?.mode === 'propose' && signedBefore?.ownPending.length)
        throw new Error(
          `You already proposed this exact action: group action ${signedBefore.ownPending[0]} is pending. ` +
            'Wait for the other members to co-sign it instead of proposing it again.',
        );
      const usableBefore =
        signedBefore && snapshot.height !== undefined && (signedBefore.height ?? -1n) >= snapshot.height
          ? signedBefore
          : undefined;
      const evo = await import('@dashevo/evo-sdk');
      const write = tokenWrite(evo, sdk, options, material);
      let raw: unknown;
      let confirmedActionId: string | undefined;
      try {
        raw = await submit(write, receiptEntities(options, material.identityId), args.assertCurrent);
      } catch (error) {
        // evo-sdk 5.0.0-rc.8 fails to verify some confirmed group proposals
        // ("Expected document in group action result"). A proved read showing
        // the signer's new signature on the matching action confirms the write;
        // anything less leaves the outcome unknown.
        if (!(error instanceof BroadcastOutcomeUnknownError) || !usableBefore) throw error;
        confirmedActionId = await confirmGroupSignature(sdk, options, usableBefore).catch(() => undefined);
        if (!confirmedActionId) throw error;
      }
      const outcome = consumeResult(raw);

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
        const required = authority.group.requiredPower;
        result.group = {
          mode: options.group.mode,
          groupPosition: options.group.groupPosition,
          actionId: options.group.mode === 'cosign' ? options.group.actionId : confirmedActionId,
          requiredPower: required,
          ...outcome,
        };
        const completes =
          options.group.mode === 'propose'
            ? authority.signerPower >= required
            : (snapshot.pending?.signedPower ?? 0) + authority.signerPower >= required;
        result.message =
          (options.group.mode === 'propose'
            ? `Proposed to group #${options.group.groupPosition}.`
            : `Co-signed group action ${options.group.actionId}.`) +
          (completes
            ? ' The signatures reached the required power, so the action executed.'
            : ` It takes effect once members with ${required} power have signed.`);
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
