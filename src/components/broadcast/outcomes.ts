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
  recipientId?: string;
  contractId?: string;
  documentType?: string;
  documentId?: string;
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
 * WASM error kinds the pinned SDK (4.0.0-rc.2) raises only while reading a
 * write method's options, before any request: `InvalidArgument` is a local
 * kind never mapped from network errors, and `NotImplemented` marks unwired
 * APIs. Every other failure inside a write call stays "outcome unknown".
 */
const PRE_SUBMISSION_SDK_ERRORS = new Set(['InvalidArgument', 'NotImplemented']);

export function isPreSubmissionSdkError(error: unknown): boolean {
  // WasmSdkError / WasmDppError are plain wasm-bindgen objects, not Errors.
  if (!error || typeof error !== 'object' || error instanceof Error) return false;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' && PRE_SUBMISSION_SDK_ERRORS.has(name);
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

export function receiptEntities(value: unknown, identityId: string): ReceiptEntities {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const string = (key: string) =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined;
  const entities = {
    // Always the signer: form inputs must not redirect receipt links.
    identityId,
    recipientId: string('recipientId'),
    contractId: string('contractId'),
    documentType: string('documentType'),
    documentId: string('documentId'),
  };
  return Object.fromEntries(Object.entries(entities).filter(([, value]) => value !== undefined));
}
