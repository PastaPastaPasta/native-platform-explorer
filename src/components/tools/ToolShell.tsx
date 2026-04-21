'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Grid,
  Heading,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { StateTransitionTool } from './StateTransitionTool';
import { ContractDeserializerTool } from './ContractDeserializerTool';
import { IdentityDeserializerTool } from './IdentityDeserializerTool';
import { DocumentDeserializerTool } from './DocumentDeserializerTool';

interface ToolDef {
  key: string;
  label: string;
  description: string;
  component: React.ComponentType;
}

const TOOLS: ToolDef[] = [
  {
    key: 'state-transition',
    label: 'State Transition',
    description: 'Deserialize a state transition from bytes',
    component: StateTransitionTool,
  },
  {
    key: 'contract',
    label: 'Contract',
    description: 'Deserialize a data contract from bytes',
    component: ContractDeserializerTool,
  },
  {
    key: 'document',
    label: 'Document',
    description: 'Deserialize a document (requires contract)',
    component: DocumentDeserializerTool,
  },
  {
    key: 'identity',
    label: 'Identity',
    description: 'Deserialize an identity from bytes',
    component: IdentityDeserializerTool,
  },
];

export function ToolShell() {
  const router = useRouter();
  const params = useSearchParams();
  const toolKey = params.get('tool') ?? '';

  const selected = TOOLS.find((t) => t.key === toolKey);
  const ToolComponent = selected?.component;

  const pickTool = (key: string) => {
    router.push(`/tools/?tool=${key}`);
  };

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={1}>
            <Heading size="md" color="gray.100">
              Tools
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Deserialize and inspect raw Dash Platform data structures.
              All decoding runs locally in the browser via WASM — no network required
              (except Document, which fetches its contract).
            </Text>
          </VStack>
        </InfoBlock>

        <Grid templateColumns={{ base: '1fr', md: '220px 1fr' }} gap={4}>
          <InfoBlock>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase" mb={2}>
              Deserializers
            </Text>
            <VStack align="stretch" spacing={1}>
              {TOOLS.map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={t.key === toolKey ? 'solid' : 'outline'}
                  colorScheme="blue"
                  onClick={() => pickTool(t.key)}
                >
                  {t.label}
                </Button>
              ))}
            </VStack>
          </InfoBlock>

          {ToolComponent ? (
            <ToolComponent />
          ) : (
            <InfoBlock>
              <VStack align="flex-start" spacing={2}>
                <Heading size="sm" color="gray.100">
                  Pick a tool
                </Heading>
                <Text fontSize="sm" color="gray.250">
                  Choose a deserializer from the sidebar to decode raw Platform data.
                </Text>
                <VStack align="stretch" spacing={1} pt={2} w="100%">
                  {TOOLS.map((t) => (
                    <Button
                      key={t.key}
                      size="sm"
                      variant="outline"
                      justifyContent="flex-start"
                      onClick={() => pickTool(t.key)}
                    >
                      <VStack align="flex-start" spacing={0}>
                        <Text fontSize="sm">{t.label}</Text>
                        <Text fontSize="xs" color="gray.400" fontWeight={400}>
                          {t.description}
                        </Text>
                      </VStack>
                    </Button>
                  ))}
                </VStack>
              </VStack>
            </InfoBlock>
          )}
        </Grid>
      </VStack>
    </Container>
  );
}
