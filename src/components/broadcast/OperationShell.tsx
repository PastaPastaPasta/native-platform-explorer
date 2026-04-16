'use client';

import { useState } from 'react';
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
  useSteps,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { SignerStatusCard } from './SignerStatusCard';
import { useSigner } from '@/signer/SignerProvider';
import { useSdk } from '@sdk/hooks';
import type { EvoSDK } from '@dashevo/evo-sdk';
import type { ExplorerSigner } from '@/signer/types';

export interface OperationFormProps<TOptions> {
  signer: ExplorerSigner;
  network: 'mainnet' | 'testnet';
  onOptionsChange: (options: TOptions | null) => void;
}

export interface OperationDescriptor<TOptions, TResult> {
  title: string;
  description: string;
  destructive?: boolean;
  FormComponent: React.ComponentType<OperationFormProps<TOptions>>;
  summarise: (options: TOptions) => string;
  execute: (args: { sdk: EvoSDK; signer: ExplorerSigner; options: TOptions }) => Promise<TResult>;
  renderResult?: (result: TResult) => React.ReactNode;
}

export function OperationShell<TOptions, TResult>({
  descriptor,
}: {
  descriptor: OperationDescriptor<TOptions, TResult>;
}) {
  const { signer } = useSigner();
  const { sdk, network } = useSdk();
  const [options, setOptions] = useState<TOptions | null>(null);
  const [destructiveAck, setDestructiveAck] = useState(false);
  const [mainnetAck, setMainnetAck] = useState(false);
  const [mainnetTyped, setMainnetTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const steps = [
    { title: 'Build' },
    { title: 'Review' },
    { title: 'Sign + broadcast' },
    { title: 'Result' },
  ];
  const { activeStep, setActiveStep } = useSteps({ index: 0, count: steps.length });

  if (!signer) {
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

  const isMainnet = network === 'mainnet';
  const mainnetConfirmed = !isMainnet || (mainnetAck && mainnetTyped === 'MAINNET');
  const canProceed =
    options !== null &&
    (!descriptor.destructive || destructiveAck) &&
    mainnetConfirmed;

  const onExecute = async () => {
    if (!sdk || !options) return;
    setBusy(true);
    setError(null);
    try {
      const r = await descriptor.execute({ sdk, signer, options });
      setResult(r);
      setActiveStep(3);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const Form = descriptor.FormComponent;

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock emphasised>
        <VStack align="stretch" spacing={2}>
          <Heading size="md" color="gray.100">
            {descriptor.title}
          </Heading>
          <Text fontSize="sm" color="gray.250">
            {descriptor.description}
          </Text>
          <HStack>
            <Badge colorScheme="blue" variant="subtle">
              {network}
            </Badge>
            {descriptor.destructive ? (
              <Badge colorScheme="red" variant="subtle">
                destructive
              </Badge>
            ) : null}
          </HStack>
        </VStack>
      </InfoBlock>

      <Stepper index={activeStep} colorScheme="blue" size="sm">
        {steps.map((s, i) => (
          <Step key={s.title}>
            <StepIndicator>
              <StepStatus complete={<StepIcon />} incomplete={<StepNumber />} active={<StepNumber />} />
            </StepIndicator>
            <StepTitle>{s.title}</StepTitle>
            {i < steps.length - 1 ? <StepSeparator /> : null}
          </Step>
        ))}
      </Stepper>

      <SignerStatusCard />

      {activeStep === 0 ? (
        <InfoBlock>
          <Form signer={signer} network={network} onOptionsChange={setOptions} />
          <HStack justify="flex-end" mt={4}>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={() => setActiveStep(1)}
              isDisabled={options === null}
            >
              Review
            </Button>
          </HStack>
        </InfoBlock>
      ) : null}

      {activeStep === 1 ? (
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Review
            </Heading>
            {options ? (
              <>
                <Text color="gray.250">{descriptor.summarise(options)}</Text>
                <CodeBlock value={options} />
              </>
            ) : null}

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

            {isMainnet ? (
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
              <Button size="sm" variant="ghost" onClick={() => setActiveStep(0)}>
                Back
              </Button>
              <Button
                size="sm"
                colorScheme="blue"
                onClick={() => {
                  setActiveStep(2);
                  void onExecute();
                }}
                isDisabled={!canProceed}
              >
                Sign + broadcast
              </Button>
            </HStack>
          </VStack>
        </InfoBlock>
      ) : null}

      {activeStep === 2 ? (
        <InfoBlock>
          <Text color="gray.250">
            {busy
              ? 'Signing via your connected signer and broadcasting via DAPI…'
              : error
                ? 'Broadcast failed.'
                : 'Waiting for result.'}
          </Text>
          {error ? <ErrorCard error={error} onRetry={() => void onExecute()} /> : null}
        </InfoBlock>
      ) : null}

      {activeStep === 3 && result ? (
        <InfoBlock emphasised>
          <Heading size="sm" color="success" mb={3}>
            Broadcast succeeded
          </Heading>
          {descriptor.renderResult ? descriptor.renderResult(result) : <CodeBlock value={result} />}
        </InfoBlock>
      ) : null}
    </VStack>
  );
}
