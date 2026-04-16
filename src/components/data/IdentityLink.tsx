'use client';

import { HStack } from '@chakra-ui/react';
import { Identifier } from './Identifier';
import { Alias } from './Alias';
import { useDpnsAlias } from '@sdk/useDpnsAlias';

/** Identifier with an auto-resolved DPNS alias chip. Use for every identity ID
 *  rendered in the app so DPNS-everywhere (PRD §11.5) holds. */
export function IdentityLink({
  id,
  dense = false,
  showAlias = true,
  avatar = true,
}: {
  id: string;
  dense?: boolean;
  showAlias?: boolean;
  avatar?: boolean;
}) {
  const { alias, isContested } = useDpnsAlias(id);
  return (
    <HStack spacing={2} as="span" display="inline-flex">
      <Identifier
        value={id}
        href={`/identity/?id=${encodeURIComponent(id)}`}
        avatar={avatar}
        dense={dense}
        highlight="both"
      />
      {showAlias && alias ? (
        <Alias
          name={alias}
          status={isContested ? 'contested' : 'ok'}
          href={`/dpns/?name=${encodeURIComponent(alias)}`}
          size="xs"
        />
      ) : null}
    </HStack>
  );
}
