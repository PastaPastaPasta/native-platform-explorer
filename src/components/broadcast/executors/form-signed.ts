// Execution for operations signed with keys entered in their form. Like
// withSigningMaterial: every failure before `submit` is "not submitted", every
// failure once `submit` starts is "outcome unknown", and the WASM key material
// registered with `onRelease` is freed whatever happens.

import {
  BroadcastOutcomeUnknownError,
  OperationNotSubmittedError,
  submitOperation,
  type ReceiptEntities,
} from '../outcomes';

export type Submit = <T>(
  write: () => Promise<T>,
  entities: ReceiptEntities,
  assertCurrent?: () => void,
) => Promise<T>;

export async function executeFormSigned<T>(
  fn: (submit: Submit, onRelease: (release: () => void) => void) => Promise<T>,
): Promise<T> {
  const releases: (() => void)[] = [];
  let submitted: ReceiptEntities | null = null;
  const submit: Submit = async (write, entities, assertCurrent) => {
    assertCurrent?.();
    submitted = entities;
    return submitOperation(write, entities);
  };
  try {
    return await fn(submit, (release) => releases.push(release));
  } catch (error) {
    if (
      error instanceof BroadcastOutcomeUnknownError ||
      error instanceof OperationNotSubmittedError
    )
      throw error;
    if (submitted) throw new BroadcastOutcomeUnknownError(error, submitted);
    throw new OperationNotSubmittedError(error);
  } finally {
    for (const release of releases.reverse()) {
      try {
        release();
      } catch {
        /* best-effort */
      }
    }
  }
}
