---
name: testar
description: Roda o testador do app de controle de vendas (node tests/run.js) e mostra os resultados, destacando os erros. Use sempre que terminar uma mudança no app, antes de dizer que está pronto, ou quando o usuário pedir para testar/validar/checar o app.
---

# Testar o app de controle de vendas

Objetivo: rodar a suíte de testes do projeto e relatar o resultado em português, **deixando os erros em evidência**.

## Passos

1. Rode o testador a partir da raiz do projeto:
   ```
   node tests/run.js
   ```
   (equivalente a `npm test`.)

2. Leia a saída e responda assim:
   - **Se tudo passou** (`🎉 TODOS OS ... TESTES PASSARAM`): confirme em uma linha quantos testes passaram. Não despeje a saída inteira.
   - **Se algo falhou** (linhas com `❌`): liste **somente as falhas**, cada uma com:
     - o nome do caso (a mensagem ao lado do ❌),
     - o esperado vs. o que veio (vem entre parênteses na própria linha),
     - o bloco/suíte (`── ... ──`) em que ocorreu.
     Em seguida, aponte o provável arquivo/função culpado em `index.html` e proponha a correção. Não diga que o app está pronto enquanto houver falha.

3. Se o comando nem rodar (erro de sintaxe, exit code 2, "Erro ao executar os testes"), trate como falha crítica: mostre o erro e investigue o `index.html` (provável erro de JavaScript). Um atalho útil para validar a sintaxe do script embutido:
   ```
   node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const s=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);fs.writeFileSync(process.env.TMP+"/_chk.js",s[s.length-1]);' && node --check "$TMP/_chk.js" && echo "SINTAXE OK"
   ```

## Como manter os testes cobrindo "todas as fases"

Os casos ficam em `tests/run.js`, na constante `CASOS_DE_TESTE`, agrupados por fase do app
(`Plantio`, `Estoque`, `Relatório`, `Resumo`, `Vendas`). Ao adicionar uma funcionalidade nova,
**adicione um bloco `suite('...')` + `ok()/eq()` correspondente** antes de considerar a tarefa concluída.
O testador carrega o código real do `index.html` (último `<script>`) e simula o DOM, então testa a
lógica de verdade — não uma cópia.
