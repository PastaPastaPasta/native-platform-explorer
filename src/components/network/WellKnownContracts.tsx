'use client';

import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { Box, Text, VStack } from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { useWellKnownEntries } from '@hooks/useWellKnownRegistry';
import { usePrefetchProps } from '@hooks/usePrefetch';
import { useContractsPreview } from '@sdk/queries';
import { documentTypeNames, normaliseContract } from '@util/contract';
import { shortId } from '@util/identifier';

const IDLE_FALLBACK_MS = 2_000;

function Preview({ value, loading }: { value: unknown; loading: boolean }) {
  if (value === undefined) {
    return loading ? <Text as="span" fontSize="xs" color="faint">loading…</Text> : null;
  }
  if (value instanceof Error) return <Text as="span" fontSize="xs" color="faint">preview unavailable</Text>;
  if (value === null) return <Text as="span" fontSize="xs" color="faint">not on this network</Text>;
  const contract = normaliseContract(value);
  const types = documentTypeNames(contract).length;
  return (
    <Text as="span" fontSize="xs" color="muted" fontFamily="mono">
      {types} doc type{types === 1 ? '' : 's'}
      {contract.ownerId ? ` · owner ${shortId(contract.ownerId)}` : ''}
    </Text>
  );
}

function ContractRow({ id, name, preview, loading }: { id: string; name: string; preview: unknown; loading: boolean }) {
  const prefetch = usePrefetchProps({ kind: 'contract', id });
  return (
    <Box
      as={NextLink}
      href={`/contract/?id=${encodeURIComponent(id)}`}
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
      gap={2}
      py={2.5}
      _hover={{ color: 'accent' }}
      transition="color 0.12s ease"
      {...prefetch}
    >
      <VStack align="start" spacing={0}>
        <Text fontSize="13px" color="ink" fontWeight={400}>
          {name}
        </Text>
        <Preview value={preview} loading={loading} />
      </VStack>
      <Identifier value={id} dense avatar={false} copy={false} />
    </Box>
  );
}

/** Home "Well-known contracts" list. Previews (document types, owner) load
 *  in one batched `contracts.getMany` once the browser is idle or the list is
 *  hovered/focused, so they never compete with the dashboard's first queries. */
export function WellKnownContracts() {
  const contracts = useWellKnownEntries('contract');
  const ids = useMemo(() => contracts.map((c) => c.id), [contracts]);
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (wanted) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (w.requestIdleCallback) {
      const handle = w.requestIdleCallback(() => setWanted(true), { timeout: IDLE_FALLBACK_MS * 2 });
      return () => w.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setWanted(true), IDLE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [wanted]);

  const q = useContractsPreview(ids, wanted);
  const previews = q.data instanceof Map ? q.data : undefined;

  return (
    <VStack
      align="stretch"
      spacing={0}
      divider={<Box h="1px" bg="hairline" />}
      onMouseEnter={() => setWanted(true)}
      onFocusCapture={() => setWanted(true)}
    >
      {contracts.map((w) => (
        <ContractRow
          key={w.id}
          id={w.id}
          name={w.name}
          preview={q.isError ? q.error : previews ? (previews.get(w.id) ?? null) : undefined}
          loading={wanted && q.isFetching}
        />
      ))}
    </VStack>
  );
}
