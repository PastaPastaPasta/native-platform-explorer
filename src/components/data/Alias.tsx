'use client';

import { Badge, HStack, Text, Tooltip } from '@chakra-ui/react';
import NextLink from 'next/link';

export type AliasStatus = 'ok' | 'contested' | 'pending' | 'unknown';

export interface AliasProps {
  name: string;
  status?: AliasStatus;
  href?: string;
  size?: 'xs' | 'sm' | 'md';
}

const STATUS_META: Record<AliasStatus, { color: string; label: string; tooltip: string }> = {
  ok: { color: 'success', label: '', tooltip: 'Registered DPNS name' },
  contested: {
    color: 'warning',
    label: 'contested',
    tooltip: 'Registration is being contested by multiple identities',
  },
  pending: { color: 'gray.400', label: 'pending', tooltip: 'Resolving …' },
  unknown: { color: 'gray.400', label: '', tooltip: 'Status unknown' },
};

export function Alias({ name, status = 'ok', href, size = 'sm' }: AliasProps) {
  const meta = STATUS_META[status];
  const body = (
    <HStack
      as="span"
      spacing={1.5}
      px={2}
      py={0.5}
      bg="gray.800"
      borderRadius="full"
      border="1px solid"
      borderColor="gray.750"
      fontSize={size}
      fontFamily="body"
    >
      <Text as="span" color="brand.light" fontWeight={600}>
        {name}
      </Text>
      {meta.label ? (
        <Badge bg="transparent" color={meta.color} fontSize="2xs" textTransform="none">
          {meta.label}
        </Badge>
      ) : null}
    </HStack>
  );

  const tooltipped = (
    <Tooltip label={meta.tooltip} hasArrow>
      {href ? (
        <HStack as={NextLink} href={href} _hover={{ opacity: 0.85 }} spacing={0}>
          {body}
        </HStack>
      ) : (
        body
      )}
    </Tooltip>
  );

  return tooltipped;
}
