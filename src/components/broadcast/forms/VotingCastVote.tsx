'use client';

import { useEffect, useState } from 'react';
import { Box, Input, Select, Text, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export type VoteChoice = 'abstain' | 'lock' | 'towardsIdentity';

export interface VotingCastVoteOptions {
  contractId: string;
  contestedResource: string;
  choice: VoteChoice;
  targetIdentityId?: string;
}

export function VotingCastVoteForm({
  onOptionsChange,
}: OperationFormProps<VotingCastVoteOptions>) {
  const [contractId, setContractId] = useState('');
  const [contestedResource, setContestedResource] = useState('');
  const [choice, setChoice] = useState<VoteChoice>('abstain');
  const [targetIdentityId, setTargetIdentityId] = useState('');

  useEffect(() => {
    if (
      !isBase58Identifier(contractId.trim()) ||
      !contestedResource.trim() ||
      (choice === 'towardsIdentity' &&
        !isBase58Identifier(targetIdentityId.trim()))
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      contractId: contractId.trim(),
      contestedResource: contestedResource.trim(),
      choice,
      targetIdentityId:
        choice === 'towardsIdentity' ? targetIdentityId.trim() : undefined,
    });
  }, [contractId, contestedResource, choice, targetIdentityId, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contract ID
        </Text>
        <Input
          size="sm"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          placeholder="Contract that defines the contested resource"
        />
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Contested resource
        </Text>
        <Input
          size="sm"
          value={contestedResource}
          onChange={(e) => setContestedResource(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          placeholder='e.g. "domain/alice" for a contested DPNS name'
        />
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Choice
        </Text>
        <Select
          size="sm"
          value={choice}
          onChange={(e) => setChoice(e.target.value as VoteChoice)}
          bg="gray.800"
          borderColor="gray.700"
        >
          <option value="abstain">Abstain</option>
          <option value="lock">Lock (no one gets it)</option>
          <option value="towardsIdentity">Towards a specific identity</option>
        </Select>
      </Box>
      {choice === 'towardsIdentity' ? (
        <Box>
          <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
            Target identity
          </Text>
          <Input
            size="sm"
            value={targetIdentityId}
            onChange={(e) => setTargetIdentityId(e.target.value)}
            fontFamily="mono"
            bg="gray.800"
            borderColor="gray.700"
            placeholder="Base58 identity ID"
          />
        </Box>
      ) : null}
      <Text fontSize="xs" color="warning">
        Casting a vote requires a masternode voting key. Most identities created
        via the bridge do not have one.
      </Text>
    </VStack>
  );
}
