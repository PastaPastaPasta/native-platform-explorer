'use client';

import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { CodeBlock } from '@components/data/CodeBlock';
import type { Network } from '@sdk/networks';
import type { ReceiptEntities } from './outcomes';

export function OperationReceipt({
  title,
  network,
  trusted,
  identityId,
  submittedAt,
  entities,
  result,
}: {
  title: string;
  network: Network;
  trusted: boolean;
  identityId: string;
  submittedAt: string;
  entities: ReceiptEntities;
  result?: unknown;
}) {
  // A full navigation rehydrates the URL network even when the shared SDK
  // provider survives client-side routing. Preserve GitHub Pages' base path.
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');
  const link = (path: string, params: Record<string, string>) =>
    `${basePath}${path}?${new URLSearchParams({ ...params, network }).toString()}`;
  const details = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const documentTypes =
    details?.kind === 'contractRegister' && Array.isArray(details.documentTypes)
      ? details.documentTypes.filter((type): type is string => typeof type === 'string')
      : [];
  return (
    <VStack align="stretch" spacing={3}>
      <Text color="gray.100" fontWeight={600}>
        {title}
      </Text>
      <Text fontSize="sm" color="gray.250">
        Network: {network} · {trusted ? 'trusted quorum source' : 'proof verification'}
      </Text>
      <Text fontSize="sm" color="gray.250" wordBreak="break-all">
        Signer identity: {identityId}
      </Text>
      <Text fontSize="xs" color="gray.400">
        Started: {submittedAt}
      </Text>
      {result !== undefined ? <CodeBlock value={result} /> : null}
      <HStack spacing={2} flexWrap="wrap">
        <Button
          as="a"
          href={link('/identity/', { id: entities.identityId ?? identityId })}
          size="sm"
          variant="outline"
        >
          Open identity
        </Button>
        {entities.recipientId ? (
          <Button
            as="a"
            href={link('/identity/', { id: entities.recipientId })}
            size="sm"
            variant="outline"
          >
            Open recipient
          </Button>
        ) : null}
        {entities.contractId ? (
          <Button
            as="a"
            href={link('/contract/', { id: entities.contractId })}
            size="sm"
            variant="outline"
          >
            Open contract
          </Button>
        ) : null}
        {entities.contractId && entities.documentType && entities.documentId ? (
          <Button
            as="a"
            href={link('/contract/document/', {
              id: entities.contractId,
              type: entities.documentType,
              docId: entities.documentId,
            })}
            size="sm"
            variant="outline"
          >
            Open document
          </Button>
        ) : null}
        {entities.contractId
          ? documentTypes.map((type) => (
              <Button
                key={type}
                as="a"
                href={link('/broadcast/', {
                  op: 'document.create',
                  contract: entities.contractId!,
                  type,
                })}
                size="sm"
                variant="outline"
              >
                Create a {type} →
              </Button>
            ))
          : null}
        {details?.kind === 'document' &&
        details.action === 'create' &&
        entities.contractId &&
        entities.documentType ? (
          <Button
            as="a"
            href={link('/broadcast/', {
              op: 'document.create',
              contract: entities.contractId,
              type: entities.documentType,
            })}
            size="sm"
            variant="outline"
          >
            Create another
          </Button>
        ) : null}
      </HStack>
    </VStack>
  );
}
