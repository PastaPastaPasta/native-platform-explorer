'use client';

import { HStack, Badge } from '@chakra-ui/react';
import type { TokenCapability } from '@util/token-rules';

export interface TokenFlags {
  mintable?: TokenCapability;
  burnable?: TokenCapability;
  freezable?: TokenCapability;
  unfreezable?: TokenCapability;
  destroyable?: TokenCapability;
  emergencyAction?: TokenCapability;
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
  // Off capabilities are omitted; one whose rule cannot be read is shown as unknown.
  const entries = Object.entries(flags).filter(([, v]) => v === true || v === 'unknown') as Array<
    [keyof TokenFlags, true | 'unknown']
  >;
  if (entries.length === 0) return null;
  return (
    <HStack spacing={2} flexWrap="wrap">
      {entries.map(([k, v]) => (
        <Badge
          key={k}
          colorScheme={v === 'unknown' ? 'gray' : FLAG_META[k].color}
          variant={v === 'unknown' ? 'outline' : 'subtle'}
          fontSize="2xs"
          textTransform="none"
          title={v === 'unknown' ? 'The explorer could not read who may perform this action.' : undefined}
        >
          {v === 'unknown' ? `${FLAG_META[k].label}: unknown` : FLAG_META[k].label}
        </Badge>
      ))}
    </HStack>
  );
}
