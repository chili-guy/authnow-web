// Gera ./site-integrado a partir do ./site ORIGINAL (nunca altera o original):
//   1. registra os códigos dos CSVs no registro estático (registry/units/*.bin + batches.json)
//   2. adiciona o emissor "authnow" ao mapa de emissores embutido nos chunks
//   3. faz o leitor de QR do site entender URLs  .../go/<codigo>  (as etiquetas já geradas)
//   4. adiciona  /go/:code -> /?code=:code  ao _redirects
//
// Formato do registro (lido do código do site):
//   h = SHA-256("authnow:" + codigo)
//   arquivo = registry/units/<h[0] em hex, 2 dígitos>.bin
//   registro de 7 bytes = h[1..5] (chave) + uint16 BE (bit15 = revogado, bits0-14 = índice em batches.json)
//   registros ordenados por chave (a busca é binária)
//
// Uso:
//   node build-integrated.js \
//     --batch "authnow.com.br-2026-09-09-13000=../entrega-authnow-qr/codigos-13000.csv" \
//     --batch "authnow.com.br-2026-09-12-8000=../entrega-authnow-qr/codigos-8000-lote2.csv"
// Opções: --src site  --out site-integrado  --issuer-id authnow
//         --issuer-json '{"name":"AuthNow","product":"AuthNow","showCode":true}'
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function args() {
  const a = process.argv.slice(2);
  const o = { batch: [] };
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, '');
    if (k === 'single-use' || k === 'drop-color-text') { o[k] = true; i -= 1; continue; }
    if (k === 'batch') o.batch.push(a[i + 1]);
    else o[k] = a[i + 1];
  }
  return o;
}
const A = args();
const SRC = path.resolve(__dirname, A.src || 'site');
const OUT = path.resolve(__dirname, A.out || 'site-integrado');
const ISSUER_ID = A['issuer-id'] || 'authnow';
// --issuer-json none  → não cria emissor novo: os lotes entram num emissor que JÁ existe
// (ex.: --issuer-id indufar --issuer-json none) e herdam foto, dose, links e PDF dele.
const SKIP_ISSUER_PATCH = A['issuer-json'] === 'none';
const ISSUER_JSON = A['issuer-json'] || '{"name":"AuthNow","product":"AuthNow","showCode":true}';
if (!A.batch.length) throw new Error('informe ao menos um --batch "<id>=<csv>"');
if (!SKIP_ISSUER_PATCH) {
  if (/['\\]/.test(ISSUER_JSON)) throw new Error('--issuer-json não pode conter aspas simples nem barras invertidas');
  JSON.parse(ISSUER_JSON);
}

const sha = (code) => crypto.createHash('sha256').update('authnow:' + code).digest();
const shardName = (i) => i.toString(16).padStart(2, '0') + '.bin';

// ---------- 1. cópia do site original ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

// ---------- 2. registro ----------
const REG = path.join(OUT, 'registry');
const batches = JSON.parse(fs.readFileSync(path.join(REG, 'batches.json'), 'utf8'));
const shards = Array.from({ length: 256 }, () => []);
let existing = 0;
for (let s = 0; s < 256; s++) {
  const buf = fs.readFileSync(path.join(REG, 'units', shardName(s)));
  if (buf.length % 7) throw new Error('shard ' + s + ' com tamanho inválido');
  for (let o = 0; o < buf.length; o += 7) {
    shards[s].push({ key: Buffer.from(buf.subarray(o, o + 5)), val: (buf[o + 5] << 8) | buf[o + 6], code: null });
  }
  existing += shards[s].length;
}

const report = { existing, batches: [], collisions: [] };
const touched = new Set();
const seenCodes = new Set();
for (const spec of A.batch) {
  const eq = spec.indexOf('=');
  const id = spec.slice(0, eq);
  const csv = path.resolve(__dirname, spec.slice(eq + 1));
  let idx = batches.findIndex((b) => b.id === id);
  if (idx < 0) {
    batches.push({ id, status: 'active', issuer: ISSUER_ID });
    idx = batches.length - 1;
  }
  if (idx > 0x7fff) throw new Error('índice de lote não cabe em 15 bits');
  const codes = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',')[0].trim()).filter(Boolean);
  let added = 0, already = 0, dupInput = 0;
  for (const code of codes) {
    if (seenCodes.has(code)) { dupInput++; continue; }
    seenCodes.add(code);
    const h = sha(code);
    const key = Buffer.from(h.subarray(1, 6));
    const list = shards[h[0]];
    const clash = list.find((r) => r.key.equals(key));
    if (clash) {
      if (clash.val === idx) already++; // re-execução: já estava lá
      else report.collisions.push({ code, with: clash.code || '(registro anterior)', batch: id });
      continue;
    }
    list.push({ key, val: idx, code });
    touched.add(h[0]);
    added++;
  }
  report.batches.push({ id, index: idx, csv: path.basename(csv), lidos: codes.length, adicionados: added, jaExistiam: already, duplicadosNoCsv: dupInput });
}

for (const s of touched) {
  const list = shards[s].sort((a, b) => Buffer.compare(a.key, b.key));
  const out = Buffer.alloc(list.length * 7);
  list.forEach((r, i) => { r.key.copy(out, i * 7); out[i * 7 + 5] = r.val >> 8; out[i * 7 + 6] = r.val & 0xff; });
  fs.writeFileSync(path.join(REG, 'units', shardName(s)), out);
}
fs.writeFileSync(path.join(REG, 'batches.json'), JSON.stringify(batches));

// ---------- 3. patches nos chunks compilados ----------
function patchFile(file, find, repl, expect) {
  const p = path.join(OUT, file);
  const src = fs.readFileSync(p, 'utf8');
  const n = src.split(find).length - 1;
  if (n !== expect) throw new Error(`${file}: esperava ${expect} ocorrência(s) de ${find.slice(0, 40)}…, achei ${n}`);
  const next = src.split(find).join(repl);
  new vm.Script(next); // falha se o JS ficou inválido
  fs.writeFileSync(p, next);
}
const chunkDir = '_next/static/chunks';
const find1 = (re) => fs.readdirSync(path.join(OUT, chunkDir), { recursive: true }).map((f) => f.replace(/\\/g, '/')).filter((f) => re.test(f));

// 3a. emissor "authnow" no mapa embutido (3 chunks)
const ISSUER_FIND = `'{"k":{"indufar":`;
const ISSUER_REPL = `'{"k":{"${ISSUER_ID}":${ISSUER_JSON},"indufar":`;
const issuerFiles = SKIP_ISSUER_PATCH
  ? []
  : [...find1(/^140-.*\.js$/), ...find1(/^app\/page-.*\.js$/), ...find1(/^app\/vsq\/page-.*\.js$/)];
for (const f of issuerFiles) patchFile(`${chunkDir}/${f}`, ISSUER_FIND, ISSUER_REPL, 1);

// 3b. leitor de QR aceita /go/<codigo> além de /c/<emissor>/a/<codigo>
const RE_FIND = String.raw`/\/c\/[^/]+\/a\/([^/?#]+)/i`;
const RE_REPL = String.raw`/\/(?:c\/[^/]+\/a|go)\/([^/?#]+)/i`;
const parserFiles = [...find1(/^app\/scan\/page-.*\.js$/), ...find1(/^app\/vsq\/page-.*\.js$/), ...find1(/^app\/not-found-.*\.js$/)];
for (const f of parserFiles) patchFile(`${chunkDir}/${f}`, RE_FIND, RE_REPL, 1);


// 3c. VALIDAÇÃO ÚNICA (--single-use): a tela de resultado chama /api/claim/ (api/claim.js).
//     1ª validação → REAL | já validada por outro aparelho → "JÁ VALIDADO" (+ data) |
//     código fora do banco → "ALERTA DE FALSIFICAÇÃO". Falha do servidor → tela de erro (falha fechada).
const vsqFile = find1(/^app\/vsq\/page-.*\.js$/)[0];
const uni = (o) => JSON.stringify(o).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const ANX = {
  POR: {
    UNKNOWN: { label: 'ALERTA DE FALSIFICAÇÃO', msg: 'Este código não consta no banco de dados da AuthNow. O produto pode ser FALSIFICADO. Não utilize e informe o fabricante.' },
    USED: { label: 'JÁ VALIDADO', msg: 'Este produto já foi validado em {d}. Cada código só pode ser validado uma vez. Se não foi você, o produto pode ser uma cópia — não utilize e informe o fabricante.', msg0: 'Este produto já foi validado anteriormente. Cada código só pode ser validado uma vez. Se não foi você, o produto pode ser uma cópia — não utilize e informe o fabricante.' },
  },
  ENG: {
    UNKNOWN: { label: 'COUNTERFEIT ALERT', msg: 'This code is not in the AuthNow database. This product may be COUNTERFEIT. Do not use it and notify the manufacturer.' },
    USED: { label: 'ALREADY VALIDATED', msg: 'This product was already validated on {d}. Each code can only be validated once. If it was not you, the product may be a copy — do not use it and notify the manufacturer.', msg0: 'This product was already validated before. Each code can only be validated once. If it was not you, the product may be a copy — do not use it and notify the manufacturer.' },
  },
  SPA: {
    UNKNOWN: { label: 'ALERTA DE FALSIFICACIÓN', msg: 'Este código no consta en la base de datos de AuthNow. El producto puede ser FALSIFICADO. No lo utilice e informe al fabricante.' },
    USED: { label: 'YA VALIDADO', msg: 'Este producto ya fue validado el {d}. Cada código solo puede validarse una vez. Si no fue usted, el producto puede ser una copia: no lo utilice e informe al fabricante.', msg0: 'Este producto ya fue validado antes. Cada código solo puede validarse una vez. Si no fue usted, el producto puede ser una copia: no lo utilice e informe al fabricante.' },
  },
};
const HELPERS =
  'var ANX=' + uni(ANX) + ';' +
  'function ANMSG(j,o){var x=ANX[j]||ANX.POR,m=x[(o.status||"").toUpperCase()];if(!m)return null;var d="";if(o.firstAt){try{d=new Date(o.firstAt).toLocaleString(s[j]||"pt-BR")}catch(e){}}return{label:m.label,msg:d?m.msg.replace("{d}",d):(m.msg0||m.msg)}}' +
  'function ANCID(c){var k="an_cid:"+c,v=null;try{v=localStorage.getItem(k)}catch(e){}if(!v){var b=new Uint8Array(16);crypto.getRandomValues(b);v=Array.prototype.map.call(b,function(x){return("0"+x.toString(16)).slice(-2)}).join("");try{localStorage.setItem(k,v)}catch(e){}}return v}' +
  'async function ANCLAIM(c){var r=await fetch("/api/claim/",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:c,cid:ANCID(c)})});if(!r.ok)throw Error("claim: HTTP "+r.status);return r.json()}';
if (A['single-use']) {
  const F = chunkDir + '/' + vsqFile;
  patchFile(F, 'var w=t(4572),f=t(1067);function b(){', 'var w=t(4572),f=t(1067);' + HELPERS + 'function b(){', 1);
  patchFile(F, 'children:y?N.real:N.notVerified', 'children:y?N.real:(ANMSG(j,o)||{}).label||N.notVerified', 1);
  patchFile(F, 'children:N.invalidMessage', 'children:(ANMSG(j,o)||{}).msg||N.invalidMessage', 1);
  patchFile(F, '(0,f.Pw)(a).then(a=>e&&c(a),()=>e&&c("error"))',
    '(0,f.Pw)(a).then(r=>"valid"!==r.verdict?r:ANCLAIM(a).then(k=>"first"===k.result?r:{verdict:k.result,issuer:r.issuer,firstAt:k.at})).then(a=>e&&c(a),()=>e&&c("error"))', 1);
  patchFile(F, 'product:(0,u.tv)(t.issuer,a,"valid"===t.verdict?"REAL":t.verdict.toUpperCase())',
    'product:Object.assign((0,u.tv)(t.issuer,a,"valid"===t.verdict?"REAL":t.verdict.toUpperCase()),{firstAt:t.firstAt})', 1);
}

// 3d. --drop-color-text: as etiquetas AuthNow não têm cor; tira "e cor" dos textos (3 idiomas)
if (A['drop-color-text']) {
  const F = chunkDir + '/' + vsqFile;
  // no código minificado os acentos aparecem como escapes literais (\xf3 etc.)
  const pairs = [
    ['corresponder em c\\xf3digo e cor ao que est\\xe1 impresso no r\\xf3tulo', 'corresponder ao c\\xf3digo que est\\xe1 impresso no r\\xf3tulo'],
    ['corresponder tanto ao c\\xf3digo quanto \\xe0 cor impressos na etiqueta do produto:', 'corresponder ao c\\xf3digo impresso na etiqueta do produto:'],
    ['must match the code and color printed on the product label', 'must match the code printed on the product label'],
    ['must match both the code and the color printed on the product label:', 'must match the code printed on the product label:'],
    ['debe coincidir en c\\xf3digo y color con el impreso en la etiqueta', 'debe coincidir con el c\\xf3digo impreso en la etiqueta'],
    ['debe coincidir tanto con el c\\xf3digo como con el color impresos en la etiqueta del producto:', 'debe coincidir con el c\\xf3digo impreso en la etiqueta del producto:'],
  ];
  for (const [a, b] of pairs) patchFile(F, a, b, 1);
}

// ---------- 4. _redirects ----------
const rp = path.join(OUT, '_redirects');
let red = fs.readFileSync(rp, 'utf8');
if (!red.includes('/go/:code')) {
  red = red.replace('/validate-new-product  /  302', '/validate-new-product  /  302\n\n# Etiquetas AuthNow (https://authnow.com.br/go/<codigo>) → mesma tela de entrada.\n/go/:code  /?code=:code  302');
  if (!red.includes('/go/:code')) throw new Error('não achei onde inserir a regra /go/ no _redirects');
  fs.writeFileSync(rp, red);
}

// ---------- relatório ----------
const total = [...shards].reduce((a, l) => a + l.length, 0);
console.log(JSON.stringify({
  registroAntes: report.existing,
  registroDepois: total,
  lotes: report.batches,
  colisoes: report.collisions,
  chunksComEmissor: issuerFiles,
  chunksComParser: parserFiles,
  shardsAlterados: touched.size,
}, null, 2));
const changed = [...new Set([
  'registry/batches.json', '_redirects',
  ...issuerFiles, ...parserFiles,
])].map((f) => (f.startsWith('registry') || f === '_redirects' ? f : chunkDir + '/' + f)).sort();
fs.writeFileSync(path.join(__dirname, 'build-info.json'), JSON.stringify({
  out: path.basename(OUT), issuerId: ISSUER_ID, newIssuer: !SKIP_ISSUER_PATCH,
  singleUse: !!A['single-use'], dropColorText: !!A['drop-color-text'],
  batches: report.batches.map((b) => ({ id: b.id, csv: b.csv })), changedNonRegistry: changed,
}, null, 2));
if (report.collisions.length) process.exitCode = 2;
