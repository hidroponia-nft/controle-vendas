/* ============================================================
   PLANILHA AUTOMÁTICA — Controle de Vendas (Hidroponia)
   ------------------------------------------------------------
   Conecta no seu Firebase, puxa TODOS os dados do app
   (vendas, plantios, custos) e gera/atualiza um Excel com as
   abas: Vendas, Plantios, Custos, Perdas e Resumo.

   Como usar: veja o LEIA-ME.txt. Resumo:
     1) Baixe a chave do Firebase e salve como serviceAccountKey.json AQUI nesta pasta.
     2) Dê 2 cliques em "Atualizar-Planilha.bat".
   ============================================================ */
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

/* ─── CONFIG ─── */
const EMAIL = 'jullien.freitas@gmail.com';   // conta do app (troque se usar outro e-mail)
const VIDA_UTIL_DIAS = 45;                    // depois disso o plantio é "passado" (mesma regra do app)
const PES_POR_BANDEJA = 200;
const ARQUIVO_SAIDA = path.join(__dirname, 'controle-vendas.xlsx');

/* ─── CHAVE ─── */
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('\n❌ Falta a chave do Firebase!');
  console.error('   Baixe o arquivo e salve como:  ' + keyPath);
  console.error('   (o passo a passo está no LEIA-ME.txt)\n');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

/* ─── MESMA LÓGICA DO APP (estoque/perda automáticos por data) ─── */
function diasDesde(ds){ if(!ds) return 0; const h=new Date(); h.setHours(0,0,0,0); const a=new Date(ds+'T00:00:00'); return Math.max(0, Math.round((h-a)/86400000)); }
function diasPara(ds){ if(!ds) return 0; const h=new Date(); h.setHours(0,0,0,0); const a=new Date(ds+'T00:00:00'); return Math.round((a-h)/86400000); }
function plantioPassado(p){ return diasDesde(p.dataEntrada||p.dataPlantio) > VIDA_UTIL_DIAS; }
function bandejasDe(p){ return p.qtdBandejas!=null ? p.qtdBandejas : Math.round((p.qtdPlantada||0)/PES_POR_BANDEJA); }
function statusPlantio(p){ if(plantioPassado(p)) return 'Passado'; return diasPara(p.previsaoColheita)<=0 ? 'Pronto p/ colher' : 'Na bancada'; }
function dataDaVenda(v){ return v.data || (v.tsLocal ? new Date(v.tsLocal).toISOString().slice(0,10) : ''); }
function vendidoProduto(pid, vendas){ let n=0; vendas.forEach(v=>(v.itens||[]).forEach(it=>{ if(it.id===pid) n+=it.qtd||0; })); return n; }
function alocaVendas(pid, plantios, vendas){
  const pls = plantios.filter(p=>p.produtoId===pid)
    .sort((a,b)=> String(a.dataEntrada||'').localeCompare(String(b.dataEntrada||'')) || (a.tsLocal||0)-(b.tsLocal||0));
  let rem = vendidoProduto(pid, vendas);
  return pls.map(p=>{
    const plantado = p.qtdPlantada||0;
    const vendido = Math.min(plantado, Math.max(0, rem));
    rem -= vendido;
    return { p, plantado, vendido, sobra: plantado-vendido, passado: plantioPassado(p) };
  });
}

/* ─── MONTA AS ABAS ─── */
function abaVendas(vendas){
  const rows=[['Data','Produto','Qtd','Preço uni','Total item','Cliente']];
  [...vendas].sort((a,b)=>(a.tsLocal||0)-(b.tsLocal||0)).forEach(v=>{
    const d=dataDaVenda(v);
    (v.itens||[]).forEach(it=>rows.push([d, it.nome, it.qtd||0, it.preco||0, (it.preco||0)*(it.qtd||0), v.clienteNome||'']));
  });
  return rows;
}
function abaPlantios(plantios){
  const rows=[['Produto','Estufa','Bandejas','Pés plantados','Entrada','Previsão','Status','Vendido','Perda']];
  const ids=[...new Set(plantios.map(p=>p.produtoId))];
  const aloc={}; ids.forEach(pid=>alocaVendas(pid, plantios, GLOBAL_VENDAS).forEach(x=>{ aloc[x.p.id]=x; }));
  [...plantios].sort((a,b)=>String(a.dataEntrada||'').localeCompare(String(b.dataEntrada||''))).forEach(p=>{
    const x=aloc[p.id]||{vendido:0,sobra:p.qtdPlantada||0,passado:plantioPassado(p)};
    rows.push([p.produtoNome||'', p.estufa||'', bandejasDe(p), p.qtdPlantada||0, p.dataEntrada||'', p.previsaoColheita||'', statusPlantio(p), x.vendido||0, x.passado?(x.sobra||0):0]);
  });
  return rows;
}
function abaCustos(custos, custosFixos){
  const rows=[['Data','Categoria','Descrição','Tipo','Valor']];
  [...custos].sort((a,b)=>String(a.data||'').localeCompare(String(b.data||''))).forEach(c=>rows.push([c.data||'', c.categoria||'', c.descricao||'', c.tipo||'', c.valor||0]));
  custosFixos.forEach(c=>rows.push(['(fixo mensal)', c.categoria||'', c.descricao||'', c.tipo||'', c.valor||0]));
  return rows;
}
function abaPerdas(produtos, plantios, vendas){
  const rows=[['Produto','Plantado','Vendido','Perda','Taxa %']];
  produtos.forEach(pr=>{
    let plantado=0,vend=0,perda=0;
    alocaVendas(pr.id, plantios, vendas).forEach(x=>{ if(x.passado){ plantado+=x.plantado; vend+=x.vendido; perda+=x.sobra; } });
    if(plantado>0) rows.push([pr.nome, plantado, vend, perda, Math.round(perda/plantado*100)]);
  });
  return rows;
}
function abaResumo(produtos, plantios, vendas, custos, custosFixos){
  const fat=vendas.reduce((s,v)=>s+(v.total||0),0);
  const nV=vendas.length;
  const unVend=vendas.reduce((s,v)=>s+(v.itens||[]).reduce((a,it)=>a+(it.qtd||0),0),0);
  const custosVar=custos.reduce((s,c)=>s+(c.valor||0),0);
  const custosFix=custosFixos.reduce((s,c)=>s+(c.valor||0),0);
  const plantadoTot=plantios.reduce((s,p)=>s+(p.qtdPlantada||0),0);
  let perdaUn=0, plantadoPassado=0;
  produtos.forEach(pr=>alocaVendas(pr.id, plantios, vendas).forEach(x=>{ if(x.passado){ perdaUn+=x.sobra; plantadoPassado+=x.plantado; } }));
  const taxa=plantadoPassado?Math.round(perdaUn/plantadoPassado*100):0;
  return [
    ['Resumo geral', ''],
    ['Atualizado em', new Date().toLocaleString('pt-BR')],
    ['Faturamento (R$)', fat],
    ['Nº de vendas', nV],
    ['Ticket médio (R$)', nV?Math.round(fat/nV*100)/100:0],
    ['Unidades vendidas', unVend],
    ['Custos variáveis (R$)', custosVar],
    ['Custos fixos por mês (R$)', custosFix],
    ['Total plantado (un)', plantadoTot],
    ['Perda total (un)', perdaUn],
    ['Taxa de perda (%)', taxa]
  ];
}

let GLOBAL_VENDAS = [];

async function main(){
  console.log('Conectando no Firebase…');
  let uid;
  try { uid = (await admin.auth().getUserByEmail(EMAIL)).uid; }
  catch(e){ console.error('\n❌ Não encontrei a conta '+EMAIL+' no Firebase. Confira o EMAIL no topo do exportar.js.\n'); process.exit(1); }

  const base = db.collection('users').doc(uid);
  const get = async name => (await base.collection(name).get()).docs.map(d=>({ id:d.id, ...d.data() }));
  console.log('Baixando seus dados…');
  const [produtos, clientes, vendas, plantios, custos, custosFixos] = await Promise.all([
    get('produtos'), get('clientes'), get('vendas'), get('plantios'), get('custos'), get('custosFixos')
  ]);
  GLOBAL_VENDAS = vendas;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaVendas(vendas)), 'Vendas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaPlantios(plantios)), 'Plantios');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaCustos(custos, custosFixos)), 'Custos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaPerdas(produtos, plantios, vendas)), 'Perdas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaResumo(produtos, plantios, vendas, custos, custosFixos)), 'Resumo');
  XLSX.writeFile(wb, ARQUIVO_SAIDA);

  console.log('\n✅ Planilha atualizada!');
  console.log('   ' + ARQUIVO_SAIDA);
  console.log('   Vendas: '+vendas.length+' | Plantios: '+plantios.length+' | Custos: '+custos.length+'\n');
}
main().catch(e=>{ console.error('\n❌ Deu erro:', e.message||e, '\n'); process.exit(1); });
