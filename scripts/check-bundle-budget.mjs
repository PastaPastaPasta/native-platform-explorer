import { readFileSync } from 'node:fs';
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

export function measureInitialBundles(nextDirectory, budgets = ROUTE_BUDGETS) {
  const { pages } = JSON.parse(readFileSync(path.join(nextDirectory, 'app-build-manifest.json'), 'utf8'));
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
    throw new Error('app-build-manifest.json must contain a pages object');
  }

  const sizes = new Map();
  return Object.entries(budgets).map(([route, budget]) => {
    const files = initialRouteFiles(pages, route).map((file) => {
      if (!sizes.has(file)) {
        const absolute = path.resolve(nextDirectory, file);
        const relative = path.relative(path.resolve(nextDirectory), absolute);
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
