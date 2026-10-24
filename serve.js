// Zero-dependency local server for the recovered static site.
// Mimics what the IPFS/ENS gateway (eth.limo) does:
//   - /dir  -> 301 /dir/  and serves dir/index.html
//   - applies ./site/_redirects ONLY when the requested path does not exist
//     (exactly like the IPFS "web redirects file" spec).
//
//   node serve.js            # http://localhost:4173
//   PORT=8000 node serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, process.env.SITE_DIR || (fs.existsSync(path.join(__dirname, 'site-integrado')) ? 'site-integrado' : 'site'));
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.bin': 'application/octet-stream',
  '.ico': 'image/x-icon',
};

// ---- _redirects -----------------------------------------------------------
function loadRedirects() {
  const file = path.join(ROOT, '_redirects');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [from, to, status] = l.split(/\s+/);
      const names = [];
      const re = new RegExp(
        '^' +
          from
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, n) => (names.push(n), '([^/]+)'))
            .replace(/\*/g, () => (names.push('splat'), '(.*)')) +
          '$',
      );
      return { re, names, to, status: Number(status) || 301 };
    });
}
const REDIRECTS = loadRedirects();

function applyRedirects(pathname, search) {
  for (const r of REDIRECTS) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => (params[n] = m[i + 1]));
    let to = r.to.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, n) => params[n] ?? '');
    if (to.includes(':splat')) to = to.replace(':splat', params.splat ?? '');
    return { to, status: r.status, search };
  }
  return null;
}

// ---- static serving -------------------------------------------------------
function resolveFile(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(ROOT, clean);
  if (!abs.startsWith(ROOT)) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

function send(res, status, file) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let abs = resolveFile(url.pathname);

    if (abs && fs.statSync(abs).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search });
        return res.end();
      }
      const idx = path.join(abs, 'index.html');
      abs = fs.existsSync(idx) ? idx : null;
    }
    if (abs) return send(res, 200, abs);

    const hit = applyRedirects(url.pathname, url.search);
    if (hit) {
      if (hit.status >= 300 && hit.status < 400) {
        const qs = hit.to.includes('?') ? '' : url.search;
        res.writeHead(hit.status, { Location: hit.to + qs });
        return res.end();
      }
      const target = resolveFile(hit.to);
      if (target && fs.statSync(target).isFile()) return send(res, hit.status, target);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  })
  .listen(PORT, () => console.log(`Serving ${ROOT}\n  http://localhost:${PORT}`));
