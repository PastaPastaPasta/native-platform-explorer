'use client';

import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useProofInspector, type ProofStatus } from './ProofInspectorContext';
import { Eyebrow } from '@ui/Eyebrow';
import { QueryEntryDetail } from '@components/query-inspector/QueryEntryCard';

const STATUS_LABEL: Record<ProofStatus, string> = {
  verified: 'VERIFIED',
  trusted: 'TRUST MODE',
  failed: 'FAILED',
};

const STATUS_COLOR: Record<ProofStatus, string> = {
  verified: 'verified',
  // Grey, not yellow — "served without a proof" is informational, not a warning.
  trusted: 'muted',
  failed: 'failed',
};

/**
 * Single-value proof drawer opened from a ProofGlyph. It renders the exact same
 * Query / Result / Proof breakdown as the query-inspector list (via the shared
 * QueryEntryDetail) so a value's proof dot opens the full depth — parameters,
 * result, response metadata, quorum signature, and the parsed GroveDB proof
 * tree — rather than a flat subset. Defaults to the Proof tab.
 */
export function ProofInspector() {
  const { isOpen, close, payload } = useProofInspector();
  const status = payload?.status ?? 'verified';
  const entry = payload?.entry;

  // A value from a non-provable endpoint isn't "trust mode" — there is simply
  // no proof to verify. Label it honestly rather than reusing the status chip.
  const noProof = entry ? !entry.proof && entry.hasProofVariant === false : false;
  const statusLabel = noProof ? 'NO PROOF' : STATUS_LABEL[status];
  const statusColor = noProof ? 'muted' : STATUS_COLOR[status];
  // Open straight to the Proof tab (index 2) when this value carries a proof
  // variant; otherwise the Query tab (no Proof tab is rendered).
  const defaultTabIndex = entry?.hasProofVariant ? 2 : 0;

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={close} size="lg">
      <DrawerOverlay bg="blackAlpha.500" />
      <DrawerContent bg="surface" color="ink">
        <DrawerCloseButton color="muted" _hover={{ color: 'ink' }} />
        <DrawerHeader
          borderBottom="1px solid"
          borderColor="hairline"
          fontFamily="heading"
          fontWeight={500}
          fontSize="lg"
          pb={3}
        >
          <VStack align="stretch" spacing={2}>
            <Eyebrow>Proof Inspector</Eyebrow>
            <Text>{payload?.title ?? 'Proof details'}</Text>
            <HStack spacing={1.5}>
              <Box as="span" fontSize="9px" color={statusColor} lineHeight={1}>
                ●
              </Box>
              <Text fontFamily="mono" fontSize="11px" color={statusColor}>
                {statusLabel}
              </Text>
            </HStack>
          </VStack>
        </DrawerHeader>
        <DrawerBody py={5}>
          <VStack align="stretch" spacing={4}>
            {payload?.notes ? (
              <Text fontSize="sm" color="muted">
                {payload.notes}
              </Text>
            ) : null}

            {entry ? (
              <QueryEntryDetail entry={entry} defaultTabIndex={defaultTabIndex} />
            ) : !payload?.notes ? (
              <Text fontSize="sm" color="muted">
                No proof payload is attached to this value yet. Open a page that
                triggers a verified query to populate the inspector.
              </Text>
            ) : null}
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
