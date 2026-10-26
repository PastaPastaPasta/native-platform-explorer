'use client';

import { useEffect, useState } from 'react';
import { Text, Textarea, VStack } from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';
import { useIdentity } from '@sdk/queries';
import type { DerivationNetwork } from '@/signer/types';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle, useKeyedAsync } from '../fields';
import { decodeStateTransition, type DecodedStateTransition } from './decode';

export interface RawBroadcastOptions {
  network: DerivationNetwork;
  /** The decoded transition; its hex is broadcast unchanged. */
  transition: DecodedStateTransition;
}

export function RawBroadcastForm({
  network,
  onOptionsChange,
}: OperationFormProps<RawBroadcastOptions>) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const decoded = useKeyedAsync(trimmed || null, decodeStateTransition);
  const transition = decoded?.value;
  const owner = useIdentity(transition?.ownerId);

  useEffect(() => {
    onOptionsChange(transition ? { network, transition } : null);
  }, [transition, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={3}>
      <FormField
        label="Signed state transition (hex or base64)"
        error={decoded?.error}
        hint="Produced and signed by another tool. The explorer decodes it locally and broadcasts the same bytes; it cannot change or re-sign it."
      >
        <Textarea
          {...inputStyle}
          minH="140px"
          aria-label="Signed state transition (hex or base64)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </FormField>
      {transition ? (
        <>
          <CodeBlock
            value={{
              type: transition.type,
              hash: transition.hash,
              ownerId: transition.ownerId ?? '(none: address-funded transition)',
              signaturePublicKeyId: transition.signaturePublicKeyId ?? '(none)',
              identityNonce: transition.identityNonce,
              identityContractNonce: transition.identityContractNonce,
              userFeeIncrease: transition.userFeeIncrease,
              bytes: transition.hex.length / 2,
              details: transition.details,
            }}
          />
          {transition.addressFunded ? (
            <Text fontSize="xs" color="warning" role="status">
              Platform address signatures do not commit to a network: the same transition is valid
              on any network where its input addresses hold funds at these nonces. Check that you
              mean to broadcast it on {network}.
            </Text>
          ) : null}
          {transition.ownerId ? (
            <Text
              fontSize="xs"
              color={owner.isSuccess && !owner.data ? 'warning' : 'gray.400'}
              role="status"
            >
              {owner.isLoading
                ? `Looking up the owner on ${network}…`
                : owner.isSuccess
                  ? owner.data
                    ? `The owner identity exists on ${network}.`
                    : `No identity ${transition.ownerId} on ${network}. The transition may be for another network, or create this identity.`
                  : `Could not look up the owner on ${network}.`}
            </Text>
          ) : null}
        </>
      ) : null}
    </VStack>
  );
}
