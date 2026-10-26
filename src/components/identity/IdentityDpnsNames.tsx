'use client';

import { Badge, HStack, Text, Tooltip, VStack } from '@chakra-ui/react';
import { Alias } from '@components/data/Alias';
import { useDpnsIsContested } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { withNetwork } from '@util/exploration';

const CONTESTED_HELP =
  'A 3–19 character name using only a–z, 0, 1 and "-" is a contested name: masternodes vote before it is awarded. This identity holds it, so the vote is over.';

function NameRow({ name }: { name: string }) {
  const { network } = useSdk();
  // `dpns.isContestedUsername` checks the label against the contested-name
  // rule locally; it does not query whether a vote is open.
  const contestedQ = useDpnsIsContested(name);
  return (
    <HStack spacing={2} flexWrap="wrap">
      <Alias name={name} href={withNetwork(`/dpns/?name=${encodeURIComponent(name)}`, network)} />
      <Tooltip label="This identity owns the registered DPNS domain document." hasArrow>
        <Badge colorScheme="green" variant="subtle" fontSize="2xs">registered</Badge>
      </Tooltip>
      {contestedQ.data === true ? (
        <Tooltip label={CONTESTED_HELP} hasArrow>
          <Badge colorScheme="orange" variant="subtle" fontSize="2xs">contested name</Badge>
        </Tooltip>
      ) : null}
    </HStack>
  );
}

export function IdentityDpnsNames({ names }: { names: string[] | undefined | null }) {
  if (!names || names.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        No DPNS names registered for this identity.
      </Text>
    );
  }
  return (
    <VStack align="flex-start" spacing={2}>
      {names.map((n) => <NameRow key={n} name={n} />)}
      <Text fontSize="xs" color="gray.500">
        Names still in a masternode vote are not registered yet and appear on the contested-resources page instead.
      </Text>
    </VStack>
  );
}
