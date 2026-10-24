// Consulta / zera a "marca de uso" de um código (para testes e suporte).
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... node extras/single-use/claim-admin.js status <codigo>
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... node extras/single-use/claim-admin.js reset  <codigo>
// (as duas variáveis estão em Vercel → Storage → seu Redis → .env.local)
const crypto = require('crypto');

const [cmd, code] = process.argv.slice(2);
const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!['status', 'reset'].includes(cmd) || !code || !url || !token) {
  console.error('uso: KV_REST_API_URL=… KV_REST_API_TOKEN=… node extras/single-use/claim-admin.js <status|reset> <codigo>');
  process.exit(1);
}
const key = 'claim:' + crypto.createHash('sha256').update(code).digest('hex');

(async () => {
  const body = cmd === 'status' ? [['GET', key]] : [['DEL', key]];
  const r = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const [{ result, error }] = await r.json();
  if (error) throw new Error(error);
  if (cmd === 'status') {
    if (!result) return console.log(`${code}: ainda NÃO validado`);
    const rec = JSON.parse(result);
    return console.log(`${code}: já validado em ${rec.at}`);
  }
  console.log(result ? `${code}: marca de uso removida (pode ser validado de novo)` : `${code}: não havia marca de uso`);
})().catch((e) => { console.error('erro:', e.message); process.exit(1); });
