'use client';

import { useEffect, useState } from 'react';
import { Button, FormControl, FormLabel, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import type { OperationFormProps } from '../OperationShell';
import type { ExplorerSigner } from '@/signer/types';
import { isBase58Identifier } from '@util/identifier';
import { getBridgeUrl } from '@util/bridge';

export interface IdentityTopUpOptions {
  identityId: string;
  amountDash: string;
}

export function IdentityTopUpForm({
  signer,
  onOptionsChange,
}: Pick<OperationFormProps<IdentityTopUpOptions>, 'onOptionsChange'> & {
  signer?: ExplorerSigner | null;
}) {
  const { network } = useSdk();
  const [identityId, setIdentityId] = useState(signer?.identityId ?? '');
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

  const bridgeUrl = getBridgeUrl(network);

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
            Top-up requires an asset-lock proof built from a Dash Core transaction — the bridge does
            that for you. Open it below, choose Manage Identity, then Top Up Identity, and enter
            this identity and amount there. After it completes, return to the identity page and
            refresh to check the balance.
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
              The bridge shortcut is unavailable. It requires an enabled Mainnet or Testnet bridge;
              other networks need their own setup.
            </Text>
          )}
        </VStack>
      </InfoBlock>
    </VStack>
  );
}
