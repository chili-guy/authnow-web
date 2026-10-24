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
| Registro | **só os nossos 21.000** (`--only-new`: os 426.000 códigos do site antigo — Indufar/PureLabs — **saíram** e agora caem no ALERTA DE FALSIFICAÇÃO); lotes em `batches.json`: `authnow.com.br-2026-09-09-13000` e `authnow.com.br-2026-09-12-8000` (**emissor `indufar`** → foto, "T.G. 15 mg", links e PDF do medicamento) |
| **CID para publicar** | `bafybeiejxjlvjatnafzesoft4ewtdihok4qhslkhq6uc6eai3bqfpuho6e` (conteúdo estático; não há função de servidor) |
| Integridade | `MANIFEST-integrado.sha256` (324 arquivos) |

**O que mudou em relação ao original** (261 arquivos; o resto é byte a byte igual):

1. `registry/units/*.bin` — os 256 shards foram refeitos **só com os 21.000 registros novos** (ordenados; os 426.000 do site
   antigo foram removidos de propósito com `--only-new`; para mantê-los, rode o build sem essa opção).
2. `registry/batches.json` — +2 lotes, emissor `indufar`.
3. **Leitor de QR** (`app/scan`, `app/vsq`, `app/not-found`): a regex que extrai o código agora aceita
   `.../go/<codigo>` além de `/c/<emissor>/a/<codigo>`. **Sem isso o scanner do site rejeitaria as 21.000
   etiquetas já geradas** (`https://authnow.com.br/go/<codigo>`).
4. `_redirects` — `/go/:code → /?code=:code` (302), igual à regra `/c/…` que já existia.
5. **Alerta de falsificação** (`--counterfeit-alert`, só em `app/vsq`): código fora do banco → alerta + caixa original; ver seção abaixo.
6. **Scanner estrito** (`--strict-scan`, só em `app/scan`) — ver seção "Scanner do site" abaixo.
7. **Textos sem "e cor"** (`--drop-color-text`): as etiquetas AuthNow não têm cor; as frases "código e cor" /
   "code and color" / "código y color" agora dizem só "código" (PT/ENG/SPA).

### 🚨 Como o site responde (hoje: o código vale quantas vezes for preciso)

| Situação | O que a pessoa vê (PT / ENG / SPA) |
| --- | --- |
| Código **está no banco** (qualquer número de vezes) | **REAL** + foto da caixa, "T.G. 15 mg", links e PDF |
| Código que **não está no banco** | **ALERTA DE FALSIFICAÇÃO** / **COUNTERFEIT ALERT** / **ALERTA DE FALSIFICACIÓN** + a caixa **original** com a legenda "Compare com a embalagem original" |
| Código revogado/recall | tela que o site já tinha |

É tudo estático: **não há servidor, banco nem Redis**. A conferência é no navegador contra `registry/`.

### 📷 Scanner do site (`--strict-scan`)

O scanner original tinha um atalho de demonstração: com um código guardado (vindo do link), **4 s depois ele se dava
por validado sem ler QR nenhum** — por isso "qualquer QR validava". Agora:

- sem QR na câmera, ele só espera; QR sem relação (ex.: um site qualquer) → "Falha na verificação";
- QR `.../go/<codigo>` (ou `/c/…/a/<codigo>`, ou o código puro) com código **fora do banco** → vai direto para o
  **ALERTA DE FALSIFICAÇÃO**; abrir um link com código falso também (sem esperar a câmera).

**Foto do produto:** na tela **REAL** a foto aparece sob o status (como no site original); no **ALERTA DE FALSIFICAÇÃO** a
foto da caixa original do T.G. 15 mg aparece embaixo da mensagem, com a legenda "Compare com a embalagem original".

### 🔁 Validação única — módulo OPCIONAL (desligado)

Já existiu em produção (1ª leitura = REAL, depois "JÁ VALIDADO") e foi **desligado a pedido**: a etiqueta deve poder ser
validada sempre; a única restrição é o código fora do banco. O código continua em `extras/single-use/` (função
`claim.js` + Redis Upstash/KV com `SET … NX`, `dev-fake-kv.js` para testar local, `claim-admin.js` status/reset).
Para religar: copie `claim.js` para `api/claim.js`, acrescente em `vercel.json`
`"functions": {"api/claim.js": {"includeFiles": "site-integrado/registry/**"}}`, conecte um Redis e reconstrua com
`--single-use` (no lugar de `--counterfeit-alert`). Teste local: `FAKE_KV=1 node serve.js`.

**Testado** (`node verify-integrated.js`, 25 verificações): 21.000/21.000 códigos → `valid`/`indufar` no lote
certo; registro com exatamente 21.000 códigos (o código antigo `3D9swb8YSe` → `unknown`); shards ordenados e sem
chave repetida; 30.000 códigos inventados → 0 aceitos; regex nova extrai `/go/…`; alerta nos 3 idiomas com a caixa
original; nenhuma chamada a servidor e nenhum texto de "já validado". No navegador: o mesmo código → REAL nas duas
vezes (inclusive "outro aparelho"); código do site antigo → ALERTA com a caixa; scanner com câmera simulada: sem QR →
espera, QR de site qualquer → "Falha na verificação", QR `/go/FAKE…` → ALERTA.
**Não testado:** a câmera de um celular de verdade e a tela do padrão de desenho com o código vindo do QR.

**Rodar:** `node serve.js` → serve `site-integrado` (`SITE_DIR=site node serve.js` serve o original).
Teste: <http://localhost:4173/go/OLcUpsOigg> → redireciona para `/?code=OLcUpsOigg`;
resultado direto: <http://localhost:4173/vsq/?code=OLcUpsOigg>.

**Adicionar lotes futuros / trocar emissor** — o build é reprodutível a partir do `site/` original:

```bash
node build-integrated.js --issuer-id indufar --issuer-json none --counterfeit-alert --drop-color-text --strict-scan --only-new \
  --batch "authnow.com.br-2026-09-09-13000=../entrega-authnow-qr/codigos-13000.csv" \
  --batch "authnow.com.br-2026-09-12-8000=../entrega-authnow-qr/codigos-8000-lote2.csv"
node verify-integrated.js
```
(`--issuer-json none` põe os lotes num emissor que já existe; tire `--only-new` para **manter** também os 426.000 códigos
do site antigo. Para criar um emissor novo, use
`--issuer-id minhamarca --issuer-json '{"name":"MinhaMarca","product":"Nome","dose":"500 ml","showCode":true}'`;
imagens/PDF vão em `site/` antes do build.) O `build-info.json` registra o que o último build fez e é lido pelo verificador.

**Para as etiquetas impressas funcionarem**, o domínio `authnow.com.br` precisa apontar para este site (Vercel, já
configurado em `vercel.json`; Cloudflare Pages/Netlify também servem, pois honram o `_redirects`).

### ⚠️ Limite de segurança do registro (importante antes de imprimir)

O registro guarda só **48 bits** do hash de cada código (1 byte do nome do shard + 5 bytes de chave) e a
verificação é apenas "essa chave existe?". Com 21.000 códigos, **1 em ~13 bilhões de strings quaisquer é
aceita como `valid`**. Medido aqui: ~880 mil hashes/s numa thread de Node → ~4 h para achar um código
"válido" (~20 min com os 12 cores deste notebook; segundos com GPU). Como o registro é público, qualquer
pessoa pode fazer isso offline e imprimir um QR que passa na checagem — e, como o código vale sempre, esse QR forjado
valeria para sempre. Saídas possíveis: aumentar a chave (12–16 bytes/registro; muda a função de busca e os shards)
e/ou conferir só no servidor, sem publicar o registro (o módulo opcional `extras/single-use/claim.js` já sabe ler o registro).

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
- Vercel: já traduzido em `vercel.json` (`redirects`).

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
| `extras/single-use/` | Módulo OPCIONAL (desligado): função de validação única `claim.js`, Redis falso `dev-fake-kv.js`, `claim-admin.js` (status/reset). |
| `build-info.json` | O que o último `build-integrated.js` fez (lido por `verify-integrated.js`). |
| `serve.js` | Servidor local sem dependências (serve o `site-integrado`; com `FAKE_KV=1` também o módulo opcional). |
| `MANIFEST.sha256` | SHA-256 de cada arquivo de `site/` (para conferir integridade depois). |
| `recover-from-ipfs.js` | Script que baixou tudo do gateway `eth.limo` (caminha pela árvore UnixFS via `?format=raw`). Refazer: `node recover-from-ipfs.js`. |
| `verify-cid.mjs` | Recalcula o CID de uma pasta: `node verify-cid.mjs site-integrado` (precisa `npm i ipfs-unixfs-importer blockstore-core multiformats`). |

## GitHub e Vercel

- Repositório (privado): `chili-guy/authnow-web`. A Vercel serve **`site-integrado/`** (ver `vercel.json`):
  `outputDirectory`, `trailingSlash` e os redirects que no IPFS/Netlify vivem no `_redirects`
  (`/c/:issuer/a/:code`, `/go/:code`, `/validate-new-product`). A Vercel **não lê** o `_redirects`.
  ⚠️ Com `trailingSlash: true` a Vercel primeiro manda `/go/X` → `/go/X/` (308) e só depois aplica os redirects, então
  **cada regra existe nas duas formas (com e sem `/` no fim)** — sem a versão com barra, o link impresso nas etiquetas
  (`/go/<codigo>`) dava 404. Teste sempre com `curl -L https://<site>/go/<codigo>` depois de mexer no `vercel.json`.
- `.gitattributes` desliga a conversão de fim de linha (`* -text`) para os arquivos chegarem à Vercel
  byte a byte iguais aos verificados localmente.
- **Importar na Vercel:** vercel.com/new → escolher `authnow-web` → *Framework Preset: Other* → deixar
  Build/Install Command vazios (o `vercel.json` já define a saída) → Deploy. Para usar `authnow.com.br`:
  Settings → Domains → adicionar o domínio e criar no DNS o registro que a Vercel indicar.
- Os CSV com os códigos em texto **não** estão neste repositório (ficam em `entrega-authnow-qr/`, fora dele).
  `build-integrated.js` os lê de `../entrega-authnow-qr/` e só funciona na máquina que os tem.
