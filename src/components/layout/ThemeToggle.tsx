'use client';

import { HStack, IconButton, Tooltip, useColorMode } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

type Mode = 'system' | 'paper' | 'carbon';

const STORAGE_KEY = 'npe.theme';
const CHAKRA_KEY = 'chakra-ui-color-mode';

function readStored(): Mode {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'paper' || v === 'carbon' ? v : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function ThemeToggle() {
  const { setColorMode } = useColorMode();
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    const stored = readStored();
    setMode(stored);
    if (stored === 'paper') setColorMode('light');
    else if (stored === 'carbon') setColorMode('dark');
  }, [setColorMode]);

  // Follow the OS only while the *stored* preference is 'system'. We read the
  // persisted value rather than the `mode` state: on mount this effect runs
  // before the effect above has committed `setMode(stored)`, so the state is
  // still its 'system' default — gating on that would clobber an explicit
  // paper/carbon choice with the OS preference on every reload. (`mode` stays
  // in the deps purely so the listener re-attaches when the user toggles.)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (readStored() !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setColorMode(mql.matches ? 'dark' : 'light');
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode, setColorMode]);

  const choose = (next: Mode) => {
    setMode(next);
    if (next === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(CHAKRA_KEY);
      setColorMode(systemPrefersDark() ? 'dark' : 'light');
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
      setColorMode(next === 'carbon' ? 'dark' : 'light');
    }
  };

  const btn = (target: Mode, label: string, glyph: string) => {
    const active = mode === target;
    return (
      <Tooltip label={label} openDelay={400} placement="bottom" key={target}>
        <IconButton
          aria-label={label}
          aria-pressed={active}
          variant="ghost"
          size="xs"
          fontFamily="mono"
          fontSize="11px"
          minW="22px"
          h="22px"
          color={active ? 'accent' : 'muted'}
          borderRadius="badge"
          onClick={() => choose(target)}
          icon={<span aria-hidden>{glyph}</span>}
          _hover={{ color: 'ink', bg: 'transparent' }}
        />
      </Tooltip>
    );
  };

  return (
    <HStack
      spacing={0}
      border="1px solid"
      borderColor="hairline"
      borderRadius="card"
      px={1}
      py="2px"
    >
      {btn('paper', 'Paper (light)', '◐')}
      {btn('system', 'Follow system', '◑')}
      {btn('carbon', 'Carbon (dark)', '●')}
    </HStack>
  );
}
