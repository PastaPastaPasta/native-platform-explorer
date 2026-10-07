/** Getter-shaped fixture reconstructed from the pinned rc.2 SDK's live error
 * in /tmp/npe-improvements/live-sdk-diagnosis/rc2.log; no SDK response is mocked. */
export const SDK_PROOF_DECODE_MESSAGE = 'grovedb: data corruption error: unable to decode proof: Other("proof layer has too many children")';

export function nativeProofError(message = SDK_PROOF_DECODE_MESSAGE): unknown {
  return Object.create({
    get name() { return 'Proof'; },
    get kind() { return 4; },
    get code() { return -1; },
    get message() { return message; },
  }, { __wbg_ptr: { value: 1, enumerable: true } });
}
