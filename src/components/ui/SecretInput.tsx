'use client';

import { useEffect, useState } from 'react';
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
  // Without CSS masking, a single-line field falls back to a password input:
  // a possible save prompt is better than a key shown in plain text.
  const [cssMask, setCssMask] = useState(true);
  useEffect(
    () => setCssMask(typeof CSS !== 'undefined' && CSS.supports?.('-webkit-text-security', 'disc')),
    [],
  );
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
        <Input {...(field as InputProps)} type={cssMask || revealed ? 'text' : 'password'} />
      )}
      <Button
        position="absolute"
        top={1}
        right={1}
        zIndex={1}
        size="xs"
        variant="ghost"
        aria-label={`Show ${props['aria-label']}`}
        aria-pressed={revealed}
        // Keep focus in the field, so toggling does not fire its blur handler.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setRevealed((value) => !value)}
      >
        {revealed ? 'Hide' : 'Show'}
      </Button>
    </Box>
  );
}
