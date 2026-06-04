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
  /** Optional client-side validator. Return null when valid, a reason string when not. */
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
        <FormLabel
          fontSize="xs"
          color="muted"
          mb={1}
          textTransform="uppercase"
          letterSpacing="0.08em"
        >
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
            bg="raised"
            borderColor="hairline"
            borderRadius="card"
            _hover={{ borderColor: 'hairlineStrong' }}
            _focusVisible={{
              borderColor: 'accent',
              boxShadow: 'none',
            }}
            pr="5rem"
          />
          <InputRightElement width="4.5rem">
            <Button
              size="xs"
              variant="ghost"
              color="accent"
              fontFamily="mono"
              fontSize="11px"
              onClick={submit}
              isDisabled={!canSubmit}
            >
              {buttonLabel}
            </Button>
          </InputRightElement>
        </InputGroup>
        {err ? <FormErrorMessage fontSize="xs">{err}</FormErrorMessage> : null}
      </FormControl>
      {description ? (
        <Text fontSize="xs" color="muted">
          {description}
        </Text>
      ) : null}
    </VStack>
  );
}
