'use client';

import NextLink from 'next/link';
import { Button, HStack, Text } from '@chakra-ui/react';
import { useSigner } from '@/signer/SignerProvider';

interface OpLink {
  op: string;
  label: string;
  params?: Record<string, string>;
  /** When set, only show when `useSigner().signer?.identityId === ownsTo`. */
  ownsTo?: string;
}

interface WriteActionsProps {
  links: OpLink[];
  title?: string;
  size?: 'xs' | 'sm';
}

function buildHref(op: string, params?: Record<string, string>): string {
  const qp = new URLSearchParams();
  qp.set('op', op);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v) qp.set(k, v);
  }
  return `/broadcast/?${qp.toString()}`;
}

/** Renders contextual "Create document" / "Edit document" / "Top up" buttons
 *  that deep-link into the broadcast console. Hides ownsTo-gated actions unless
 *  the target belongs to the connected identity. Signers are cleared outside
 *  /wallet and /broadcast, so the public reconnect hint stands in for them on
 *  read pages; the console still requires a live signer to sign. */
export function WriteActions({ links, title, size = 'sm' }: WriteActionsProps) {
  const { signer, stash } = useSigner();
  const identityId = signer?.identityId ?? stash?.identityId;
  const visible = links.filter((l) => !l.ownsTo || identityId === l.ownsTo);
  if (visible.length === 0) return null;

  return (
    <HStack spacing={2} flexWrap="wrap" align="center">
      {title ? (
        <Text fontSize="xs" color="gray.400" mr={1}>
          {title}
        </Text>
      ) : null}
      {visible.map((l) => (
        <Button
          key={l.op + (l.params ? JSON.stringify(l.params) : '')}
          as={NextLink}
          href={buildHref(l.op, l.params)}
          size={size}
          variant="outline"
          colorScheme="blue"
        >
          {l.label}
        </Button>
      ))}
    </HStack>
  );
}
