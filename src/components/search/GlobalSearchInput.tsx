'use client';

import { useState, type FormEvent } from 'react';
import { Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/navigation';

export interface GlobalSearchInputProps {
  width?: string;
  autoFocus?: boolean;
}

export function GlobalSearchInput({ width = '100%', autoFocus }: GlobalSearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState('');

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const q = value.trim();
    if (q.length === 0) return;
    router.push(`/search/?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={onSubmit} action="#" style={{ width }} role="search">
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="muted" boxSize={3} />
        </InputLeftElement>
        <Input
          type="search"
          name="q"
          aria-label="Search"
          placeholder="identity · contract · token · DPNS · hash"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          fontFamily="mono"
          fontSize="12px"
          borderRadius="card"
          bg="raised"
          borderColor="hairline"
          color="ink"
          _placeholder={{ color: 'muted' }}
          _hover={{ borderColor: 'hairlineStrong' }}
          _focusVisible={{ borderColor: 'accent', boxShadow: 'none' }}
        />
      </InputGroup>
    </form>
  );
}
