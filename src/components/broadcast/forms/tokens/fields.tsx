'use client';

import { Box, Input, Text } from '@chakra-ui/react';
import { isBase58Identifier } from '@util/identifier';
import { formatTokenAmount } from '@util/token-rules';
import type { HolderState } from '../../tokens/state';

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text fontSize="xs" color="gray.400" mt={1}>
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}

/** An identity input that shows the identity's balance and frozen state once loaded. */
export function IdentityInput({
  label,
  value,
  onChange,
  state,
  decimals,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  state?: HolderState;
  decimals: number;
}) {
  const invalid = value.trim() !== '' && !isBase58Identifier(value.trim());
  return (
    <Field label={label}>
      <Input
        size="sm"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fontFamily="mono"
        bg="gray.800"
        borderColor={invalid ? 'danger' : 'gray.700'}
        placeholder="Base58 identity ID"
      />
      {state ? (
        <Text fontSize="xs" color={state.exists ? 'gray.400' : 'warning'} mt={1} role="status">
          {state.exists
            ? `Balance ${formatTokenAmount(state.balance, decimals)}${state.frozen ? ' · frozen' : ''}`
            : 'No identity with this ID exists.'}
        </Text>
      ) : null}
    </Field>
  );
}
