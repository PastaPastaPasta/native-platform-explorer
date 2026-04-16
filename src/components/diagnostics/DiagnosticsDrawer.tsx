'use client';

import {
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSdk } from '@sdk/hooks';

interface LogEntry {
  key: string;
  stateAt: number;
  status: string;
}

function usePlatformShortcut(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isSlash = e.key === '/';
      const isMac = (e.metaKey && isSlash) || (e.ctrlKey && isSlash);
      if (isMac) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);
}

function useQueryLog(maxEntries = 100): LogEntry[] {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    const cache = qc.getQueryCache();
    const unsubscribe = cache.subscribe((ev) => {
      if (!ev) return;
      const q = ev.query;
      setEntries((prev) => {
        const next: LogEntry = {
          key: JSON.stringify(q.queryKey),
          stateAt: Date.now(),
          status: q.state.status,
        };
        const out = [next, ...prev].slice(0, maxEntries);
        return out;
      });
    });
    return () => unsubscribe();
  }, [qc, maxEntries]);
  return entries;
}

export function DiagnosticsDrawer() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  usePlatformShortcut(onOpen);
  const { network, trusted, status } = useSdk();
  const log = useQueryLog(100);
  const rows = useMemo(() => log.slice(0, 100), [log]);

  return (
    <Drawer isOpen={isOpen} placement="right" size="md" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent bg="gray.900" borderLeft="1px solid" borderColor="gray.750">
        <DrawerCloseButton />
        <DrawerHeader color="gray.100">Diagnostics</DrawerHeader>
        <DrawerBody>
          <VStack align="stretch" spacing={3}>
            <HStack spacing={4}>
              <Text fontSize="xs" color="gray.400">
                network <Text as="span" color="gray.100">{network}</Text>
              </Text>
              <Text fontSize="xs" color="gray.400">
                trusted <Text as="span" color={trusted ? 'success' : 'warning'}>{String(trusted)}</Text>
              </Text>
              <Text fontSize="xs" color="gray.400">
                sdk <Text as="span" color="gray.100">{status}</Text>
              </Text>
            </HStack>
            <HStack>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
                  }
                }}
              >
                Copy JSON
              </Button>
            </HStack>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">Query</Th>
                  <Th color="gray.400" borderColor="gray.750">Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.slice(0, 50).map((e, i) => (
                  <Tr key={i}>
                    <Td borderColor="gray.750" fontFamily="mono" fontSize="2xs">
                      <Text noOfLines={1}>{e.key}</Text>
                    </Td>
                    <Td borderColor="gray.750" fontFamily="mono" fontSize="2xs">
                      {e.status}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
