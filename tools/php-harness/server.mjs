/**
 * PHP/cPanel harness server.
 *
 *   node server.mjs <port> <docroot>
 *
 * Serves a CodeIgniter docroot through php-wasm (PHP 8.2, with the MySQL
 * extension) so the cPanel build can be exercised without Apache, PHP-FPM or a
 * terminal. Requests that do not match a real file fall through to index.php,
 * which is what the app's .htaccess does on cPanel.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PHP, PHPRequestHandler } from '@php-wasm/universal';
import { loadNodeRuntime, createNodeFsMountHandler } from '@php-wasm/node';

const port = Number(process.argv[2] || 8082);
const docroot = (process.argv[3] || '/home/user/deploy-test/final-a').replace(/\/$/, '');
const version = process.argv[4] || '8.2';

const php = new PHP(await loadNodeRuntime(version, {
  // Without an explicit process id the WASM loader refuses to initialise.
  emscriptenOptions: { processId: Number(process.env.PHP_PROCESS_ID || 1) },
}));
// Mount the docroot into the WASM filesystem; the host root is not visible by
// default, which is why a docroot path alone resolves to 404.
await php.mkdirTree('/www');
await php.mount('/www', createNodeFsMountHandler(docroot));
php.chdir('/www');
const handler = new PHPRequestHandler({
  php,
  documentRoot: '/www',
  absoluteUrl: `http://0.0.0.0:${port}`,
  getFileNotFoundAction: () => ({ type: 'internal-redirect', uri: '/index.php' }),
});

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  // Emulate the shipped .htaccess: the cPanel host would refuse these before
  // PHP ever ran. Without this the WASM harness would happily serve .env.
  const pathname = (req.url || '/').split('?')[0];
  const denied =
    pathname === '/.env' || pathname.endsWith('/.env') ||
    /\.(sql|md|json)$/i.test(pathname) && (pathname.startsWith('/database') || pathname === '/composer.json' || pathname === '/composer.lock') ||
    pathname.startsWith('/application/') || pathname.startsWith('/system/') ||
    pathname.startsWith('/database/');
  if (denied) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // DirectoryIndex: cPanel's Apache serves index.html ahead of index.php, so
  // the SPA shell is the homepage and CodeIgniter only handles what is not a
  // real file (the front-controller rewrite below).
  if ((pathname === '/' || pathname === '') && fs.existsSync(path.join(docroot, 'index.html'))) {
    const html = fs.readFileSync(path.join(docroot, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  try {
    const out = await handler.request({
      url: req.url,
      method: req.method,
      headers,
      body: body.length ? body : undefined,
    });
    const outHeaders = { ...(out.headers || {}) };
    delete outHeaders['content-length'];
    // Emit every header value, not just the first: Set-Cookie, traceparent etc.
    const flat = {};
    for (const [k, v] of Object.entries(outHeaders)) {
      flat[k] = Array.isArray(v) ? v : [v];
    }
    res.writeHead(out.httpStatusCode || 200, flat);
    res.end(Buffer.from(out.bytes || new Uint8Array()));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('harness error: ' + (e && e.stack ? e.stack : String(e)));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`PHP ${version} harness listening on ${port} — docroot ${docroot}`);
});
