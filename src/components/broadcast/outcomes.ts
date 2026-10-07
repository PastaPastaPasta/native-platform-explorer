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

export async function submitOperation<T>(
  submit: () => Promise<T>,
  entities: ReceiptEntities,
  assertCurrent?: () => void,
): Promise<T> {
  assertCurrent?.();
  try {
    return await submit();
  } catch (error) {
    throw new BroadcastOutcomeUnknownError(error, entities);
  }
}

export function receiptEntities(value: unknown, identityId: string): ReceiptEntities {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const string = (key: string) =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined;
  const entities = {
    identityId: string('identityId') ?? identityId,
    recipientId: string('recipientId'),
    contractId: string('contractId'),
    documentType: string('documentType'),
    documentId: string('documentId'),
  };
  return Object.fromEntries(Object.entries(entities).filter(([, value]) => value !== undefined));
}
