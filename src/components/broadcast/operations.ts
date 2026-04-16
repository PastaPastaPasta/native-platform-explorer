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

// We ship a focused set of representative operations covering identity funding,
// DPNS registration, and raw state-transition broadcast. The OperationShell +
// form pattern is the canonical extension point: each new form plugs in here
// and the `/broadcast` console picks it up automatically.
export const OPERATIONS: OperationEntry[] = [
  {
    facade: 'identities',
    op: 'topUp',
    descriptor: {
      title: 'Top up an identity',
      description: 'Add credits to your identity by spending L1 DASH via an asset lock.',
      FormComponent: IdentityTopUpForm,
      summarise: (o: IdentityTopUpOptions) =>
        `Top up identity ${o.identityId} by ${o.amountDash} DASH.`,
      execute: async ({ sdk, options }: { sdk: unknown; options: IdentityTopUpOptions }) => {
        // `identities.topUp` shape depends on the SDK build — some variants
        // take a funding address / asset lock, others a signer. We delegate
        // the real call through a thin wrapper below.
        const s = sdk as {
          identities: {
            topUp?: (args: IdentityTopUpOptions) => Promise<unknown>;
          };
        };
        if (!s.identities.topUp) {
          throw new Error(
            'identities.topUp is not exposed by this SDK build. Upgrade @dashevo/evo-sdk or use a different facade.',
          );
        }
        return s.identities.topUp(options);
      },
    } as OperationDescriptor<IdentityTopUpOptions, unknown> as OperationDescriptor<unknown, unknown>,
  },
  {
    facade: 'dpns',
    op: 'registerName',
    descriptor: {
      title: 'Register a DPNS name',
      description: 'Claim an unregistered DPNS label for your identity.',
      FormComponent: DpnsRegisterForm,
      summarise: (o: DpnsRegisterOptions) =>
        `Register ${o.label}.dash for identity ${o.identityId}.`,
      execute: async ({ sdk, signer, options }: { sdk: unknown; signer: unknown; options: DpnsRegisterOptions }) => {
        const s = sdk as {
          dpns: { registerName?: (args: unknown) => Promise<unknown> };
        };
        if (!s.dpns.registerName) {
          throw new Error('dpns.registerName is not exposed by this SDK build.');
        }
        return s.dpns.registerName({ ...options, signer });
      },
    } as OperationDescriptor<DpnsRegisterOptions, unknown> as OperationDescriptor<unknown, unknown>,
  },
  {
    facade: 'stateTransitions',
    op: 'broadcastAndWait',
    descriptor: {
      title: 'Broadcast a raw state transition',
      description:
        'Paste a hex-encoded state transition and broadcast it. Power-user escape hatch — used for ops not yet exposed via a dedicated form.',
      FormComponent: StateTransitionBroadcastForm,
      summarise: (o: RawBroadcastOptions) =>
        `Broadcast ${o.stHex.length / 2} bytes of raw state transition.`,
      execute: async ({ sdk, options }: { sdk: unknown; options: RawBroadcastOptions }) => {
        const s = sdk as {
          stateTransitions: {
            broadcastStateTransition?: (st: Uint8Array) => Promise<unknown>;
          };
        };
        if (!s.stateTransitions.broadcastStateTransition) {
          throw new Error('stateTransitions.broadcastStateTransition is not exposed.');
        }
        const bytes = Uint8Array.from(
          options.stHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
        );
        return s.stateTransitions.broadcastStateTransition(bytes);
      },
    } as OperationDescriptor<RawBroadcastOptions, unknown> as OperationDescriptor<unknown, unknown>,
  },
];
