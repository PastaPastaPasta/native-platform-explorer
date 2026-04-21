import { SYSTEM_DATA_CONTRACTS } from './system-data-contracts';

export interface WellKnown {
  id: string;
  kind: 'contract' | 'token' | 'identity';
  name: string;
  description?: string;
  url?: string;
  tags?: string[];
  contested?: { docType: string; indexName: string };
}

// Curated registry — the only way we give names to otherwise anonymous contract
// and token IDs. Users can extend this locally via /settings in later stages.
export const WELL_KNOWN: WellKnown[] = SYSTEM_DATA_CONTRACTS.filter((c) => c.testnetId).map(
  (c) => ({
    id: c.testnetId,
    kind: 'contract' as const,
    name: c.name,
    description: c.description,
    tags: ['system'],
    contested: c.contested,
  }),
);

export function findWellKnown(id: string): WellKnown | undefined {
  return WELL_KNOWN.find((w) => w.id === id);
}
