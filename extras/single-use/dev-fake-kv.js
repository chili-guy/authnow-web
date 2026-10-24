// Redis REST FALSO, em memória — só para testar a validação única localmente.
// Fala o mínimo do protocolo do Upstash que o api/claim.js usa: POST /pipeline com
// [["SET", k, v, "NX"], ["GET", k], ["DEL", k]]. Não use em produção (some ao reiniciar).
const http = require('http');

function start(port, token = 'fake-token') {
  const store = new Map();
  const run = (cmd) => {
    const [op, key, val, flag] = cmd;
    switch (String(op).toUpperCase()) {
      case 'SET':
        if (String(flag).toUpperCase() === 'NX' && store.has(key)) return { result: null };
        store.set(key, val);
        return { result: 'OK' };
      case 'GET':
        return { result: store.has(key) ? store.get(key) : null };
      case 'DEL':
        return { result: store.delete(key) ? 1 : 0 };
      default:
        return { error: 'ERR unknown command ' + op };
    }
  };
  const server = http
    .createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (req.headers.authorization !== 'Bearer ' + token) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        let cmds = [];
        try { cmds = JSON.parse(raw); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cmds.map(run)));
      });
    })
    .listen(port, '127.0.0.1');
  return { server, store };
}

module.exports = { start };
