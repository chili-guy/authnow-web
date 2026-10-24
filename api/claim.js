// Vercel Function — validação ÚNICA do código.
//
//   POST /api/claim/   { "code": "<codigo>", "cid": "<id do aparelho>" }
//
//   result: "first"   1ª validação (ou o MESMO aparelho voltando a abrir) → REAL
//           "used"    já validado antes por outro aparelho → "produto já validado" (+ data)
//           "unknown" código fora do banco de dados → alerta de falsificação
//           "revoked" | "recalled"  (registro)
//
// O código é conferido no registro estático (mesmo formato do site: SHA-256("authnow:"+codigo))
// e a "marca de uso" fica num Redis REST (Upstash / Vercel KV) com SET ... NX — atômico, então
// dois aparelhos validando ao mesmo tempo nunca recebem "first" os dois.
//
// Variáveis (a integração Upstash/KV da Vercel já cria):
//   KV_REST_API_URL + KV_REST_API_TOKEN   (ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
// Sem elas a função responde 503 e a tela mostra "não foi possível verificar" (falha fechada:
// nunca diz REAL sem conseguir registrar o uso).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const hex = (s) => sha(s).toString('hex');

// ---------- registro (arquivos empacotados com a função: ver vercel.json "includeFiles") ----------
function registryDir() {
  const candidates = [
    process.env.AN_REGISTRY_DIR,
    path.join(process.cwd(), 'site-integrado', 'registry'),
    path.join(__dirname, '..', 'site-integrado', 'registry'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(path.join(p, 'batches.json')));
}
const cache = { dir: null, batches: null, shards: new Map() };

function lookup(code) {
  if (!cache.dir) {
    cache.dir = registryDir();
    if (!cache.dir) throw new Error('registry_not_found');
    cache.batches = JSON.parse(fs.readFileSync(path.join(cache.dir, 'batches.json'), 'utf8'));
  }
  const h = sha('authnow:' + code);
  const name = h[0].toString(16).padStart(2, '0');
  if (!cache.shards.has(name)) cache.shards.set(name, fs.readFileSync(path.join(cache.dir, 'units', name + '.bin')));
  const e = cache.shards.get(name);
  let lo = 0, hi = e.length / 7 - 1, v = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, o = 7 * mid;
    let c = 0;
    for (let i = 0; i < 5 && c === 0; i++) c = e[o + i] - h[1 + i];
    if (c === 0) { v = (e[o + 5] << 8) | e[o + 6]; break; }
    c < 0 ? (lo = mid + 1) : (hi = mid - 1);
  }
  if (v === null) return { verdict: 'unknown' };
  const b = cache.batches[v & 0x7fff];
  if (v & 0x8000) return { verdict: 'revoked', issuer: b && b.issuer };
  return { verdict: b && b.status === 'recalled' ? 'recalled' : 'valid', issuer: b && b.issuer };
}

// ---------- Redis REST ----------
function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}
async function kv(cfg, commands) {
  const r = await fetch(cfg.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('kv_http_' + r.status);
  const out = await r.json();
  return out.map((o) => {
    if (o && o.error) throw new Error('kv_' + o.error);
    return o.result;
  });
}

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const send = (res, status, body) => res.status(status).json(body);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const body = typeof req.body === 'string' ? parse(req.body) || {} : req.body || {};
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const cid = typeof body.cid === 'string' ? body.cid.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return send(res, 400, { error: 'invalid_code' });
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(cid)) return send(res, 400, { error: 'invalid_client_id' });

  try {
    const reg = lookup(code);
    if (reg.verdict !== 'valid') return send(res, 200, { result: reg.verdict }); // não grava nada

    const cfg = kvConfig();
    if (!cfg) return send(res, 503, { error: 'not_configured' });

    const key = 'claim:' + hex(code); // só o hash do código vai para o banco
    const idHash = hex('cid:' + cid);
    const now = new Date().toISOString();
    const [setRes, stored] = await kv(cfg, [
      ['SET', key, JSON.stringify({ at: now, id: idHash }), 'NX'],
      ['GET', key],
    ]);
    const rec = parse(stored) || {};
    if (setRes === 'OK') return send(res, 200, { result: 'first', at: rec.at || now });
    if (rec.id === idHash) return send(res, 200, { result: 'first', at: rec.at, revisit: true });
    return send(res, 200, { result: 'used', at: rec.at });
  } catch (err) {
    console.error('claim failed:', err && err.message);
    return send(res, 503, { error: 'unavailable' });
  }
};
