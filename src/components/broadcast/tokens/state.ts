// Proof-verified reads a token write depends on. Forms load them to explain
// what is possible before review; executors load them again immediately before
// signing and refuse to submit when they no longer support the reviewed inputs.

import type { EvoSDK } from '@dashevo/evo-sdk';
import { toPlain, toRecord } from '@util/contract';
import { idToString, readProp } from '@util/sdk-shape';
import { isBase58Identifier } from '@util/identifier';
import { tokenModelFromContract, type TokenModel } from './model';
import { pendingActionFromJson, type PendingGroupAction } from './group-actions';

export interface TokenTarget {
  tokenId: string;
  contractId: string;
  position: number;
}

/** A token named by its ID, or by its contract and position (or both, which must agree). */
export interface TokenTargetInput {
  tokenId?: string;
  contractId?: string;
  position?: number;
}

export async function resolveTokenTarget(sdk: EvoSDK, input: TokenTargetInput): Promise<TokenTarget> {
  const tokenId = input.tokenId?.trim() || undefined;
  const contractId = input.contractId?.trim() || undefined;
  if (tokenId && !isBase58Identifier(tokenId)) throw new Error('The token ID is not a valid identifier.');
  if (contractId && !isBase58Identifier(contractId))
    throw new Error('The contract ID is not a valid identifier.');
  if (contractId && input.position !== undefined) {
    if (!Number.isInteger(input.position) || input.position < 0 || input.position > 65535)
      throw new Error('The token position must be a whole number from 0 to 65535.');
    const calculated = await sdk.tokens.calculateId(contractId, input.position);
    if (tokenId && tokenId !== calculated)
      throw new Error(
        `Token ${tokenId} is not position ${input.position} of contract ${contractId} (that is ${calculated}).`,
      );
    return { tokenId: calculated, contractId, position: input.position };
  }
  if (!tokenId) throw new Error('Enter a token ID, or a contract ID and token position.');
  const info = await sdk.tokens.contractInfo(tokenId);
  const owner = idToString(readProp<unknown>(info, 'contractId'));
  const position = readProp<number>(info, 'tokenContractPosition');
  if (!info || !owner || typeof position !== 'number')
    throw new Error(`No token ${tokenId} on this network.`);
  return { tokenId, contractId: owner, position };
}

export interface HolderState {
  /** The identity exists on Platform. */
  exists: boolean;
  balance: bigint;
  frozen: boolean;
}

export interface TokenSnapshot {
  model: TokenModel;
  paused: boolean;
  totalSupply: bigint;
  /** Credits per base unit of the first and last tier, when the token is for sale. */
  price?: { first: bigint; last: bigint };
  holders: Record<string, HolderState>;
  /** The signer's credit balance, when requested. */
  credits?: bigint;
  /** The co-signed action and its signers' power, when requested. */
  pending?: PendingGroupAction | null;
  /** Block time of a proved read, or the client clock: for distribution schedules. */
  nowMs: number;
  /** Block height the supply was proved at. */
  height?: bigint;
}

export interface SnapshotRequest {
  target: TokenTarget;
  holderIds: string[];
  creditsOf?: string;
  cosign?: { groupPosition: number; actionId: string };
}

const big = (value: unknown): bigint | undefined => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
};

async function loadHolders(sdk: EvoSDK, tokenId: string, ids: string[]): Promise<Record<string, HolderState>> {
  const unique = [...new Set(ids.filter(isBase58Identifier))];
  if (unique.length === 0) return {};
  const [identities, balances, infos] = await Promise.all([
    sdk.identities.balances(unique),
    sdk.tokens.balances(unique, tokenId),
    sdk.tokens.identitiesTokenInfos(unique, tokenId),
  ]);
  const holders: Record<string, HolderState> = {};
  for (const id of unique) {
    holders[id] = {
      exists: identities.get(id) !== undefined,
      balance: balances.get(id) ?? 0n,
      frozen: readProp<boolean>(infos.get(id), 'isFrozen') === true,
    };
  }
  return holders;
}

export async function loadPendingAction(
  sdk: EvoSDK,
  contractId: string,
  groupPosition: number,
  actionId: string,
): Promise<PendingGroupAction | null> {
  const actions = await sdk.group.actions({
    dataContractId: contractId,
    groupContractPosition: groupPosition,
    status: 'ACTIVE',
  });
  const action = [...actions.entries()].find(([id]) => String(id) === actionId)?.[1];
  if (!action) return null;
  const signers = await sdk.group.actionSigners({
    dataContractId: contractId,
    groupContractPosition: groupPosition,
    status: 'ACTIVE',
    actionId,
  });
  return pendingActionFromJson(actionId, groupPosition, toPlain(action), signers);
}

export async function loadTokenSnapshot(sdk: EvoSDK, request: SnapshotRequest): Promise<TokenSnapshot> {
  const { target } = request;
  const [contract, statuses, supply, prices, holders, credits, pending] = await Promise.all([
    sdk.contracts.fetch(target.contractId),
    sdk.tokens.statuses([target.tokenId]),
    sdk.tokens.totalSupplyWithProof(target.tokenId),
    sdk.tokens.directPurchasePrices([target.tokenId]),
    loadHolders(sdk, target.tokenId, request.holderIds),
    request.creditsOf ? sdk.identities.balance(request.creditsOf) : Promise.resolve(undefined),
    request.cosign
      ? loadPendingAction(sdk, target.contractId, request.cosign.groupPosition, request.cosign.actionId)
      : Promise.resolve(undefined),
  ]);
  if (!contract) throw new Error(`Contract ${target.contractId} not found.`);
  const model = tokenModelFromContract(contract, target);
  const priceInfo = prices.get(target.tokenId);
  const first = big(readProp<unknown>(priceInfo, 'basePrice'));
  const last = big(readProp<unknown>(priceInfo, 'currentPrice'));
  const supplyData = readProp<unknown>(supply, 'data');
  const totalSupply = big(readProp<unknown>(supplyData, 'totalSupply'));
  if (totalSupply === undefined) throw new Error(`Token ${target.tokenId} has no total supply record.`);
  const metadata = toRecord(readProp<unknown>(supply, 'metadata'));
  const blockTime = Number(metadata?.timeMs);
  const height = big(metadata?.height);
  return {
    model,
    // A token with no status record is active.
    paused: readProp<boolean>(statuses.get(target.tokenId), 'isPaused') === true,
    totalSupply,
    price: first !== undefined || last !== undefined ? { first: first ?? last!, last: last ?? first! } : undefined,
    holders,
    credits,
    pending,
    nowMs: Number.isFinite(blockTime) && blockTime > 0 ? blockTime : Date.now(),
    height,
  };
}

/** A group's actions in one status, with each action's signers. */
export async function loadGroupActions(
  sdk: EvoSDK,
  contractId: string,
  groupPosition: number,
  status: 'ACTIVE' | 'CLOSED',
): Promise<PendingGroupAction[]> {
  const query = { dataContractId: contractId, groupContractPosition: groupPosition, status } as const;
  const actions = await sdk.group.actions(query);
  return Promise.all(
    [...actions.entries()].map(async ([id, action]) => {
      const actionId = String(id);
      const signers = await sdk.group.actionSigners({ ...query, actionId });
      return pendingActionFromJson(actionId, groupPosition, toPlain(action), signers);
    }),
  );
}

/** Proved balances after a transition, with the height they were proved at. */
export async function readProvedBalances(
  sdk: EvoSDK,
  tokenId: string,
  ids: string[],
): Promise<{ balances: Record<string, bigint>; height?: bigint }> {
  const response = await sdk.tokens.balancesWithProof(ids, tokenId);
  const data = readProp<unknown>(response, 'data');
  const metadata = toRecord(readProp<unknown>(response, 'metadata'));
  const balances: Record<string, bigint> = {};
  for (const id of ids) balances[id] = (data instanceof Map ? (data.get(id) as bigint | undefined) : undefined) ?? 0n;
  return { balances, height: big(metadata?.height) };
}
