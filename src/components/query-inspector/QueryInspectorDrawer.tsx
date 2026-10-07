'use client';

import {
  Accordion,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { useEffect, useMemo } from 'react';
import { useQueryProofStore } from '@/contexts/QueryProofStore';
import { useSdk } from '@sdk/hooks';
import { downloadEvidenceBundle, serializeEvidenceBundle } from '@sdk/evidence';
import { QueryEntryCard } from './QueryEntryCard';
import { OVERVIEW_TEXT } from './annotations';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

export function QueryInspectorDrawer() {
  const toast = useToast();
  const { entries, retainedBytes, droppedEntries, clear, enabled, drawerOpen, openDrawer, closeDrawer } = useQueryProofStore();
  const { network, trusted, status } = useSdk();

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (drawerOpen) closeDrawer();
      else openDrawer();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openDrawer, closeDrawer, drawerOpen, enabled]);

  const stats = useMemo(() => {
    let captured = 0;
    let verified = 0;
    for (const e of entries) {
      if (e.proof) captured++;
      if (e.verification === 'verified') verified++;
    }
    return { total: entries.length, captured, verified };
  }, [entries]);

  return (
    <Drawer isOpen={drawerOpen} placement="right" size="full" onClose={closeDrawer}>
      <DrawerOverlay />
      <DrawerContent bg="gray.900">
        <DrawerCloseButton aria-label="Close query inspector" minW="44px" minH="44px" />
        <DrawerHeader color="gray.100" pb={2} maxW="1400px" mx="auto" w="100%">
          <Text fontSize="md">Query Inspector</Text>
        </DrawerHeader>
        <DrawerBody px={6} maxW="1400px" mx="auto" w="100%">
          <VStack align="stretch" spacing={4}>
            <HStack spacing={4} flexWrap="wrap">
              <Text fontSize="xs" color="gray.400">
                {stats.total} queries
              </Text>
              <Text fontSize="xs" color={stats.verified > 0 ? 'success' : 'gray.400'}>
                {stats.verified} SDK verified · {stats.captured} proofs captured
              </Text>
              <Text fontSize="xs" color="gray.500">
                Current SDK: {network} · {trusted ? 'trusted' : 'untrusted'} · {status}
              </Text>
            </HStack>
            <Text fontSize="xs" color="gray.400">
              Inspector data: {(retainedBytes / 1024 / 1024).toFixed(2)} MiB of 8 MiB estimated retained data · up to 200 queries
              {droppedEntries ? ` · ${droppedEntries} oversized entries skipped` : ''}
            </Text>
            <HStack spacing={2} flexWrap="wrap">
              <Button size="sm" minH="44px" variant="outline" isDisabled={!entries.length} onClick={() => downloadEvidenceBundle(entries)}>
                Export all evidence JSON
              </Button>
              <Button
                size="sm"
                minH="44px"
                isDisabled={!entries.length}
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(serializeEvidenceBundle(entries));
                    toast({ title: 'Evidence copied', status: 'success' });
                  } catch {
                    toast({ title: 'Could not copy evidence', description: 'Use Export all evidence JSON to save the file.', status: 'error' });
                  }
                }}
              >
                Copy all evidence JSON
              </Button>
              <Button size="sm" minH="44px" variant="outline" onClick={clear}>
                Clear
              </Button>
            </HStack>

            <Box
              bg="sunken"
              borderRadius="md"
              px={3}
              py={2}
              borderLeft="3px solid"
              borderColor="brand.normal"
            >
              <Text fontSize="xs" color="gray.300" lineHeight="1.6">
                {OVERVIEW_TEXT}
              </Text>
            </Box>

            {entries.length === 0 ? (
              <Text fontSize="xs" color="gray.500" textAlign="center" py={8}>
                No queries captured yet. Navigate to a page to see queries appear here.
              </Text>
            ) : (
              <Accordion allowMultiple>
                {entries.map((entry, i) => (
                  <QueryEntryCard key={`${entry.methodName}-${entry.timestamp}-${i}`} entry={entry} />
                ))}
              </Accordion>
            )}
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
