'use client';

import { useEffect, useState } from 'react';
import { FormControl, FormLabel, Text, Textarea, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';

export interface RawBroadcastOptions {
  stHex: string;
}

const HEX_RE = /^[0-9a-fA-F]*$/;

export function RawBroadcastLabel() {
  return null;
}

export function StateTransitionBroadcastForm({
  onOptionsChange,
}: OperationFormProps<RawBroadcastOptions>) {
  const [hex, setHex] = useState('');
  const stripped = hex.replace(/\s+/g, '');
  const valid = stripped.length > 0 && stripped.length % 2 === 0 && HEX_RE.test(stripped);

  useEffect(() => {
    onOptionsChange(valid ? { stHex: stripped } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripped]);

  return (
    <VStack align="stretch" spacing={3}>
      <FormControl>
        <FormLabel fontSize="xs" color="gray.250">
          State transition (hex)
        </FormLabel>
        <Textarea
          size="sm"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          minH="160px"
        />
        {hex && !valid ? (
          <Text fontSize="xs" color="warning" mt={1}>
            Expected an even-length hex string.
          </Text>
        ) : null}
      </FormControl>
    </VStack>
  );
}
