'use client';

import { useEffect, useState } from 'react';
import { Text, Textarea, VStack } from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';
import { useIdentity } from '@sdk/queries';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../addresses/fields';
import { decodeStateTransition, type DecodedStateTransition } from './decode';

export interface RawBroadcastOptions {
  network: 'mainnet' | 'testnet';
  /** The decoded transition; its hex is broadcast unchanged. */
  transition: DecodedStateTransition;
}

export function RawBroadcastForm({
  network,
  onOptionsChange,
}: OperationFormProps<RawBroadcastOptions>) {
  const [text, setText] = useState('');
  const [decoded, setDecoded] = useState<{
    text: string;
    transition?: DecodedStateTransition;
    error?: string;
  } | null>(null);
  const trimmed = text.trim();

  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    void decodeStateTransition(trimmed).then(
      (transition) => !cancelled && setDecoded({ text: trimmed, transition }),
      (error: unknown) =>
        !cancelled &&
        setDecoded({
          text: trimmed,
          error: error instanceof Error ? error.message : 'Could not decode.',
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [trimmed]);
  const current = trimmed && decoded?.text === trimmed ? decoded : null;
  const transition = current?.transition;
  const owner = useIdentity(transition?.ownerId);

  useEffect(() => {
    onOptionsChange(transition ? { network, transition } : null);
  }, [transition, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={3}>
      <FormField
        label="Signed state transition (hex or base64)"
        error={current?.error}
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
            }}
          />
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
