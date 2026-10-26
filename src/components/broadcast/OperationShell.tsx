'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextLink from 'next/link';
import {
  Badge,
  Button,
  Checkbox,
  Heading,
  HStack,
  Input,
  Step,
  StepIcon,
  StepIndicator,
  StepNumber,
  StepSeparator,
  StepStatus,
  StepTitle,
  Stepper,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { SignerStatusCard } from './SignerStatusCard';
import { OperationReceipt } from './OperationReceipt';
import { IdentityTopUpForm } from './forms/IdentityTopUp';
import { resolveOperationCapability, type OperationCapabilityRequirement } from './capabilities';
import {
  BroadcastOutcomeUnknownError,
  OperationNotSubmittedError,
  receiptEntities,
} from './outcomes';
import { useSigner } from '@/signer/SignerProvider';
import { invalidateNetworkQueries, useSdk } from '@sdk/hooks';
import { normalizeError } from '@sdk/errors';
import { getDerivationNetwork, type Network } from '@sdk/networks';
import type { EvoSDK } from '@dashevo/evo-sdk';
import type {
  ExplorerSigner,
  KeySelectionCriteria,
  SignerKeyDescriptor,
} from '@/signer/types';
import { selectSigningKey } from '@/signer/keys';
import type { ExecuteArgs } from './executors';

export interface OperationFormProps<TOptions> {
  signer: ExplorerSigner;
  network: 'mainnet' | 'testnet';
  onOptionsChange: (options: TOptions | null) => void;
}

export interface OperationDescriptor<TOptions, TResult> {
  operationId?: string;
  capability?: OperationCapabilityRequirement;
  title: string;
  description: string;
  destructive?: boolean;
  FormComponent: React.ComponentType<OperationFormProps<TOptions>>;
  summarise: (options: TOptions) => string;
  /** What the review step shows for the inputs; use it to hide secrets. Defaults to the options. */
  reviewData?: (options: TOptions) => unknown;
  /**
   * Copy of the inputs without private key material. Once execution settles,
   * or the signer is cleared, the shell keeps only this copy for the receipt.
   */
  redactSecrets?: (options: TOptions) => TOptions;
  /** Key requirements for these inputs; the review step shows the key they select. */
  signingCriteria?: (sdk: EvoSDK, options: TOptions) => Promise<KeySelectionCriteria | undefined>;
  execute: (args: ExecuteArgs<TOptions>) => Promise<TResult>;
}

// Tag every primitive so bigint credits cannot collide with a string or JSON
// object supplied by a form. Sorting keys makes equivalent JSON edits stable.
function fingerprint(value: unknown): string {
  function encode(input: unknown): unknown {
    if (input === null) return ['null'];
    if (typeof input !== 'object') return [typeof input, String(input)];
    if (input instanceof Uint8Array) return ['bytes', Array.from(input)];
    if (Array.isArray(input)) return ['array', input.map(encode)];
    return [
      'object',
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, encode(item)]),
    ];
  }
  return JSON.stringify(encode(value));
}

/** Zero byte arrays in inputs the shell is discarding (strings cannot be wiped). */
function wipeBytes(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Uint8Array) value.fill(0);
  else Object.values(value).forEach((item) => wipeBytes(item, seen));
}

function describeKey(key: SignerKeyDescriptor): string {
  const bounds = key.contractBounds
    ? ` · bound to contract ${key.contractBounds.contractId}${
        key.contractBounds.documentType ? ` (${key.contractBounds.documentType})` : ''
      }`
    : '';
  return `#${key.id} · ${String(key.purpose ?? 'unknown purpose')} · ${String(
    key.securityLevel ?? 'unknown level',
  )}${bounds}`;
}

interface Review<TOptions, TResult> {
  descriptor: OperationDescriptor<TOptions, TResult>;
  contextBinding: object;
  options: TOptions;
  fingerprint: string;
  sdk: EvoSDK;
  signer: ExplorerSigner;
  identityId: string;
  network: Network;
  trusted: boolean;
  sessionSignal: AbortSignal | null;
}

type Submission<TOptions, TResult> = Review<TOptions, TResult> & { submittedAt: string };

function withoutSecrets<TOptions, TResult>(
  snapshot: Submission<TOptions, TResult>,
): Submission<TOptions, TResult> {
  const redact = snapshot.descriptor.redactSecrets;
  if (!redact) return snapshot;
  const options = structuredClone(redact(snapshot.options));
  return { ...snapshot, options, fingerprint: fingerprint(options) };
}

export function OperationShell<TOptions, TResult>({
  descriptor,
}: {
  descriptor: OperationDescriptor<TOptions, TResult>;
}) {
  const { signer } = useSigner();
  const { sdk, network, trusted, status, sessionId, sessionSignal } = useSdk();
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<TOptions | null>(null);
  const [review, setReview] = useState<Review<TOptions, TResult> | null>(null);
  const [submission, setSubmission] = useState<Submission<TOptions, TResult> | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const [destructiveAck, setDestructiveAck] = useState(false);
  const [mainnetAck, setMainnetAck] = useState(false);
  const [mainnetTyped, setMainnetTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyRefresh, setKeyRefresh] = useState(0);
  const [keyState, setKeyState] = useState<{
    binding: object;
    keys: SignerKeyDescriptor[];
    error?: string;
  } | null>(null);
  const [reviewKey, setReviewKey] = useState<{
    review: Review<TOptions, TResult>;
    key?: SignerKeyDescriptor;
    error?: string;
  } | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const optionsFingerprint = fingerprint(options);
  const identityId = signer?.identityId;
  const operationId = descriptor.operationId;
  const contextBinding = useMemo(
    () => ({
      descriptor,
      operationId,
      sdk,
      signer,
      identityId,
      network,
      trusted,
      status,
      sessionId,
      sessionSignal,
    }),
    [
      descriptor,
      operationId,
      sdk,
      signer,
      identityId,
      network,
      trusted,
      status,
      sessionId,
      sessionSignal,
    ],
  );
  const current = useRef({ contextBinding, optionsFingerprint, status });
  current.current = { contextBinding, optionsFingerprint, status };
  const isCurrent = (snapshot: Review<TOptions, TResult>) =>
    mounted.current &&
    current.current.status === 'ready' &&
    !snapshot.sessionSignal?.aborted &&
    snapshot.contextBinding === current.current.contextBinding &&
    snapshot.fingerprint === current.current.optionsFingerprint;
  const reviewIsCurrent = review !== null && isCurrent(review);
  useEffect(() => {
    if (
      !descriptor.capability ||
      descriptor.capability.status !== 'available' ||
      !signer ||
      status !== 'ready'
    )
      return;
    let cancelled = false;
    void signer
      .availableKeys()
      .then((keys) => {
        if (!cancelled) setKeyState({ binding: contextBinding, keys });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setKeyState({
            binding: contextBinding,
            keys: [],
            error: normalizeError(error).message,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [descriptor.capability, signer, status, contextBinding, keyRefresh]);
  const checkingKeys =
    !!signer &&
    descriptor.capability?.status === 'available' &&
    status === 'ready' &&
    keyState?.binding !== contextBinding;
  const keyError = keyState?.binding === contextBinding ? keyState.error : undefined;
  const capability = descriptor.capability
    ? resolveOperationCapability(
        descriptor.capability,
        signer,
        keyState?.binding === contextBinding ? keyState.keys : [],
      )
    : {
        status: signer?.prepareSdk ? 'available' : 'requires-another-signer',
        reason: 'Connect an SDK-compatible signer on the wallet page.',
      };
  const signerSessionMatches = !signer?.sdk || signer.sdk === sdk;
  const capabilityAvailable =
    !checkingKeys && signerSessionMatches && capability.status === 'available' && !keyError;
  const retryKeyCheck = () => {
    setKeyState(null);
    setKeyRefresh((value) => value + 1);
  };

  // Show the key that will sign; executors resolve the same criteria again.
  const currentKeys = keyState?.binding === contextBinding ? keyState.keys : null;
  useEffect(() => {
    const signingCriteria = review?.descriptor.signingCriteria;
    if (!review || !signingCriteria || !currentKeys) return;
    let cancelled = false;
    void signingCriteria(review.sdk, review.options)
      .then((criteria) => selectSigningKey(currentKeys, criteria))
      .then(
        (key) => {
          if (!cancelled) setReviewKey({ review, key });
        },
        (error: unknown) => {
          if (!cancelled) setReviewKey({ review, error: normalizeError(error).message });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [review, currentKeys]);
  const reviewSigningKey = reviewKey?.review === review ? reviewKey : null;
  const signingKeyReady = !review?.descriptor.signingCriteria || !!reviewSigningKey?.key;

  // Keep only the redacted receipt once the inputs can no longer be submitted.
  const purgeSecrets = useCallback(() => {
    setOptions(null);
    setReview(null);
    setReviewKey(null);
    setSubmission((snapshot) => snapshot && withoutSecrets<TOptions, TResult>(snapshot));
  }, []);

  const reset = useCallback(() => {
    setReview(null);
    setReviewKey(null);
    setSubmission(null);
    setOptions(null);
    setDestructiveAck(false);
    setMainnetAck(false);
    setMainnetTyped('');
    setError(null);
    setResult(null);
    setActiveStep(0);
    setFormRevision((revision) => revision + 1);
  }, []);

  // Input edits invalidate review; context changes reset even a partially
  // built form. Keep a submitted receipt until its SDK call resolves, but
  // drop its secrets when the context (e.g. the cleared signer) changes.
  const previousContext = useRef(contextBinding);
  useEffect(() => {
    const changed = previousContext.current !== contextBinding;
    previousContext.current = contextBinding;
    if (submission) {
      if (changed) purgeSecrets();
    } else if (changed || (review && !reviewIsCurrent)) {
      reset();
      setNotice('Transaction context changed. Build and review the operation again.');
    }
  }, [contextBinding, review, reviewIsCurrent, submission, reset, purgeSecrets]);

  const onReview = () => {
    if (
      !sdk ||
      !signer ||
      status !== 'ready' ||
      sessionSignal?.aborted ||
      !capabilityAvailable ||
      options === null
    )
      return;
    setReview({
      descriptor,
      contextBinding,
      options: structuredClone(options),
      fingerprint: optionsFingerprint,
      sdk,
      signer,
      identityId: signer.identityId,
      network,
      trusted,
      sessionSignal,
    });
    setDestructiveAck(false);
    setMainnetAck(false);
    setMainnetTyped('');
    setNotice(null);
    setActiveStep(1);
  };
  const mainnetConfirmed = network !== 'mainnet' || (mainnetAck && mainnetTyped === 'MAINNET');
  const canProceed =
    reviewIsCurrent &&
    capabilityAvailable &&
    signingKeyReady &&
    (!descriptor.destructive || destructiveAck) &&
    mainnetConfirmed &&
    !busy;
  const onExecute = async () => {
    if (!review || !canProceed || !isCurrent(review) || inFlight.current) return;
    const submitted = { ...review, submittedAt: new Date().toISOString() };
    const sourceOptions = options;
    inFlight.current = true;
    setSubmission(submitted);
    setActiveStep(2);
    setBusy(true);
    setError(null);
    try {
      const r = await submitted.descriptor.execute({
        sdk: submitted.sdk,
        signer: submitted.signer,
        options: submitted.options,
        signingKeyId: reviewSigningKey?.key?.id,
        assertCurrent: () => {
          if (!isCurrent(submitted))
            throw new OperationNotSubmittedError(
              'The reviewed SDK session, signer, or inputs changed before submission.',
            );
        },
      });
      // Refresh only the network the operation actually used, even if the user
      // switched networks while the SDK was waiting for confirmation.
      void invalidateNetworkQueries(queryClient, submitted.network);
      if (!mounted.current) return;
      setResult(r);
      setActiveStep(3);
    } catch (e) {
      if (mounted.current) setError(normalizeError(e));
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        purgeSecrets();
      }
      if (submitted.descriptor.redactSecrets) {
        wipeBytes(submitted.options);
        wipeBytes(sourceOptions);
      }
    }
  };

  if (
    !submission &&
    (capability.status === 'unsupported' || capability.status === 'external-bridge')
  ) {
    return (
      <InfoBlock>
        <VStack align="stretch" spacing={3}>
          <Heading size="sm" color="gray.100">
            {descriptor.title}
          </Heading>
          <Badge
            alignSelf="flex-start"
            colorScheme={capability.status === 'external-bridge' ? 'blue' : 'orange'}
          >
            {capability.status === 'external-bridge' ? 'External bridge' : 'Unsupported'}
          </Badge>
          <Text fontSize="sm" color="gray.250">
            {capability.reason}
          </Text>
          {capability.status === 'external-bridge' &&
          descriptor.operationId === 'identity.topUp' ? (
            <IdentityTopUpForm key={formRevision} signer={signer} onOptionsChange={() => {}} />
          ) : null}
        </VStack>
      </InfoBlock>
    );
  }
  if (!signer && !submission) {
    return (
      <InfoBlock>
        <Heading size="sm" color="gray.100" mb={2}>
          No signer connected
        </Heading>
        <Text fontSize="sm" color="gray.250">
          Connect a signer at{' '}
          <NextLink href="/wallet/" style={{ color: 'var(--chakra-colors-brand-light)' }}>
            /wallet
          </NextLink>{' '}
          to broadcast state transitions.
        </Text>
      </InfoBlock>
    );
  }

  const Form = descriptor.FormComponent;
  const steps = ['Build', 'Review', 'Sign + broadcast', 'Result'];
  const notSubmitted = error instanceof OperationNotSubmittedError;
  const origin = submission ?? review;
  const entities = submission
    ? {
        ...receiptEntities(submission.options, submission.identityId),
        ...receiptEntities(result, submission.identityId),
        ...(error instanceof BroadcastOutcomeUnknownError ? error.entities : {}),
      }
    : {};
  // Undefined result fields must not overwrite identifiers collected from inputs.
  const receiptIdentifiers = Object.fromEntries(
    Object.entries(entities).filter(([, value]) => value !== undefined),
  );

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock emphasised>
        <VStack align="stretch" spacing={2}>
          <Heading size="md" color="gray.100">
            {origin?.descriptor.title ?? descriptor.title}
          </Heading>
          <Text fontSize="sm" color="gray.250">
            {origin?.descriptor.description ?? descriptor.description}
          </Text>
          <HStack>
            <Badge colorScheme="blue" variant="subtle">
              {origin?.network ?? network}
            </Badge>
            {(origin?.descriptor.destructive ?? descriptor.destructive) ? (
              <Badge colorScheme="red" variant="subtle">
                destructive
              </Badge>
            ) : null}
          </HStack>
        </VStack>
      </InfoBlock>
      <Stepper index={activeStep} colorScheme="blue" size="sm">
        {steps.map((title, i) => (
          <Step key={title}>
            <StepIndicator>
              <StepStatus
                complete={<StepIcon />}
                incomplete={<StepNumber />}
                active={<StepNumber />}
              />
            </StepIndicator>
            <StepTitle>{title}</StepTitle>
            {i < steps.length - 1 ? <StepSeparator /> : null}
          </Step>
        ))}
      </Stepper>
      <SignerStatusCard refreshId={keyRefresh} onRetry={retryKeyCheck} />
      {notice ? (
        <Text role="status" color="warning" fontSize="sm">
          {notice}
        </Text>
      ) : null}
      {!submission && descriptor.capability ? (
        <Text role="status" fontSize="sm" color={capabilityAvailable ? 'gray.250' : 'warning'}>
          {!signerSessionMatches
            ? 'Reconnect your signer for the current SDK session.'
            : checkingKeys
              ? 'Checking signer capabilities…'
              : keyError
                ? `Could not validate signer keys: ${keyError}`
                : capability.reason}
        </Text>
      ) : null}
      {!submission && keyError ? (
        <Button size="sm" alignSelf="flex-start" onClick={retryKeyCheck}>
          Retry signer capabilities
        </Button>
      ) : null}
      {!submission && signer ? (
        <InfoBlock display={activeStep === 0 ? undefined : 'none'}>
          <Form
            key={formRevision}
            signer={signer}
            network={getDerivationNetwork(network)}
            onOptionsChange={setOptions}
          />
          {status !== 'ready' || !sdk ? (
            <Text color="warning" fontSize="sm" mt={3}>
              Wait for the SDK connection before reviewing.
            </Text>
          ) : null}
          <HStack justify="flex-end" mt={4}>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={onReview}
              isDisabled={options === null || status !== 'ready' || !sdk || !capabilityAvailable}
            >
              Review
            </Button>
          </HStack>
        </InfoBlock>
      ) : null}
      {activeStep === 1 && reviewIsCurrent && review ? (
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Review
            </Heading>
            <Text color="gray.250">{review.descriptor.summarise(review.options)}</Text>
            <Text fontSize="sm" color="gray.250">
              Identity: {review.identityId} · Network: {review.network} ·{' '}
              {review.trusted ? 'trusted quorum source' : 'proof verification'}
            </Text>
            <CodeBlock
              value={review.descriptor.reviewData?.(review.options) ?? review.options}
            />
            {review.descriptor.signingCriteria ? (
              <Text
                fontSize="sm"
                role="status"
                color={reviewSigningKey?.error ? 'warning' : 'gray.250'}
              >
                {reviewSigningKey?.key
                  ? `Signing key: ${describeKey(reviewSigningKey.key)}`
                  : reviewSigningKey?.error
                    ? `No key can sign this operation: ${reviewSigningKey.error}`
                    : 'Selecting the signing key…'}
              </Text>
            ) : null}
            <Text fontSize="sm" color="gray.250">
              Fees: Platform deducts processing fees from the identity&apos;s credit balance when
              the transition executes. The SDK does not provide an estimate in advance, so the exact
              fee is only known afterwards.
            </Text>
            {descriptor.destructive ? (
              <InfoBlock>
                <VStack align="stretch" spacing={2}>
                  <Text color="danger" fontSize="sm" fontWeight={600}>
                    This operation destroys state.
                  </Text>
                  <Checkbox
                    isChecked={destructiveAck}
                    onChange={(e) => setDestructiveAck(e.target.checked)}
                  >
                    I understand this is not reversible.
                  </Checkbox>
                </VStack>
              </InfoBlock>
            ) : null}
            {network === 'mainnet' ? (
              <InfoBlock>
                <VStack align="stretch" spacing={2}>
                  <Text color="warning" fontSize="sm" fontWeight={600}>
                    Mainnet action — extra confirmation required.
                  </Text>
                  <Checkbox
                    isChecked={mainnetAck}
                    onChange={(e) => setMainnetAck(e.target.checked)}
                  >
                    I understand this will execute on mainnet.
                  </Checkbox>
                  <Input
                    size="sm"
                    aria-label="Mainnet confirmation"
                    value={mainnetTyped}
                    onChange={(e) => setMainnetTyped(e.target.value)}
                    placeholder="Type MAINNET to proceed"
                    bg="gray.800"
                    borderColor="gray.700"
                  />
                </VStack>
              </InfoBlock>
            ) : null}
            <HStack justify="space-between">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReview(null);
                  setDestructiveAck(false);
                  setMainnetAck(false);
                  setMainnetTyped('');
                  setActiveStep(0);
                }}
              >
                Back
              </Button>
              <Button
                size="sm"
                colorScheme="blue"
                onClick={() => void onExecute()}
                isDisabled={!canProceed}
              >
                Sign + broadcast
              </Button>
            </HStack>
          </VStack>
        </InfoBlock>
      ) : null}
      {activeStep === 2 && submission ? (
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Text color="gray.250">
              {busy
                ? 'Signing via your connected signer and broadcasting via DAPI…'
                : notSubmitted
                  ? 'Not submitted.'
                  : error
                    ? 'Outcome unknown.'
                    : 'Waiting for result.'}
            </Text>
            {error ? (
              <>
                <ErrorCard
                  title={notSubmitted ? 'Not submitted' : 'Outcome unknown'}
                  error={error}
                />
                {notSubmitted ? (
                  <Button
                    alignSelf="flex-start"
                    size="sm"
                    onClick={() => {
                      reset();
                      setNotice(null);
                    }}
                  >
                    Return to build and review
                  </Button>
                ) : (
                  <>
                    <Text color="warning" fontSize="sm">
                      This operation may have reached Platform. Check the affected entities on{' '}
                      {submission.network} before creating any new transaction. A timeout does not
                      prove rejection.
                    </Text>
                    <Button
                      alignSelf="flex-start"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void queryClient.invalidateQueries({
                          queryKey: ['npe', submission.network],
                        })
                      }
                    >
                      Refresh status
                    </Button>
                  </>
                )}
              </>
            ) : null}
            <OperationReceipt
              title={submission.descriptor.title}
              network={submission.network}
              trusted={submission.trusted}
              identityId={submission.identityId}
              submittedAt={submission.submittedAt}
              entities={receiptIdentifiers}
            />
          </VStack>
        </InfoBlock>
      ) : null}
      {activeStep === 3 && submission ? (
        <InfoBlock emphasised>
          <Heading size="sm" color="success" mb={3}>
            Broadcast succeeded
          </Heading>
          <Text color="gray.250" fontSize="sm" mb={3}>
            Affected queries on {submission.network} have been marked for refresh.
          </Text>
          <OperationReceipt
            title={submission.descriptor.title}
            network={submission.network}
            trusted={submission.trusted}
            identityId={submission.identityId}
            submittedAt={submission.submittedAt}
            entities={receiptIdentifiers}
            result={result}
          />
          <Button
            mt={4}
            size="sm"
            variant="outline"
            onClick={() => {
              reset();
              setNotice(null);
            }}
          >
            Build a new operation
          </Button>
        </InfoBlock>
      ) : null}
    </VStack>
  );
}
