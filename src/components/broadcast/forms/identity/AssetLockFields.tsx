'use client';

import { useEffect, useState } from 'react';
import { HStack, Input, Radio, RadioGroup, Stack, Text, Textarea, VStack } from '@chakra-ui/react';
import { FormField, inputStyle } from '../addresses/fields';
import {
  parseAssetLockProof,
  type AssetLockProofInput,
  type ParsedAssetLockProof,
} from './asset-lock';

type Kind = AssetLockProofInput['kind'];

/** Asset-lock proof inputs. Reports the parsed proof, or null while it is incomplete or invalid. */
export function AssetLockProofFields({
  showIdentityId = false,
  onChange,
}: {
  /** Show the identity ID an identity create with this proof gets. */
  showIdentityId?: boolean;
  onChange: (proof: ParsedAssetLockProof | null) => void;
}) {
  const [kind, setKind] = useState<Kind>('instant');
  const [fields, setFields] = useState({
    instantLockHex: '',
    transactionHex: '',
    outputIndex: '0',
    txid: '',
    coreChainLockedHeight: '',
    text: '',
  });
  const [parsed, setParsed] = useState<{
    key: string;
    proof?: ParsedAssetLockProof;
    error?: string;
  } | null>(null);

  const input: AssetLockProofInput =
    kind === 'instant'
      ? {
          kind,
          instantLockHex: fields.instantLockHex,
          transactionHex: fields.transactionHex,
          outputIndex: fields.outputIndex,
        }
      : kind === 'chain'
        ? {
            kind,
            txid: fields.txid,
            outputIndex: fields.outputIndex,
            coreChainLockedHeight: fields.coreChainLockedHeight,
          }
        : { kind, text: fields.text };
  const key = JSON.stringify(input);
  const complete = Object.values(input).every((value) => String(value).trim() !== '');

  useEffect(() => {
    if (!complete) return;
    let cancelled = false;
    void parseAssetLockProof(JSON.parse(key) as AssetLockProofInput).then(
      (proof) => !cancelled && setParsed({ key, proof }),
      (error: unknown) =>
        !cancelled &&
        setParsed({
          key,
          error: error instanceof Error ? error.message : 'Invalid asset-lock proof.',
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, complete]);
  const current = complete && parsed?.key === key ? parsed : null;
  const proof = current?.proof ?? null;

  useEffect(() => {
    onChange(proof);
  }, [proof, onChange]);

  const set = (name: keyof typeof fields) => (e: { target: { value: string } }) =>
    setFields((previous) => ({ ...previous, [name]: e.target.value }));

  return (
    <VStack align="stretch" spacing={3}>
      <FormField label="Asset-lock proof">
        <RadioGroup value={kind} onChange={(value) => setKind(value as Kind)}>
          <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
            <Radio value="instant" size="sm">
              <Text fontSize="sm">InstantSend lock</Text>
            </Radio>
            <Radio value="chain" size="sm">
              <Text fontSize="sm">Chain lock</Text>
            </Radio>
            <Radio value="serialized" size="sm">
              <Text fontSize="sm">Serialized proof</Text>
            </Radio>
          </Stack>
        </RadioGroup>
      </FormField>
      {kind === 'instant' ? (
        <>
          <FormField
            label="InstantSend lock (hex)"
            hint="The islock of the asset-lock transaction, as Core's getislocks or the ZMQ rawtxlock message gives it."
          >
            <Textarea
              {...inputStyle}
              rows={3}
              aria-label="InstantSend lock (hex)"
              value={fields.instantLockHex}
              onChange={set('instantLockHex')}
            />
          </FormField>
          <FormField
            label="Asset-lock transaction (hex)"
            hint="The raw type-8 transaction (getrawtransaction)."
          >
            <Textarea
              {...inputStyle}
              rows={3}
              aria-label="Asset-lock transaction (hex)"
              value={fields.transactionHex}
              onChange={set('transactionHex')}
            />
          </FormField>
        </>
      ) : kind === 'chain' ? (
        <HStack align="flex-start" spacing={2}>
          <FormField label="Asset-lock transaction ID">
            <Input
              {...inputStyle}
              aria-label="Asset-lock transaction ID"
              value={fields.txid}
              onChange={set('txid')}
            />
          </FormField>
          <FormField
            label="Chain-locked height"
            hint="A Core height at or above the transaction's block that Platform has seen chain-locked."
          >
            <Input
              {...inputStyle}
              inputMode="numeric"
              aria-label="Chain-locked height"
              value={fields.coreChainLockedHeight}
              onChange={set('coreChainLockedHeight')}
            />
          </FormField>
        </HStack>
      ) : (
        <FormField
          label="Proof (hex or JSON)"
          hint='The SDK serialization: hex bytes, or JSON such as {"$type":"chain","coreChainLockedHeight":…,"outPoint":"txid:vout"}.'
        >
          <Textarea
            {...inputStyle}
            rows={4}
            aria-label="Asset-lock proof (hex or JSON)"
            value={fields.text}
            onChange={set('text')}
          />
        </FormField>
      )}
      {kind !== 'serialized' ? (
        <FormField label="Output index" hint="The asset-lock credit output (usually 0).">
          <Input
            {...inputStyle}
            inputMode="numeric"
            aria-label="Asset-lock output index"
            value={fields.outputIndex}
            onChange={set('outputIndex')}
          />
        </FormField>
      ) : null}
      {current?.error ? (
        <Text fontSize="xs" color="danger" role="alert">
          {current.error}
        </Text>
      ) : proof ? (
        <Text fontSize="xs" color="gray.250" wordBreak="break-all" data-testid="asset-lock-summary">
          {proof.type} proof for output {proof.outPoint}
          {showIdentityId ? ` · creates identity ${proof.identityId}` : ''}
        </Text>
      ) : null}
    </VStack>
  );
}
