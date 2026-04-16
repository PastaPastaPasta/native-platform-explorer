'use client';

import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface LookupInputProps {
  label: string;
  description?: string;
  placeholder?: string;
  /** Optional client-side validator. Return null when valid, a reason string
   *  when not. */
  validate?: (v: string) => string | null;
  /** Build the destination URL. Receives the trimmed input. */
  buildHref: (value: string) => string;
  buttonLabel?: string;
}

export function LookupInput({
  label,
  description,
  placeholder,
  validate,
  buildHref,
  buttonLabel = 'Open',
}: LookupInputProps) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const err = trimmed ? validate?.(trimmed) ?? null : null;
  const canSubmit = trimmed.length > 0 && !err;

  const submit = () => {
    if (!canSubmit) return;
    router.push(buildHref(trimmed));
  };

  return (
    <VStack align="stretch" spacing={1}>
      <FormControl isInvalid={!!err}>
        <FormLabel fontSize="xs" color="gray.250" mb={1}>
          {label}
        </FormLabel>
        <InputGroup size="sm">
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            fontFamily="mono"
            bg="gray.800"
            borderColor="gray.700"
            _focus={{ borderColor: 'brand.normal' }}
            pr="5rem"
          />
          <InputRightElement width="4.5rem">
            <Button size="xs" colorScheme="blue" onClick={submit} isDisabled={!canSubmit}>
              {buttonLabel}
            </Button>
          </InputRightElement>
        </InputGroup>
        {err ? <FormErrorMessage fontSize="xs">{err}</FormErrorMessage> : null}
      </FormControl>
      {description ? (
        <Text fontSize="xs" color="gray.400">
          {description}
        </Text>
      ) : null}
    </VStack>
  );
}
