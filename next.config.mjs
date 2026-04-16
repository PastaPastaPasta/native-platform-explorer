import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
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
