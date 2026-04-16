'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';

export interface TallySegment {
  label: string;
  count: number;
  color: string; // Chakra color token
}

export interface VoteTallyBarProps {
  segments: TallySegment[];
  total?: number;
  variant?: 'contested' | 'protocol';
}

export function VoteTallyBar({ segments, total, variant = 'contested' }: VoteTallyBarProps) {
  const sum = total ?? segments.reduce((a, s) => a + s.count, 0);
  const safeSum = sum > 0 ? sum : 1;

  return (
    <VStack align="stretch" spacing={2} width="100%">
      <HStack
        as="div"
        height="10px"
        width="100%"
        bg="gray.800"
        borderRadius="full"
        overflow="hidden"
        spacing={0}
      >
        {segments.map((s) => {
          const pct = Math.max(0, (s.count / safeSum) * 100);
          return (
            <Box
              key={s.label}
              width={`${pct}%`}
              height="100%"
              bg={s.color}
              opacity={variant === 'protocol' ? 0.85 : 0.9}
              transition="width 200ms ease-in-out"
            />
          );
        })}
      </HStack>
      <HStack spacing={4} flexWrap="wrap" justify="flex-start">
        {segments.map((s) => {
          const pct = sum > 0 ? ((s.count / sum) * 100).toFixed(1) : '0.0';
          return (
            <HStack key={s.label} spacing={2}>
              <Box width="10px" height="10px" bg={s.color} borderRadius="sm" />
              <Text fontSize="xs" color="gray.250">
                {s.label}: <Text as="span" fontFamily="mono" color="gray.100">{s.count}</Text>{' '}
                <Text as="span" color="gray.400">({pct}%)</Text>
              </Text>
            </HStack>
          );
        })}
        <Text fontSize="xs" color="gray.400">
          Total: <Text as="span" fontFamily="mono" color="gray.250">{sum}</Text>
        </Text>
      </HStack>
    </VStack>
  );
}
