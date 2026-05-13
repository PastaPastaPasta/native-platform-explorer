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
} from '@chakra-ui/react';
import { useEffect, useMemo } from 'react';
import { useQueryProofStore } from '@/contexts/QueryProofStore';
import { useSdk } from '@sdk/hooks';
import { safeStringify } from '@util/wasm-json';
import { QueryEntryCard } from './QueryEntryCard';
import { OVERVIEW_TEXT } from './annotations';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

export function QueryInspectorDrawer() {
  const { entries, clear, enabled, drawerOpen, openDrawer, closeDrawer } = useQueryProofStore();
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
    let proven = 0;
    let maxHeight = 0;
    let maxEpoch = 0;
    for (const e of entries) {
      if (e.proof) proven++;
      if (e.metadata) {
        if (e.metadata.height > maxHeight) maxHeight = e.metadata.height;
        if (e.metadata.epoch > maxEpoch) maxEpoch = e.metadata.epoch;
      }
    }
    return { total: entries.length, proven, maxHeight, maxEpoch };
  }, [entries]);

  return (
    <Drawer isOpen={drawerOpen} placement="right" size="lg" onClose={closeDrawer}>
      <DrawerOverlay />
      <DrawerContent bg="gray.900" borderLeft="1px solid" borderColor="gray.750">
        <DrawerCloseButton />
        <DrawerHeader color="gray.100" pb={2}>
          <Text fontSize="md">Query Inspector</Text>
        </DrawerHeader>
        <DrawerBody px={4}>
          <VStack align="stretch" spacing={4}>
            <HStack spacing={4} flexWrap="wrap">
              <Text fontSize="xs" color="gray.400">
                {stats.total} queries
              </Text>
              <Text fontSize="xs" color={stats.proven > 0 ? 'success' : 'gray.400'}>
                {stats.proven} proven
              </Text>
              {stats.maxHeight > 0 ? (
                <Text fontSize="xs" color="gray.400">
                  height {stats.maxHeight}
                </Text>
              ) : null}
              {stats.maxEpoch > 0 ? (
                <Text fontSize="xs" color="gray.400">
                  epoch {stats.maxEpoch}
                </Text>
              ) : null}
              <Text fontSize="xs" color="gray.500">
                {network} · {trusted ? 'trusted' : 'untrusted'} · {status}
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(safeStringify(entries));
                }}
              >
                Copy All
              </Button>
              <Button size="xs" variant="outline" onClick={clear}>
                Clear
              </Button>
            </HStack>

            <Box
              bg="whiteAlpha.50"
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
