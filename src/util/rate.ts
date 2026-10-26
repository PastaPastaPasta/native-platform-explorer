// Fetch DASH/USD from a public ticker. Coinbase sends CORS headers, so it is
// the default in browsers. KuCoin's public API sends none: browsers block the
// request and log a console error on every page load. It stays selectable
// (with Coinbase fallback) for deployments that proxy or rewrite it.
// Returns null if every provider fails — the UI must degrade gracefully.

export interface DashUsdRate {
  price: number;
  fetchedAt: number;
  source: 'kucoin' | 'coinbase';
}

async function fetchKucoin(signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=DASH-USDT',
      { signal },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { code?: string; data?: { price?: string } };
    const raw = json?.data?.price;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function fetchCoinbase(signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/DASH-USD/spot', { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { amount?: string } };
    const raw = json?.data?.amount;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function fetchDashUsdRate(
  preferred: 'kucoin' | 'coinbase' | 'none' = 'coinbase',
  signal?: AbortSignal,
): Promise<DashUsdRate | null> {
  if (preferred === 'none') return null;
  const now = Date.now();
  if (preferred === 'kucoin') {
    const k = await fetchKucoin(signal);
    if (k !== null) return { price: k, fetchedAt: now, source: 'kucoin' };
    const c = await fetchCoinbase(signal);
    if (c !== null) return { price: c, fetchedAt: now, source: 'coinbase' };
    return null;
  }
  const c = await fetchCoinbase(signal);
  if (c !== null) return { price: c, fetchedAt: now, source: 'coinbase' };
  return null;
}
