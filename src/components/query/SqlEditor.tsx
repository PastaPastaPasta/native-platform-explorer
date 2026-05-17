'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Textarea,
  Text,
  Code,
} from '@chakra-ui/react';

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  parseError?: { message: string; position: number } | null;
  isLoading?: boolean;
}

export function SqlEditor({ value, onChange, onRun, parseError, isLoading }: SqlEditorProps) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => { setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent)); }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onRun();
      }
    },
    [onRun],
  );

  return (
    <FormControl>
      <FormLabel fontSize="xs" color="gray.400" mb={1}>
        SQL Query
      </FormLabel>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' ORDER BY normalizedLabel ASC LIMIT 25`}
        fontFamily="mono"
        fontSize="sm"
        bg="gray.800"
        borderColor="gray.700"
        color="gray.100"
        minH="100px"
        resize="vertical"
        _placeholder={{ color: 'gray.500' }}
        _hover={{ borderColor: 'gray.600' }}
        _focus={{ borderColor: 'brand.normal', boxShadow: '0 0 0 1px rgba(0,141,228,0.3)' }}
      />
      <HStack mt={2} justify="space-between" align="flex-start">
        <Box flex={1}>
          {parseError && (
            <Box>
              <Text fontSize="xs" color="red.300" mb={1}>
                {parseError.message}
              </Text>
              {value && (
                <Code
                  display="block"
                  fontSize="2xs"
                  bg="rgba(255,0,0,0.08)"
                  color="gray.300"
                  p={2}
                  borderRadius="md"
                  whiteSpace="pre"
                  overflowX="auto"
                >
                  {value}
                  {'\n'}
                  {' '.repeat(Math.max(0, parseError.position))}^
                </Code>
              )}
            </Box>
          )}
        </Box>
        <Button
          colorScheme="blue"
          size="sm"
          onClick={onRun}
          isLoading={isLoading}
          flexShrink={0}
        >
          Run
        </Button>
      </HStack>
      <Text fontSize="2xs" color="gray.500" mt={1}>
        {isMac ? '⌘' : 'Ctrl'}+Enter to run
      </Text>
    </FormControl>
  );
}
