'use client';

import { Badge } from '@chakra-ui/react';

export type VoteChoice = 'towardsIdentity' | 'abstain' | 'lock' | 'unknown';

const COLOR: Record<VoteChoice, string> = {
  towardsIdentity: 'green',
  abstain: 'yellow',
  lock: 'red',
  unknown: 'gray',
};

const LABEL: Record<VoteChoice, string> = {
  towardsIdentity: 'for',
  abstain: 'abstain',
  lock: 'lock',
  unknown: '—',
};

export function VoteChoiceBadge({ choice }: { choice: VoteChoice | string | undefined }) {
  const key: VoteChoice =
    choice === 'towardsIdentity' || choice === 'abstain' || choice === 'lock'
      ? (choice as VoteChoice)
      : 'unknown';
  return (
    <Badge colorScheme={COLOR[key]} variant="subtle" fontSize="2xs" textTransform="none">
      {LABEL[key]}
    </Badge>
  );
}
