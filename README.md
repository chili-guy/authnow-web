# Clone — `app-authnow.eth.limo`

Cópia completa do site publicado em **`https://app-authnow.eth.limo/`**
(ENS `app-authnow.eth` → IPFS), recuperada em 2026-10-24.

| | |
| --- | --- |
| URL de origem | `https://app-authnow.eth.limo/c/IDF/a/3D9swb8YSe` |
| Nome ENS | `app-authnow.eth` |
| **CID raiz (IPFS)** | `bafybeihcvxo563lzpnjacanxupakfiw6u5sf6s4jmzmmhimrclyr2dzpnu` |
| Conteúdo | 324 arquivos · ~5 MB · "AuthNow — Validação de autenticidade de produtos" · `v 2.0.20 · demo` |
| Integridade | ✅ o CID recalculado a partir desta pasta é **idêntico** ao original (cópia byte a byte) |

## ✅ Versão integrada — `site-integrado/` (os 21.000 códigos AuthNow já valem aqui)

`site/` é o original, **intocado** e com CID verificado. `site-integrado/` é uma cópia gerada
**a partir dele** com os códigos dos nossos dois lotes registrados — é essa a pasta para publicar.

| | |
| --- | --- |
| Códigos registrados | **21.000** — lote 1 (13.000, `codigos-13000.csv`) + lote 2 (8.000, `codigos-8000-lote2.csv`) |
| Registro | 426.000 → **447.000** unidades; lotes novos em `batches.json`: `authnow.com.br-2026-09-09-13000` e `authnow.com.br-2026-09-12-8000` (emissor `authnow`) |
| **CID para publicar** | `bafybeib2fbjbf6mujcs6vqlm4o7to7lmpwrb2ah35ezhuvnp5pwudlii6u` |
| Integridade | `MANIFEST-integrado.sha256` (324 arquivos) |

**O que mudou em relação ao original** (263 arquivos; o resto é byte a byte igual):

1. `registry/units/*.bin` — os 256 shards ganharam os 21.000 registros novos (ordenados; os 426.000 antigos intactos).
2. `registry/batches.json` — +2 lotes, emissor `authnow`.
3. **Emissor `authnow`** no mapa embutido nos chunks `140-*.js`, `app/page-*.js`, `app/vsq/page-*.js`
   (sem ele a tela de resultado ficaria sem título). Hoje: nome/produto "AuthNow", sem imagem nem links.
4. **Leitor de QR** (`app/scan`, `app/vsq`, `app/not-found`): a regex que extrai o código agora aceita
   `.../go/<codigo>` além de `/c/<emissor>/a/<codigo>`. **Sem isso o scanner do site rejeitaria as 21.000
   etiquetas já geradas** (`https://authnow.com.br/go/<codigo>`).
5. `_redirects` — `/go/:code → /?code=:code` (302), igual à regra `/c/…` que já existia.

**Testado** (`node verify-integrated.js`): 21.000/21.000 códigos → `valid`/`authnow` no lote certo; nenhum dos
426.000 registros antigos perdido; shards ordenados e sem chave repetida; código antigo `3D9swb8YSe` continua
`valid`/`indufar`; 30.000 códigos inventados → 0 aceitos; regex nova extrai `/go/…` e mantém `/c/…/a/…`. No
navegador: nossos códigos → **REAL**; código da Indufar → "T.G. 15 mg" como antes; código falso → **NÃO VERIFICADO**.
Não testado: o scanner por câmera (precisa de celular) e a tela do padrão de desenho com o código vindo do QR.

**Rodar:** `node serve.js` → serve `site-integrado` (`SITE_DIR=site node serve.js` serve o original).
Teste: <http://localhost:4173/go/OLcUpsOigg> → redireciona para `/?code=OLcUpsOigg`;
resultado direto: <http://localhost:4173/vsq/?code=OLcUpsOigg>.

**Trocar nome/imagem/links do produto** (hoje placeholder "AuthNow") e **adicionar lotes futuros** — o build é
reprodutível a partir do `site/` original:

```bash
node build-integrated.js \
  --batch "authnow.com.br-2026-09-09-13000=../entrega-authnow-qr/codigos-13000.csv" \
  --batch "authnow.com.br-2026-09-12-8000=../entrega-authnow-qr/codigos-8000-lote2.csv" \
  --issuer-json '{"name":"MinhaMarca","product":"Nome do Produto","dose":"500 ml","site":"https://exemplo.com","showCode":true}'
node verify-integrated.js
```
(imagens/PDF do produto vão em `site/` antes do build e entram no JSON como `"image":"/caminho.webp"`, `"certPdf":"/x.pdf"`.)

**Para as etiquetas impressas funcionarem aqui**, o domínio `authnow.com.br` precisa servir `site-integrado/`:
Cloudflare Pages ou Netlify (honram o `_redirects`), ou IPFS + DNSLink apontando para o CID acima.
GitHub Pages **não** lê `_redirects` (a rota `/go/…` não redirecionaria).

### ⚠️ Limite de segurança do registro (importante antes de imprimir)

O registro guarda só **48 bits** do hash de cada código (1 byte do nome do shard + 5 bytes de chave) e a
verificação é apenas "essa chave existe?". Com 447.000 unidades, **1 em ~630 milhões de strings quaisquer é
aceita como `valid`**. Medido aqui: ~880 mil hashes/s numa thread de Node → ~12 min para forjar um código
válido (~1 min com os 12 cores deste notebook; menos de 1 s com GPU). Como o registro é público, qualquer
pessoa pode fazer isso offline e imprimir um QR "autêntico" — com o emissor/produto de qualquer lote.
Isso vale para os lotes antigos (Indufar/PureLabs) também. Não há contagem de scans nem detecção de clone
nesta versão (o servidor/API que montamos tem as duas coisas). Saídas possíveis: aumentar a chave (12–16
bytes/registro; muda a função de busca e os shards) e/ou validar no servidor, em vez de (ou além de) no registro.

## O que é

Site **estático** gerado com Next.js (App Router, `output: export`). **Não tem backend**:

- A verificação roda no navegador (`crypto.subtle`) contra um registro estático
  publicado junto com o site: `registry/units/00.bin … ff.bin` (256 shards) e
  `registry/batches.json`.
- Usa a câmera (`navigator.mediaDevices`) para ler o QR.
- Páginas: `/` (tela do padrão de desenho), `/scan`, `/vsq`, `/legal/*`, `/licenses`, `/404`,
  mais `issuers/indufar` e `issuers/purelabs` (PDFs/imagens dos emissores) e `product/`.
- `_redirects` (formato IPFS/Netlify) faz o QR funcionar:
  `/c/:issuer/a/:code → /?code=:code` (302) e `/validate-new-product → /`.
- Sem chaves de API ou segredos no código (varredura por padrões comuns: nada encontrado).
  `authnow.net` aparece só nos e-mails/links das páginas legais; `dweb.link` num script de
  redirect do IPFS; Adobe Fonts e Google Fonts são carregados de CDN.

## Rodar localmente

Só precisa de Node (nenhuma dependência):

```bash
node serve.js            # http://localhost:4173
PORT=8000 node serve.js
```

Teste o fluxo do QR: <http://localhost:4173/c/IDF/a/3D9swb8YSe>
(o `serve.js` imita o gateway: aplica o `_redirects` só quando o caminho não existe,
`/pasta` → `/pasta/`, e serve o `404.html`).

## Publicar de novo

**A) Manter o mesmo endereço (`app-authnow.eth.limo`) — recomendado**

1. Envie a pasta `site/` para um serviço de pinning IPFS (Pinata, Storacha/web3.storage,
   Filebase, 4EVERLAND, Fleek…) **ou** rode um nó Kubo: `ipfs add -r --cid-version=1 site`.
2. Confira que o CID resultante é `bafybeihcvxo563…zpnu`. Como esta cópia é idêntica,
   com as configurações padrão do Kubo o CID bate e **o ENS não precisa ser alterado** —
   só precisa continuar *pinado* em algum lugar.
3. Se o serviço gerar outro CID (chunker/layout diferente), atualize o **Content Hash** de
   `app-authnow.eth` para `ipfs://<novo-cid>` (precisa da carteira dona do nome ENS).
4. Alternativa que preserva exatamente o original enquanto ele ainda existir na rede:
   "Pin by CID" nos provedores, ou `ipfs pin add bafybeihcvxo563lzpnjacanxupakfiw6u5sf6s4jmzmmhimrclyr2dzpnu`.

> ⚠️ Se o site estava pinado por um serviço ligado à conta perdida (Fleek, 4EVERLAND, Pinata…)
> e o plano expirar, o conteúdo pode sumir do IPFS. **Faça o pin por conta própria agora.**

**B) Hospedagem estática comum** (Cloudflare Pages, Netlify, Vercel, GitHub Pages, nginx):
suba o conteúdo de `site/` na raiz.

- Netlify e Cloudflare Pages honram o `_redirects` (o QR funciona sem ajuste).
- GitHub Pages **não** lê `_redirects` → a rota `/c/:issuer/a/:code` precisaria de um
  `404.html` com JS que converta o caminho em `/?code=…`.
- Vercel: traduza as 2 regras para `vercel.json` (`redirects`).

## O que NÃO foi possível recuperar

O **código-fonte original** (TypeScript/React, configs, `package.json`, histórico git).
O que existe é a saída compilada e minificada do Next.js, sem source maps. Dá para hospedar
e usar normalmente, mas editar o app exige reescrever a partir dela. Para achar o repositório
original: pistas úteis são o `buildId` `88BNjbcNiyz6cz9Z3KYvs`, o e-mail de notificações do
GitHub/CI, `gh auth status` em outros computadores, e os painéis de deploy
(Fleek/4EVERLAND/Pinata) que costumam estar ligados à conta GitHub.

## Arquivos desta pasta

| Arquivo | Função |
| --- | --- |
| `site/` | O site original exatamente como estava publicado (raiz do CID antigo). |
| `site-integrado/` | Site + os 21.000 códigos AuthNow (publicar esta). |
| `build-integrated.js` / `verify-integrated.js` | Geram e verificam o `site-integrado/` a partir do `site/`. |
| `MANIFEST-integrado.sha256` | SHA-256 dos 324 arquivos do `site-integrado/`. |
| `serve.js` | Servidor local sem dependências (serve o `site-integrado`). |
| `MANIFEST.sha256` | SHA-256 de cada arquivo de `site/` (para conferir integridade depois). |
| `recover-from-ipfs.js` | Script que baixou tudo do gateway `eth.limo` (caminha pela árvore UnixFS via `?format=raw`). Refazer: `node recover-from-ipfs.js`. |
| `verify-cid.mjs` | Recalcula o CID de uma pasta: `node verify-cid.mjs site-integrado` (precisa `npm i ipfs-unixfs-importer blockstore-core multiformats`). |

## GitHub e Vercel

- Repositório (privado): `chili-guy/authnow-web`. A Vercel serve **`site-integrado/`** (ver `vercel.json`):
  `outputDirectory`, `trailingSlash` e os 3 redirects que no IPFS/Netlify vivem no `_redirects`
  (`/c/:issuer/a/:code`, `/go/:code`, `/validate-new-product`). A Vercel **não lê** o `_redirects`.
- `.gitattributes` desliga a conversão de fim de linha (`* -text`) para os arquivos chegarem à Vercel
  byte a byte iguais aos verificados localmente.
- **Importar na Vercel:** vercel.com/new → escolher `authnow-web` → *Framework Preset: Other* → deixar
  Build/Install Command vazios (o `vercel.json` já define a saída) → Deploy. Para usar `authnow.com.br`:
  Settings → Domains → adicionar o domínio e criar no DNS o registro que a Vercel indicar.
- Os CSV com os códigos em texto **não** estão neste repositório (ficam em `entrega-authnow-qr/`, fora dele).
  `build-integrated.js` os lê de `../entrega-authnow-qr/` e só funciona na máquina que os tem.
