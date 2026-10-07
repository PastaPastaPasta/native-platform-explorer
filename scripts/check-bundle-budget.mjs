import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const KiB = 1024;
const MiB = 1024 * KiB;

// These budgets cover the initial JavaScript needed for the route and every
// ancestor layout. SDK chunks imported after hydration are intentionally absent.
export const ROUTE_BUDGETS = {
  '/page': { raw: 2 * MiB, gzip: 512 * KiB },
  '/identity/page': { raw: 2 * MiB, gzip: 512 * KiB },
  '/query/page': { raw: 2 * MiB, gzip: 512 * KiB },
  '/wallet/page': { raw: 2 * MiB, gzip: 512 * KiB },
  '/broadcast/page': { raw: 2 * MiB, gzip: 512 * KiB },
};

function entryFiles(pages, entry) {
  const files = pages[entry];
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== 'string')) {
    throw new Error(`Missing or invalid app-build-manifest entry: ${entry}`);
  }
  return files;
}

export function initialRouteFiles(pages, route) {
  const files = new Set(entryFiles(pages, '/layout'));
  const segments = route.split('/').filter(Boolean);
  for (let depth = 1; depth < segments.length; depth += 1) {
    const layout = `/${segments.slice(0, depth).join('/')}/layout`;
    if (Object.hasOwn(pages, layout)) {
      for (const file of entryFiles(pages, layout)) files.add(file);
    }
  }
  for (const file of entryFiles(pages, route)) files.add(file);
  const scripts = [...files].filter((file) => file.endsWith('.js'));
  if (scripts.length === 0) throw new Error(`No initial JavaScript found for ${route}`);
  return scripts;
}

/** Exported HTML includes ancestor layouts and only scripts requested at startup. */
export function exportedRouteFiles(html) {
  const files = new Set();
  for (const [element] of html.matchAll(/<!--[\s\S]*?-->|<script\b[^>]*>(?:[\s\S]*?<\/script\s*>|$)/gi)) {
    if (element.startsWith('<!--')) continue;
    const tag = element.slice(0, element.indexOf('>') + 1);
    const match = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (!match) continue; // Inline React hydration instructions are not files.
    const source = (match[1] ?? match[2] ?? match[3]).replace(/&amp;/gi, '&');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) {
      throw new Error(`Cannot measure remote initial script: ${source}`);
    }
    if (!source.startsWith('/')) throw new Error(`Unsupported initial script: ${source}`);
    const pathname = decodeURIComponent(source.split(/[?#]/)[0]);
    if (pathname.includes('\\') || pathname.split('/').some((part) => part === '.' || part === '..')) {
      throw new Error(`Unsafe initial script path: ${source}`);
    }
    const normalized = `/${pathname.replace(/^\/+/, '')}`;
    const marker = normalized.indexOf('/_next/static/');
    if (marker === -1 || !normalized.endsWith('.js')) {
      throw new Error(`Unsupported initial script: ${source}`);
    }
    // A GitHub Pages base path is a URL prefix, not a physical export directory.
    files.add(normalized.slice(marker + 1));
  }
  if (files.size === 0) throw new Error('Exported page has no initial script files');
  return [...files];
}

function routeAssets(buildDirectory) {
  const manifest = path.join(buildDirectory, 'app-build-manifest.json');
  if (existsSync(manifest)) {
    const { pages } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
      throw new Error('app-build-manifest.json must contain a pages object');
    }
    return { directory: buildDirectory, filesForRoute: (route) => initialRouteFiles(pages, route) };
  }

  // Next 16 no longer emits app-build-manifest.json. Use the shipped HTML
  // instead of evaluating executable client-reference manifests.
  const directory = path.basename(buildDirectory) === '.next'
    ? path.resolve(buildDirectory, '../out')
    : buildDirectory;
  return {
    directory,
    filesForRoute(route) {
      if (!/^\/(?:[\w-]+\/)*page$/.test(route)) throw new Error(`Unsupported route entry: ${route}`);
      const segments = route.split('/').filter(Boolean).slice(0, -1);
      const html = readFileSync(path.join(directory, ...segments, 'index.html'), 'utf8');
      return exportedRouteFiles(html);
    },
  };
}

export function measureInitialBundles(buildDirectory, budgets = ROUTE_BUDGETS) {
  const { directory, filesForRoute } = routeAssets(path.resolve(buildDirectory));
  const sizes = new Map();
  return Object.entries(budgets).map(([route, budget]) => {
    const files = filesForRoute(route).map((file) => {
      if (!sizes.has(file)) {
        const absolute = path.resolve(directory, file);
        const relative = path.relative(path.resolve(directory), absolute);
        if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
          throw new Error(`Build manifest asset escapes the build directory: ${file}`);
        }
        const bytes = readFileSync(absolute);
        sizes.set(file, { file, raw: bytes.length, gzip: gzipSync(bytes).length });
      }
      return sizes.get(file);
    });
    const raw = files.reduce((sum, file) => sum + file.raw, 0);
    const gzip = files.reduce((sum, file) => sum + file.gzip, 0);
    return { route, raw, gzip, budget, files, passed: raw <= budget.raw && gzip <= budget.gzip };
  });
}

function formatBytes(bytes) {
  return bytes >= MiB ? `${(bytes / MiB).toFixed(2)} MiB` : `${(bytes / KiB).toFixed(1)} KiB`;
}

export function checkBundleBudgets(nextDirectory, write = console.log) {
  const results = measureInitialBundles(nextDirectory);
  for (const result of results) {
    write(`${result.passed ? 'PASS' : 'FAIL'} ${result.route}: ${formatBytes(result.gzip)} gzip ` +
      `(limit ${formatBytes(result.budget.gzip)}), ${formatBytes(result.raw)} raw ` +
      `(limit ${formatBytes(result.budget.raw)})`);
    if (!result.passed) {
      for (const file of [...result.files].sort((a, b) => b.gzip - a.gzip).slice(0, 3)) {
        write(`  ${file.file}: ${formatBytes(file.gzip)} gzip`);
      }
    }
  }
  return results.every((result) => result.passed);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const defaultDirectory = fileURLToPath(new URL('../.next', import.meta.url));
  try {
    if (!checkBundleBudgets(process.argv[2] ?? defaultDirectory)) process.exitCode = 1;
  } catch (error) {
    console.error(`Bundle budget check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
