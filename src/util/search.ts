import {
  isBase58Identifier,
  isBech32mAddress,
  isHex64,
  isPublicKeyHash,
  looksLikeDpnsName,
  looksLikeEpochIndex,
} from './identifier';
import { normaliseDpnsName } from './dpns';

export type SearchCandidate =
  | { kind: 'epoch'; index: number }
  | { kind: 'identity'; id: string }
  | { kind: 'contract'; id: string }
  | { kind: 'token'; id: string }
  | { kind: 'stateTransition'; hash: string }
  | { kind: 'evonode'; proTxHash: string }
  | { kind: 'address'; addr: string }
  | { kind: 'identityByPkh'; pkh: string }
  | { kind: 'dpnsName'; name: string }
  | { kind: 'dpnsPrefix'; prefix: string };

export interface SearchClassification {
  raw: string;
  candidates: SearchCandidate[];
}

export function classifyQuery(input: string): SearchClassification {
  const raw = input.trim();
  const candidates: SearchCandidate[] = [];

  if (!raw) return { raw, candidates };

  if (looksLikeEpochIndex(raw)) {
    candidates.push({ kind: 'epoch', index: Number(raw) });
  }

  if (isBase58Identifier(raw)) {
    // An Identifier can plausibly be any of these three entity types. We race.
    candidates.push({ kind: 'identity', id: raw });
    candidates.push({ kind: 'contract', id: raw });
    candidates.push({ kind: 'token', id: raw });
  }

  if (isHex64(raw)) {
    candidates.push({ kind: 'stateTransition', hash: raw });
    candidates.push({ kind: 'evonode', proTxHash: raw });
  }

  if (isBech32mAddress(raw)) {
    candidates.push({ kind: 'address', addr: raw });
  }

  if (isPublicKeyHash(raw)) {
    candidates.push({ kind: 'identityByPkh', pkh: raw });
  }

  if (looksLikeDpnsName(raw)) {
    const name = normaliseDpnsName(raw);
    candidates.push({ kind: 'dpnsName', name });
    const bareLabel = raw.endsWith('.dash') ? raw.slice(0, -5) : raw;
    if (bareLabel.length >= 2) {
      candidates.push({ kind: 'dpnsPrefix', prefix: bareLabel });
    }
  }

  return { raw, candidates };
}
