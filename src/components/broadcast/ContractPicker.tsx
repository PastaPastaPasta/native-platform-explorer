'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Button, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { isBase58Identifier, shortId } from '@util/identifier';

const RECENT_KEY = 'npe:recentContracts';
const MAX_RECENTS = 10;

interface Recent {
  id: string;
  ts: number;
  label?: string;
}

function readRecents(): Recent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is Recent =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as Recent).id === 'string' &&
        typeof (r as Recent).ts === 'number',
    );
  } catch {
    return [];
  }
}

/** Record a contract as recently used. Call after a successful fetch/use. */
export function rememberContract(id: string, label?: string): void {
  if (typeof window === 'undefined') return;
  if (!isBase58Identifier(id)) return;
  const existing = readRecents().filter((r) => r.id !== id);
  const next: Recent[] = [{ id, ts: Date.now(), label }, ...existing].slice(
    0,
    MAX_RECENTS,
  );
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

interface ContractPickerProps {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** When true, show the "recently used" chip list. Defaults to true. */
  showRecents?: boolean;
}

export function ContractPicker({
  value,
  onChange,
  placeholder = 'Contract ID (Base58)',
  showRecents = true,
}: ContractPickerProps) {
  const [recents, setRecents] = useState<Recent[]>([]);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  const valid = useMemo(() => isBase58Identifier(value.trim()), [value]);

  return (
    <VStack align="stretch" spacing={2}>
      <Input
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        fontFamily="mono"
        bg="gray.800"
        borderColor={value && !valid ? 'danger' : 'gray.700'}
      />
      {value && !valid ? (
        <Text fontSize="xs" color="danger">
          Not a valid Base58 identifier.
        </Text>
      ) : null}
      {showRecents && recents.length > 0 ? (
        <Box>
          <Text fontSize="xs" color="gray.400" mb={1}>
            Recently used
          </Text>
          <HStack spacing={1} flexWrap="wrap">
            {recents.map((r) => (
              <Button
                key={r.id}
                size="xs"
                variant="outline"
                onClick={() => onChange(r.id)}
                fontFamily="mono"
              >
                {r.label ? `${r.label} · ` : ''}
                {shortId(r.id, 8, 6)}
              </Button>
            ))}
          </HStack>
        </Box>
      ) : null}
    </VStack>
  );
}
