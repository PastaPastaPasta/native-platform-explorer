// Masternode votes on contested resources (sdk.voting.masternodeVote). The
// voter is the masternode's voting identity, whose ID Platform derives from
// the ProTxHash and the voting key's hash. The vote is signed with the key
// Platform holds for that identity, never a key built from form input alone.

import type { EvoSDK, IdentityPublicKey, PrivateKey } from '@dashevo/evo-sdk';
import { freeAll, withPrivateKey } from '@/signer/form-keys';
import { hexToBytes } from '@util/hex';
import { isBase58Identifier } from '@util/identifier';
import { proTxHashToHex } from '@util/protx';
import type { ExecuteArgs } from '../executors';
import type { MasternodeVoteOptions } from '../forms/voting/MasternodeVote';
import { executeFormSigned } from './form-signed';

export interface VoteResult {
  kind: 'vote';
  message: string;
  /** The masternode's voter identity. */
  identityId: string;
  /** The vote as Platform recorded it. */
  vote: unknown;
}

/** Identifier::create_voter_identifier: SHA-256(proTxHash ‖ voting key hash). */
export async function voterIdentityId(
  proTxHash: Uint8Array,
  votingKeyHash: Uint8Array,
): Promise<string> {
  const { Identifier } = await import('@dashevo/evo-sdk');
  const data = new Uint8Array(proTxHash.length + votingKeyHash.length);
  data.set(proTxHash);
  data.set(votingKeyHash, proTxHash.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const id = Identifier.fromBytes(digest);
  try {
    return id.toBase58();
  } finally {
    freeAll(id);
  }
}

/** The ProTxHash bytes as the SDK reads them (hex as Core shows it, or base58). */
function proTxHashBytes(value: string): Uint8Array {
  const hex = proTxHashToHex(value);
  if (!hex) throw new Error('Enter the masternode ProTxHash as 64 hex characters or base58.');
  return hexToBytes(hex);
}

/** The enabled VOTING key of the voter identity that `key` controls. */
async function voterKey(
  sdk: EvoSDK,
  proTxHash: string,
  key: PrivateKey,
  network: string,
): Promise<{ voterId: string; votingKey: IdentityPublicKey }> {
  const keyHash = key.getPublicKeyHash();
  const voterId = await voterIdentityId(proTxHashBytes(proTxHash), hexToBytes(keyHash));
  const voter = await sdk.identities.fetch(voterId);
  if (!voter)
    throw new Error(
      `No masternode voter identity on ${network} for this ProTxHash and voting key. ` +
        'Check both, and the network.',
    );
  const keys = voter.publicKeys;
  try {
    const votingKey = keys.find(
      (k) =>
        k.purpose === 'VOTING' && k.disabledAt === undefined && k.getPublicKeyHash() === keyHash,
    );
    if (!votingKey)
      throw new Error(`Voter identity ${voterId} has no enabled voting key matching this key.`);
    keys.splice(keys.indexOf(votingKey), 1);
    return { voterId, votingKey };
  } finally {
    freeAll(...keys, voter);
  }
}

export async function executeMasternodeVote({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<MasternodeVoteOptions>): Promise<VoteResult> {
  return executeFormSigned(sdk, async (submit, onRelease) => {
    const { IdentitySigner, ResourceVoteChoice, VotePoll } = await import('@dashevo/evo-sdk');
    if (
      options.choice === 'towardsIdentity' &&
      !isBase58Identifier(options.towardsIdentityId ?? '')
    )
      throw new Error('Choose the contender to vote for.');
    const votePoll = new VotePoll({
      contractId: options.contractId,
      documentTypeName: options.documentTypeName,
      indexName: options.indexName,
      indexValues: options.indexValues,
    });
    const voteChoice =
      options.choice === 'towardsIdentity'
        ? ResourceVoteChoice.TowardsIdentity(options.towardsIdentityId!)
        : options.choice === 'abstain'
          ? ResourceVoteChoice.Abstain()
          : ResourceVoteChoice.Lock();
    onRelease(() => freeAll(votePoll, voteChoice));
    return withPrivateKey(options.votingKeyWif, options.network, 'voting key', async (key) => {
      const { voterId, votingKey } = await voterKey(sdk, options.proTxHash, key, options.network);
      const signer = new IdentitySigner();
      onRelease(() => freeAll(votingKey, signer));
      signer.addKey(key);
      const vote = await submit(
        () =>
          sdk.voting.masternodeVote({
            masternodeProTxHash: options.proTxHash.trim(),
            votePoll,
            voteChoice,
            votingKey,
            signer,
          }),
        { identityId: voterId, contractId: options.contractId },
        assertCurrent,
      );
      try {
        return {
          kind: 'vote' as const,
          message: `Voted ${options.choice === 'towardsIdentity' ? `for ${options.towardsIdentityId}` : options.choice} as voter ${voterId}.`,
          identityId: voterId,
          vote: vote.toJSON(),
        };
      } finally {
        freeAll(vote);
      }
    });
  });
}
