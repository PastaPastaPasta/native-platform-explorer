'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Heading,
  HStack,
  SimpleGrid,
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
  icon: React.ReactNode;
  offline: boolean;
  component: React.ComponentType;
}

function IconST() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M6 8h16M6 14h10M6 20h13" stroke="rgba(0,141,228,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 13l4 4-4 4" stroke="rgba(44,187,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconContract() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="4" y="4" width="20" height="20" rx="3" stroke="rgba(0,141,228,0.7)" strokeWidth="1.5" />
      <path d="M9 10h10M9 14h6M9 18h8" stroke="rgba(44,187,255,0.9)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M8 4h8l6 6v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="rgba(0,141,228,0.7)" strokeWidth="1.5" />
      <path d="M16 4v6h6" stroke="rgba(0,141,228,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 16h8M10 20h5" stroke="rgba(44,187,255,0.9)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconIdentity() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="11" r="4" stroke="rgba(0,141,228,0.7)" strokeWidth="1.5" />
      <path d="M7 23c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="rgba(44,187,255,0.9)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const TOOLS: ToolDef[] = [
  {
    key: 'state-transition',
    label: 'State Transition',
    description: 'Decode state transitions — identity creates, contract updates, document batches, and more.',
    icon: <IconST />,
    offline: true,
    component: StateTransitionTool,
  },
  {
    key: 'contract',
    label: 'Data Contract',
    description: 'Decode a data contract to inspect its document schemas, tokens, and groups.',
    icon: <IconContract />,
    offline: true,
    component: ContractDeserializerTool,
  },
  {
    key: 'document',
    label: 'Document',
    description: 'Decode a document with its contract context. Fetches the contract from the network.',
    icon: <IconDocument />,
    offline: false,
    component: DocumentDeserializerTool,
  },
  {
    key: 'identity',
    label: 'Identity',
    description: 'Decode an identity to inspect its keys, balance, and revision.',
    icon: <IconIdentity />,
    offline: true,
    component: IdentityDeserializerTool,
  },
];

function ToolCard({
  tool,
  onClick,
}: {
  tool: ToolDef;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      gap={3}
      p={{ base: 5, md: 6 }}
      borderRadius="block"
      border="1px solid"
      borderColor="rgba(255,255,255,0.08)"
      bg="linear-gradient(135deg, rgba(24,31,34,0.35) 0%, rgba(24,31,34,0.18) 100%)"
      sx={{ backdropFilter: 'blur(44px)' }}
      transition="all 0.25s ease"
      _hover={{
        borderColor: 'rgba(0,141,228,0.35)',
        boxShadow: '0 0 0 1px rgba(0,141,228,0.15), 0 8px 32px rgba(0,141,228,0.08)',
        transform: 'translateY(-2px)',
      }}
      _active={{ transform: 'translateY(0)' }}
      cursor="pointer"
      textAlign="left"
      w="100%"
    >
      <HStack spacing={3} w="100%">
        <Box flexShrink={0}>{tool.icon}</Box>
        <VStack align="flex-start" spacing={0} flex={1}>
          <Text fontSize="sm" fontWeight={600} color="gray.100">
            {tool.label}
          </Text>
          <Text fontSize="2xs" color={tool.offline ? 'gray.500' : 'brand.normal'} fontWeight={500}>
            {tool.offline ? 'offline' : 'network'}
          </Text>
        </VStack>
      </HStack>
      <Text fontSize="xs" color="gray.400" lineHeight="1.5">
        {tool.description}
      </Text>
    </Box>
  );
}

function ToolTabBar({
  tools,
  activeKey,
  onSelect,
}: {
  tools: ToolDef[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <HStack
      spacing={1}
      p={1}
      borderRadius="xl"
      bg="rgba(24,31,34,0.5)"
      border="1px solid"
      borderColor="rgba(255,255,255,0.06)"
      overflowX="auto"
      flexShrink={0}
      sx={{
        backdropFilter: 'blur(20px)',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {tools.map((t) => {
        const active = t.key === activeKey;
        return (
          <Box
            as="button"
            key={t.key}
            onClick={() => onSelect(t.key)}
            px={4}
            py={2}
            borderRadius="lg"
            fontSize="xs"
            fontWeight={active ? 600 : 500}
            color={active ? 'gray.100' : 'gray.400'}
            bg={active ? 'rgba(0,141,228,0.15)' : 'transparent'}
            border="1px solid"
            borderColor={active ? 'rgba(0,141,228,0.25)' : 'transparent'}
            transition="all 0.2s ease"
            _hover={active ? {} : { color: 'gray.200', bg: 'rgba(255,255,255,0.04)' }}
            cursor="pointer"
            whiteSpace="nowrap"
            display="flex"
            alignItems="center"
            gap={2}
          >
            <Box flexShrink={0} transform="scale(0.7)" transformOrigin="center">
              {t.icon}
            </Box>
            {t.label}
          </Box>
        );
      })}
    </HStack>
  );
}

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
              All decoding runs locally in the browser via WASM.
            </Text>
          </VStack>
        </InfoBlock>

        {ToolComponent ? (
          <>
            <ToolTabBar tools={TOOLS} activeKey={toolKey} onSelect={pickTool} />
            <ToolComponent />
          </>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            {TOOLS.map((t) => (
              <ToolCard key={t.key} tool={t} onClick={() => pickTool(t.key)} />
            ))}
          </SimpleGrid>
        )}
      </VStack>
    </Container>
  );
}
