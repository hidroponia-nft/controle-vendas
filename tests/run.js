/* ============================================================
   TESTADOR DO APP DE CONTROLE DE VENDAS
   ------------------------------------------------------------
   Roda a LÓGICA REAL do index.html (sem navegador e sem Firebase),
   simulando o DOM. Serve para validar o app em qualquer fase.

   Como usar:
     node tests/run.js
     npm test

   Como funciona:
     1. Lê o index.html e extrai o último <script> (o nosso código).
     2. Cria stubs de document/window/navigator/firebase para o código carregar.
     3. Executa o código + os casos de teste no mesmo escopo (vm).
     4. Cada assert imprime ✅/❌ e o processo sai com código !=0 se algo falhar.

   Para cobrir uma fase nova do app: adicione um bloco em CASOS_DE_TESTE.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(APP, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appCode = scripts[scripts.length - 1];
if (!appCode || !/function estoqueProduto/.test(appCode)) {
  console.error('❌ Não encontrei o código do app no index.html (o último <script>). Abortei.');
  process.exit(2);
}

// ---- stubs mínimos de navegador (DOM falso que guarda innerHTML/textContent) ----
const store = {};
function makeEl(id){
  return { id, _h:'', set innerHTML(v){this._h=v;}, get innerHTML(){return this._h;},
    value:'', textContent:'', style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    appendChild(){}, addEventListener(){} };
}
const sandbox = {
  store, makeEl, console, Date, JSON, Math, parseInt, parseFloat, Number, isNaN,
  setTimeout: () => {}, clearTimeout: () => {},
  document: { getElementById: id => store[id] || (store[id] = makeEl(id)),
              querySelectorAll: () => [], addEventListener(){} },
  window: {}, navigator: {},
};
sandbox.globalThis = sandbox;

// ---- mini-framework de asserts (compartilha escopo com o app via vm) ----
const FRAMEWORK = `
var __fail = 0, __pass = 0;
function suite(n){ console.log('\\n── ' + n + ' ──'); }
function ok(cond,msg){ if(cond){ __pass++; console.log('  \\u2705 '+msg); }
                       else { __fail++; console.log('  \\u274C FALHOU: '+msg); } }
function eq(a,b,msg){ ok(a===b, msg + (a===b?'':'  (esperado '+JSON.stringify(b)+', veio '+JSON.stringify(a)+')')); }
function reset(){ PRODUTOS=[]; CLIENTES=[]; VENDAS=[]; PLANTIOS=[]; CART=[]; FB_USER={uid:'teste'}; }
function hojeMais(n){ return addDias(new Date().toISOString().slice(0,10), n); }
`;

const CASOS_DE_TESTE = `
/* ===== FASE: PLANTIO — status do ciclo ===== */
suite('Plantio · status do lote');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5}];
var lNa  ={id:'a',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:200,colhido:false,previsaoColheita:hojeMais(5)};
var lPron={id:'b',estufa:'Estufa 2',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:150,colhido:false,previsaoColheita:hojeMais(-1)};
var lColh={id:'c',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:200,colhido:true,qtdColhida:180};
eq(statusPlantio(lNa),'Na bancada','lote com colheita futura = Na bancada');
eq(statusPlantio(lPron),'Pronto p/ colher','lote vencido = Pronto p/ colher');
eq(statusPlantio(lColh),'Colhido','lote colhido = Colhido');
eq(addDias('2026-06-01',28),'2026-06-29','previsão = entrada + dias na bancada');

/* ===== FASE: ESTOQUE — colhido menos vendido ===== */
suite('Estoque · derivado de colheita e vendas');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5}];
PLANTIOS=[lNa]; VENDAS=[];
eq(estoqueProduto('p1'),0,'sem colheita, estoque = 0');
PLANTIOS=[lNa,lColh];
eq(estoqueProduto('p1'),180,'após colher 180, estoque = 180');
VENDAS=[{itens:[{id:'p1',nome:'Alface Brida',preco:3.5,qtd:5}],total:17.5}];
eq(estoqueProduto('p1'),175,'após vender 5, estoque = 175');

/* ===== FASE: RELATÓRIO — prontos pra colher por estufa ===== */
suite('Relatório · prontos pra colher por estufa');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5}];
var lE1={id:'d',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:120,colhido:false,previsaoColheita:hojeMais(0)};
PLANTIOS=[lNa,lPron,lColh,lE1]; VENDAS=[];
renderColheita();
var rep = document.getElementById('pl-colher').innerHTML;
ok(rep.includes('Estufa 1') && rep.includes('Estufa 2'),'mostra as duas estufas');
ok(rep.includes('120 pés'),'Estufa 1 lista o lote pronto (120)');
ok(rep.includes('150 pés'),'Estufa 2 lista o lote pronto (150)');
ok(!rep.includes('200 pés'),'lote na bancada (200) não aparece nos prontos');
ok(rep.indexOf('Estufa 1') < rep.indexOf('Estufa 2'),'Estufa 1 antes da Estufa 2');

/* ===== FASE: RESUMO — números do topo da aba Plantio ===== */
suite('Resumo · contadores do topo');
renderPlantios();
eq(document.getElementById('pl-cultivo').textContent, 470, 'pés em cultivo = 470 (exclui colhido)');
eq(document.getElementById('pl-prontos').textContent, 270, 'prontos p/ colher = 270 pés');
eq(document.getElementById('pl-lotes').textContent, 3, 'lotes na bancada = 3 (exclui colhido)');

/* ===== FASE: VENDAS — total e itens do carrinho ===== */
suite('Vendas · cálculo do carrinho');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5},{id:'p2',nome:'Alface Roxa',preco:4}];
CART=[{id:'p1',nome:'Alface Brida',preco:3.5,qtd:3},{id:'p2',nome:'Alface Roxa',preco:4,qtd:2}];
eq(cartTotal(), 3.5*3 + 4*2, 'total do carrinho = 18.5');
eq(brl(18.5), 'R$ 18,50', 'formatação em reais');
`;

vm.createContext(sandbox);
try {
  vm.runInContext(FRAMEWORK + appCode + CASOS_DE_TESTE, sandbox, { filename: 'app+tests.js' });
} catch (e) {
  console.error('\n❌ Erro ao executar os testes:\n', e);
  process.exit(1);
}

const pass = sandbox.__pass || 0, fail = sandbox.__fail || 0;
console.log('\n' + (fail ? `❌ ${fail} falhou(aram), ${pass} passou(aram)` : `🎉 TODOS OS ${pass} TESTES PASSARAM`));
process.exit(fail ? 1 : 0);
