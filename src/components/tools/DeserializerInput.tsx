'use client';

import { useCallback, useState } from 'react';
import { Badge, Box, HStack, Text, Textarea } from '@chakra-ui/react';
import { decodeInput } from '@util/decode-input';

export interface DeserializerInputProps {
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  onDecode: (bytes: Uint8Array | null) => void;
}

export function DeserializerInput({
  label = 'Input',
  placeholder = 'Paste hex, base64, or comma-separated byte values…',
  disabled,
  onDecode,
}: DeserializerInputProps) {
  const [raw, setRaw] = useState('');
  const [format, setFormat] = useState<string | null>(null);
  const [byteLen, setByteLen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setRaw(value);
      if (!value.trim()) {
        setFormat(null);
        setByteLen(null);
        setError(null);
        onDecode(null);
        return;
      }
      const result = decodeInput(value);
      if (result.ok) {
        setFormat(result.format);
        setByteLen(result.bytes.length);
        setError(null);
        onDecode(result.bytes);
      } else {
        setFormat(null);
        setByteLen(null);
        setError(result.error);
        onDecode(null);
      }
    },
    [onDecode],
  );

  return (
    <Box
      borderRadius="xl"
      border="1px solid"
      borderColor={error ? 'rgba(244,88,88,0.3)' : raw ? 'rgba(0,141,228,0.2)' : 'rgba(255,255,255,0.08)'}
      overflow="hidden"
      transition="border-color 0.2s ease"
      opacity={disabled ? 0.5 : 1}
    >
      <HStack
        px={4}
        py={2}
        bg="rgba(24,31,34,0.6)"
        borderBottom="1px solid"
        borderColor="rgba(255,255,255,0.06)"
        justify="space-between"
      >
        <HStack spacing={2}>
          <Text fontSize="xs" color="gray.400" fontWeight={500}>
            {label}
          </Text>
          {format ? (
            <Badge colorScheme="blue" fontSize="2xs" variant="subtle">
              {format.toUpperCase()}
            </Badge>
          ) : null}
        </HStack>
        {byteLen !== null ? (
          <Text fontSize="2xs" color="gray.500" fontFamily="mono">
            {byteLen} bytes
          </Text>
        ) : null}
      </HStack>

      <Textarea
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        fontFamily="mono"
        fontSize="xs"
        bg="rgba(24,29,32,0.8)"
        color="gray.100"
        border="none"
        borderRadius={0}
        minH="140px"
        p={4}
        resize="vertical"
        isDisabled={disabled}
        _focus={{ boxShadow: 'none' }}
        _placeholder={{ color: 'gray.600' }}
      />

      {error ? (
        <HStack px={4} py={2} bg="rgba(244,88,88,0.06)" borderTop="1px solid" borderColor="rgba(244,88,88,0.15)">
          <Text fontSize="xs" color="red.300">
            {error}
          </Text>
        </HStack>
      ) : null}
    </Box>
  );
}
