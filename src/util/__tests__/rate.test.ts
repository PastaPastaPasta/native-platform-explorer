import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDashUsdRate } from '../rate';

const COINBASE = 'https://api.coinbase.com/v2/prices/DASH-USD/spot';
const KUCOIN = 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=DASH-USDT';

function mockFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (!(url in responses)) throw new TypeError('Failed to fetch'); // CORS-blocked
    return new Response(JSON.stringify(responses[url]), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDashUsdRate', () => {
  // Regression: KuCoin sends no CORS headers, so a KuCoin-first default logged
  // a blocked request in the console on every page load.
  it('defaults to Coinbase and never touches KuCoin', async () => {
    const fetchMock = mockFetch({ [COINBASE]: { data: { amount: '50.6' } } });
    await expect(fetchDashUsdRate()).resolves.toMatchObject({ price: 50.6, source: 'coinbase' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([COINBASE]);
  });

  it('returns null without falling back to KuCoin when Coinbase fails', async () => {
    const fetchMock = mockFetch({});
    await expect(fetchDashUsdRate('coinbase')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit kucoin selection, falling back to Coinbase', async () => {
    const fetchMock = mockFetch({ [COINBASE]: { data: { amount: '51' } } });
    await expect(fetchDashUsdRate('kucoin')).resolves.toMatchObject({ price: 51, source: 'coinbase' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([KUCOIN, COINBASE]);
  });

  it('returns null when disabled', async () => {
    const fetchMock = mockFetch({});
    await expect(fetchDashUsdRate('none')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
