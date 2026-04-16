'use client';

import { FormControl, FormLabel, HStack, Input } from '@chakra-ui/react';

export interface RangeFilterProps {
  label: string;
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}

export function RangeFilter({ label, min, max, onMinChange, onMaxChange }: RangeFilterProps) {
  return (
    <FormControl>
      <FormLabel fontSize="xs" color="gray.250" mb={1}>
        {label}
      </FormLabel>
      <HStack>
        <Input
          size="sm"
          type="number"
          placeholder="min"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
        <Input
          size="sm"
          type="number"
          placeholder="max"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          bg="gray.800"
          borderColor="gray.700"
        />
      </HStack>
    </FormControl>
  );
}
