import { extractErrorMessage } from '@sdk/errors';

/** Only errors explicitly raised before a write call are safe to rebuild. */
export class OperationNotSubmittedError extends Error {
  constructor(cause: unknown) {
    super(extractErrorMessage(cause), { cause });
    this.name = 'OperationNotSubmittedError';
  }
}

export interface ReceiptEntities {
  identityId?: string;
  /** Platform addresses (bech32m) the operation spent from or paid to. */
  addresses?: string[];
  recipientId?: string;
  contractId?: string;
  documentType?: string;
  documentId?: string;
  tokenId?: string;
  /** An identity a token operation acts on (frozen, unfrozen, destroyed). */
  targetIdentityId?: string;
}

/** The SDK does not expose a reliable broadcast boundary or rejection type.
 * Once a write call starts, transport/timeout errors cannot prove rejection. */
export class BroadcastOutcomeUnknownError extends Error {
  constructor(
    cause: unknown,
    readonly entities: ReceiptEntities = {},
  ) {
    super(extractErrorMessage(cause), { cause });
    this.name = 'BroadcastOutcomeUnknownError';
  }
}

/**
 * WASM error kinds the pinned SDK (5.0.0-rc.8) raises only before a write
 * method submits its transition: `InvalidArgument` is a local kind never
 * mapped from network errors, and `NotImplemented` marked unwired APIs (5.0
 * no longer raises it). Every other failure inside a write call, including
 * 5.0's `ExecutionNotProved` after an accepted broadcast, stays "outcome
 * unknown". The audit is recorded in outcomes.test.ts.
 */
const PRE_SUBMISSION_SDK_ERRORS = new Set(['InvalidArgument', 'NotImplemented']);

/** The kind of a WASM SDK error, or undefined for anything else. */
export function sdkErrorName(error: unknown): string | undefined {
  // WasmSdkError / WasmDppError are plain wasm-bindgen objects, not Errors.
  if (!error || typeof error !== 'object' || error instanceof Error) return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

export function isPreSubmissionSdkError(error: unknown): boolean {
  return PRE_SUBMISSION_SDK_ERRORS.has(sdkErrorName(error) ?? '');
}

export async function submitOperation<T>(
  submit: () => Promise<T>,
  entities: ReceiptEntities,
  assertCurrent?: () => void,
): Promise<T> {
  assertCurrent?.();
  try {
    return await submit();
  } catch (error) {
    if (isPreSubmissionSdkError(error)) throw new OperationNotSubmittedError(error);
    throw new BroadcastOutcomeUnknownError(error, entities);
  }
}

/**
 * Receipt identifiers in `value` (the reviewed inputs or the result). With a
 * connected signer the identity is always the signer: form inputs must not
 * redirect receipt links. Form-signed operations have no signer, so their
 * identity is the one the reviewed inputs or the confirmed result name.
 */
export function receiptEntities(value: unknown, signerIdentityId: string | null): ReceiptEntities {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const string = (key: string) =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined;
  const addresses = Array.isArray(record.addresses)
    ? record.addresses.filter((address): address is string => typeof address === 'string')
    : [];
  const entities = {
    identityId: signerIdentityId ?? string('identityId'),
    recipientId: string('recipientId'),
    contractId: string('contractId'),
    documentType: string('documentType'),
    documentId: string('documentId'),
    addresses: addresses.length ? addresses : undefined,
    tokenId: string('tokenId'),
    targetIdentityId: string('targetIdentityId'),
  };
  return Object.fromEntries(Object.entries(entities).filter(([, value]) => value !== undefined));
}
