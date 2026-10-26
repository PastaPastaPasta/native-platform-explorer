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
  isDisabled?: boolean;
  onCancel?: () => void;
}

/** Locate a parse-error offset as a 1-based line/column plus the caret line,
 *  copying tabs from the source so the caret lines up under the offending text. */
export function errorCaret(sql: string, position: number): { line: number; column: number; text: string; caret: string } {
  const offset = Math.min(Math.max(0, position), sql.length);
  const lineStart = sql.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = sql.indexOf('\n', offset);
  const text = sql.slice(lineStart, lineEnd === -1 ? sql.length : lineEnd).replace(/\r$/, '');
  const before = sql.slice(lineStart, offset);
  return {
    line: sql.slice(0, lineStart).split('\n').length,
    column: before.length + 1,
    text,
    caret: `${before.replace(/[^\t]/g, ' ')}^`,
  };
}

export function SqlEditor({
  value,
  onChange,
  onRun,
  parseError,
  isLoading,
  isDisabled,
  onCancel,
}: SqlEditorProps) {
  const [isMac, setIsMac] = useState(false);
  const caret = parseError && value ? errorCaret(value, parseError.position) : null;
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isDisabled && !isLoading && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onRun();
      }
    },
    [onRun, isDisabled, isLoading],
  );

  return (
    <FormControl>
      <FormLabel htmlFor="query-sql" fontSize="xs" color="gray.400" mb={1}>
        SQL Query
      </FormLabel>
      <Textarea
        id="query-sql"
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
              {caret && (
                <>
                  {value.includes('\n') && (
                    <Text fontSize="2xs" color="gray.400" mb={1}>
                      Line {caret.line}, column {caret.column}
                    </Text>
                  )}
                  <Code
                    data-testid="sql-error-caret"
                    display="block"
                    fontSize="2xs"
                    bg="rgba(255,0,0,0.08)"
                    color="gray.300"
                    p={2}
                    borderRadius="md"
                    whiteSpace="pre"
                    overflowX="auto"
                  >
                    {caret.text}
                    {'\n'}
                    {caret.caret}
                  </Code>
                </>
              )}
            </Box>
          )}
        </Box>
        <Button
          colorScheme="blue"
          size="sm"
          onClick={onRun}
          isDisabled={isDisabled || isLoading || !value.trim()}
          flexShrink={0}
        >
          Run
        </Button>
        {isLoading && onCancel && (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel run
          </Button>
        )}
      </HStack>
      <Text fontSize="2xs" color="gray.500" mt={1}>
        {isMac ? '⌘' : 'Ctrl'}+Enter to run
      </Text>
    </FormControl>
  );
}
