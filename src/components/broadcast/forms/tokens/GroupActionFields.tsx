'use client';

import { Box, HStack, Radio, RadioGroup, Stack, Text, VStack } from '@chakra-ui/react';
import { useGroupActions } from '@sdk/queries';
import { toPlain } from '@util/contract';
import { shortId } from '@util/identifier';
import { safeStringify } from '@util/wasm-json';
import {
  pendingActionFromJson,
  pendingActionKind,
  type PendingGroupAction,
} from '../../tokens/group-actions';
import type { Authority, TokenModel } from '../../tokens/model';
import type { TokenOperationKind } from '../../tokens/options';
import { Field } from './fields';

type GroupAuthority = Extract<Authority, { kind: 'group' }>;
type Mode = 'direct' | 'propose' | 'cosign';

export function GroupActionFields({
  kind,
  model,
  signerId,
  groupPosition,
  authority,
  mode,
  onModeChange,
  actionId,
  onActionIdChange,
  pending,
  pendingError,
}: {
  kind: TokenOperationKind;
  model: TokenModel;
  signerId: string;
  groupPosition: number;
  authority: GroupAuthority | null;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  actionId: string;
  onActionIdChange: (actionId: string) => void;
  pending: PendingGroupAction | null;
  pendingError: string | null;
}) {
  const group = model.groups[groupPosition];
  const actionsQ = useGroupActions(model.contractId, groupPosition, 'ACTIVE');
  const actions =
    actionsQ.data instanceof Map
      ? [...actionsQ.data.entries()]
          .map(([id, action]) => pendingActionFromJson(String(id), groupPosition, toPlain(action), undefined))
          .filter((a) => (a.tokenPosition === undefined || a.tokenPosition === model.position) && pendingActionKind(a) === kind)
      : [];
  const required = group?.requiredPower ?? 0;
  const myPower = group?.members[signerId] ?? 0;

  return (
    <Box borderWidth="1px" borderColor="gray.700" borderRadius="md" p={3}>
      <VStack align="stretch" spacing={3}>
        <Text fontSize="sm" color="gray.100" fontWeight={600}>
          Group #{groupPosition} approval
        </Text>
        {group ? (
          <Text fontSize="xs" color="gray.400">
            Requires {required} power. Members:{' '}
            {Object.entries(group.members)
              .map(([member, power]) => `${shortId(member)} (${power})`)
              .join(', ')}
            .
          </Text>
        ) : null}
        <RadioGroup value={mode} onChange={(value) => onModeChange(value as Mode)}>
          <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
            {authority?.canActAlone ? <Radio value="direct">Act alone (your power meets the requirement)</Radio> : null}
            <Radio value="propose">Propose a new group action</Radio>
            <Radio value="cosign">Co-sign a pending action</Radio>
          </Stack>
        </RadioGroup>
        {mode === 'propose' ? (
          <Text fontSize="xs" color="gray.250">
            Your signature adds {myPower} of the {required} power required; the action stays pending until other members
            co-sign it. Only the proposer may attach a public note.
          </Text>
        ) : null}
        {mode === 'cosign' ? (
          <Field label="Pending action">
            {actionsQ.isLoading ? (
              <Text fontSize="xs" color="gray.400">
                Loading pending actions…
              </Text>
            ) : actions.length === 0 && !actionId ? (
              <Text fontSize="xs" color="warning">
                Group #{groupPosition} has no pending {kind} action for this token.
              </Text>
            ) : (
              <RadioGroup value={actionId} onChange={onActionIdChange}>
                <VStack align="stretch" spacing={2}>
                  {actions.map((action) => (
                    <Radio key={action.actionId} value={action.actionId} alignItems="flex-start">
                      <Text fontSize="xs" fontFamily="mono" wordBreak="break-all">
                        {action.actionId}
                      </Text>
                      <Text fontSize="xs" color="gray.400" wordBreak="break-all">
                        {action.proposerId ? `Proposed by ${shortId(action.proposerId)} · ` : ''}
                        {safeStringify(action.fields, 0)}
                      </Text>
                    </Radio>
                  ))}
                </VStack>
              </RadioGroup>
            )}
            {pending ? (
              <HStack mt={2} spacing={2} flexWrap="wrap" role="status">
                <Text fontSize="xs" color="gray.250">
                  Signed so far: {pending.signedPower} of {required} power (
                  {Object.entries(pending.signers)
                    .map(([member, power]) => `${shortId(member)} ${power}`)
                    .join(', ') || 'no signers'}
                  ). Your signature adds {myPower}
                  {pending.signedPower + myPower >= required
                    ? ', which completes the action and executes it.'
                    : `; ${required - pending.signedPower - myPower} more power is still needed afterwards.`}
                </Text>
              </HStack>
            ) : null}
            {pendingError ? (
              <Text fontSize="xs" color="warning" mt={1}>
                {pendingError}
              </Text>
            ) : null}
          </Field>
        ) : null}
      </VStack>
    </Box>
  );
}
