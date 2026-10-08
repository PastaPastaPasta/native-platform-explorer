/** The deployment selected by the explorer operator; builds may override it. */
export const DEFAULT_BRIDGE_URL = 'https://bridge.dashhq.org';

/**
 * The bridge reads network, but does not prefill top-up mode or identity.
 * Unknown networks fall back to Testnet there, so never hand them off silently.
 */
export function getBridgeUrl(
  network: string,
  configuredUrl = process.env.NEXT_PUBLIC_BRIDGE_URL ?? DEFAULT_BRIDGE_URL,
): string | null {
  if (network !== 'mainnet' && network !== 'testnet') return null;
  if (!configuredUrl.trim()) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.search || url.hash) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    url.searchParams.set('network', network);
    return url.href;
  } catch {
    return null;
  }
}
