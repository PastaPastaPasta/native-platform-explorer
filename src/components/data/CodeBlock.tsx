'use client';

import { Box, Code, HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon } from '@chakra-ui/icons';
import { useMemo, useState } from 'react';

export interface CodeBlockProps {
  value: unknown;
  collapsedHeight?: number;
  collapsible?: boolean;
  language?: string;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const rendered = JSON.stringify(value, replacer, 2);
    // JSON.stringify returns undefined for functions/symbols/etc. and can
    // return "{}" for WASM class instances whose state lives behind getters.
    // In either case, walk the object one level to surface a readable view.
    if (rendered === undefined || rendered === '{}') {
      const walked = walkInstance(value);
      return JSON.stringify(walked, replacer, 2) ?? String(value);
    }
    return rendered;
  } catch {
    // JSON.stringify threw (typically circular references on WASM classes).
    // Fall back to a shallow walk.
    try {
      return JSON.stringify(walkInstance(value), replacer, 2) ?? String(value);
    } catch {
      return String(value);
    }
  }
}

function replacer(_k: string, v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  // SDK classes typically expose `.toJSON()`; honour it before anything else.
  if (v && typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
    try {
      return (v as { toJSON: () => unknown }).toJSON();
    } catch {
      /* fall through to walkInstance below */
    }
  }
  if (v instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of v) out[String(k)] = val;
    return out;
  }
  if (v instanceof Set) return [...v];
  if (v instanceof Uint8Array) {
    return Array.from(v)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return v;
}

/** Walk an object/WASM class instance into a plain JSON-serialisable form.
 *  Handles three sources of state that JSON.stringify would otherwise miss:
 *    1) enumerable own properties (plain objects, wasm-bindgen direct fields)
 *    2) ES6 property-style getters on the prototype — `get contenders()` etc.
 *    3) zero-arg method-style getters — `getOwnerId()` / `getFoo()` — with
 *       the `get` prefix stripped.
 *  Recurses through nested values so deeply-wrapped responses unwrap fully. */
function walkInstance(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Uint8Array || value instanceof Map || value instanceof Set) return value;
  if (Array.isArray(value)) return value.map((v) => walkInstance(v, depth + 1));
  // Bail out of pathologically deep graphs to avoid infinite recursion on
  // classes whose getters return `this` or similar self-references.
  if (depth > 6) return value;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // 1) Enumerable own properties first (direct wasm-bindgen fields like
  //    ContestedResourceVoteState.contenders).
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__wbg_ptr') continue; // skip wasm pointer noise
    out[k] = walkInstance(v, depth + 1);
  }

  // 2) + 3) Walk prototype chain for getters we can read.
  let proto: object | null = Object.getPrototypeOf(obj) as object | null;
  const seen = new Set<string>();
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name === 'free' || seen.has(name)) continue;
      seen.add(name);
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc) continue;

      // ES6 getter: `get foo()` — read via obj[name].
      if (typeof desc.get === 'function') {
        if (name in out) continue;
        try {
          const raw = (obj as Record<string, unknown>)[name];
          out[name] = walkInstance(raw, depth + 1);
        } catch {
          /* skip getters that throw */
        }
        continue;
      }

      // Method-style: `getFoo()` with zero args. Map to `foo`.
      if (typeof desc.value === 'function' && name.startsWith('get') && name.length > 3) {
        const fn = desc.value as (...args: unknown[]) => unknown;
        if (fn.length !== 0) continue;
        const key = name[3]!.toLowerCase() + name.slice(4);
        if (key in out) continue;
        try {
          const raw = (fn as () => unknown).call(obj);
          out[key] = walkInstance(raw, depth + 1);
        } catch {
          /* skip getters that throw */
        }
      }
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return out;
}

export function CodeBlock({ value, collapsedHeight = 240, collapsible = true }: CodeBlockProps) {
  const text = useMemo(() => stringify(value), [value]);
  const [open, setOpen] = useState(false);
  const long = text.split('\n').length > 20 || text.length > 2000;

  return (
    <Box position="relative" borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.750">
      <HStack
        position="absolute"
        top={2}
        right={2}
        zIndex={2}
        bg="gray.800"
        borderRadius="md"
        px={1}
      >
        <Tooltip label="Copy" hasArrow>
          <IconButton
            aria-label="Copy"
            icon={<CopyIcon />}
            size="xs"
            variant="ghost"
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                void navigator.clipboard.writeText(text);
              }
            }}
          />
        </Tooltip>
        {collapsible && long ? (
          <Tooltip label={open ? 'Collapse' : 'Expand'} hasArrow>
            <IconButton
              aria-label="Toggle"
              icon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="xs"
              variant="ghost"
              onClick={() => setOpen((o) => !o)}
            />
          </Tooltip>
        ) : null}
      </HStack>
      <Code
        display="block"
        whiteSpace="pre"
        p={4}
        bg="gray.800"
        color="gray.100"
        fontFamily="mono"
        fontSize="xs"
        maxHeight={open || !collapsible || !long ? undefined : `${collapsedHeight}px`}
        overflow="auto"
      >
        {text}
      </Code>
    </Box>
  );
}
