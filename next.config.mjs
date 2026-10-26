import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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

// Next's default build ID is random, which was the only difference between two
// builds of the same commit. The commit makes the export reproducible (see
// /about and scripts/verify-integrity.mjs). NPE_BUILD_ID overrides it, e.g.
// to simulate a deploy in tests; without git the ID stays random.
function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
const gitCommit = readGitCommit();
const buildId = process.env.NPE_BUILD_ID || gitCommit || randomBytes(12).toString('base64url');

// GitHub Pages serves project sites from /<repo-name>/. The deploy workflow
// sets NEXT_PUBLIC_BASE_PATH to the repo name (e.g. '/native-platform-explorer')
// so internal links and Next's asset prefix resolve correctly. Local dev
// leaves it unset and the app mounts at '/'.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

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
  },
  images: {
    unoptimized: true,
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'src/styles')],
  },
  webpack: (config) => {
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
