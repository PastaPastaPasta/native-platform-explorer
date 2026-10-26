import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Serve the exact export at its deployment prefix, without SPA fallbacks that
// would conceal missing routes or broken asset paths in browser tests.
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** A static server for an export directory. `setRoot` swaps the directory,
 *  which lets browser tests simulate a deploy. */
export function createExportServer({ root = 'out', basePath = '' } = {}) {
  let directory = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
        response.writeHead(404).end();
        return;
      }
      let file = resolve(directory, `.${pathname.slice(basePath.length) || '/'}`);
      if (file !== directory && !file.startsWith(`${directory}${sep}`)) {
        response.writeHead(404).end();
        return;
      }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.setRoot = (next) => {
    directory = resolve(next);
  };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const port = Number(process.env.NPE_PREVIEW_PORT || 3100);
  const server = createExportServer({ basePath });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Static export: http://127.0.0.1:${port}${basePath}/`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
