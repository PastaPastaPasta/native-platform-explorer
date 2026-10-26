'use client';

// Token write operations for the /broadcast registry. Forms and executors load
// on demand so the console's initial bundle does not carry them.

import dynamic from 'next/dynamic';
import { Text } from '@chakra-ui/react';
import type { OperationDescriptor, OperationFormProps } from '../OperationShell';
import type { ExecuteArgs } from '../executors';
import type { TokenResult } from '../executors/tokens';
import { summariseTokenOperation, tokenOperationIsDestructive } from './review';
import { tokenOperationId, type TokenOperationKind, type TokenOperationOptions } from './options';

const TokenOperationForm = dynamic(
  () => import('../forms/tokens/TokenOperationForm').then((module) => module.TokenOperationForm),
  {
    ssr: false,
    loading: () => (
      <Text fontSize="sm" color="gray.400">
        Loading the token form…
      </Text>
    ),
  },
);

async function execute(args: ExecuteArgs<TokenOperationOptions>): Promise<TokenResult> {
  const { executeTokenOperation } = await import('../executors/tokens');
  return executeTokenOperation(args);
}

export interface TokenOperationSpec {
  id: string;
  label: string;
  blurb: string;
  descriptor: OperationDescriptor<TokenOperationOptions, TokenResult>;
}

const SPECS: Array<[TokenOperationKind, string, string, string]> = [
  ['mint', 'Mint tokens', 'Issue new tokens, if the token\'s rules authorize you.', 'Creates new tokens. The token\'s minting rule decides who may mint and whether you choose the recipient; the max supply caps the total.'],
  ['burn', 'Burn tokens', 'Destroy tokens from your balance.', 'Removes tokens from your balance and from the total supply. This cannot be undone.'],
  ['transfer', 'Transfer tokens', 'Send tokens to another identity.', 'Moves tokens from your balance to another identity. Paused tokens and frozen balances cannot be transferred.'],
  ['freeze', 'Freeze a balance', 'Stop an identity from sending a token.', 'Freezes an identity\'s balance of the token: it can no longer send it until unfrozen.'],
  ['unfreeze', 'Unfreeze a balance', 'Let a frozen identity send a token again.', 'Unfreezes an identity\'s balance of the token.'],
  ['destroyFrozen', 'Destroy frozen funds', 'Remove a frozen balance from the supply.', 'Destroys the whole frozen balance of an identity. The tokens are gone for good.'],
  ['emergencyAction', 'Pause or resume', 'Stop or restart transfers of a token.', 'Pausing stops transfers between holders until the token is resumed; minting, burning and purchases continue.'],
  ['setPrice', 'Set the direct-purchase price', 'Sell a token for credits at a single or tiered price.', 'Sets, replaces or removes the price at which anyone can buy the token directly from Platform with credits.'],
  ['directPurchase', 'Buy tokens directly', 'Buy a token at its direct-purchase price.', 'Buys newly issued tokens at the token\'s direct-purchase price, paid from your identity\'s credits.'],
  ['claim', 'Claim a distribution', 'Collect tokens a distribution owes you.', 'Claims what a perpetual, pre-programmed or once-per-identity distribution currently owes your identity.'],
  ['configUpdate', 'Update token configuration', 'Change a token setting or who governs it.', 'Changes one item of the token configuration: a value such as the max supply, or who may act on or administer a rule.'],
];

function formFor(kind: TokenOperationKind) {
  function TokenForm(props: OperationFormProps<TokenOperationOptions>) {
    return <TokenOperationForm kind={kind} {...props} />;
  }
  TokenForm.displayName = `TokenForm(${kind})`;
  return TokenForm;
}

export const TOKEN_OPERATION_SPECS: TokenOperationSpec[] = SPECS.map(([kind, label, blurb, description]) => ({
  id: tokenOperationId(kind),
  label,
  blurb,
  descriptor: {
    title: label,
    description,
    destructive:
      kind === 'burn' || kind === 'destroyFrozen' || kind === 'emergencyAction'
        ? true
        : kind === 'configUpdate'
          ? tokenOperationIsDestructive
          : undefined,
    secrets: 'none',
    FormComponent: formFor(kind),
    summarise: summariseTokenOperation,
    execute,
  },
}));
