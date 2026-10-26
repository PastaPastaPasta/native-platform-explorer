import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

// Recorded public responses of quorums.<network>.networks.dash.org (/quorums,
// /previous, a trimmed /masternodes). Every SDK session is trusted, so the real
// SDK fetches these on connect; serving them lets offline tests reach a ready
// session. They supply quorum keys only: no DAPI response or proof outcome.
const SERVICE = /^quorums\.(testnet|mainnet)\.networks\.dash\.org$/;
const ENDPOINTS = new Set(['quorums', 'previous', 'masternodes']);

function fixture(network: string, endpoint: string): string {
  return readFileSync(new URL(`./fixtures/quorums/${network}-${endpoint}.json`, import.meta.url), 'utf8');
}

/** Fulfil a quorum-service request from fixtures. Returns false for any other URL. */
export async function fulfillQuorumService(route: Route): Promise<boolean> {
  const url = new URL(route.request().url());
  const network = SERVICE.exec(url.hostname)?.[1];
  const endpoint = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!network || !ENDPOINTS.has(endpoint)) return false;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: fixture(network, endpoint),
  });
  return true;
}

/** Serve the local export and quorum fixtures; abort (or delegate) every other
 *  request, so DAPI and third-party endpoints are an explicit outage. */
export async function routeOffline(page: Page, external?: (route: Route) => Promise<void>) {
  await page.route(/^https?:\/\//, async (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === '127.0.0.1' || hostname === 'localhost') return route.continue();
    if (await fulfillQuorumService(route)) return;
    if (external) return external(route);
    return route.abort('failed');
  });
}
