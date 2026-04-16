'use client';

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { useBreadcrumbs } from '@contexts/BreadcrumbsContext';

export function Breadcrumbs() {
  const { items } = useBreadcrumbs();
  if (items.length === 0) return null;

  return (
    <Breadcrumb
      separator={<ChevronRightIcon color="gray.400" boxSize={3} />}
      fontSize="sm"
      color="gray.250"
      spacing="6px"
      my={3}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <BreadcrumbItem key={`${item.label}-${idx}`} isCurrentPage={isLast}>
            {item.href && !isLast ? (
              <BreadcrumbLink
                as={NextLink}
                href={item.href}
                color="brand.normal"
                _hover={{ color: 'brand.light' }}
              >
                {item.label}
              </BreadcrumbLink>
            ) : (
              <Text color={isLast ? 'gray.100' : 'gray.250'}>{item.label}</Text>
            )}
          </BreadcrumbItem>
        );
      })}
    </Breadcrumb>
  );
}
