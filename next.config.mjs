import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  images: {
    unoptimized: true,
  },
  sassOptions: {
    includePaths: [path.join(__dirname, 'src/styles')],
  },
  experimental: {
    esmExternals: true,
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
