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
function reset(){ PRODUTOS=[]; CLIENTES=[]; VENDAS=[]; PLANTIOS=[]; CUSTOS=[]; CUSTOS_FIXOS=[]; CART=[]; FB_USER={uid:'teste'}; REL_PERIODO='tudo'; CUSTO_PERIODO='tudo'; }
function hojeMais(n){ return addDias(new Date().toISOString().slice(0,10), n); }
`;

const CASOS_DE_TESTE = `
/* ===== FASE: PLANTIO — status do ciclo ===== */
suite('Plantio · status do lote');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5}];
var lNa  ={id:'a',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:200,colhido:false,previsaoColheita:hojeMais(5)};
var lPron={id:'b',estufa:'Estufa 2',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:150,colhido:false,previsaoColheita:hojeMais(-1)};
var lColh={id:'c',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Alface Brida',qtdPlantada:200,dataEntrada:hojeMais(-50)}; // passou de 45 dias
eq(statusPlantio(lNa),'Na bancada','plantio com colheita futura = Na bancada');
eq(statusPlantio(lPron),'Pronto p/ colher','plantio vencido = Pronto p/ colher');
eq(statusPlantio(lColh),'Passado','plantio com +45 dias = Passado (automático)');
eq(addDias('2026-06-01',28),'2026-06-29','previsão = entrada + dias na bancada');

/* ===== FASE: ESTOQUE — plantado no ponto − vendido (automático) ===== */
suite('Estoque · plantado no ponto − vendido');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5}];
PLANTIOS=[{id:'a',produtoId:'p1',qtdPlantada:200,dataEntrada:hojeMais(-10)}]; VENDAS=[];
eq(estoqueProduto('p1'),200,'plantou 200 (no ponto), nada vendido → estoque 200');
VENDAS=[{itens:[{id:'p1',qtd:50}]}];
eq(estoqueProduto('p1'),150,'vendeu 50 → disponível 150');
eq(perdaProduto('p1'),0,'ainda no ponto → sem perda');
// passou de 45 dias: o que não vendeu vira perda sozinho
PLANTIOS=[{id:'a',produtoId:'p1',qtdPlantada:200,dataEntrada:hojeMais(-50)}];
eq(estoqueProduto('p1'),0,'passado não conta como estoque');
eq(perdaProduto('p1'),150,'passou: 200 plantado − 50 vendidos = 150 de perda');

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
eq(document.getElementById('pl-cultivo').textContent, 470, 'pés em cultivo = 470 (exclui passado)');
eq(document.getElementById('pl-prontos').textContent, 270, 'prontos p/ colher = 270 pés');
eq(document.getElementById('pl-lotes').textContent, 3, 'plantios na bancada = 3 (exclui passado)');

/* ===== FASE: VENDAS — total e itens do carrinho ===== */
suite('Vendas · cálculo do carrinho');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:3.5},{id:'p2',nome:'Alface Roxa',preco:4}];
CART=[{id:'p1',nome:'Alface Brida',preco:3.5,qtd:3},{id:'p2',nome:'Alface Roxa',preco:4,qtd:2}];
eq(cartTotal(), 3.5*3 + 4*2, 'total do carrinho = 18.5');
eq(brl(18.5), 'R$ 18,50', 'formatação em reais');

/* ===== FASE: CUSTOS — tipo padrão por categoria ===== */
suite('Custos · classificação produção x operacional');
eq(tipoPadrao('Fertilizantes'),'Produção','fertilizante = produção (margem bruta)');
eq(tipoPadrao('Mudas'),'Produção','mudas = produção');
eq(tipoPadrao('Energia'),'Operacional','energia = operacional (só margem líquida)');
eq(tipoPadrao('Combustível'),'Operacional','combustível = operacional');

/* ===== FASE: CUSTOS — período e totais ===== */
suite('Custos · período (semana exclui antigos) e render');
reset();
CUSTOS=[
  {id:'x1',categoria:'Energia',valor:300,tipo:'Operacional',data:hojeMais(-1)},
  {id:'x2',categoria:'Fertilizantes',valor:200,tipo:'Produção',data:hojeMais(-2)},
  {id:'x3',categoria:'Combustível',valor:100,tipo:'Operacional',data:hojeMais(-100)}
];
eq(custosNoPeriodo(0).length, 3, 'período "tudo" pega os 3 custos');
eq(custosNoPeriodo(periodoIni('semana')).length, 2, 'semana exclui o custo de 100 dias atrás');
CUSTO_PERIODO='tudo'; renderCustos();
eq(document.getElementById('cu-total').textContent, brl(600), 'total de custos = 600');
eq(document.getElementById('cu-prod').textContent, brl(200), 'custos de produção = 200');

/* ===== FASE: RELATÓRIO — margem bruta, líquida e por cliente ===== */
suite('Relatório · margens e por cliente');
reset();
PRODUTOS=[{id:'p1',nome:'Alface Brida',preco:5}];
VENDAS=[
  {itens:[{id:'p1',nome:'Alface Brida',preco:5,qtd:100}],total:500,qtdItens:100,clienteNome:'Mercado A',tsLocal:Date.now()},
  {itens:[{id:'p1',nome:'Alface Brida',preco:5,qtd:40}], total:200,qtdItens:40, clienteNome:'Feira B', tsLocal:Date.now()}
];
CUSTOS=[
  {id:'c1',categoria:'Fertilizantes',valor:100,tipo:'Produção',data:hojeMais(0)},
  {id:'c2',categoria:'Energia',valor:150,tipo:'Operacional',data:hojeMais(0)}
];
REL_PERIODO='tudo'; renderRelatorios();
eq(document.getElementById('r-receita').textContent, brl(700), 'faturamento = 700');
eq(document.getElementById('r-custos').textContent, brl(250), 'custos totais = 250');
eq(document.getElementById('m-lbruto').textContent, brl(600), 'lucro bruto = 700 - 100 (produção)');
eq(document.getElementById('m-lliquido').textContent, brl(450), 'lucro líquido = 700 - 250 (todos)');
eq(document.getElementById('m-mbruta').textContent, '85.7%', 'margem bruta = 600/700');
eq(document.getElementById('m-mliquida').textContent, '64.3%', 'margem líquida = 450/700');
var rc=document.getElementById('r-clientes').innerHTML;
ok(rc.includes('Mercado A') && rc.includes('Feira B'), 'lista os dois clientes');
ok(rc.indexOf('Mercado A') < rc.indexOf('Feira B'), 'quem mais comprou aparece primeiro');
ok(rc.includes(brl(500)) && rc.includes(brl(200)), 'mostra o total comprado por cliente');

/* ===== FASE: CUSTOS FIXOS — entram sozinhos na margem (mês) ===== */
suite('Custos fixos · mensais entram na margem');
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5}];
VENDAS=[{itens:[{id:'p1',nome:'Brida',preco:5,qtd:400}],total:2000,qtdItens:400,clienteNome:'A',tsLocal:Date.now()}];
CUSTOS_FIXOS=[
  {id:'f1',categoria:'Funcionário',valor:1000,tipo:'Operacional'},
  {id:'f2',categoria:'Energia',valor:600,tipo:'Operacional'},
  {id:'f3',categoria:'Combustível',valor:120,tipo:'Operacional'}
];
eq(fixosMensalTotal(), 1720, 'total fixo mensal = 1720');
REL_PERIODO='mes'; renderRelatorios();
eq(document.getElementById('r-custos').textContent, brl(1720), 'custos do mês = 1720 (só fixos)');
eq(document.getElementById('m-lbruto').textContent, brl(2000), 'lucro bruto = 2000 (fixos são operacionais)');
eq(document.getElementById('m-lliquido').textContent, brl(280), 'lucro líquido = 2000 - 1720 = 280');
ok(fatorPeriodo('semana') < fatorPeriodo('mes'), 'semana conta fração menor que o mês');

/* fixo de produção afeta a margem bruta */
reset();
VENDAS=[{itens:[{id:'p1',nome:'Brida',preco:5,qtd:200}],total:1000,qtdItens:200,clienteNome:'A',tsLocal:Date.now()}];
CUSTOS_FIXOS=[{id:'f1',categoria:'Fertilizantes',valor:200,tipo:'Produção'}];
REL_PERIODO='mes'; renderRelatorios();
eq(document.getElementById('m-lbruto').textContent, brl(800), 'fixo de produção abate na margem bruta (1000-200)');

/* ===== FASE: VENDAS — vender menores é permitido (sem trava, só aviso) ===== */
suite('Vendas · vender menores é permitido');
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5},{id:'p2',nome:'Roxa',preco:4}];
PLANTIOS=[{id:'a',produtoId:'p1',qtdPlantada:2,colhido:false}];   // p1 tem 2 plantado, p2 tem 0
eq(estoqueProduto('p1'),2,'p1 com 2 disponíveis');
eq(estoqueProduto('p2'),0,'p2 sem estoque');
document.getElementById('pdv-prod').value='p2';
pdvAdd();
eq(noCarrinho('p2'),1,'dá pra vender produto sem tamanho final (menores)');
document.getElementById('pdv-prod').value='p1';
pdvAdd();
eq(noCarrinho('p1'),1,'adiciona ao carrinho');
cartSetQty('p1',40);
eq(noCarrinho('p1'),40,'digita a quantidade direto (40)');
cartSetQty('p1',7);
eq(noCarrinho('p1'),7,'digitar de novo ajusta (7)');
cartDel('p1');
eq(noCarrinho('p1'),0,'lixeira remove do carrinho');

/* ===== FASE: VENDAS — data da venda escolhida no calendário ===== */
suite('Vendas · data escolhida no calendário');
var hj=new Date().toISOString().slice(0,10), t0=Date.now();
ok(tsDaVenda('')>=t0, 'sem data escolhida usa a hora atual');
ok(tsDaVenda(hj)>=t0, 'data de hoje usa a hora atual');
eq(tsDaVenda('2026-01-10'), new Date('2026-01-10T12:00:00').getTime(), 'dia passado vira meio-dia daquela data');
ok(tsDaVenda('2026-01-10') < t0, 'data passada gera timestamp anterior a agora');

/* ===== FASE: VENDAS — alerta vermelho de produtos sem tamanho final ===== */
suite('Vendas · alerta de sem estoque');
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5},{id:'p2',nome:'Roxa',preco:4}];
PLANTIOS=[{id:'a',produtoId:'p1',qtdPlantada:5,colhido:false}];
var sem=produtosSemEstoque();
eq(sem.length,1,'só um produto sem estoque');
eq(sem[0].id,'p2','o sem estoque é o p2 (Roxa)');
refreshPdvSelects();
var al=document.getElementById('pdv-alert');
ok(al.style.display==='block','alerta vermelho fica visível');
ok(al.innerHTML.includes('Roxa'),'alerta cita o produto sem estoque');
PLANTIOS=[{id:'a',produtoId:'p1',qtdPlantada:5,colhido:false},{id:'b',produtoId:'p2',qtdPlantada:5,colhido:false}];
refreshPdvSelects();
eq(document.getElementById('pdv-alert').style.display,'none','sem produtos zerados, alerta some');

/* ===== FASE: PLANTIO — tempo plantado e quanto falta pra colher ===== */
suite('Plantio · tempo plantado e falta pra colher');
reset();
eq(diasDesde(hojeMais(-10)),10,'plantado há 10 dias');
eq(diasDesde(hojeMais(3)),0,'data futura nunca fica negativa');
PRODUTOS=[{id:'p1',nome:'Brida',preco:5}];
PLANTIOS=[{id:'a',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Brida',qtdPlantada:100,colhido:false,dataEntrada:hojeMais(-10),previsaoColheita:hojeMais(18)}];
renderPlantios();
var pl=document.getElementById('pl-list').innerHTML;
ok(pl.includes('plantado há 10 dia'),'mostra há quanto tempo está plantado');
ok(pl.includes('faltam 18 dia'),'mostra quantos dias faltam pra colher');

/* ===== FASE: PLANTIO — bandejas (cada bandeja = 200 pés) ===== */
suite('Plantio · bandejas (200 pés cada)');
eq(bandejasDe({qtdBandejas:3}),3,'usa o nº de bandejas quando existe');
eq(bandejasDe({qtdPlantada:600}),3,'converte plantio antigo: 600 pés = 3 bandejas');
eq(bandejasDe({qtdPlantada:200}),1,'200 pés = 1 bandeja');
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5}];
PLANTIOS=[{id:'a',estufa:'Estufa 1',produtoId:'p1',produtoNome:'Brida',qtdBandejas:3,qtdPlantada:600,colhido:false,dataEntrada:hojeMais(-5),previsaoColheita:hojeMais(10)}];
renderPlantios();
var plb=document.getElementById('pl-list').innerHTML;
ok(plb.includes('3 bandeja'),'lista mostra as bandejas');
ok(plb.includes('600 pés'),'lista mostra os pés equivalentes');

/* ===== FASE: PERDAS — automático por 45 dias (plantio × vendas) ===== */
suite('Perdas · automático por 45 dias');
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5}];
PLANTIOS=[
  {id:'a',produtoId:'p1',produtoNome:'Brida',qtdPlantada:2000,dataEntrada:hojeMais(-50)}, // passou do ponto
  {id:'b',produtoId:'p1',produtoNome:'Brida',qtdPlantada:1000,dataEntrada:hojeMais(-5)}   // ainda no ponto
];
VENDAS=[{itens:[{id:'p1',qtd:1600}]}];
// FIFO: as 1600 vendas saem do plantio mais antigo (o passado) primeiro
eq(perdaProduto('p1'),400,'passado: 2000 − 1600 vendidos = 400 de perda');
eq(estoqueProduto('p1'),1000,'no ponto: 1000 disponível (vendas saíram do passado)');
PERDA_PERIODO='tudo'; renderPerdas();
eq(document.getElementById('pd-plantado').textContent,2000,'painel: plantado passado = 2000');
eq(document.getElementById('pd-vendido').textContent,1600,'painel: vendido = 1600');
eq(document.getElementById('pd-perda').textContent,400,'painel: perda = 400');
eq(document.getElementById('pd-taxa').textContent,'20.0%','taxa de perda = 20%');
var pdl=document.getElementById('pd-list').innerHTML;
ok(pdl.includes('Brida') && pdl.includes('perda 400'),'lista por produto mostra a perda');
// período: passado que "morreu" (entrada+45) há muito tempo fica fora da semana
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5}];
PLANTIOS=[{id:'a',produtoId:'p1',produtoNome:'Brida',qtdPlantada:500,dataEntrada:hojeMais(-120)}]; VENDAS=[];
PERDA_PERIODO='tudo'; renderPerdas();
eq(document.getElementById('pd-perda').textContent,500,'tudo: inclui o passado antigo (perda 500)');
PERDA_PERIODO='semana'; renderPerdas();
eq(document.getElementById('pd-perda').textContent,0,'semana: exclui o passado que morreu há muito');

/* ===== FASE: EXPORTAR — linhas das planilhas ===== */
suite('Exportar · linhas para o Excel');
reset();
PRODUTOS=[{id:'p1',nome:'Brida',preco:5}];
VENDAS=[{itens:[{id:'p1',nome:'Brida',preco:5,qtd:40}],total:200,data:'2026-07-01',tsLocal:new Date('2026-07-01T12:00:00').getTime(),clienteNome:'Mercado A'}];
var lv=linhasVendasExport();
eq(lv.length,2,'cabeçalho + 1 linha de item');
eq(lv[0][0],'Data','1ª coluna é Data');
eq(lv[1][0],'2026-07-01','usa a data escolhida da venda');
eq(lv[1][4],200,'total do item = preço × qtd');
eq(lv[1][5],'Mercado A','traz o cliente');
// resumo: perda entra pelo plantio passado
PLANTIOS=[{id:'a',produtoId:'p1',produtoNome:'Brida',qtdPlantada:100,dataEntrada:hojeMais(-50)}];
VENDAS=[{itens:[{id:'p1',nome:'Brida',preco:5,qtd:60}],total:300,data:hj,tsLocal:Date.now()}];
var rz={}; linhasResumoExport().forEach(r=>rz[r[0]]=r[1]);
eq(rz['Faturamento (R$)'],300,'resumo: faturamento = 300');
eq(rz['Perda total (un)'],40,'resumo: perda = 100 plantado − 60 vendido');
eq(rz['Taxa de perda (%)'],40,'resumo: taxa de perda = 40%');
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
