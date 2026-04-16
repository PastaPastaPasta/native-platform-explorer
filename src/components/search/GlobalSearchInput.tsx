'use client';

import { useState, type FormEvent } from 'react';
import { Input, InputGroup, InputLeftElement, Box } from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/navigation';

export interface GlobalSearchInputProps {
  width?: string;
  autoFocus?: boolean;
}

export function GlobalSearchInput({ width = '15rem', autoFocus }: GlobalSearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    router.push(`/search/?q=${encodeURIComponent(q)}`);
  };

  return (
    <Box as="form" onSubmit={onSubmit} width={width}>
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.400" boxSize={3} />
        </InputLeftElement>
        <Input
          aria-label="Search"
          placeholder="Identity · contract · token · DPNS …"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          fontSize="sm"
          borderRadius="full"
          bg="gray.800"
          borderColor="gray.700"
          _hover={{ borderColor: 'gray.600' }}
          _focus={{ borderColor: 'brand.normal' }}
        />
      </InputGroup>
    </Box>
  );
}
