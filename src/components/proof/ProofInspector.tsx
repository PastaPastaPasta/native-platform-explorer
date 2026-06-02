'use client';

import {
  Box,
  Code,
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
import { CopyButton } from '@ui/CopyButton';
import { Eyebrow } from '@ui/Eyebrow';

const STATUS_LABEL: Record<ProofStatus, string> = {
  verified: 'VERIFIED',
  trusted: 'TRUST MODE',
  failed: 'FAILED',
};

const STATUS_COLOR: Record<ProofStatus, string> = {
  verified: 'verified',
  trusted: 'trusted',
  failed: 'failed',
};

function bytesToHex(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return null;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Eyebrow mb={1.5}>{label}</Eyebrow>
      {children}
    </Box>
  );
}

function MonoCopy({ value }: { value: string }) {
  return (
    <HStack
      align="flex-start"
      spacing={2}
      bg="sunken"
      borderRadius="card"
      px={3}
      py={2}
      border="1px solid"
      borderColor="hairline"
    >
      <Box
        as="code"
        fontFamily="mono"
        fontSize="11px"
        color="ink"
        wordBreak="break-all"
        flex="1"
      >
        {value}
      </Box>
      <CopyButton value={value} label="Copy" />
    </HStack>
  );
}

export function ProofInspector() {
  const { isOpen, close, payload } = useProofInspector();
  const status = payload?.status ?? 'verified';
  const entry = payload?.entry;
  const proof = entry?.proof;
  const meta = entry?.metadata;

  const merkleRoot = bytesToHex(proof?.blockIdHash);
  const signature = bytesToHex(proof?.signature);
  const quorumHash = bytesToHex(proof?.quorumHash);

  // A value from a non-provable endpoint isn't "trust mode" — there is simply
  // no proof to verify. Label it honestly rather than reusing the status chip.
  const noProof = !proof && entry?.hasProofVariant === false;
  const statusLabel = noProof ? 'NO PROOF' : STATUS_LABEL[status];
  const statusColor = noProof ? 'muted' : STATUS_COLOR[status];

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={close} size="md">
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
          <VStack align="stretch" spacing={5}>
            {payload?.notes ? (
              <Text fontSize="sm" color="muted">
                {payload.notes}
              </Text>
            ) : null}

            {merkleRoot ? (
              <Field label="Block ID hash (merkle root)">
                <MonoCopy value={merkleRoot} />
              </Field>
            ) : null}

            {quorumHash ? (
              <Field label="Quorum hash">
                <MonoCopy value={quorumHash} />
              </Field>
            ) : null}

            {proof ? (
              <Field label="Quorum">
                <HStack spacing={4} fontFamily="mono" fontSize="12px" color="ink">
                  <Text>
                    <Text as="span" color="muted">
                      type
                    </Text>{' '}
                    {proof.quorumType}
                  </Text>
                  <Text>
                    <Text as="span" color="muted">
                      round
                    </Text>{' '}
                    {proof.round}
                  </Text>
                </HStack>
              </Field>
            ) : null}

            {meta ? (
              <Field label="Response metadata">
                <Code
                  display="block"
                  fontFamily="mono"
                  fontSize="11px"
                  color="ink"
                  bg="sunken"
                  borderRadius="card"
                  border="1px solid"
                  borderColor="hairline"
                  p={3}
                  whiteSpace="pre"
                >
                  {`height       ${meta.height}\nepoch        #${meta.epoch}\ncore height  ${meta.coreChainLockedHeight}\nprotocol     v${meta.protocolVersion}\nchain id     ${meta.chainId}\ntime         ${new Date(meta.timeMs).toISOString()}`}
                </Code>
              </Field>
            ) : null}

            {signature ? (
              <Field label="Threshold signature">
                <MonoCopy value={signature} />
              </Field>
            ) : null}

            {entry ? (
              <Field label="Call">
                <Text fontFamily="mono" fontSize="11px" color="ink">
                  {entry.methodName}
                </Text>
              </Field>
            ) : null}

            {!proof && !meta && !payload?.notes ? (
              entry ? (
                <Text fontSize="sm" color="muted">
                  {entry.error
                    ? `Proof was not captured: ${entry.error}`
                    : entry.hasProofVariant === false
                      ? 'This endpoint does not return a cryptographic proof, so there is nothing to verify here.'
                      : 'Served in trust mode — no proof was requested for this query. Enable trusted mode to verify it in your browser.'}
                </Text>
              ) : (
                <Text fontSize="sm" color="muted">
                  No proof payload is attached to this value yet. Open a page that
                  triggers a verified query to populate the inspector.
                </Text>
              )
            ) : null}
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
