import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 3303);
const HOST = process.env.HOST || '127.0.0.1';
const DIST_DIR = process.env.DIST_DIR || '/opt/portal-web/dist';
const MATRIX_AUTH_BRIDGE_URL = process.env.MATRIX_AUTH_BRIDGE_URL || 'http://127.0.0.1:3302';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function proxyApi(req, res, targetPath) {
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readRawBody(req);
  const upstream = await fetch(`${MATRIX_AUTH_BRIDGE_URL}${targetPath}`, {
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'] || 'application/json',
      'x-forwarded-email': req.headers['x-forwarded-email'] || '',
      'x-forwarded-preferred-username': req.headers['x-forwarded-preferred-username'] || '',
      'x-forwarded-access-token': req.headers['x-forwarded-access-token'] || '',
      authorization: req.headers['authorization'] || '',
    },
    body,
  });
  const respBody = await upstream.text();
  res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(respBody);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/app/api/')) {
    try {
      await proxyApi(req, res, url.pathname.replace(/^\/app/, '') + url.search);
    } catch (err) {
      console.error(err);
      res.writeHead(502);
      res.end();
    }
    return;
  }

  // Strip the "/app" prefix (Vite is built with base "/app/") to map onto dist/ on disk.
  let relPath = url.pathname.replace(/^\/app\/?/, '');
  if (relPath === '') relPath = 'index.html';

  let filePath = path.join(DIST_DIR, relPath);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Client-side route (e.g. /app/chats) -> serve the SPA shell.
      // Never cache index.html: it references hashed asset filenames that
      // change on every deploy, and mobile carriers love caching HTML.
      fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    const cacheControl = ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cacheControl });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`portal-web listening on http://${HOST}:${PORT}, serving ${DIST_DIR}`);
});
