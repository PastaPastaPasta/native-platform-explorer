'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input, Select, Text, Textarea, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import { useContestedResourceVoteState } from '@sdk/queries';
import { isBase58Identifier } from '@util/identifier';
import { idToString, readProp } from '@util/sdk-shape';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle } from '../addresses/fields';

export type VoteChoice = 'towardsIdentity' | 'abstain' | 'lock';

export interface MasternodeVoteOptions {
  network: 'mainnet' | 'testnet';
  /** The masternode's ProTxHash: hex as Core shows it, or base58. */
  proTxHash: string;
  votingKeyWif: string;
  contractId: string;
  documentTypeName: string;
  indexName: string;
  indexValues: unknown[];
  choice: VoteChoice;
  towardsIdentityId?: string;
}

export function redactVotingKey({ votingKeyWif: _secret, ...rest }: MasternodeVoteOptions) {
  return { ...rest, votingKey: 'provided (hidden)' };
}

const PRO_TX_HASH = /^(?:[0-9a-f]{64})$/i;

function parseIndexValues(text: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Contest links may carry the JSON URL-encoded once more (see /governance/contested/detail). */
function initialIndexValues(raw: string | null): string {
  if (!raw) return '';
  if (parseIndexValues(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function MasternodeVoteForm({
  network,
  onOptionsChange,
}: OperationFormProps<MasternodeVoteOptions>) {
  const params = useSearchParams();
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [documentTypeName, setDocumentTypeName] = useState(params.get('docType') ?? '');
  const [indexName, setIndexName] = useState(params.get('indexName') ?? '');
  const [indexValuesText, setIndexValuesText] = useState(() =>
    initialIndexValues(params.get('indexValues')),
  );
  const [proTxHash, setProTxHash] = useState('');
  const [wif, setWif] = useState('');
  const [choice, setChoice] = useState<VoteChoice>('towardsIdentity');
  const [towards, setTowards] = useState('');

  const indexValues = useMemo(() => parseIndexValues(indexValuesText.trim()), [indexValuesText]);
  const pollValid =
    isBase58Identifier(contractId.trim()) &&
    !!documentTypeName.trim() &&
    !!indexName.trim() &&
    !!indexValues;
  const state = useContestedResourceVoteState(
    pollValid ? contractId.trim() : undefined,
    documentTypeName.trim() || undefined,
    indexName.trim() || undefined,
    indexValues ?? undefined,
  );
  const contenders = (
    (readProp<unknown[]>(state.data, 'contenders') as unknown[] | undefined) ?? []
  )
    .map(
      (c) =>
        idToString(readProp<unknown>(c, 'identityId')) ??
        idToString(readProp<unknown>(c, 'towardsIdentity')),
    )
    .filter((id): id is string => !!id);
  const proTxValid = PRO_TX_HASH.test(proTxHash.trim()) || isBase58Identifier(proTxHash.trim());
  const towardsValid = choice !== 'towardsIdentity' || isBase58Identifier(towards.trim());

  useEffect(() => {
    if (!pollValid || !proTxValid || !wif.trim() || !towardsValid) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      proTxHash: proTxHash.trim(),
      votingKeyWif: wif.trim(),
      contractId: contractId.trim(),
      documentTypeName: documentTypeName.trim(),
      indexName: indexName.trim(),
      indexValues: indexValues!,
      choice,
      ...(choice === 'towardsIdentity' ? { towardsIdentityId: towards.trim() } : {}),
    });
  }, [
    pollValid,
    proTxValid,
    towardsValid,
    wif,
    proTxHash,
    contractId,
    documentTypeName,
    indexName,
    indexValues,
    choice,
    towards,
    network,
    onOptionsChange,
  ]);

  return (
    <VStack align="stretch" spacing={4}>
      <FormField
        label="Contract ID"
        error={
          contractId && !isBase58Identifier(contractId.trim())
            ? 'Enter a base58 contract ID.'
            : null
        }
      >
        <Input
          {...inputStyle}
          aria-label="Contract ID"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
        />
      </FormField>
      <FormField label="Document type">
        <Input
          {...inputStyle}
          aria-label="Document type"
          value={documentTypeName}
          onChange={(e) => setDocumentTypeName(e.target.value)}
        />
      </FormField>
      <FormField label="Index name">
        <Input
          {...inputStyle}
          aria-label="Index name"
          value={indexName}
          onChange={(e) => setIndexName(e.target.value)}
        />
      </FormField>
      <FormField
        label="Index values (JSON array)"
        error={
          indexValuesText && !indexValues
            ? 'Enter a non-empty JSON array, e.g. ["dash","alice"].'
            : null
        }
        hint="Open a contest from /governance/contested to fill these in."
      >
        <Textarea
          {...inputStyle}
          rows={2}
          aria-label="Index values (JSON array)"
          value={indexValuesText}
          onChange={(e) => setIndexValuesText(e.target.value)}
        />
      </FormField>
      {pollValid ? (
        <Text fontSize="xs" color={state.isError ? 'warning' : 'gray.400'}>
          {state.isLoading
            ? 'Reading the contest…'
            : state.isError
              ? 'Could not read this contest; check the resource.'
              : state.data
                ? `${contenders.length} contender(s).`
                : 'No vote state for this resource: the contest may be closed or the values may not match.'}
        </Text>
      ) : null}
      <FormField label="Vote">
        <Select
          size="sm"
          bg="gray.800"
          borderColor="gray.700"
          aria-label="Vote"
          value={choice}
          onChange={(e) => setChoice(e.target.value as VoteChoice)}
        >
          <option value="towardsIdentity">For a contender</option>
          <option value="abstain">Abstain</option>
          <option value="lock">Lock (no one gets it)</option>
        </Select>
      </FormField>
      {choice === 'towardsIdentity' ? (
        <FormField
          label="Contender identity"
          error={towards && !towardsValid ? 'Enter a base58 identity ID.' : null}
        >
          {contenders.length ? (
            <Select
              size="sm"
              bg="gray.800"
              borderColor="gray.700"
              aria-label="Contender"
              placeholder="Pick a contender"
              value={contenders.includes(towards) ? towards : ''}
              onChange={(e) => setTowards(e.target.value)}
              mb={2}
            >
              {contenders.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </Select>
          ) : null}
          <Input
            {...inputStyle}
            aria-label="Contender identity"
            value={towards}
            onChange={(e) => setTowards(e.target.value)}
          />
        </FormField>
      ) : null}
      <FormField
        label="Masternode ProTxHash"
        error={
          proTxHash && !proTxValid
            ? 'Enter the 64-character hex ProTxHash (or its base58 identifier).'
            : null
        }
      >
        <Input
          {...inputStyle}
          aria-label="Masternode ProTxHash"
          value={proTxHash}
          onChange={(e) => setProTxHash(e.target.value)}
        />
      </FormField>
      <FormField
        label="Voting key (WIF)"
        hint="The masternode's voting private key. It identifies the voter identity together with the ProTxHash, signs the vote, and stays in this tab only for this operation."
      >
        <SecretInput
          {...inputStyle}
          aria-label="Voting key (WIF)"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
        />
      </FormField>
    </VStack>
  );
}
