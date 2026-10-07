// @vitest-environment node
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { WasmSdkError } from '@dashevo/evo-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractErrorMessage, normalizeError } from '../errors';

afterEach(() => { vi.unstubAllGlobals(); });

describe('SDK error formatting', () => {
  it('preserves native Error instances and their existing causes', () => {
    const error = new Error('connection failed', { cause: new Error('socket closed') });
    expect(normalizeError(error)).toBe(error);
    expect(extractErrorMessage(error)).toBe('connection failed');
  });

  it.each(['network request failed', 42, null, undefined])('normalizes primitive failures: %s', (failure) => {
    expect(normalizeError(failure).message).toBe(String(failure));
    expect(normalizeError(failure).cause).toBe(failure);
  });

  it('reads a useful getter even when another SDK getter throws', () => {
    class ConnectionFailure {
      get message() { return 'quorums service unavailable'; }
      get name() { throw new Error('disposed getter'); }
    }
    expect(extractErrorMessage(new ConnectionFailure())).toBe('ConnectionFailure: quorums service unavailable');
  });

  it('formats the actual pinned SDK rejection from an offline trusted connection', async () => {
    const sdkModule = await realpath(new URL('../../../node_modules/@dashevo/evo-sdk/package.json', import.meta.url));
    const binary = createRequire(sdkModule).resolve('@dashevo/wasm-sdk/raw/wasm_sdk_bg.wasm');
    const sdk = await import('@dashevo/evo-sdk');
    sdk.initSync({ module: await readFile(binary) });
    // Block every HTTP request; this calls the actual SDK without network access.
    const fetch = vi.fn().mockRejectedValue(new TypeError('Blocked quorum request fixture'));
    vi.stubGlobal('fetch', fetch);
    let rejection: unknown;
    try { await sdk.EvoSDK.testnetTrusted().connect(); }
    catch (error) { rejection = error; }

    expect(fetch).toHaveBeenCalled();
    expect(rejection).toBeInstanceOf(sdk.WasmSdkError);
    expect(rejection).not.toBeInstanceOf(Error);
    expect(String(rejection)).toBe('[object Object]');
    const original = rejection as WasmSdkError;
    expect(original.message).toMatch(/Failed to prefetch quorums: HTTP request error/);
    const normalized = normalizeError(original);
    expect(normalized.message).toContain(original.message);
    expect(normalized.message).not.toContain('[object Object]');
    expect(normalized.cause).toBe(original);
    original.free();
  });
});
