// Walks the IPFS UnixFS tree behind app-authnow.eth.limo using the gateway's
// ?format=raw (dag-pb blocks) so EVERY file is found — including ones the HTML
// never links to (e.g. _redirects, _headers, source maps).
const fs = require('fs');
const path = require('path');

const BASE = 'https://app-authnow.eth.limo';
const OUT = path.join(__dirname, 'site');

function varint(buf, pos) {
  let result = 0, shift = 0, b;
  do {
    b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return [result, pos];
}

// Minimal protobuf field reader -> [{field, wire, value}]
function readFields(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = varint(buf, pos);
    const field = tag >>> 3, wire = tag & 7;
    if (wire === 0) {
      let v; [v, pos] = varint(buf, pos);
      out.push({ field, wire, value: v });
    } else if (wire === 2) {
      let len; [len, pos] = varint(buf, pos);
      out.push({ field, wire, value: buf.subarray(pos, pos + len) });
      pos += len;
    } else {
      throw new Error('unsupported wire type ' + wire);
    }
  }
  return out;
}

function parsePBNode(block) {
  const node = { data: null, links: [] };
  for (const f of readFields(block)) {
    if (f.field === 1) node.data = f.value;
    if (f.field === 2) {
      const link = { hash: null, name: '', tsize: 0 };
      for (const lf of readFields(f.value)) {
        if (lf.field === 1) link.hash = lf.value;
        if (lf.field === 2) link.name = lf.value.toString('utf8');
        if (lf.field === 3) link.tsize = lf.value;
      }
      node.links.push(link);
    }
  }
  return node;
}

// UnixFS Data: field1 Type (0 raw,1 dir,2 file,3 meta,4 symlink,5 HAMT), field3 filesize
function parseUnixfs(data) {
  const u = { type: 2, filesize: null };
  if (!data) return u;
  for (const f of readFields(data)) {
    if (f.field === 1) u.type = f.value;
    if (f.field === 3) u.filesize = f.value;
  }
  return u;
}

function cidCodec(hash) {
  if (hash[0] === 0x12 && hash.length === 34) return 0x70; // CIDv0 = dag-pb
  const [, p1] = varint(hash, 0); // version
  const [codec] = varint(hash, p1);
  return codec;
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}

async function rawBlock(p, isDir) {
  const base = BASE + enc(p) + (isDir && !p.endsWith('/') ? '/' : '');
  const r = await get(base + '?format=raw');
  if (!r.ok) throw new Error('raw ' + p + ' -> HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

const manifest = [];
const problems = [];

async function download(p, expectedSize) {
  const r = await get(BASE + enc(p));
  if (!r.ok) throw new Error('GET ' + p + ' -> HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const dest = path.join(OUT, ...p.split('/').filter(Boolean));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  if (expectedSize != null && expectedSize !== buf.length) {
    problems.push(`size mismatch ${p}: expected ${expectedSize}, got ${buf.length}`);
  }
  manifest.push({ path: p, bytes: buf.length, etag: (r.headers.get('etag') || '').replace(/"/g, '') });
}

async function walkDir(p, block) {
  const node = parsePBNode(block);
  const u = parseUnixfs(node.data);
  if (u.type === 5) problems.push('HAMT-sharded directory (not fully handled): ' + p);
  fs.mkdirSync(path.join(OUT, ...p.split('/').filter(Boolean)), { recursive: true });
  for (const link of node.links) {
    const child = (p === '' ? '' : p) + '/' + link.name;
    const codec = cidCodec(link.hash);
    if (codec === 0x55) {
      await download(child, null); // raw leaf = small file
    } else {
      const b = await rawBlock(child, false);
      const n = parsePBNode(b);
      const cu = parseUnixfs(n.data);
      if (cu.type === 1 || cu.type === 5) {
        const full = await rawBlock(child, true);
        await walkDir(child, full);
      } else {
        await download(child, cu.filesize);
      }
    }
  }
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  const root = await rawBlock('', true);
  await walkDir('', root);
  fs.writeFileSync(
    path.join(__dirname, 'manifest.json'),
    JSON.stringify({ base: BASE, files: manifest, problems }, null, 2),
  );
  const total = manifest.reduce((a, f) => a + f.bytes, 0);
  console.log(`files: ${manifest.length}  total: ${(total / 1024).toFixed(1)} KB`);
  console.log('problems:', problems.length ? problems : 'none');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
