'use client';

import { HStack } from '@chakra-ui/react';
import { Identifier } from './Identifier';
import { Alias } from './Alias';
import { useDpnsAlias } from '@sdk/useDpnsAlias';
import { useSdk } from '@sdk/hooks';
import { withNetwork } from '@util/exploration';

/** Identifier with an auto-resolved DPNS alias chip. Use for every identity ID
 *  rendered in the app so DPNS-everywhere (PRD §11.5) holds. */
export function IdentityLink({
  id,
  dense = false,
  showAlias = true,
  avatar = false,
}: {
  id: string;
  dense?: boolean;
  showAlias?: boolean;
  avatar?: boolean;
}) {
  const { network } = useSdk();
  const { alias, isContested } = useDpnsAlias(id);
  return (
    <HStack spacing={2} as="span" display="inline-flex">
      <Identifier
        value={id}
        href={withNetwork(`/identity/?id=${encodeURIComponent(id)}`, network)}
        avatar={avatar}
        dense={dense}
        highlight="both"
      />
      {showAlias && alias ? (
        <Alias
          name={alias}
          status={isContested ? 'contested' : 'ok'}
          href={withNetwork(`/dpns/?name=${encodeURIComponent(alias)}`, network)}
          size="xs"
        />
      ) : null}
    </HStack>
  );
}
