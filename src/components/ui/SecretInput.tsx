'use client';

import { useState } from 'react';
import { Box, Button, Input, Textarea, type InputProps, type TextareaProps } from '@chakra-ui/react';

// Private keys and mnemonics are typed into text fields masked with CSS, not
// `type="password"`: browsers ignore autocomplete="off" when offering to save a
// password, and a password field that disappears on submit looks like a login.
// The data attributes ask 1Password, LastPass and Dashlane to skip the field.
const SECRET_FIELD_ATTRIBUTES = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;

type SecretInputProps =
  | ({ multiline?: false; 'aria-label': string } & Omit<InputProps, 'type'>)
  | ({ multiline: true; 'aria-label': string } & TextareaProps);

/** A text field for private key material: masked, with a show/hide toggle. */
export function SecretInput({ multiline, mt, ...props }: SecretInputProps) {
  const [revealed, setRevealed] = useState(false);
  const field = {
    ...props,
    ...SECRET_FIELD_ATTRIBUTES,
    pr: 16,
    sx: { WebkitTextSecurity: revealed ? 'none' : 'disc' },
  };
  return (
    <Box position="relative" mt={mt}>
      {multiline ? (
        <Textarea {...(field as TextareaProps)} />
      ) : (
        <Input {...(field as InputProps)} type="text" />
      )}
      <Button
        position="absolute"
        top={1}
        right={1}
        zIndex={1}
        size="xs"
        variant="ghost"
        aria-label={`${revealed ? 'Hide' : 'Show'} ${props['aria-label']}`}
        aria-pressed={revealed}
        onClick={() => setRevealed((value) => !value)}
      >
        {revealed ? 'Hide' : 'Show'}
      </Button>
    </Box>
  );
}
