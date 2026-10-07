'use client';

import { useEffect, useState } from 'react';
import { Button, FormControl, FormLabel, HStack, Input, Text, VStack } from '@chakra-ui/react';
import {
  MAX_SAVED_QUERIES,
  MAX_SAVED_QUERY_NAME_LENGTH,
  MAX_SAVED_QUERY_SQL_LENGTH,
  loadSavedQueries,
  saveSavedQueries,
  type SavedQuery,
} from '@util/query-workspace';

export function SavedQueries({
  network,
  contractId,
  sql,
  onLoad,
}: {
  network: string;
  contractId: string;
  sql: string;
  onLoad: (sql: string) => void;
}) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [message, setMessage] = useState('');
  const [loadedScope, setLoadedScope] = useState('');
  const scope = JSON.stringify([network, contractId]);
  const currentSaved = loadedScope === scope ? saved : [];
  useEffect(() => {
    setSaved(loadSavedQueries(network, contractId));
    setLoadedScope(scope);
    setName('');
    setMessage('');
  }, [network, contractId, scope]);

  function store(queries: SavedQuery[]) {
    if (!saveSavedQueries(network, contractId, queries)) {
      setMessage('Could not save queries. Browser storage may be unavailable or full.');
      return;
    }
    setSaved(queries);
    setMessage('Saved queries updated.');
  }

  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="xs" color="gray.400">
        Saved queries for {network} and the selected contract
      </Text>
      <Text fontSize="2xs" color="gray.500">
        Only queries you explicitly save are stored in this browser. Names and SQL include filter
        values; anyone using this browser profile can read them. Results are never saved.
      </Text>
      <FormControl>
        <FormLabel htmlFor="query-save-name" fontSize="xs" color="gray.400">
          Query name
        </FormLabel>
        <HStack flexWrap="wrap">
          <Input
            id="query-save-name"
            size="sm"
            maxW="280px"
            value={name}
            maxLength={MAX_SAVED_QUERY_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this query"
          />
          <Button
            size="sm"
            variant="outline"
            isDisabled={
              !name.trim() ||
              !sql.trim() ||
              !contractId ||
              sql.length > MAX_SAVED_QUERY_SQL_LENGTH ||
              (currentSaved.length >= MAX_SAVED_QUERIES &&
                !currentSaved.some((query) => query.name === name.trim()))
            }
            onClick={() =>
              store([
                ...currentSaved.filter((query) => query.name !== name.trim()),
                { name: name.trim(), sql },
              ])
            }
          >
            Save query
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={!currentSaved.length}
            onClick={() => store([])}
          >
            Clear saved queries for this contract
          </Button>
        </HStack>
      </FormControl>
      {currentSaved.map((query) => (
        <HStack key={query.name} spacing={2}>
          <Button size="xs" variant="outline" onClick={() => onLoad(query.sql)}>
            {query.name}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Delete saved query ${query.name}`}
            onClick={() => store(currentSaved.filter((entry) => entry.name !== query.name))}
          >
            Delete
          </Button>
        </HStack>
      ))}
      <Text fontSize="xs" color="gray.400" role="status">
        {message}
      </Text>
    </VStack>
  );
}
