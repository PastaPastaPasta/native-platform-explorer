'use client';

import { useEffect, useState } from 'react';
import { Button, CloseButton, HStack, Text } from '@chakra-ui/react';
import { startServiceWorker } from '@util/service-worker';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');
// Production exports only: `next dev` serves no sw.js. A build with
// NEXT_PUBLIC_SERVICE_WORKER=off also removes a worker an earlier deploy
// installed (and ships an unregistering sw.js, see scripts/harden-export.mjs).
const enabled = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SERVICE_WORKER !== 'off';
// The build the page's HTML came from (scripts/harden-export.mjs writes the
// meta into every exported page). Read before hydration touches <head>.
const pageBuildId = typeof document === 'undefined'
  ? ''
  : document.querySelector<HTMLMetaElement>('meta[name="npe-build"]')?.content ?? '';

/** Registers the offline service worker and offers a reload when a newer
 *  deploy is ready. */
export function ServiceWorkerManager() {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let stop: (() => void) | undefined;
    // Register after the page's own resources have loaded.
    const start = () => {
      stop = startServiceWorker({
        container: navigator.serviceWorker,
        scriptUrl: `${basePath}/sw.js`,
        scope: `${basePath}/`,
        buildId: pageBuildId,
        enabled,
        onUpdate: (next) => setApply(() => next),
        reload: () => window.location.reload(),
      });
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      stop?.();
    };
  }, []);

  if (!apply) return null;
  return (
    <HStack
      role="status"
      aria-live="polite"
      position="fixed"
      bottom={4}
      left="50%"
      transform="translateX(-50%)"
      zIndex="toast"
      spacing={3}
      px={4}
      py={3}
      maxW="calc(100vw - 2rem)"
      bg="surface"
      border="1px solid"
      borderColor="hairlineStrong"
      borderRadius="md"
      boxShadow="lg"
    >
      <Text fontSize="sm" color="ink">A new version of the explorer is available.</Text>
      <Button size="sm" colorScheme="blue" onClick={apply}>Reload</Button>
      <CloseButton size="sm" aria-label="Dismiss update notice" onClick={() => setApply(null)} />
    </HStack>
  );
}
