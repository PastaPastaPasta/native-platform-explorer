import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the actually-installed @dashevo/evo-sdk version at build time so the UI
// can show which SDK the bundle was compiled against. We read the package's
// own package.json straight from node_modules (its `exports` map blocks
// `require.resolve('.../package.json')`), reflecting the real installed
// version — dev tags and all.
function readEvoSdkVersion() {
  try {
    const pkgPath = path.join(__dirname, 'node_modules/@dashevo/evo-sdk/package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
const evoSdkVersion = readEvoSdkVersion();

// GitHub Pages serves project sites from /<repo-name>/. The deploy workflow
// sets NEXT_PUBLIC_BASE_PATH to the repo name (e.g. '/native-platform-explorer')
// so internal links and Next's asset prefix resolve correctly. Local dev
// leaves it unset and the app mounts at '/'.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Next's default build ID is random, which was the only difference between two
// builds of the same commit. A reproducible one (see /about and
// scripts/verify-integrity.mjs) is the commit plus a digest of the settings
// that change the output: the base path and NEXT_PUBLIC_* values (from the
// environment or .env files, which Next has loaded by now). It must differ
// whenever the output does: a page whose RSC payloads name another build ID
// is reloaded instead of mixing two builds' chunks. Uncommitted changes, or
// no git, get a random ID. NPE_BUILD_ID overrides it, e.g. in tests.
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
const gitCommit = git('rev-parse', 'HEAD') ?? '';
function reproducibleBuildId() {
  if (!gitCommit || git('status', '--porcelain', '--untracked-files=no') !== '') return null;
  const settings = Object.entries(process.env)
    .filter(([name]) => name.startsWith('NEXT_PUBLIC_') && name !== 'NEXT_PUBLIC_BASE_PATH')
    .sort(([a], [b]) => a.localeCompare(b));
  // Same commit and settings can still yield different bytes with another
  // installed dependency set or Node major; a shared ID would then make old
  // tabs request chunks the new build's integrity map refuses.
  const toolchain = {
    lockfile: createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'pnpm-lock.yaml'))).digest('hex'),
    node: process.versions.node.split('.')[0],
  };
  const digest = createHash('sha256').update(JSON.stringify({ basePath, settings, toolchain })).digest('hex');
  return `${gitCommit}-${digest.slice(0, 12)}`;
}
const buildId = process.env.NPE_BUILD_ID || reproducibleBuildId() || randomBytes(12).toString('base64url');

// Webpack's default deterministic module IDs hash each module's identifier.
// Next's client entry modules embed absolute source paths in theirs, so the
// IDs (and every chunk naming them) changed with the checkout directory, and
// nobody could reproduce CI's build elsewhere. This assigns IDs the same way
// from identifiers with the project directory replaced by a placeholder.
class PortableModuleIdsPlugin {
  apply(compiler) {
    const root = compiler.context;
    const portable = (identifier) => [root, encodeURIComponent(root)]
      .reduce((name, form) => name.split(form).join('<root>'), identifier);
    compiler.hooks.compilation.tap('PortableModuleIdsPlugin', (compilation) => {
      compilation.hooks.moduleIds.tap('PortableModuleIdsPlugin', (modules) => {
        const { chunkGraph } = compilation;
        const used = new Set();
        const pending = [];
        for (const module of modules) {
          const id = chunkGraph.getModuleId(module);
          if (id !== null) used.add(String(id));
          else if (module.needId && chunkGraph.getNumberOfModuleChunks(module) > 0) {
            pending.push([portable(module.identifier()), module]);
          }
        }
        pending.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        // Like webpack: a power-of-ten range with room for 20 IDs per module.
        let range = 1000;
        while (range < pending.length * 20 + used.size) range *= 10;
        for (const [name, module] of pending) {
          for (let salt = 0; ; salt += 1) {
            const id = Number.parseInt(createHash('sha256').update(`${name}#${salt}`).digest('hex').slice(0, 12), 16) % range;
            if (!used.has(String(id))) {
              used.add(String(id));
              chunkGraph.setModuleId(module, id);
              break;
            }
          }
        }
      });
    });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath || undefined,
  generateBuildId: () => buildId,
  env: {
    // Exposed to client code via process.env; see src/version.ts.
    NEXT_PUBLIC_EVO_SDK_VERSION: evoSdkVersion,
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
    // Always inlined: unset would leave a runtime process.env lookup while
    // CI's empty value inlines "", so the two builds differed.
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'src/styles')],
  },
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization.moduleIds = false;
      config.plugins.push(new PortableModuleIdsPlugin());
    }

    // Markdown raw imports (used in /about, /sdk-reference pages later).
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });

    // WASM is loaded from the @dashevo/evo-sdk bundle at runtime, but make sure
    // webpack tolerates the async WASM experiment if bundling decides to include it.
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      topLevelAwait: true,
    };

    return config;
  },
};

export default nextConfig;
