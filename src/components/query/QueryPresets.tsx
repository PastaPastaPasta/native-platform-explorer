'use client';

import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';

interface Preset {
  key: string;
  label: string;
  contractKey: string;
  sql: string;
}

const PRESETS: Preset[] = [
  {
    key: 'dpns-domains',
    label: 'DPNS domains',
    contractKey: 'dpns',
    sql: "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' ORDER BY normalizedLabel ASC LIMIT 25",
  },
  {
    key: 'dpns-prefix',
    label: 'DPNS prefix search',
    contractKey: 'dpns',
    sql: "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' AND normalizedLabel startsWith 'a' ORDER BY normalizedLabel ASC LIMIT 25",
  },
  {
    key: 'dashpay',
    label: 'Dashpay profiles',
    contractKey: 'dashpay',
    sql: 'SELECT * FROM profile LIMIT 25',
  },
  {
    key: 'mn-rewards',
    label: 'Masternode rewards',
    contractKey: 'masternode-rewards',
    sql: 'SELECT * FROM rewardShare LIMIT 25',
  },
];

function resolveContractKey(key: string): string | undefined {
  return SYSTEM_DATA_CONTRACTS.find((c) => c.key === key)?.testnetId;
}

export interface QueryPresetsProps {
  onSelect: (sql: string, contractId: string) => void;
}

export function QueryPresets({ onSelect }: QueryPresetsProps) {
  return (
    <VStack align="flex-start" spacing={1}>
      <Text fontSize="2xs" color="gray.500" fontWeight={500}>
        Presets
      </Text>
      <HStack spacing={2} flexWrap="wrap">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="xs"
            variant="outline"
            colorScheme="gray"
            fontWeight={400}
            onClick={() => {
              const cid = resolveContractKey(p.contractKey);
              if (cid) onSelect(p.sql, cid);
            }}
          >
            {p.label}
          </Button>
        ))}
      </HStack>
    </VStack>
  );
}
