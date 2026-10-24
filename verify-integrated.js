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

const INFO = JSON.parse(fs.readFileSync(path.join(ROOT, 'build-info.json'), 'utf8'));
const ISSUER = INFO.issuerId;
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
  for (const c of codes) { const r = look(c); if (r.verdict === 'valid' && r.issuer === ISSUER && r.batch === id) good++; }
  total += codes.length;
  ok(good === codes.length, `${id}: ${good}/${codes.length} válidos (emissor ${ISSUER})`);
}

if (INFO.onlyNew) {
  console.log('2) Registro SÓ com os nossos códigos (--only-new): os do site antigo saíram');
  let recs = 0, unsorted = 0, dupKeys = 0;
  for (let sh = 0; sh < 256; sh++) {
    const b = fs.readFileSync(path.join(NEW, 'registry/units', sh.toString(16).padStart(2, '0') + '.bin'));
    recs += b.length / 7;
    for (let o = 7; o < b.length; o += 7) {
      const c = Buffer.compare(b.subarray(o - 7, o - 2), b.subarray(o, o + 5));
      if (c > 0) unsorted++; if (c === 0) dupKeys++;
    }
  }
  ok(recs === total, `registro tem exatamente ${recs} códigos (esperado ${total}: só os dos CSVs)`);
  ok(unsorted === 0 && dupKeys === 0, 'shards ordenados e sem chave repetida');
  const bn = JSON.parse(fs.readFileSync(path.join(NEW, 'registry/batches.json'), 'utf8'));
  ok(bn.length === LOTES.length && bn.every((b, i) => b.id === LOTES[i][0] && b.issuer === ISSUER && b.status === 'active'), `batches.json: só os ${LOTES.length} lotes novos (emissor ${ISSUER})`);
  console.log('3) Códigos do site antigo agora são rejeitados');
  const old = look('3D9swb8YSe');
  ok(old.verdict === 'unknown', `código antigo 3D9swb8YSe → ${old.verdict} (alerta de falsificação)`);
  let fp = 0;
  for (let i = 0; i < 30000; i++) if (look(crypto.randomBytes(8).toString('base64url').slice(0, 10)).verdict !== 'unknown') fp++;
  ok(fp === 0, `30.000 códigos aleatórios inventados → ${fp} aceitos`);
} else {
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

}

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
const expected = INFO.changedNonRegistry.slice().sort();
ok(JSON.stringify(others.slice().sort()) === JSON.stringify(expected), `exatamente os ${expected.length} arquivos não-registro esperados (build-info.json)`);


console.log('6) Validação única + alerta de falsificação (chunk vsq)');
const orig = fs.readFileSync(path.join(ORIG, '_next/static/chunks/app/vsq', vsq), 'utf8');
const has = (t) => src.includes(t);
if (INFO.singleUse) {
  try { new (require('vm').Script)(src); ok(true, 'chunk vsq continua JavaScript válido'); } catch (e) { ok(false, 'chunk vsq com erro de sintaxe: ' + e.message); }
  ok(has('/api/claim/') && has('ANCLAIM(a)'), 'tela de resultado chama /api/claim/');
  // os textos ficam no chunk como escapes \uXXXX literais
  ok(has('ALERTA DE FALSIFICA\\u00c7\\u00c3O') && has('COUNTERFEIT ALERT') && has('ALERTA DE FALSIFICACI\\u00d3N'), 'alerta de falsificação nos 3 idiomas');
  ok(has('J\\u00c1 VALIDADO') && has('ALREADY VALIDATED') && has('YA VALIDADO'), '"já validado" nos 3 idiomas');
  ok(!orig.includes('/api/claim/'), 'o original não tinha chamada ao /api/claim/ (o patch é novo)');
  ok(has('(o.image||"UNKNOWN"===(o.status||"").toUpperCase())&&(0,n.jsxs)("section",{className:m["product-panel"]') && has('Compare com a embalagem original') && has('Compare with the original packaging') && has('Compare con el empaque original'), '"JÁ VALIDADO" e alerta de falsificação mostram a foto da caixa embaixo (alerta com legenda "compare com a original" nos 3 idiomas)');
} else ok(!has('/api/claim/'), 'build sem --single-use não chama /api/claim/');
if (INFO.dropColorText) {
  const colorRe = /c\\xf3digo e cor|code and color|y color con|both the code and the color|con el color/;
  ok(colorRe.test(orig) && !colorRe.test(src), 'textos não mencionam mais "cor" (PT/ENG/SPA)');
}

console.log('6b) Scanner estrito (chunk scan)');
{
  const scanF = fs.readdirSync(path.join(NEW, '_next/static/chunks/app/scan')).find((f) => f.endsWith('.js'));
  const sc = fs.readFileSync(path.join(NEW, '_next/static/chunks/app/scan', scanF), 'utf8');
  const so = fs.readFileSync(path.join(ORIG, '_next/static/chunks/app/scan', scanF), 'utf8');
  if (INFO.strictScan) {
    try { new (require('vm').Script)(sc); ok(true, 'chunk scan continua JavaScript válido'); } catch (e) { ok(false, 'chunk scan com erro: ' + e.message); }
    ok(so.includes('setTimeout(async()=>{a(await R(t))},4e3)') && !sc.includes('},4e3)'), 'atalho de 4 s que se auto-validava sem ler QR foi removido');
    ok(sc.includes('location.replace("/vsq/?code="') && sc.includes('location.assign("/vsq/?code="'), 'código fora do banco (link ou QR lido) vai para a tela de alerta');
    ok(!sc.includes('Produto Aut\xeantico!'), 'transição não diz "Produto Autêntico!" antes da checagem de uso único');
  } else ok(sc.includes('},4e3)'), 'build sem --strict-scan mantém o scanner original');
}

console.log('7) Função /api/claim contra o registro real (Redis falso)');
(async () => {
  const kv = require('./dev-fake-kv').start(4777);
  process.env.KV_REST_API_URL = 'http://127.0.0.1:4777';
  process.env.KV_REST_API_TOKEN = 'fake-token';
  process.env.AN_REGISTRY_DIR = path.join(NEW, 'registry');
  const claim = require('./api/claim.js');
  const call = (body, method = 'POST') => new Promise((resolve) => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    claim({ method, body }, res);
  });
  const codesOf = (i) => fs.readFileSync(LOTES[i][1], 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',')[0]);
  const [c1, c2, c3] = codesOf(0);
  const d1 = codesOf(1)[0];
  const A1 = 'a'.repeat(32), B1 = 'b'.repeat(32);

  let r = await call({ code: c1, cid: A1 });
  ok(r.code === 200 && r.body.result === 'first' && !!r.body.at, '1ª validação (aparelho A) → first');
  const at1 = r.body.at;
  r = await call({ code: c1, cid: A1 });
  ok(r.body.result === 'used' && r.body.self === true && r.body.at === at1, 'mesmo aparelho reabrindo → used (self), mesma data: único uso vale também para quem validou');
  r = await call({ code: c1, cid: B1 });
  ok(r.body.result === 'used' && r.body.self === false && r.body.at === at1, 'outro aparelho → used (não self), com a data da 1ª validação');
  r = await call({ code: 'CODIGOFALSO', cid: A1 });
  ok(r.code === 200 && r.body.result === 'unknown', 'código fora do banco → unknown (alerta de falsificação)');
  ok(![...kv.store.keys()].some((k) => k.includes('CODIGOFALSO')), 'código desconhecido não grava nada no Redis');
  r = await call({ code: 'bad code!', cid: A1 }); ok(r.code === 400, 'código malformado → 400');
  r = await call({ code: c1, cid: 'x' }); ok(r.code === 400, 'cid curto → 400');
  r = await call({}, 'GET'); ok(r.code === 405, 'GET → 405');
  r = await call({ code: '3D9swb8YSe', cid: A1 });
  if (INFO.onlyNew) ok(r.body.result === 'unknown', 'código do site antigo 3D9swb8YSe → unknown (alerta de falsificação)');
  else ok(r.body.result === 'first', 'código antigo Indufar 3D9swb8YSe também passa pela validação única');
  const par = await Promise.all(Array.from({ length: 25 }, (_, i) => call({ code: d1, cid: String(i).padStart(2, '0').repeat(10) })));
  ok(par.filter((p) => p.body.result === 'first').length === 1, '25 aparelhos ao mesmo tempo no mesmo código → só 1 recebe first');
  const keys = [...kv.store.keys()];
  ok(keys.every((k) => /^claim:[0-9a-f]{64}$/.test(k)) && !keys.some((k) => k.includes(c1)), 'Redis guarda só o hash do código (nunca o código em claro)');

  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  r = await call({ code: c3, cid: A1 });
  ok(r.code === 503 && r.body.error === 'not_configured', 'sem Redis configurado → 503 not_configured (falha fechada)');
  kv.server.close();

  console.log(failures ? `\n❌ ${failures} FALHA(S)` : '\n✅ TUDO CERTO');
  process.exit(failures ? 1 : 0);
})();
