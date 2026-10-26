'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Box, Text } from '@chakra-ui/react';

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Box>
      <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
        {label}
      </Text>
      {children}
      {error || hint ? (
        <Text fontSize="xs" color={error ? 'danger' : 'gray.400'} mt={1}>
          {error ?? hint}
        </Text>
      ) : null}
    </Box>
  );
}

export const inputStyle = {
  size: 'sm',
  fontFamily: 'mono',
  bg: 'gray.800',
  borderColor: 'gray.700',
} as const;

export const selectStyle = { size: 'sm', bg: 'gray.800', borderColor: 'gray.700' } as const;

/**
 * `compute(key)` for the current key, ignoring results for keys that have
 * since changed. Null with no key or while pending. `key` must encode every
 * input `compute` reads. Errors carry only our own messages: callers throw
 * readable Errors and never quote secret input.
 */
export function useKeyedAsync<T>(
  key: string | null,
  compute: (key: string) => Promise<T>,
): { value?: T; error?: string } | null {
  const [state, setState] = useState<{ key: string; value?: T; error?: string } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    compute(key).then(
      (value) => !cancelled && setState({ key, value }),
      (error: unknown) =>
        !cancelled &&
        setState({ key, error: error instanceof Error ? error.message : 'Invalid input.' }),
    );
    return () => {
      cancelled = true;
    };
    // `key` encodes every input of `compute`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key !== null && state?.key === key ? state : null;
}
