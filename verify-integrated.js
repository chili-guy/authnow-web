// Verificação independente do site-integrado (não reutiliza o código do build).
//   node verify-integrated.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const ORIG = path.join(ROOT, 'site');
const NEW = path.join(ROOT, 'site-integrado');
const LOTES = [
  ['authnow.com.br-2026-09-09-13000', path.join(ROOT, '../entrega-authnow-qr/codigos-13000.csv')],
  ['authnow.com.br-2026-09-12-8000', path.join(ROOT, '../entrega-authnow-qr/codigos-8000-lote2.csv')],
];

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  ✅ ' : '  ❌ ') + msg); if (!c) failures++; };

// ---- mesma lógica do site (chunk 1067) ----
function makeLookup(dir) {
  const batches = JSON.parse(fs.readFileSync(path.join(dir, 'registry/batches.json'), 'utf8'));
  const cache = new Map();
  const shard = (n) => { if (!cache.has(n)) cache.set(n, fs.readFileSync(path.join(dir, 'registry/units', n + '.bin'))); return cache.get(n); };
  return (code) => {
    if (!code) return { verdict: 'unknown', issuer: null };
    const h = crypto.createHash('sha256').update('authnow:' + code).digest();
    const e = shard(h[0].toString(16).padStart(2, '0'));
    let lo = 0, hi = e.length / 7 - 1, v = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, o = 7 * mid;
      let c = 0;
      for (let i = 0; i < 5 && c === 0; i++) c = e[o + i] - h[1 + i];
      if (c === 0) { v = (e[o + 5] << 8) | e[o + 6]; break; }
      c < 0 ? (lo = mid + 1) : (hi = mid - 1);
    }
    if (v === null) return { verdict: 'unknown', issuer: null };
    const b = batches[v & 0x7fff];
    const issuer = b?.issuer ?? null;
    if (v & 0x8000) return { verdict: 'revoked', issuer, batch: b?.id };
    return { verdict: b?.status === 'recalled' ? 'recalled' : 'valid', issuer, batch: b?.id };
  };
}
const look = makeLookup(NEW);

console.log('1) Todos os códigos dos CSVs resolvem como válidos, no lote certo');
let total = 0;
for (const [id, csv] of LOTES) {
  const codes = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',')[0]);
  let good = 0;
  for (const c of codes) { const r = look(c); if (r.verdict === 'valid' && r.issuer === 'authnow' && r.batch === id) good++; }
  total += codes.length;
  ok(good === codes.length, `${id}: ${good}/${codes.length} válidos (emissor authnow)`);
}

console.log('2) Registro original preservado');
let origRecords = 0, newRecords = 0, missing = 0, unsorted = 0, dupKeys = 0;
for (let s = 0; s < 256; s++) {
  const n = s.toString(16).padStart(2, '0') + '.bin';
  const a = fs.readFileSync(path.join(ORIG, 'registry/units', n));
  const b = fs.readFileSync(path.join(NEW, 'registry/units', n));
  origRecords += a.length / 7; newRecords += b.length / 7;
  const present = new Map();
  for (let o = 0; o < b.length; o += 7) present.set(b.subarray(o, o + 5).toString('hex'), b.subarray(o + 5, o + 7).toString('hex'));
  for (let o = 0; o < a.length; o += 7) {
    if (present.get(a.subarray(o, o + 5).toString('hex')) !== a.subarray(o + 5, o + 7).toString('hex')) missing++;
  }
  for (let o = 7; o < b.length; o += 7) {
    const c = Buffer.compare(b.subarray(o - 7, o - 2), b.subarray(o, o + 5));
    if (c > 0) unsorted++; if (c === 0) dupKeys++;
  }
}
ok(missing === 0, `nenhum dos ${origRecords} registros originais foi perdido ou alterado`);
ok(newRecords === origRecords + total, `total ${origRecords} → ${newRecords} (+${newRecords - origRecords}, esperado +${total})`);
ok(unsorted === 0 && dupKeys === 0, 'todos os shards continuam ordenados e sem chave repetida');
const bo = JSON.parse(fs.readFileSync(path.join(ORIG, 'registry/batches.json'), 'utf8'));
const bn = JSON.parse(fs.readFileSync(path.join(NEW, 'registry/batches.json'), 'utf8'));
ok(JSON.stringify(bn.slice(0, bo.length)) === JSON.stringify(bo) && bn.length === bo.length + 2, `batches.json: ${bo.length} lotes originais intactos + 2 novos`);

console.log('3) Comportamento antigo preservado');
const ctl = look('3D9swb8YSe');
ok(ctl.verdict === 'valid' && ctl.issuer === 'indufar', `código antigo 3D9swb8YSe → ${ctl.verdict}/${ctl.issuer}`);
let fp = 0;
for (let i = 0; i < 30000; i++) if (look(crypto.randomBytes(8).toString('base64url').slice(0, 10)).verdict !== 'unknown') fp++;
ok(fp === 0, `30.000 códigos aleatórios inventados → ${fp} aceitos`);

console.log('4) Leitor de QR (regex patchada)');
const vsq = fs.readdirSync(path.join(NEW, '_next/static/chunks/app/vsq')).find((f) => f.endsWith('.js'));
const src = fs.readFileSync(path.join(NEW, '_next/static/chunks/app/vsq', vsq), 'utf8');
const m = src.match(/t=a\.match\((\/[^\n]*?\/i)\)/);
ok(!!m, 'regex localizada no chunk vsq');
const re = eval(m[1]);
const cap = (u) => (u.match(re) || [])[1] || null;
ok(cap('https://authnow.com.br/go/OLcUpsOigg') === 'OLcUpsOigg', 'https://authnow.com.br/go/<codigo>  → código extraído');
ok(cap('https://app-authnow.eth.limo/c/IDF/a/3D9swb8YSe') === '3D9swb8YSe', '/c/<emissor>/a/<codigo> continua funcionando');
ok(cap('https://x.com/?code=ABC') === null, '?code= segue pelo caminho antigo (searchParams)');

console.log('5) Só o necessário mudou');
const diff = [];
(function walk(rel = '') {
  for (const e of fs.readdirSync(path.join(NEW, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r);
    else {
      const o = path.join(ORIG, r);
      if (!fs.existsSync(o) || !fs.readFileSync(o).equals(fs.readFileSync(path.join(NEW, r)))) diff.push(r.replace(/\\/g, '/'));
    }
  }
})();
const shardsChanged = diff.filter((f) => f.startsWith('registry/units/')).length;
const others = diff.filter((f) => !f.startsWith('registry/units/'));
console.log(`  arquivos diferentes do original: ${diff.length} (${shardsChanged} shards + ${others.length} outros)`);
others.forEach((f) => console.log('     • ' + f));
ok(others.length === 7, '7 arquivos não-registro alterados (batches.json, _redirects, 5 chunks)');

console.log(failures ? `\n❌ ${failures} FALHA(S)` : '\n✅ TUDO CERTO');
process.exit(failures ? 1 : 0);
