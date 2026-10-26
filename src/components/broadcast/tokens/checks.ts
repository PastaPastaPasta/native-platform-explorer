// Why a token write cannot go ahead. Forms show these before review; executors
// re-run them on a fresh snapshot immediately before signing and refuse to
// submit if any remain. The checks mirror the Drive validation that would
// otherwise reject the transition as a paid failure (v5.0.0-rc.8).

import { formatTokenAmount } from '@util/token-rules';
import { shortId } from '@util/identifier';
import { toRecord } from '@util/contract';
import { configChangeAuthority, configChangeProblems } from './config-change';
import { cosignParameters, pendingActionKind, type PendingGroupAction } from './group-actions';
import { operationAuthority, type Authority, type TokenModel } from './model';
import { MAX_TOKEN_AMOUNT, describeTokenAmount, publicNoteError } from './amount';
import { GROUP_OPERATIONS, type TokenOperationKind, type TokenOperationOptions } from './options';
import type { TokenSnapshot } from './state';

/** Identities whose balance and frozen state the operation depends on. */
export function holderIdsFor(options: TokenOperationOptions, burnFromId?: string): string[] {
  const ids = [options.signerId];
  if ('recipientId' in options) ids.push(options.recipientId);
  if ('targetIdentityId' in options) ids.push(options.targetIdentityId);
  if (burnFromId) ids.push(burnFromId);
  return [...new Set(ids)];
}

/** Pre-programmed releases for `identityId` that are due at `nowMs`. */
export function duePreProgrammed(model: TokenModel, identityId: string, nowMs: number): { due: bigint; next?: number } {
  let due = 0n;
  let next: number | undefined;
  for (const [time, recipients] of Object.entries(toRecord(model.preProgrammedDistribution?.distributions) ?? {})) {
    const amount = toRecord(recipients)?.[identityId];
    if (amount === undefined) continue;
    const at = Number(time);
    if (at <= nowMs) due += BigInt(String(amount));
    else if (next === undefined || at < next) next = at;
  }
  return { due, next };
}

/** Why the signer can or cannot claim from each distribution. */
export function claimProblem(
  distribution: 'perpetual' | 'preProgrammed' | 'oncePerIdentity',
  model: TokenModel,
  signerId: string,
  nowMs: number,
): string | null {
  if (distribution === 'perpetual') {
    const recipient = toRecord(model.perpetualDistribution?.distributionRecipient);
    if (!model.perpetualDistribution) return 'This token has no perpetual distribution.';
    const type = String(recipient?.$type ?? Object.keys(recipient ?? {})[0] ?? '');
    if (/^contractOwner$/i.test(type) && signerId !== model.contractOwnerId)
      return `The perpetual distribution pays the contract owner (${shortId(model.contractOwnerId)}), not you.`;
    if (/^identity$/i.test(type)) {
      const expected = String(recipient?.identity ?? recipient?.Identity ?? '');
      if (expected && expected !== signerId)
        return `The perpetual distribution pays identity ${shortId(expected)}, not you.`;
    }
    return null;
  }
  if (distribution === 'preProgrammed') {
    if (!model.preProgrammedDistribution) return 'This token has no pre-programmed distribution.';
    const { due, next } = duePreProgrammed(model, signerId, nowMs);
    if (due > 0n) return null;
    return next !== undefined
      ? `Your next pre-programmed release is at ${new Date(next).toISOString()}.`
      : 'The pre-programmed distribution has no release for you.';
  }
  return model.oncePerIdentityDistribution ? null : 'This token has no once-per-identity distribution.';
}

/** The authority that governs these inputs, for operations governed by a rule. */
export function authorityFor(options: TokenOperationOptions, model: TokenModel): Authority | null {
  return options.kind === 'configUpdate'
    ? configChangeAuthority(options.change, model, options.signerId)
    : operationAuthority(options.kind, model, options.signerId);
}

function groupProblems(options: TokenOperationOptions, snapshot: TokenSnapshot): string[] {
  const authority = authorityFor(options, snapshot.model);
  if (!authority) return options.group ? ['This operation cannot be a group action.'] : [];
  if (authority.kind === 'denied') return [authority.reason];
  const group = options.group;
  if (!group) {
    if (authority.kind === 'group' && !authority.canActAlone)
      return [
        `Group #${authority.group.position} must approve this: propose it as a group action or co-sign a ` +
          `pending one (your power ${authority.signerPower} of ${authority.group.requiredPower} required).`,
      ];
    return [];
  }
  if (authority.kind !== 'group' || authority.group.position !== group.groupPosition)
    return [`This change is not governed by group #${group.groupPosition}.`];
  if (group.mode === 'propose') return [];
  const problems: string[] = [];
  const pending = snapshot.pending;
  if (!pending || pending.actionId !== group.actionId)
    return [`Group action ${shortId(group.actionId)} is no longer pending.`];
  if (pending.tokenPosition !== undefined && pending.tokenPosition !== snapshot.model.position)
    problems.push('That group action is for another token of the contract.');
  if (pendingActionKind(pending) !== options.kind) problems.push('That group action is a different operation.');
  if (pending.signers[options.signerId] !== undefined) problems.push('You have already signed this group action.');
  if (pending.signedPower >= authority.group.requiredPower) problems.push('That group action is already complete.');
  if (options.publicNote) problems.push('Only the proposer may attach a public note.');
  const expected = cosignParameters(pending);
  if (!expected) problems.push('This explorer cannot rebuild the parameters of that group action.');
  else if (!sameParameters(expected, options))
    problems.push('The inputs differ from the pending group action; co-signers must repeat it exactly.');
  return problems;
}

/** Whether a group action is the one these inputs propose or co-sign. */
export function actionMatches(action: PendingGroupAction, options: TokenOperationOptions, position: number): boolean {
  const parameters = cosignParameters(action);
  return (
    (action.tokenPosition === undefined || action.tokenPosition === position) &&
    pendingActionKind(action) === options.kind &&
    !!parameters &&
    sameParameters(parameters, options)
  );
}

function sameParameters(expected: NonNullable<ReturnType<typeof cosignParameters>>, options: TokenOperationOptions): boolean {
  const { kind: _kind, ...fields } = expected;
  const record = options as unknown as Record<string, unknown>;
  return Object.entries(fields).every(([key, value]) =>
    key === 'burnFromId' ? true : stable(record[key]) === stable(value),
  );
}

/** Key-order independent JSON with tagged bigints. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'bigint') return `${v}n`;
    if (v && typeof v === 'object' && !Array.isArray(v))
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
    return v;
  });
}

function amountProblem(amount: bigint): string | null {
  return amount <= 0n || amount > MAX_TOKEN_AMOUNT
    ? `Token amounts must be between 1 and ${MAX_TOKEN_AMOUNT} base units.`
    : null;
}

function supplyProblem(snapshot: TokenSnapshot, amount: bigint, verb: string): string | null {
  const { maxSupply, decimals, name } = snapshot.model;
  if (maxSupply === undefined || snapshot.totalSupply + amount <= maxSupply) return null;
  return (
    `${verb} ${describeTokenAmount(amount, decimals, name)} would exceed the max supply of ` +
    `${formatTokenAmount(maxSupply, decimals)} (current supply ${formatTokenAmount(snapshot.totalSupply, decimals)}).`
  );
}

function holder(snapshot: TokenSnapshot, id: string) {
  return snapshot.holders[id] ?? { exists: false, balance: 0n, frozen: false };
}

export function tokenOperationProblems(options: TokenOperationOptions, snapshot: TokenSnapshot): string[] {
  const { model } = snapshot;
  const problems: string[] = [];
  const push = (problem: string | null | undefined) => {
    if (problem) problems.push(problem);
  };
  if (
    options.tokenId !== model.tokenId ||
    options.contractId !== model.contractId ||
    options.tokenPosition !== model.position
  )
    return ['The inputs name a different token than the one loaded.'];
  if (options.decimals !== model.decimals || options.tokenName !== model.name)
    return [
      `The token's conventions changed (now ${model.decimals} decimals, "${model.name}"). Build and review the operation again.`,
    ];
  push(publicNoteError(options.publicNote));
  if (options.group && !GROUP_OPERATIONS.has(options.kind)) problems.push('This operation cannot be a group action.');
  problems.push(...groupProblems(options, snapshot));
  const signer = holder(snapshot, options.signerId);
  const cosigning = options.group?.mode === 'cosign';

  switch (options.kind) {
    case 'mint': {
      push(amountProblem(options.amount));
      const destination = model.newTokensDestinationIdentity;
      if (!model.mintingAllowChoosingDestination) {
        if (options.chooseRecipient)
          problems.push('This token does not let minters choose the recipient.');
        if (!destination)
          problems.push('No one can mint: the token has no destination identity and minters may not choose one.');
        else if (options.recipientId !== destination)
          problems.push(`Minted tokens go to the token's destination identity ${shortId(destination)}.`);
      } else if (!options.chooseRecipient && options.recipientId !== destination) {
        problems.push('Choose who receives the minted tokens.');
      }
      const recipient = holder(snapshot, options.recipientId);
      if (!recipient.exists) problems.push(`Recipient ${shortId(options.recipientId)} does not exist.`);
      if (recipient.frozen) problems.push(`Recipient ${shortId(options.recipientId)} has a frozen balance.`);
      push(supplyProblem(snapshot, options.amount, 'Minting'));
      break;
    }
    case 'burn': {
      push(amountProblem(options.amount));
      const burnFrom = cosigning && snapshot.pending ? cosignParameters(snapshot.pending) : null;
      const fromId = burnFrom?.kind === 'burn' && burnFrom.burnFromId ? burnFrom.burnFromId : options.signerId;
      const from = holder(snapshot, fromId);
      if (from.balance < options.amount)
        problems.push(
          `${fromId === options.signerId ? 'You hold' : `${shortId(fromId)} holds`} only ` +
            `${describeTokenAmount(from.balance, model.decimals, model.name)}.`,
        );
      break;
    }
    case 'transfer': {
      push(amountProblem(options.amount));
      if (options.recipientId === options.signerId) problems.push('You cannot transfer tokens to yourself.');
      if (snapshot.paused) problems.push('The token is paused: transfers are stopped until it is resumed.');
      if (signer.frozen) problems.push('Your balance of this token is frozen.');
      if (signer.balance < options.amount)
        problems.push(`You hold only ${describeTokenAmount(signer.balance, model.decimals, model.name)}.`);
      const recipient = holder(snapshot, options.recipientId);
      if (!recipient.exists) problems.push(`Recipient ${shortId(options.recipientId)} does not exist.`);
      if (recipient.frozen && !model.allowTransferToFrozenBalance)
        problems.push(`Recipient ${shortId(options.recipientId)} has a frozen balance, which this token does not let receive transfers.`);
      break;
    }
    case 'freeze': {
      const target = holder(snapshot, options.targetIdentityId);
      if (!target.exists) problems.push(`Identity ${shortId(options.targetIdentityId)} does not exist.`);
      if (target.frozen) problems.push(`The balance of ${shortId(options.targetIdentityId)} is already frozen.`);
      break;
    }
    case 'unfreeze': {
      if (!holder(snapshot, options.targetIdentityId).frozen)
        problems.push(`The balance of ${shortId(options.targetIdentityId)} is not frozen.`);
      break;
    }
    case 'destroyFrozen': {
      const target = holder(snapshot, options.targetIdentityId);
      if (!target.frozen) problems.push(`The balance of ${shortId(options.targetIdentityId)} is not frozen.`);
      else if (target.balance === 0n) problems.push(`${shortId(options.targetIdentityId)} has no frozen balance to destroy.`);
      if (target.balance !== options.frozenBalance)
        problems.push(
          `The frozen balance is now ${describeTokenAmount(target.balance, model.decimals, model.name)}, not the reviewed amount.`,
        );
      break;
    }
    case 'emergencyAction': {
      if (options.action === 'pause' && snapshot.paused) problems.push('The token is already paused.');
      if (options.action === 'resume' && !snapshot.paused) problems.push('The token is not paused.');
      break;
    }
    case 'setPrice': {
      const schedule = options.schedule;
      if (schedule.type === 'single' && schedule.price <= 0n)
        problems.push('The price must be greater than zero; remove the price to stop direct sales.');
      if (schedule.type === 'tiers') {
        if (schedule.tiers.length === 0) problems.push('Add at least one price tier.');
        const amounts = new Set(schedule.tiers.map((t) => t.minAmount));
        if (amounts.size !== schedule.tiers.length) problems.push('Each tier needs a different minimum amount.');
        if (schedule.tiers.some((t) => t.minAmount <= 0n || t.minAmount > MAX_TOKEN_AMOUNT))
          problems.push(`Tier minimum amounts must be between 1 and ${MAX_TOKEN_AMOUNT} base units.`);
        if (schedule.tiers.some((t) => t.price <= 0n)) problems.push('Tier prices must be greater than zero.');
      }
      break;
    }
    case 'directPurchase': {
      push(amountProblem(options.amount));
      const price = snapshot.price;
      if (!price) {
        problems.push('This token is not for sale: no direct-purchase price is set.');
        break;
      }
      if (price.first !== options.reviewedPrice.first || price.last !== options.reviewedPrice.last)
        problems.push('The direct-purchase price changed. Build and review the purchase again.');
      if (price.first === price.last) {
        const total = price.first * options.amount;
        if (options.maxTotalCost !== total)
          problems.push(`At the current price the total is ${total} credits; the agreed total must match it.`);
      } else {
        const lowest = (price.first < price.last ? price.first : price.last) * options.amount;
        if (options.maxTotalCost < lowest)
          problems.push(`No tier sells ${describeTokenAmount(options.amount, model.decimals, model.name)} for less than ${lowest} credits.`);
      }
      if (snapshot.credits !== undefined && snapshot.credits < options.maxTotalCost)
        problems.push(`Your identity has ${snapshot.credits} credits, less than the ${options.maxTotalCost} agreed.`);
      push(supplyProblem(snapshot, options.amount, 'Buying'));
      break;
    }
    case 'claim':
      push(claimProblem(options.distributionType, model, options.signerId, snapshot.nowMs));
      break;
    case 'configUpdate':
      problems.push(...configChangeProblems(options.change, model, snapshot.totalSupply));
      break;
  }
  return [...new Set(problems)];
}

/** Operations the signer could plausibly perform, for entry-point links. */
export function plausibleOperations(
  model: TokenModel,
  signerId: string,
  context: { balance?: bigint; forSale: boolean; nowMs: number },
): TokenOperationKind[] {
  const kinds: TokenOperationKind[] = [];
  for (const kind of ['mint', 'burn', 'freeze', 'unfreeze', 'destroyFrozen', 'emergencyAction', 'setPrice'] as const) {
    const authority = operationAuthority(kind, model, signerId);
    if (!authority || authority.kind === 'denied') continue;
    // Burning takes your own balance, unless you co-sign a group burn.
    if (kind === 'burn' && authority.kind === 'direct' && (context.balance ?? 0n) === 0n) continue;
    kinds.push(kind);
  }
  if ((context.balance ?? 0n) > 0n) kinds.push('transfer');
  if (context.forSale) kinds.push('directPurchase');
  if ((['perpetual', 'preProgrammed', 'oncePerIdentity'] as const).some((d) => !claimProblem(d, model, signerId, context.nowMs)))
    kinds.push('claim');
  if (canUpdateConfig(model, signerId)) kinds.push('configUpdate');
  return kinds;
}

/** Whether the signer governs any configuration item. */
export function canUpdateConfig(model: TokenModel, signerId: string): boolean {
  const changes = [
    { item: 'maxSupply', value: null },
    { item: 'conventions', decimals: model.decimals, localizations: {} },
    { item: 'perpetualDistribution', value: null },
    { item: 'newTokensDestinationIdentity', value: null },
    { item: 'mintingAllowChoosingDestination', value: true },
    { item: 'marketplaceTradeMode', value: 'NotTradeable' },
    { item: 'mainControlGroup', value: null },
    ...(['conventions', 'maxSupply', 'manualMinting', 'manualBurning', 'freeze', 'unfreeze', 'destroyFrozenFunds', 'emergencyAction', 'perpetualDistribution', 'newTokensDestinationIdentity', 'mintingAllowChoosingDestination', 'marketplaceTradeMode'] as const).map(
      (rule) => ({ item: 'rule', rule, target: 'authorized', takers: { type: 'contractOwner' } }) as const,
    ),
  ] as const;
  return changes.some((change) => configChangeAuthority(change, model, signerId).kind !== 'denied');
}

const DISTRIBUTION_KINDS = ['perpetual', 'preProgrammed', 'oncePerIdentity'] as const;

/** Why the signer cannot perform this kind of operation on the token at all, before any input. */
export function tokenOperationUnavailable(
  kind: TokenOperationKind,
  snapshot: TokenSnapshot,
  signerId: string,
): string | null {
  const { model } = snapshot;
  const authority = operationAuthority(kind, model, signerId);
  if (authority?.kind === 'denied') return authority.reason;
  const balance = snapshot.holders[signerId]?.balance ?? 0n;
  switch (kind) {
    case 'transfer':
      return balance === 0n ? `You hold no ${model.name}.` : null;
    case 'burn':
      return authority?.kind === 'direct' && balance === 0n ? `You hold no ${model.name} to burn.` : null;
    case 'directPurchase':
      return snapshot.price ? null : 'This token is not for sale: no direct-purchase price is set.';
    case 'claim':
      return DISTRIBUTION_KINDS.every((d) => claimProblem(d, model, signerId, snapshot.nowMs))
        ? (claimProblem('perpetual', model, signerId, snapshot.nowMs) ?? 'Nothing to claim.')
        : null;
    case 'configUpdate':
      return canUpdateConfig(model, signerId) ? null : "You do not govern any part of this token's configuration.";
    default:
      return null;
  }
}
