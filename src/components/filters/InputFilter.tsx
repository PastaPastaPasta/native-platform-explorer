'use client';

import { FormControl, FormErrorMessage, FormLabel, Input } from '@chakra-ui/react';

export interface InputFilterProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  validate?: (v: string) => string | null;
}

export function InputFilter({ label, value, onChange, placeholder, validate }: InputFilterProps) {
  const err = value ? validate?.(value) ?? null : null;
  return (
    <FormControl isInvalid={!!err}>
      <FormLabel fontSize="xs" color="gray.250" mb={1}>
        {label}
      </FormLabel>
      <Input
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
        _focus={{ borderColor: 'brand.normal' }}
      />
      {err ? <FormErrorMessage fontSize="xs">{err}</FormErrorMessage> : null}
    </FormControl>
  );
}
