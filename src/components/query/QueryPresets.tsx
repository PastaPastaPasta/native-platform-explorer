'use client';

import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';

interface Preset {
  key: string;
  label: string;
  /** Resolve a system-contract testnet ID by registry key. */
  contractKey?: string;
  /** Or pin a raw contract ID (used for the grades-on-devnet-paloma aggregates). */
  contractId?: string;
  sql: string;
  /** Optional grouping tag for the preset row. */
  group?: 'docs' | 'aggregates';
}

// Grade contract registered on devnet-paloma; aggregate presets only return
// real data when the user is connected to that devnet.
const GRADES_CONTRACT_ID = 'C2SZQvHzzQ8XXM47muPHt9dLrf64Sc2aSSdAiyPhDT2i';

const PRESETS: Preset[] = [
  {
    key: 'dpns-domains',
    label: 'DPNS domains',
    contractKey: 'dpns',
    group: 'docs',
    sql: "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' ORDER BY normalizedLabel ASC LIMIT 25",
  },
  {
    key: 'dpns-prefix',
    label: 'DPNS prefix search',
    contractKey: 'dpns',
    group: 'docs',
    sql: "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' AND normalizedLabel startsWith 'a' ORDER BY normalizedLabel ASC LIMIT 25",
  },
  {
    key: 'dashpay',
    label: 'Dashpay profiles',
    contractKey: 'dashpay',
    group: 'docs',
    sql: 'SELECT * FROM profile LIMIT 25',
  },
  {
    key: 'mn-rewards',
    label: 'Masternode rewards',
    contractKey: 'masternode-rewards',
    group: 'docs',
    sql: 'SELECT * FROM rewardShare LIMIT 25',
  },
  // ── Aggregates against the grades contract (devnet-paloma) ──────────
  {
    key: 'grades-total-count',
    label: 'grades: global COUNT',
    contractId: GRADES_CONTRACT_ID,
    group: 'aggregates',
    sql: 'SELECT COUNT(*) FROM grade',
  },
  {
    key: 'grades-total-avg',
    label: 'grades: global AVG(score)',
    contractId: GRADES_CONTRACT_ID,
    group: 'aggregates',
    sql: 'SELECT AVG(score) FROM grade',
  },
  {
    key: 'grades-per-class-count',
    label: 'grades: COUNT GROUP BY class',
    contractId: GRADES_CONTRACT_ID,
    group: 'aggregates',
    sql: "SELECT COUNT(*) FROM grade WHERE class IN ('CS101','CS202','MATH150','MATH250','PHYS200','BIO110','ENG101') GROUP BY class",
  },
  {
    key: 'grades-per-class-avg',
    label: 'grades: AVG(score) GROUP BY class',
    contractId: GRADES_CONTRACT_ID,
    group: 'aggregates',
    sql: "SELECT AVG(score) FROM grade WHERE class IN ('CS101','CS202','MATH150','MATH250','PHYS200','BIO110','ENG101') GROUP BY class",
  },
  {
    key: 'grades-cs101-range-avg',
    label: 'grades: CS101 rolling-window AVG (range)',
    contractId: GRADES_CONTRACT_ID,
    group: 'aggregates',
    sql: "SELECT AVG(score) FROM grade WHERE class == 'CS101' AND semester BETWEEN 20251 AND 20253",
  },
  {
    key: 'grades-cs101-per-semester',
    label: 'grades: CS101 AVG per semester (RangeDistinct)',
    contractId: GRADES_CONTRACT_ID,
    group: 'aggregates',
    sql: "SELECT AVG(score) FROM grade WHERE class == 'CS101' AND semester BETWEEN 20241 AND 20262 GROUP BY semester ORDER BY semester ASC",
  },
];

function resolveContract(preset: Preset): string | undefined {
  if (preset.contractId) return preset.contractId;
  if (preset.contractKey) {
    return SYSTEM_DATA_CONTRACTS.find((c) => c.key === preset.contractKey)?.testnetId;
  }
  return undefined;
}

export interface QueryPresetsProps {
  onSelect: (sql: string, contractId: string) => void;
}

export function QueryPresets({ onSelect }: QueryPresetsProps) {
  const docs = PRESETS.filter((p) => p.group !== 'aggregates');
  const aggregates = PRESETS.filter((p) => p.group === 'aggregates');

  function renderRow(label: string, items: Preset[]) {
    return (
      <VStack align="flex-start" spacing={1}>
        <Text fontSize="2xs" color="gray.500" fontWeight={500}>
          {label}
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          {items.map((p) => (
            <Button
              key={p.key}
              size="xs"
              variant="outline"
              colorScheme="gray"
              fontWeight={400}
              onClick={() => {
                const cid = resolveContract(p);
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

  return (
    <VStack align="stretch" spacing={2}>
      {renderRow('Presets', docs)}
      {renderRow('Aggregates (devnet-paloma grades)', aggregates)}
    </VStack>
  );
}
