'use client';

import type { OperationDescriptor } from './OperationShell';
import { IdentityTopUpForm, type IdentityTopUpOptions } from './forms/IdentityTopUp';
import { DpnsRegisterForm, type DpnsRegisterOptions } from './forms/DpnsRegister';
import { StateTransitionBroadcastForm, type RawBroadcastOptions } from './forms/RawBroadcast';

export type FacadeKey = 'identities' | 'dpns' | 'stateTransitions';

export interface OperationEntry {
  facade: FacadeKey;
  op: string;
  descriptor: OperationDescriptor<unknown, unknown>;
}

// Preview-only gate used by forms that collect the right shape but can't yet
// wire the SDK's IdentitySigner / AssetLockProof plumbing. Surfaces a clear
// "not yet implemented — requires IdentitySigner bridge" message so users
// don't hit cryptic WASM type errors on a button labelled "Broadcast". The
// form + OperationShell + summary still demonstrate the Build → Review →
// Sign → Broadcast flow end-to-end; only the final SDK call is gated.
function previewOnly(operation: string): never {
  throw new Error(
    `${operation} requires the SDK's IdentitySigner bridge (Identity + ` +
      `IdentityPublicKey + IdentitySigner instance), which is tracked as a ` +
      `follow-up. The form and review steps are ready; only the final SDK call ` +
      `is gated in this build.`,
  );
}

function makeEntry<O, R>(
  facade: FacadeKey,
  op: string,
  descriptor: OperationDescriptor<O, R>,
): OperationEntry {
  return { facade, op, descriptor: descriptor as OperationDescriptor<unknown, unknown> };
}

// We ship a focused set of representative operations covering identity
// funding, DPNS registration, and raw state-transition broadcast. Each new
// form plugs in via `makeEntry` and `/broadcast` picks it up automatically.
export const OPERATIONS: OperationEntry[] = [
  makeEntry<IdentityTopUpOptions, unknown>('identities', 'topUp', {
    title: 'Top up an identity',
    description:
      'Add credits to your identity by spending L1 DASH via an asset lock. Preview only in this build — the final broadcast is gated until the IdentitySigner bridge lands.',
    FormComponent: IdentityTopUpForm,
    summarise: (o) => `Top up identity ${o.identityId} by ${o.amountDash} DASH.`,
    execute: async () => previewOnly('identities.topUp'),
  }),
  makeEntry<DpnsRegisterOptions, unknown>('dpns', 'registerName', {
    title: 'Register a DPNS name',
    description:
      'Claim an unregistered DPNS label for your identity. Preview only in this build — the final broadcast is gated until the IdentitySigner bridge lands.',
    FormComponent: DpnsRegisterForm,
    summarise: (o) => `Register ${o.label}.dash for identity ${o.identityId}.`,
    execute: async () => previewOnly('dpns.registerName'),
  }),
  makeEntry<RawBroadcastOptions, unknown>('stateTransitions', 'broadcastAndWait', {
    title: 'Broadcast a raw state transition',
    description:
      'Paste a hex-encoded state transition. Preview only — broadcastStateTransition takes a StateTransition class instance, not raw bytes, so the final call is gated until a deserialisation helper lands.',
    FormComponent: StateTransitionBroadcastForm,
    summarise: (o) => `Broadcast ${o.stHex.length / 2} bytes of raw state transition.`,
    execute: async () => previewOnly('stateTransitions.broadcastStateTransition'),
  }),
];
