'use client';

import { useCallback, useState } from 'react';
import { Badge, FormControl, FormLabel, HStack, Text, Textarea } from '@chakra-ui/react';
import { decodeInput } from '@util/decode-input';

export interface DeserializerInputProps {
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  onDecode: (bytes: Uint8Array | null) => void;
}

export function DeserializerInput({
  label = 'Input (hex, base64, or comma-separated bytes)',
  placeholder = 'Paste hex, base64, or comma-separated byte values…',
  disabled,
  onDecode,
}: DeserializerInputProps) {
  const [raw, setRaw] = useState('');
  const [format, setFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setRaw(value);
      if (!value.trim()) {
        setFormat(null);
        setError(null);
        onDecode(null);
        return;
      }
      const result = decodeInput(value);
      if (result.ok) {
        setFormat(result.format);
        setError(null);
        onDecode(result.bytes);
      } else {
        setFormat(null);
        setError(result.error);
        onDecode(null);
      }
    },
    [onDecode],
  );

  return (
    <FormControl isDisabled={disabled}>
      <HStack spacing={2} mb={1}>
        <FormLabel fontSize="xs" color="gray.250" mb={0}>
          {label}
        </FormLabel>
        {format ? (
          <Badge colorScheme="blue" fontSize="2xs" variant="subtle">
            {format.toUpperCase()}
          </Badge>
        ) : null}
      </HStack>
      <Textarea
        size="sm"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
        minH="160px"
        isDisabled={disabled}
      />
      {error ? (
        <Text fontSize="xs" color="red.300" mt={1}>
          {error}
        </Text>
      ) : null}
    </FormControl>
  );
}
