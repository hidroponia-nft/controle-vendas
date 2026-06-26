# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

PWA de **controle de vendas para hidroponia** (alface NFT): plantio/cultivo, produtos, vendas/PDV, clientes e relatórios. App de página única, sem build e sem dependências de NPM — todo o código vive em `index.html`. Interface em português (pt-BR), pensada primeiro para celular.

## Como rodar / testar

Não há build nem lint. Para desenvolver, sirva a pasta por HTTP (o service worker e o `manifest.json` exigem `http://`, não funcionam via `file://`):

```bash
npx serve -l 8080      # ou: python -m http.server 8080 → http://localhost:8080
```

O Firebase Auth/Firestore exige que o domínio esteja autorizado no console; `localhost` já costuma estar liberado.

### Testes (rodar sempre antes de concluir uma mudança)

```bash
npm test        # = node tests/run.js
```

`tests/run.js` carrega o **código real** do `index.html` (extrai o último `<script>`), simula o DOM com stubs e roda asserts da lógica — sem navegador e sem Firebase. Os casos ficam na constante `CASOS_DE_TESTE`, agrupados por fase (`Plantio`, `Estoque`, `Relatório`, `Resumo`, `Vendas`). **Ao adicionar uma funcionalidade, acrescente um bloco de teste correspondente.** Há também a skill **`/testar`** (`.claude/skills/testar/`) que roda isso e destaca as falhas. Para checar só a sintaxe do script embutido, use `node --check` no `<script>` extraído.

## Arquitetura

- **`index.html`** — tudo: HTML, CSS (em `<style>`) e JS vanilla (em `<script>`). Sem framework, sem módulos, sem bundler. Firebase entra pelos SDKs **compat** via CDN (`firebase-*-compat.js`).
- **`sw.js`** — service worker *network-first*: sempre busca a versão fresca da rede e cai no cache só offline. Ao mudar assets, **incremente `CACHE`** (`vendas-app-v1` → `v2`) para invalidar o cache antigo.
- **`manifest.json`** + `icon-192.png` / `icon-512.png` — instalação na tela inicial. Ícones são gerados via System.Drawing no PowerShell (saco de dinheiro 💰 em gradiente azul), não desenhados à mão.

### Estado e dados

- Estado em memória são globais: `PRODUTOS`, `CLIENTES`, `VENDAS`, `PLANTIOS` (espelhos do Firestore) e `CART` (carrinho do PDV, não persistido).
- **Firestore**, por usuário, sob `users/{uid}/{produtos|clientes|vendas|plantios}`. Toda coleção é acessada por `col(name)`, que já injeta o `uid` logado — nunca montar caminho à mão.
- Listeners `onSnapshot` (`attachListeners`) mantêm os espelhos em tempo real; `onAuthStateChanged` → `onAuth` liga/desliga tudo no login/logout. Login deslogado zera os arrays.
- Persistência offline do Firestore está ligada (`enablePersistence`), então o app funciona sem rede e sincroniza depois.

### Modelo de estoque (importante — é o coração do app)

O estoque **não é digitado**: é **derivado**. Para cada produto, `estoqueProduto(pid) = colhidoProduto(pid) − vendidoProduto(pid)`:
- `colhidoProduto` = soma de `qtdColhida` dos plantios já colhidos (`colhido === true`) daquele produto.
- `vendidoProduto` = soma das quantidades vendidas daquele produto em todas as `VENDAS`.

Por isso, quando `VENDAS` ou `PLANTIOS` mudam, os listeners re-renderizam **também** produtos e os selects do PDV. Finalizar venda só grava o doc da venda (`col('vendas').add`) — **não** mexe em campo de estoque. A aba 🌱 **Plantio** é a única fonte de entrada de estoque: `colher()` marca `colhido` e grava `qtdColhida`, que entra no estoque.

**Modelo do plantio reflete a operação real (2 estufas):** as mudas chegam com ~10 dias e vão **direto pra bancada final** — não há berçário no app. Cada lote tem `estufa` (`ESTUFAS`: Estufa 1/2), `dataEntrada` (entrada na bancada), `diasBancada` (default `BANCADA_PADRAO` = 28, ajustável por estação) e `previsaoColheita` = entrada + diasBancada (recalculada por `plRecalcPrev()`). O status **não é um campo** — é derivado por `statusPlantio()`: `Na bancada` → `Pronto p/ colher` (quando a previsão chega) → `Colhido`. Variedade cultivada: alface **Brida** (crespa), ciclo de bancada ~25–28 dias em hidroponia.

### Convenções importantes

- **Firebase compartilhado com o app HIDROPONIA**: mesmo projeto `nft-alface`. Os dados ficam sob `users/{uid}/...` porque as **Security Rules** desse projeto só permitem esse caminho — gravar em outro top-level (ex.: a antiga tentativa `vendas_app/...`) é **bloqueado e a escrita falha silenciosamente**. As subcoleções de vendas (`produtos`, `clientes`, `vendas`, `plantios`) não colidem com a `medicoes` da hidroponia.
- Toda escrita passa por `needLogin()` antes.
- Navegação é só troca de classe `.active` entre `<section class="screen">` via `goTo(nome)`; cada aba re-renderiza no `goTo`. Não há roteador/URL.
- Conteúdo vindo do usuário é sempre passado por `esc()` ao montar HTML por template string.
- Relatórios são calculados no cliente a partir de `VENDAS` (filtrando por `tsLocal`), não há agregação no servidor.

## Cuidado

`apiKey` do Firebase está embutida no `index.html` — é normal e esperado em apps web Firebase (a segurança vem das Security Rules do Firestore, não de esconder a chave).
