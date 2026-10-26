'use client';

import { useEffect, useState } from 'react';
import { Box, FormControl, FormLabel, Input, Text, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';
import { validateLabel } from '@util/dpns';
import { useDpnsIsContested } from '@sdk/queries';

export interface DpnsRegisterOptions {
  label: string;
  /** Whether Platform treats the label as contested (masternode vote + contest fee). */
  contested: boolean;
}

/** DPNS names live under the `dash` parent domain on every network. */
export const DPNS_TLD = 'dash';

export function DpnsRegisterForm({ signer, onOptionsChange }: OperationFormProps<DpnsRegisterOptions>) {
  const [label, setLabel] = useState('');
  const normalized = label.trim().toLowerCase();
  const labelCheck = normalized ? validateLabel(normalized) : { valid: false };
  const contestedQuery = useDpnsIsContested(
    labelCheck.valid ? `${normalized}.${DPNS_TLD}` : undefined,
  );
  const contested = typeof contestedQuery.data === 'boolean' ? contestedQuery.data : undefined;

  useEffect(() => {
    if (!labelCheck.valid || contested === undefined) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({ label: normalized, contested });
  }, [labelCheck.valid, normalized, contested, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        The name is registered to the connected identity{' '}
        <Text as="span" fontFamily="mono" wordBreak="break-all">
          {signer?.identityId}
        </Text>
        . Disconnect on /wallet and reconnect to use another identity.
      </Text>
      <FormControl>
        <FormLabel fontSize="xs" color="gray.250">
          Label (will be registered as {normalized || '…'}.{DPNS_TLD})
        </FormLabel>
        <Input
          size="sm"
          fontFamily="mono"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
        {label && !labelCheck.valid ? (
          <Text color="warning" fontSize="xs" mt={1}>
            {'reason' in labelCheck ? labelCheck.reason : 'Invalid label'}
          </Text>
        ) : null}
        {contestedQuery.error ? (
          <Text color="warning" fontSize="xs" mt={1}>
            Could not check whether this name is contested. Try again.
          </Text>
        ) : null}
      </FormControl>
      {contested ? (
        <Box
          role="note"
          borderRadius="md"
          border="1px solid"
          borderColor="warning"
          bg="rgba(255,199,2,0.08)"
          p={3}
        >
          <Text fontSize="sm" color="warning" fontWeight={600}>
            {normalized}.{DPNS_TLD} is a contested name
          </Text>
          <Text fontSize="xs" color="gray.250" mt={1}>
            Names of 3–19 characters that use only letters, 0, 1, and hyphens (after o→0, i/l→1
            normalization) are contested. Registering one does not assign it immediately: it opens a
            contest that other identities can join, and masternodes vote on the winner during the
            voting period (two weeks on mainnet; test networks may be shorter). Platform deducts a
            0.2 DASH contest fee from your identity balance in addition to the normal fees, and the
            fee is not refunded if another identity wins. Longer names, or names with digits 2–9,
            are not contested.
          </Text>
        </Box>
      ) : null}
    </VStack>
  );
}
