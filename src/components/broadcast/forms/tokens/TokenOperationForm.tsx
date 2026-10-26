'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Box, HStack, Input, Radio, RadioGroup, Select, Stack, Text, Textarea, VStack } from '@chakra-ui/react';
import { useSdkQuery } from '@sdk/hooks';
import { isBase58Identifier, shortId } from '@util/identifier';
import { formatTokenAmount } from '@util/token-rules';
import type { OperationFormProps } from '../../OperationShell';
import { describeTokenAmount, publicNoteError } from '../../tokens/amount';
import { claimProblem, tokenOperationProblems, tokenOperationUnavailable } from '../../tokens/checks';
import { configChangeAuthority } from '../../tokens/config-change';
import { cosignParameters } from '../../tokens/group-actions';
import { operationAuthority, describeTakers, ruleFor, OPERATION_RULES, type Authority, type TokenModel } from '../../tokens/model';
import { buildTokenDraft, EMPTY_FIELDS, type GroupChoice, type TokenFormFields } from '../../tokens/draft';
import { GROUP_OPERATIONS, type TokenOperationKind, type TokenOperationOptions } from '../../tokens/options';
import { loadTokenSnapshot, resolveTokenTarget, type TokenSnapshot, type TokenTarget } from '../../tokens/state';
import { GroupActionFields } from './GroupActionFields';
import { PriceScheduleFields } from './PriceScheduleFields';
import { ConfigChangeFields } from './ConfigChangeFields';
import { Field, IdentityInput } from './fields';

export type TokenOperationFormProps = OperationFormProps<TokenOperationOptions> & { kind: TokenOperationKind };

const DISTRIBUTIONS = [
  ['perpetual', 'Perpetual distribution'],
  ['preProgrammed', 'Pre-programmed distribution'],
  ['oncePerIdentity', 'Once-per-identity distribution'],
] as const;

function AuthorityLine({ authority, kind, model }: { authority: Authority | null; kind: TokenOperationKind; model: TokenModel }) {
  const rule = OPERATION_RULES[kind];
  const who = rule ? describeTakers(ruleFor(model, rule)?.authorized ?? null) : null;
  if (!authority) return null;
  return (
    <Text fontSize="xs" color={authority.kind === 'denied' ? 'warning' : 'gray.400'} role="status">
      {who ? `Authorized: ${who}. ` : ''}
      {authority.kind === 'direct'
        ? 'You may act directly.'
        : authority.kind === 'group'
          ? `Group #${authority.group.position} decides: you hold ${authority.signerPower} of the ${authority.group.requiredPower} power required${authority.canActAlone ? ', enough to act alone' : ''}.`
          : authority.reason}
    </Text>
  );
}

export function TokenOperationForm({ kind, signer, onOptionsChange }: TokenOperationFormProps) {
  const params = useSearchParams();
  const signerId = signer.identityId;
  const [tokenInput, setTokenInput] = useState(params.get('token') ?? params.get('id') ?? '');
  const [contractInput, setContractInput] = useState(params.get('contract') ?? '');
  const [positionInput, setPositionInput] = useState(params.get('position') ?? '');
  const [fields, setFields] = useState<TokenFormFields>(() => ({
    ...EMPTY_FIELDS,
    target: params.get('target') ?? '',
    recipient: params.get('recipient') ?? '',
  }));
  const [groupMode, setGroupMode] = useState<'direct' | 'propose' | 'cosign'>(
    params.get('groupAction') ? 'cosign' : 'direct',
  );
  const [actionId, setActionId] = useState(params.get('groupAction') ?? '');
  // A co-sign link names the group, which a configuration change only reveals once loaded.
  const linkedGroup = params.get('group') === null ? undefined : Number(params.get('group'));
  const update = (patch: Partial<TokenFormFields>) => setFields((current) => ({ ...current, ...patch }));

  const position = positionInput.trim() === '' ? undefined : Number(positionInput);
  const targetInput = {
    tokenId: tokenInput.trim() || undefined,
    contractId: contractInput.trim() || undefined,
    position: Number.isInteger(position) ? position : undefined,
  };
  const targetReady =
    (!!targetInput.tokenId && isBase58Identifier(targetInput.tokenId)) ||
    (!!targetInput.contractId && isBase58Identifier(targetInput.contractId) && targetInput.position !== undefined);
  const targetQ = useSdkQuery<TokenTarget>(
    ['tokenWrite', 'target', targetInput.tokenId, targetInput.contractId, targetInput.position],
    (sdk) => resolveTokenTarget(sdk, targetInput),
    { enabled: targetReady, retry: false },
  );
  const target = targetReady ? targetQ.data : undefined;

  // A first snapshot (signer only) decides the authority; the full one adds
  // the identities and group action the inputs name.
  const recipientId = isBase58Identifier(fields.recipient.trim()) ? fields.recipient.trim() : undefined;
  const targetId = isBase58Identifier(fields.target.trim()) ? fields.target.trim() : undefined;
  const cosigning = groupMode === 'cosign' && isBase58Identifier(actionId);
  const baseQ = useSdkQuery<TokenSnapshot>(
    ['tokenWrite', 'snapshot', target?.tokenId, signerId],
    (sdk) => loadTokenSnapshot(sdk, { target: target!, holderIds: [signerId] }),
    { enabled: !!target, retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const model = baseQ.data?.model;
  const ruleAuthority: Authority | null =
    model && kind !== 'configUpdate' ? operationAuthority(kind, model, signerId) : null;
  const changeAuthority =
    model && kind === 'configUpdate' && fields.change && typeof fields.change !== 'string'
      ? configChangeAuthority(fields.change, model, signerId)
      : null;
  const authority = ruleAuthority ?? changeAuthority;
  const linkedCosign =
    kind === 'configUpdate' && !authority && groupMode === 'cosign' && Number.isInteger(linkedGroup);
  const groupPosition =
    authority?.kind === 'group' ? authority.group.position : linkedCosign ? linkedGroup : undefined;
  const groupAllowed = GROUP_OPERATIONS.has(kind) && (authority?.kind === 'group' || linkedCosign);
  const effectiveMode = !groupAllowed
    ? 'direct'
    : groupMode === 'direct' && authority?.kind === 'group' && !authority.canActAlone
      ? 'propose'
      : groupMode;

  const fullQ = useSdkQuery<TokenSnapshot>(
    [
      'tokenWrite',
      'snapshot',
      target?.tokenId,
      signerId,
      recipientId,
      targetId,
      kind === 'directPurchase',
      effectiveMode === 'cosign' ? `${groupPosition}/${actionId}` : '',
    ],
    async (sdk) => {
      const cosign =
        effectiveMode === 'cosign' && cosigning && groupPosition !== undefined
          ? { groupPosition, actionId }
          : undefined;
      const first = await loadTokenSnapshot(sdk, {
        target: target!,
        holderIds: [signerId, recipientId, targetId].filter((id): id is string => !!id),
        creditsOf: kind === 'directPurchase' ? signerId : undefined,
        cosign,
      });
      const params = first.pending ? cosignParameters(first.pending) : null;
      const extra = [
        params && 'recipientId' in params ? params.recipientId : undefined,
        params && 'targetIdentityId' in params ? params.targetIdentityId : undefined,
        params?.kind === 'burn' ? params.burnFromId : undefined,
      ].filter((id): id is string => !!id && !first.holders[id]);
      return extra.length === 0
        ? first
        : loadTokenSnapshot(sdk, {
            target: target!,
            holderIds: [...Object.keys(first.holders), ...extra],
            creditsOf: kind === 'directPurchase' ? signerId : undefined,
            cosign,
          });
    },
    { enabled: !!target && !!model, retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const snapshot = fullQ.data ?? baseQ.data;

  // Prefill the mint recipient once the token's destination is known.
  useEffect(() => {
    if (kind === 'mint' && model && !fields.recipient)
      update({ recipient: model.newTokensDestinationIdentity ?? signerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, model]);
  useEffect(() => {
    if (kind === 'emergencyAction' && snapshot) update({ action: snapshot.paused ? 'resume' : 'pause' });
  }, [kind, snapshot?.paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = effectiveMode === 'cosign' ? (fullQ.data?.pending ?? null) : null;
  const group: GroupChoice | null =
    effectiveMode === 'direct'
      ? { mode: 'direct' }
      : groupPosition === undefined
        ? null
        : effectiveMode === 'propose'
          ? { mode: 'propose', groupPosition }
          : pending
            ? { mode: 'cosign', groupPosition, actionId: pending.actionId, parameters: cosignParameters(pending) }
            : null;
  const targetBalance = targetId ? fullQ.data?.holders[targetId]?.balance : undefined;
  const cosignTarget =
    group?.mode === 'cosign' && group.parameters && 'targetIdentityId' in group.parameters
      ? fullQ.data?.holders[group.parameters.targetIdentityId]?.balance
      : undefined;
  const draft =
    model && group
      ? buildTokenDraft(kind, fields, {
          model,
          signerId,
          group,
          targetBalance: cosignTarget ?? targetBalance,
          price: snapshot?.price,
        })
      : null;
  const unavailable = snapshot ? tokenOperationUnavailable(kind, snapshot, signerId) : null;
  // The full snapshot is keyed by every identity and action the inputs name.
  const loaded = !!fullQ.data;
  const problems = draft?.options && fullQ.data ? tokenOperationProblems(draft.options, fullQ.data) : [];
  const ready = !!draft?.options && loaded && problems.length === 0 && !unavailable;
  const draftKey = draft?.options ? JSON.stringify(draft.options, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v)) : '';

  useEffect(() => {
    onOptionsChange(ready && draft?.options ? draft.options : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, draftKey, onOptionsChange]);

  const decimals = model?.decimals ?? 0;
  const amountOf = (value: bigint) => (model ? describeTokenAmount(value, decimals, model.name) : String(value));
  const loadError = targetQ.error ?? baseQ.error ?? fullQ.error;
  const signerHolder = snapshot?.holders[signerId];
  const locked = effectiveMode === 'cosign';

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Token
        </Text>
        <Stack direction={{ base: 'column', md: 'row' }} spacing={2}>
          <Input
            size="sm"
            aria-label="Token ID"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            fontFamily="mono"
            bg="gray.800"
            borderColor={tokenInput && !isBase58Identifier(tokenInput.trim()) ? 'danger' : 'gray.700'}
            placeholder="Token ID"
          />
          <Text fontSize="xs" color="gray.400" alignSelf="center">
            or
          </Text>
          <Input
            size="sm"
            aria-label="Contract ID"
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
            fontFamily="mono"
            bg="gray.800"
            borderColor={contractInput && !isBase58Identifier(contractInput.trim()) ? 'danger' : 'gray.700'}
            placeholder="Contract ID"
          />
          <Input
            size="sm"
            aria-label="Token position"
            value={positionInput}
            onChange={(e) => setPositionInput(e.target.value)}
            fontFamily="mono"
            bg="gray.800"
            borderColor="gray.700"
            placeholder="Position"
            maxW={{ md: '110px' }}
          />
        </Stack>
        {loadError ? (
          <Text role="alert" fontSize="xs" color="warning" mt={1}>
            {loadError.message}
          </Text>
        ) : targetReady && !snapshot ? (
          <Text fontSize="xs" color="gray.400" mt={1}>
            Loading the token…
          </Text>
        ) : null}
      </Box>

      {snapshot && model ? (
        <Box borderWidth="1px" borderColor="gray.700" borderRadius="md" p={3}>
          <HStack spacing={2} flexWrap="wrap">
            <Text fontSize="sm" color="gray.100" fontWeight={600}>
              {model.name}
            </Text>
            <Badge variant="subtle" colorScheme={snapshot.paused ? 'red' : 'green'}>
              {snapshot.paused ? 'paused' : 'active'}
            </Badge>
            <Text fontSize="xs" color="gray.400">
              {decimals} decimals · position {model.position} of contract {shortId(model.contractId)}
            </Text>
          </HStack>
          <Text fontSize="xs" color="gray.400" mt={1} fontFamily="mono" wordBreak="break-all">
            {model.tokenId}
          </Text>
          <Text fontSize="xs" color="gray.250" mt={1}>
            Supply {formatTokenAmount(snapshot.totalSupply, decimals)}
            {model.maxSupply !== undefined ? ` of max ${formatTokenAmount(model.maxSupply, decimals)}` : ' (no max)'} ·
            your balance {formatTokenAmount(signerHolder?.balance ?? 0n, decimals)}
            {signerHolder?.frozen ? ' (frozen)' : ''}
            {snapshot.price
              ? ` · price ${snapshot.price.first}${snapshot.price.first !== snapshot.price.last ? `–${snapshot.price.last}` : ''} credits per base unit`
              : ''}
          </Text>
          <AuthorityLine authority={authority} kind={kind} model={model} />
        </Box>
      ) : null}

      {unavailable ? (
        <Text role="alert" color="warning" fontSize="sm" fontWeight={600}>
          Unavailable: {unavailable}
        </Text>
      ) : null}

      {snapshot && model && !unavailable ? (
        <>
          {kind === 'configUpdate' ? (
            <ConfigChangeFields
              model={model}
              totalSupply={snapshot.totalSupply}
              signerId={signerId}
              locked={locked && pending ? cosignParameters(pending) : null}
              onChange={(change) => update({ change })}
            />
          ) : null}

          {groupAllowed && groupPosition !== undefined ? (
            <GroupActionFields
              kind={kind}
              model={model}
              signerId={signerId}
              groupPosition={groupPosition}
              authority={authority?.kind === 'group' ? authority : null}
              mode={effectiveMode}
              onModeChange={setGroupMode}
              actionId={actionId}
              onActionIdChange={setActionId}
              pending={pending}
              pendingError={effectiveMode === 'cosign' && cosigning && loaded && !fullQ.isFetching && !pending ? 'That action is not pending for this group.' : null}
            />
          ) : null}

          {(kind === 'mint' || kind === 'burn' || kind === 'transfer' || kind === 'directPurchase') && !locked ? (
            <Field label={`Amount (${model.name})`} hint={`Up to ${decimals} decimal places. Converted exactly to base units.`}>
              <Input
                size="sm"
                aria-label="Amount"
                value={fields.amount}
                onChange={(e) => update({ amount: e.target.value })}
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
                placeholder="e.g. 1.5"
                inputMode="decimal"
              />
            </Field>
          ) : null}

          {kind === 'mint' && !locked ? (
            model.mintingAllowChoosingDestination ? (
              <IdentityInput
                label="Recipient identity"
                value={fields.recipient}
                onChange={(recipient) => update({ recipient })}
                state={recipientId ? fullQ.data?.holders[recipientId] : undefined}
                decimals={decimals}
              />
            ) : (
              <Text fontSize="sm" color="gray.250">
                Minted tokens go to the token&apos;s destination identity{' '}
                <Text as="span" fontFamily="mono">
                  {model.newTokensDestinationIdentity ?? 'none set'}
                </Text>
                ; this token does not let minters choose.
              </Text>
            )
          ) : null}

          {kind === 'transfer' ? (
            <IdentityInput
              label="Recipient identity"
              value={fields.recipient}
              onChange={(recipient) => update({ recipient })}
              state={recipientId ? fullQ.data?.holders[recipientId] : undefined}
              decimals={decimals}
            />
          ) : null}

          {(kind === 'freeze' || kind === 'unfreeze' || kind === 'destroyFrozen') && !locked ? (
            <IdentityInput
              label="Target identity"
              value={fields.target}
              onChange={(target) => update({ target })}
              state={targetId ? fullQ.data?.holders[targetId] : undefined}
              decimals={decimals}
            />
          ) : null}

          {kind === 'emergencyAction' && !locked ? (
            <Field label="Action" hint="Pausing stops transfers between holders. Minting, burning and purchases are not paused.">
              <RadioGroup value={fields.action} onChange={(action) => update({ action: action as 'pause' | 'resume' })}>
                <HStack spacing={4}>
                  <Radio value="pause" isDisabled={snapshot.paused}>
                    Pause
                  </Radio>
                  <Radio value="resume" isDisabled={!snapshot.paused}>
                    Resume
                  </Radio>
                </HStack>
              </RadioGroup>
            </Field>
          ) : null}

          {kind === 'setPrice' && !locked ? (
            <PriceScheduleFields value={fields.schedule} decimals={decimals} name={model.name} onChange={(schedule) => update({ schedule })} />
          ) : null}

          {kind === 'directPurchase' && snapshot.price ? (
            snapshot.price.first === snapshot.price.last ? (
              <Text fontSize="sm" color="gray.250" role="status">
                {draft?.options?.kind === 'directPurchase'
                  ? `Total: ${draft.options.maxTotalCost} credits at ${snapshot.price.first} credits per base unit. The agreed total must match the current price exactly.`
                  : `Price: ${snapshot.price.first} credits per base unit.`}
              </Text>
            ) : (
              <Field
                label="Maximum total (credits)"
                hint={`Tiered pricing: the SDK reports only the smallest-amount tier (${snapshot.price.first} per base unit) and the largest (${snapshot.price.last}). Intermediate tiers and the minimum purchase are not readable, so enter the most you will pay; Platform charges the price of the tier your amount falls in and rejects the purchase if that exceeds your maximum.`}
              >
                <Input
                  size="sm"
                  aria-label="Maximum total (credits)"
                  value={fields.maxTotal}
                  onChange={(e) => update({ maxTotal: e.target.value })}
                  fontFamily="mono"
                  bg="gray.800"
                  borderColor="gray.700"
                />
              </Field>
            )
          ) : null}

          {kind === 'claim' ? (
            <Field label="Distribution">
              <Select
                size="sm"
                aria-label="Distribution"
                value={fields.distributionType}
                onChange={(e) => update({ distributionType: e.target.value as TokenFormFields['distributionType'] })}
                bg="gray.800"
                borderColor="gray.700"
              >
                {DISTRIBUTIONS.map(([value, label]) => {
                  const problem = claimProblem(value, model, signerId, snapshot.nowMs);
                  return (
                    <option key={value} value={value} disabled={!!problem}>
                      {label}
                      {problem ? ` (unavailable: ${problem})` : ''}
                    </option>
                  );
                })}
              </Select>
            </Field>
          ) : null}

          {locked && draft?.options ? (
            <Text fontSize="sm" color="gray.250" role="status">
              Co-signing repeats the proposal exactly
              {'amount' in draft.options ? `: ${amountOf(draft.options.amount)}` : ''}
              {'recipientId' in draft.options ? ` to ${draft.options.recipientId}` : ''}
              {'targetIdentityId' in draft.options ? ` for ${draft.options.targetIdentityId}` : ''}.
            </Text>
          ) : null}

          {kind !== 'directPurchase' && !locked ? (
            <Field label="Public note (optional)" hint="Stored on chain with the transition; anyone can read it.">
              <Textarea
                size="sm"
                aria-label="Public note"
                value={fields.note}
                onChange={(e) => update({ note: e.target.value })}
                bg="gray.800"
                borderColor={publicNoteError(fields.note) ? 'danger' : 'gray.700'}
                rows={2}
              />
            </Field>
          ) : null}

          {draft && (draft.errors.length > 0 || problems.length > 0) ? (
            <VStack align="stretch" spacing={1} role="alert" aria-label="Why this cannot be reviewed yet">
              {[...draft.errors, ...problems].map((problem) => (
                <Text key={problem} fontSize="xs" color="warning">
                  {problem}
                </Text>
              ))}
            </VStack>
          ) : null}
        </>
      ) : null}
    </VStack>
  );
}
