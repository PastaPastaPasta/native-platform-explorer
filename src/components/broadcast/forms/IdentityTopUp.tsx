'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import type { OperationFormProps } from '../OperationShell';
import { isBase58Identifier } from '@util/identifier';

export interface IdentityTopUpOptions {
  identityId: string;
  amountDash: string;
}

// Mirrors BridgeLaunchCard: no fallback URL. Operators must set
// NEXT_PUBLIC_BRIDGE_URL — we don't want to send users to an arbitrary domain
// to type a seed phrase.
const BRIDGE_BASE_URL = (process.env.NEXT_PUBLIC_BRIDGE_URL ?? '').replace(
  /\/+$/,
  '',
);

export function IdentityTopUpForm({
  signer,
  onOptionsChange,
}: OperationFormProps<IdentityTopUpOptions>) {
  const { network } = useSdk();
  const [identityId, setIdentityId] = useState(signer.identityId);
  const [amount, setAmount] = useState('0.1');

  useEffect(() => {
    const validId = isBase58Identifier(identityId.trim());
    const validAmount = Number(amount) > 0;
    if (!validId || !validAmount) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ identityId: identityId.trim(), amountDash: amount });
  }, [identityId, amount, onOptionsChange]);

  const bridgeUrl = BRIDGE_BASE_URL
    ? `${BRIDGE_BASE_URL}/?${new URLSearchParams({
        network,
        mode: 'topup',
        identityId: identityId.trim(),
      }).toString()}`
    : null;

  return (
    <VStack align="stretch" spacing={4}>
      <FormControl>
        <FormLabel fontSize="xs" color="gray.250">
          Identity
        </FormLabel>
        <Input
          size="sm"
          fontFamily="mono"
          value={identityId}
          onChange={(e) => setIdentityId(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
      </FormControl>
      <FormControl>
        <FormLabel fontSize="xs" color="gray.250">
          Approximate amount (DASH)
        </FormLabel>
        <Input
          size="sm"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          The bridge will quote the exact amount based on UTXOs available.
        </Text>
      </FormControl>

      <InfoBlock>
        <VStack align="stretch" spacing={2}>
          <Text fontSize="sm" color="gray.100" fontWeight={500}>
            Top-up happens in the bridge
          </Text>
          <Text fontSize="xs" color="gray.250">
            Top-up requires an asset-lock proof built from a Dash Core transaction
            — the bridge does that for you. Open it below; when the bridge says
            &ldquo;complete&rdquo;, return here and the identity balance will refresh
            automatically.
          </Text>
          {bridgeUrl ? (
            <HStack>
              <Button
                as="a"
                size="sm"
                colorScheme="blue"
                href={bridgeUrl}
                target="_blank"
                rel="noopener noreferrer"
                isDisabled={!isBase58Identifier(identityId.trim())}
              >
                Open bridge →
              </Button>
            </HStack>
          ) : (
            <Text fontSize="xs" color="warning">
              Bridge URL not configured. Set NEXT_PUBLIC_BRIDGE_URL to enable
              this shortcut, or run the bridge separately.
            </Text>
          )}
        </VStack>
      </InfoBlock>
    </VStack>
  );
}
