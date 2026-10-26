'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Input, InputGroup, InputLeftElement, InputRightElement, Text } from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/navigation';
import { useSdk } from '@sdk/hooks';
import { withNetwork } from '@util/exploration';
import { classifyQuery, type SearchCandidate } from '@util/search';
import { useDebouncedValue } from '@hooks/useDebouncedValue';

export const SEARCH_DEBOUNCE_MS = 200;

const KIND_HINT: Record<SearchCandidate['kind'], string> = {
  epoch: 'epoch',
  identity: 'ID',
  contract: 'ID',
  token: 'ID',
  stateTransition: 'hash',
  evonode: 'hash',
  address: 'address',
  identityByPkh: 'key hash',
  dpnsName: 'name',
  dpnsPrefix: 'name',
};

/** Short label for what a query looks like, e.g. "ID" or "hash". */
export function searchHint(query: string): string | null {
  const candidates = classifyQuery(query).candidates;
  if (candidates.length === 0) return query.trim() ? 'no match' : null;
  return [...new Set(candidates.map((c) => KIND_HINT[c.kind]))].join(' · ');
}

export interface GlobalSearchInputProps {
  width?: string;
  autoFocus?: boolean;
  initialValue?: string;
}

export function GlobalSearchInput({ width = '100%', autoFocus, initialValue = '' }: GlobalSearchInputProps) {
  const router = useRouter();
  const { network } = useSdk();
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  // Classify as the user types, but only once typing pauses.
  const debounced = useDebouncedValue(value, SEARCH_DEBOUNCE_MS);
  const hint = useMemo(() => searchHint(debounced), [debounced]);
  const hintId = useId();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const q = value.trim();
    if (q.length === 0) return;
    router.push(withNetwork(`/search/?q=${encodeURIComponent(q)}`, network));
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
          aria-describedby={hint ? hintId : undefined}
          pr={hint ? '5.5rem' : undefined}
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
        {hint ? (
          <InputRightElement width="auto" pr={2} pointerEvents="none">
            <Text id={hintId} fontSize="10px" fontFamily="mono" color="muted" whiteSpace="nowrap">
              {hint}
            </Text>
          </InputRightElement>
        ) : null}
      </InputGroup>
    </form>
  );
}
