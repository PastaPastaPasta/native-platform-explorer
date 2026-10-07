'use client';

import { Button, HStack, Text, VStack, useToast } from '@chakra-ui/react';
import { useSdk } from '@sdk/hooks';
import { getNetwork } from '@sdk/networks';
import { EVO_SDK_VERSION } from '@/version';
import type { DocumentsQueryParams } from '@sdk/queries';
import type { ParsedQuery } from '@util/sql-parser';
import {
  aggregateExportRows,
  buildSdkExample,
  extractDocumentRows,
  serializeQueryCsv,
  serializeQueryJson,
} from '@util/query-workspace';

export function ResultActions({
  parsed,
  params,
  data,
  retrievedAt,
}: {
  parsed: ParsedQuery;
  params: DocumentsQueryParams;
  data: unknown;
  retrievedAt: number;
}) {
  const { network, trusted } = useSdk();
  const toast = useToast();
  function download(format: 'json' | 'csv') {
    try {
      const content =
        format === 'json'
          ? serializeQueryJson({
              network,
              trusted,
              sdkVersion: EVO_SDK_VERSION,
              retrievedAt: new Date(retrievedAt).toISOString(),
              statement: parsed,
              query: params,
              result: data,
            })
          : serializeQueryCsv(
              parsed.select === 'documents'
                ? extractDocumentRows(data)
                : aggregateExportRows(data, parsed.select),
            );
      const url = URL.createObjectURL(
        new Blob([content], {
          type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `query-${network}-${parsed.from}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ status: 'error', title: 'Could not export query result' });
    }
  }
  return (
    <VStack align="stretch" spacing={1}>
      <HStack spacing={2} flexWrap="wrap">
        <Button size="xs" variant="outline" onClick={() => download('json')}>
          Export JSON
        </Button>
        <Button size="xs" variant="outline" onClick={() => download('csv')}>
          Export CSV
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                buildSdkExample(parsed, params, getNetwork(network), trusted),
              );
              toast({ status: 'success', title: 'SDK example copied' });
            } catch {
              toast({ status: 'error', title: 'Could not copy SDK example' });
            }
          }}
        >
          Copy SDK example
        </Button>
      </HStack>
      <Text fontSize="2xs" color="gray.500">
        Exports include this result page. JSON stores BigInts as decimal strings; CSV preserves
        their digits. Import CSV integer columns as text to prevent spreadsheet rounding. Aggregate
        group keys retain their original encoding.
      </Text>
    </VStack>
  );
}
