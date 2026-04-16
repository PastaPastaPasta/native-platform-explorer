'use client';

import { HStack, Badge } from '@chakra-ui/react';

export interface TokenFlags {
  mintable?: boolean;
  burnable?: boolean;
  freezable?: boolean;
  unfreezable?: boolean;
  destroyable?: boolean;
  emergencyAction?: boolean;
}

const FLAG_META: Record<
  keyof TokenFlags,
  { label: string; color: string }
> = {
  mintable: { label: 'mintable', color: 'green' },
  burnable: { label: 'burnable', color: 'orange' },
  freezable: { label: 'freezable', color: 'blue' },
  unfreezable: { label: 'unfreezable', color: 'blue' },
  destroyable: { label: 'destroyable', color: 'red' },
  emergencyAction: { label: 'emergency-action', color: 'red' },
};

export function TokenFlagsPills({ flags }: { flags: TokenFlags }) {
  const entries = Object.entries(flags).filter(([, v]) => v === true) as Array<
    [keyof TokenFlags, boolean]
  >;
  if (entries.length === 0) return null;
  return (
    <HStack spacing={2} flexWrap="wrap">
      {entries.map(([k]) => (
        <Badge
          key={k}
          colorScheme={FLAG_META[k].color}
          variant="subtle"
          fontSize="2xs"
          textTransform="none"
        >
          {FLAG_META[k].label}
        </Badge>
      ))}
    </HStack>
  );
}
