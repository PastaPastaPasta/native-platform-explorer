'use client';

import { Box, Code, Text, Textarea } from '@chakra-ui/react';

/** Blank text means "no definitions"; anything else must be a JSON object. */
export function parseDefinitionsText(text: string): {
  definitions: Record<string, unknown> | null;
  error: string | null;
} {
  if (!text.trim()) return { definitions: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      definitions: null,
      error: `Definitions JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { definitions: null, error: 'Definitions must be a JSON object.' };
  }
  return {
    definitions: Object.keys(parsed).length > 0 ? (parsed as Record<string, unknown>) : null,
    error: null,
  };
}

export function ContractDefinitionsField({
  id,
  value,
  error,
  onChange,
  hint,
}: {
  id: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <Box>
      <Text as="label" htmlFor={id} fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
        Schema definitions (<Code fontSize="xs">$defs</Code>)
      </Text>
      <Textarea
        id={id}
        rows={6}
        fontFamily="mono"
        fontSize="xs"
        bg="gray.800"
        borderColor={error ? 'danger' : 'gray.700'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='{ "title": { "type": "string", "maxLength": 100 } }'
      />
      {error ? (
        <Text fontSize="xs" color="danger" mt={1}>
          {error}
        </Text>
      ) : (
        <Text fontSize="xs" color="gray.400" mt={1}>
          {hint} Reference a definition from a property with{' '}
          <Code fontSize="xs">{'{ "$ref": "#/$defs/name" }'}</Code>.
        </Text>
      )}
    </Box>
  );
}
