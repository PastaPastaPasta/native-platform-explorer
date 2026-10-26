'use client';

import { useMemo, useState } from 'react';
import { Badge, Box, Button, Grid, HStack, Text, VStack } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { CodeBlock } from '@components/data/CodeBlock';
import { getIndicesForType } from '@util/schema';
import { toRecord } from '@util/contract';

type Json = Record<string, unknown>;

type Selection = { type: string; property?: string } | null;


function propertyType(def: unknown): string {
  const d = toRecord(def);
  if (!d) return '?';
  if (d.byteArray === true) return d.contentMediaType === 'application/x.dash.dpp.identifier' ? 'identifier' : 'bytes';
  return typeof d.type === 'string' ? d.type : '?';
}

/**
 * Document-type tree beside the JSON. Selecting a type shows its schema;
 * selecting a property shows only that property's fragment.
 */
export function SchemaNavigator({ schemas }: { schemas: Json | undefined }) {
  const types = useMemo(() => Object.keys(schemas ?? {}), [schemas]);
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(types.slice(0, 1)));

  const selectedSchema = selection ? toRecord(schemas?.[selection.type]) : undefined;
  const value = !selection
    ? schemas
    : selection.property
      ? toRecord(selectedSchema?.properties)?.[selection.property]
      : selectedSchema;
  const label = !selection ? 'All document types' : selection.property ? `${selection.type}.${selection.property}` : selection.type;

  const toggle = (type: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  if (types.length === 0) {
    return <CodeBlock value={schemas ?? {}} />;
  }

  return (
    <Grid templateColumns={{ base: '1fr', lg: 'minmax(220px, 280px) 1fr' }} gap={4} alignItems="start">
      <Box as="nav" aria-label="Document types" border="1px solid" borderColor="gray.750" borderRadius="xl" p={2} maxH="560px" overflowY="auto">
        <Button
          size="xs"
          variant={selection === null ? 'solid' : 'ghost'}
          colorScheme="blue"
          w="full"
          justifyContent="flex-start"
          onClick={() => setSelection(null)}
          mb={1}
        >
          All types ({types.length})
        </Button>
        <VStack align="stretch" spacing={0}>
          {types.map((type) => {
            const schema = toRecord(schemas?.[type]);
            const props = Object.entries(toRecord(schema?.properties) ?? {});
            const required = new Set(Array.isArray(schema?.required) ? (schema.required as string[]) : []);
            const indices = getIndicesForType(schema);
            const open = expanded.has(type);
            const active = selection?.type === type && !selection.property;
            return (
              <Box key={type}>
                <HStack spacing={0}>
                  <Button
                    size="xs"
                    variant="ghost"
                    px={1}
                    minW={6}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${type}`}
                    aria-expanded={open}
                    onClick={() => toggle(type)}
                  >
                    {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </Button>
                  <Button
                    size="xs"
                    variant={active ? 'solid' : 'ghost'}
                    colorScheme="blue"
                    flex={1}
                    justifyContent="space-between"
                    fontFamily="mono"
                    onClick={() => setSelection({ type })}
                  >
                    <Text as="span" isTruncated>{type}</Text>
                    <Text as="span" color="gray.400" fontSize="2xs" ml={2}>
                      {props.length} props · {indices.length} idx
                    </Text>
                  </Button>
                </HStack>
                {open ? (
                  <VStack align="stretch" spacing={0} pl={7} pb={1}>
                    {props.map(([name, def]) => (
                      <Button
                        key={name}
                        size="xs"
                        variant={selection?.type === type && selection.property === name ? 'solid' : 'ghost'}
                        colorScheme="blue"
                        justifyContent="space-between"
                        fontFamily="mono"
                        fontWeight={400}
                        onClick={() => setSelection({ type, property: name })}
                      >
                        <Text as="span" isTruncated>
                          {name}
                          {required.has(name) ? <Text as="span" color="orange.300">*</Text> : null}
                        </Text>
                        <Text as="span" color="gray.400" fontSize="2xs" ml={2}>{propertyType(def)}</Text>
                      </Button>
                    ))}
                    {indices.map((idx) => (
                      <HStack key={idx.name} px={2} py={0.5} spacing={1} fontSize="2xs" color="gray.400" flexWrap="wrap">
                        <Badge variant="outline" fontSize="2xs" colorScheme={idx.unique ? 'purple' : 'gray'}>
                          {idx.unique ? 'unique' : 'index'}
                        </Badge>
                        <Text fontFamily="mono">
                          {idx.name}: {idx.properties.map((p) => `${p.field}${p.order === 'desc' ? '↓' : ''}`).join(', ')}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                ) : null}
              </Box>
            );
          })}
        </VStack>
        <Text fontSize="2xs" color="gray.500" px={2} pt={2}>
          <Text as="span" color="orange.300">*</Text> required · ↓ descending index order
        </Text>
      </Box>
      <VStack align="stretch" spacing={2} minW={0}>
        <Text fontSize="xs" color="gray.400" fontFamily="mono">{label}</Text>
        <CodeBlock value={value ?? {}} />
      </VStack>
    </Grid>
  );
}
