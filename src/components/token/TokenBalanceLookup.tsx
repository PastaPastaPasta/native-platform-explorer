'use client';

import { useState } from 'react';
import { parseAsString, useQueryState } from 'nuqs';
import { Badge, Button, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { IdentityLink } from '@components/data/IdentityLink';
import { DateBlock } from '@components/data/DateBlock';
import {
  usePerpetualDistributionLastClaim,
  useTokenIdentityBalances,
  useTokenIdentityTokenInfos,
} from '@sdk/queries';
import { useSigner } from '@/signer/SignerProvider';
import { isBase58Identifier } from '@util/identifier';
import { readProp } from '@util/sdk-shape';
import { formatTokenAmount } from '@util/token-rules';

/** rc.2 `RewardDistributionMoment`: one of block height, time or epoch. */
export function describeClaimMoment(moment: unknown): { kind: string; value: React.ReactNode } | null {
  if (!moment) return null;
  const type = readProp<string>(moment, 'type') ?? '';
  const height = readProp<bigint>(moment, 'blockHeight');
  const time = readProp<bigint>(moment, 'timestampMs');
  const epoch = readProp<number>(moment, 'epochIndex');
  if (height !== undefined && height !== null) return { kind: 'block', value: `block ${height.toString()}` };
  if (time !== undefined && time !== null) return { kind: 'time', value: <DateBlock value={Number(time)} /> };
  if (epoch !== undefined && epoch !== null) return { kind: 'epoch', value: `epoch ${epoch}` };
  return { kind: type || 'unknown', value: type || '—' };
}

export function TokenBalanceLookup({
  tokenId,
  decimals,
  hasPerpetualDistribution,
}: {
  tokenId: string;
  decimals?: number;
  hasPerpetualDistribution: boolean;
}) {
  // Read-only: the connected signer's identity is only a default.
  const { signer } = useSigner();
  const [holder, setHolder] = useQueryState('holder', parseAsString);
  const identityId = holder ?? signer?.identityId ?? undefined;
  const [input, setInput] = useState('');
  const trimmed = input.trim();

  const balancesQ = useTokenIdentityBalances(identityId, identityId ? [tokenId] : undefined);
  const infosQ = useTokenIdentityTokenInfos(identityId, identityId ? [tokenId] : undefined);
  const claimQ = usePerpetualDistributionLastClaim(identityId, tokenId, hasPerpetualDistribution);

  const balance = balancesQ.data instanceof Map ? (balancesQ.data.get(tokenId) as bigint | undefined) : undefined;
  const info = infosQ.data instanceof Map ? infosQ.data.get(tokenId) : undefined;
  const frozen = readProp<boolean>(info, 'isFrozen');
  const claim = describeClaimMoment(claimQ.data);

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock>
        <VStack align="stretch" spacing={2}>
          <Text fontSize="sm" color="gray.250">
            Look up one identity&apos;s balance, frozen state and last distribution claim for this token.
          </Text>
          <HStack spacing={2}>
            <Input
              size="sm"
              placeholder="Identity ID"
              aria-label="Identity ID for balance lookup"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isBase58Identifier(trimmed)) void setHolder(trimmed);
              }}
              fontFamily="mono"
              bg="gray.800"
              borderColor="gray.700"
            />
            <Button size="sm" colorScheme="blue" isDisabled={!isBase58Identifier(trimmed)} onClick={() => void setHolder(trimmed)}>
              Look up
            </Button>
          </HStack>
          {!holder && signer ? (
            <Text fontSize="xs" color="gray.400">Showing the connected signer&apos;s identity.</Text>
          ) : null}
        </VStack>
      </InfoBlock>

      {!identityId ? (
        <InfoBlock>
          <Text fontSize="sm" color="gray.400">Enter an identity ID, or connect a signer to see your own balance.</Text>
        </InfoBlock>
      ) : (
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <InfoLine label="Identity" value={<IdentityLink id={identityId} dense />} />
            <HStack spacing={8} flexWrap="wrap" align="flex-start">
              <InfoLine
                label="Balance"
                value={balancesQ.isLoading ? <Text color="gray.400">…</Text>
                  : balancesQ.isError ? <ErrorCard error={balancesQ.error} onRetry={() => balancesQ.refetch()} />
                    : <Text fontFamily="mono" color="gray.100">{formatTokenAmount(balance ?? 0n, decimals)}</Text>}
              />
              <InfoLine
                label="Frozen"
                value={infosQ.isLoading ? <Text color="gray.400">…</Text>
                  : infosQ.isError ? <ErrorCard error={infosQ.error} onRetry={() => infosQ.refetch()} />
                    : frozen === true ? <Badge colorScheme="red">frozen</Badge>
                      : <Badge colorScheme="green" variant="subtle">{frozen === false ? 'not frozen' : 'not frozen (no record)'}</Badge>}
              />
              <InfoLine
                label="Last perpetual-distribution claim"
                value={!hasPerpetualDistribution ? <Text fontSize="sm" color="gray.400">Token has no perpetual distribution.</Text>
                  : claimQ.isLoading ? <Text color="gray.400">…</Text>
                    : claimQ.isError ? <ErrorCard error={claimQ.error} onRetry={() => claimQ.refetch()} />
                      : claim ? <Text fontSize="sm" color="gray.100">{claim.value}</Text>
                        : <Text fontSize="sm" color="gray.400">Never claimed.</Text>}
              />
            </HStack>
          </VStack>
        </InfoBlock>
      )}
    </VStack>
  );
}
