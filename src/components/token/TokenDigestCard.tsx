'use client';

import NextLink from 'next/link';
import { HStack, Heading, Link, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { BigNumberDisplay } from '@components/data/BigNumber';
import { NotActive } from '@components/data/NotActive';
import { InfoBlock } from '@ui/InfoBlock';
import { TokenFlagsPills, type TokenFlags } from './TokenFlagsPills';
import { EntityActions } from '@components/exploration/EntityActions';
import { useSdk } from '@sdk/hooks';
import { withNetwork } from '@util/exploration';
import { formatTokenAmount } from '@util/token-rules';

export interface TokenDigestCardProps {
  id: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  totalSupply?: bigint | number | string | null;
  maxSupply?: bigint | number | string | null;
  baseSupply?: bigint | number | string | null;
  price?: React.ReactNode;
  flags: TokenFlags;
  /** Owning contract (resolved from the token ID via tokens.contractInfo). */
  ownerContractId?: string | null;
  tokenContractPosition?: number | null;
}

/** Raw on-chain amounts, scaled by the token's decimals once they are known. */
function Supply({ value, decimals }: { value: bigint | number | string | null | undefined; decimals?: number | null }) {
  if (value === null || value === undefined) return <NotActive />;
  if (decimals === null || decimals === undefined) return <BigNumberDisplay value={value} />;
  return <Text as="span" fontFamily="mono" fontSize="md" color="gray.100">{formatTokenAmount(String(value), decimals)}</Text>;
}

export function TokenDigestCard({
  id,
  name,
  symbol,
  decimals,
  totalSupply,
  maxSupply,
  baseSupply,
  price,
  flags,
  ownerContractId,
  tokenContractPosition,
}: TokenDigestCardProps) {
  const { network } = useSdk();
  const title = name ?? symbol ?? 'Token';
  const subtitle = symbol && name && symbol !== name ? symbol : undefined;
  return (
    <InfoBlock emphasised>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <VStack align="flex-start" spacing={2}>
            <Heading as="h1" size="md" color="gray.100">
              {title}
              {subtitle ? (
                <Text as="span" color="gray.400" fontSize="md" fontWeight={500}>
                  {' · '}
                  {subtitle}
                </Text>
              ) : null}
            </Heading>
            <Identifier value={id} avatar copy highlight="both" />
          </VStack>
          <TokenFlagsPills flags={flags} />
        </HStack>

        <EntityActions kind="token" id={id} />

        <Wrap spacing={8}>
          <WrapItem>
            <InfoLine label="Decimals" value={decimals ?? <NotActive />} />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Total supply"
              value={<Supply value={totalSupply} decimals={decimals} />}
            />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Max supply"
              value={<Supply value={maxSupply} decimals={decimals} />}
            />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Base supply"
              value={<Supply value={baseSupply} decimals={decimals} />}
            />
          </WrapItem>
          <WrapItem>
            <InfoLine label="Price" value={price ?? <NotActive />} />
          </WrapItem>
          {ownerContractId ? (
            <WrapItem>
              <InfoLine
                label={
                  tokenContractPosition !== null && tokenContractPosition !== undefined
                    ? `Contract · #${tokenContractPosition}`
                    : 'Contract'
                }
                value={
                  <Link
                    as={NextLink}
                    href={withNetwork(`/contract/?id=${encodeURIComponent(ownerContractId)}`, network)}
                    color="brand.light"
                  >
                    <Identifier value={ownerContractId} dense />
                  </Link>
                }
              />
            </WrapItem>
          ) : null}
        </Wrap>
      </VStack>
    </InfoBlock>
  );
}
