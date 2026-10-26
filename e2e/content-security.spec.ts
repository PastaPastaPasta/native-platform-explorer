import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { routeOffline } from './quorum-fixtures';

// The export's per-page CSP <meta> and SRI attributes (PRD §11.11), checked in
// a real browser: the policy must not block the app's own scripts, styles,
// WASM or workers, and integrity must hold for the scripts the webpack runtime
// loads after startup (the SDK chunk among them). Network is an outage here
// apart from quorum fixtures, which get the real SDK chunk loaded and started.

async function recordViolations(page: Page) {
  const violations: string[] = [];
  await page.exposeFunction('npeReportViolation', (text: string) => { violations.push(text); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { npeReportViolation: (text: string) => void })
        .npeReportViolation(`${event.violatedDirective} ${event.blockedURI} ${event.sample}`);
    });
  });
  return violations;
}

const ROUTES = ['', 'query/', 'wallet/', 'broadcast/', 'about/', 'settings/', 'network/status/', 'sdk-reference/', 'tools/', 'offline/'];

test('main routes run under the CSP without violations', async ({ page }) => {
  test.setTimeout(60_000);
  const violations = await recordViolations(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await routeOffline(page);
  for (const route of ROUTES) {
    await page.goto(`${route}?network=testnet`);
    await expect(page.getByRole('banner').getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible();
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(policy).toMatch(/script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/]+=*')+;/);
  }
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
  // The recorder works: an injected inline script is blocked and reported.
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.npeInjected = true';
    document.head.append(script);
  });
  await expect.poll(() => violations).toEqual([expect.stringMatching(/^script-src-elem inline/)]);
  expect(await page.evaluate(() => 'npeInjected' in window)).toBe(false);
});

test('the proof parser WASM compiles under the CSP', async ({ page }) => {
  const violations = await recordViolations(page);
  await routeOffline(page);
  await page.goto('tools/?tool=proof&network=testnet');
  const proof = readFileSync(new URL('../src/components/query-inspector/__tests__/fixtures/testnet-dpns-domain-asc.bin', import.meta.url));
  await page.getByPlaceholder(/Paste hex/).fill(proof.toString('hex'));
  await expect(page.getByText(/LayerProof/).first()).toBeVisible();
  expect(violations).toEqual([]);
});

test('chunks loaded after startup carry integrity, and a tampered chunk is refused', async ({ page }) => {
  await page.addInitScript(() => {
    const loaded: Array<[string, string]> = [];
    (window as unknown as { npeChunks: typeof loaded }).npeChunks = loaded;
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function appendChild<T extends Node>(this: Node, node: T): T {
      if (node instanceof HTMLScriptElement && node.dataset.webpack) loaded.push([node.src, node.integrity]);
      return append.call(this, node) as T;
    };
  });
  await routeOffline(page);
  await page.goto('?network=testnet');
  // The SDK chunk loads once the session starts.
  await expect.poll(() => page.evaluate(() => (window as unknown as { npeChunks: unknown[] }).npeChunks.length)).toBeGreaterThan(0);
  const chunks = await page.evaluate(() => (window as unknown as { npeChunks: Array<[string, string]> }).npeChunks);
  for (const [src, integrity] of chunks) expect(integrity, src).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);

  const target = chunks[0]![0];
  const refused = page.waitForEvent('console', (message) => message.type() === 'error' && /integrity/i.test(message.text()));
  await page.route(target, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n// tampered` });
  });
  await page.reload();
  expect((await refused).text()).toContain(new URL(target).pathname);
});
