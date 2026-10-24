// Calcula o CID IPFS de uma pasta (CIDv1, folhas raw, chunks de 256 KiB = padrão do Kubo).
//   node verify-cid.mjs site                 -> deve dar bafybeihcvxo563…zpnu (original)
//   node verify-cid.mjs site-integrado       -> CID a publicar da versão integrada
// Precisa: npm i ipfs-unixfs-importer blockstore-core multiformats
import fs from 'node:fs'
import path from 'node:path'
import { importer } from 'ipfs-unixfs-importer'
import { fixedSize } from 'ipfs-unixfs-importer/chunker'
import { MemoryBlockstore } from 'blockstore-core/memory'

const ROOT = path.resolve(process.argv[2] || 'site')
function* walk(dir, rel = '') {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name)
    const r = rel ? `${rel}/${name}` : name
    if (fs.statSync(abs).isDirectory()) yield* walk(abs, r)
    else yield { path: `root/${r}`, content: fs.readFileSync(abs) }
  }
}
let root
for await (const e of importer(walk(ROOT), new MemoryBlockstore(), {
  cidVersion: 1, rawLeaves: true, chunker: fixedSize({ chunkSize: 262144 }),
})) { if (e.path === 'root') root = e }
console.log(path.basename(ROOT), '->', root.cid.toString())
