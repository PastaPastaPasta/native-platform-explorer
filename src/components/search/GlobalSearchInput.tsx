'use client';

import { useState, type FormEvent } from 'react';
import { Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/navigation';

export interface GlobalSearchInputProps {
  width?: string;
  autoFocus?: boolean;
}

export function GlobalSearchInput({ width = '15rem', autoFocus }: GlobalSearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState('');

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const q = value.trim();
    if (q.length === 0) return;
    router.push(`/search/?q=${encodeURIComponent(q)}`);
  };

  // Real <form> element (not Chakra's Box as="form") so React binds onSubmit
  // to the native form's submit event and preventDefault reliably fires.
  // action='javascript:void(0)' is an extra safety net for the case where
  // something prevents React from handling the submit synthetically.
  return (
    <form onSubmit={onSubmit} action="#" style={{ width }} role="search">
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.400" boxSize={3} />
        </InputLeftElement>
        <Input
          type="search"
          name="q"
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
    </form>
  );
}
