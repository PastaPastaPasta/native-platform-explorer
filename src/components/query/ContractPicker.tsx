'use client';

import { useMemo } from 'react';
import {
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Tag,
  Text,
} from '@chakra-ui/react';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { shortId } from '@util/identifier';

export interface ContractPickerProps {
  contractId: string;
  onChange: (id: string) => void;
  resolvedAlias?: string;
}

export function ContractPicker({ contractId, onChange, resolvedAlias }: ContractPickerProps) {
  const matchedContract = useMemo(
    () => SYSTEM_DATA_CONTRACTS.find((c) => c.testnetId === contractId),
    [contractId],
  );

  const isKnown = !!matchedContract;

  return (
    <FormControl>
      <FormLabel fontSize="xs" color="gray.400" mb={1}>
        Data Contract
      </FormLabel>
      <HStack spacing={2}>
        <Select
          size="sm"
          bg="gray.800"
          borderColor="gray.700"
          color="gray.100"
          fontFamily="mono"
          fontSize="xs"
          maxW="280px"
          value={isKnown ? contractId : '__custom__'}
          onChange={(e) => {
            onChange(e.target.value === '__custom__' ? '' : e.target.value);
          }}
          _hover={{ borderColor: 'gray.600' }}
        >
          {SYSTEM_DATA_CONTRACTS.filter((c) => c.testnetId).map((c) => (
            <option key={c.key} value={c.testnetId}>
              {c.name} ({c.key})
            </option>
          ))}
          <option value="__custom__">Custom contract ID…</option>
        </Select>
        {!isKnown && (
          <Input
            size="sm"
            bg="gray.800"
            borderColor="gray.700"
            color="gray.100"
            fontFamily="mono"
            fontSize="xs"
            placeholder="Paste contract ID (base58)"
            value={contractId}
            onChange={(e) => onChange(e.target.value)}
            flex={1}
            _hover={{ borderColor: 'gray.600' }}
          />
        )}
        {resolvedAlias && (
          <Tag size="sm" colorScheme="blue" flexShrink={0}>
            via FROM alias
          </Tag>
        )}
      </HStack>
      {matchedContract && (
        <Text fontSize="2xs" color="gray.500" mt={1}>
          {matchedContract.description} — {shortId(contractId)}
        </Text>
      )}
    </FormControl>
  );
}
