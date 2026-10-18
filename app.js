/* ====== template original, capturado antes de qualquer alteração no DOM ====== */
const TEMPLATE = '<!doctype html>\n<html lang="pt-BR">' + document.documentElement.innerHTML + '</html>';

const DIAS = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const LETRAS = ['S','T','Q','Q','S'];
const BASE_CHAVE = 'plannerSemanal:v3';
const CHAVE_ANTIGA = 'plannerSemanal:v1';   /* versão anterior deste arquivo, para não perder trabalho */
const $ = id => document.getElementById(id);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const agora = () => new Date().toISOString();
const hora = d => { const x = d ? new Date(d) : new Date(); return String(x.getHours()).padStart(2,'0') + ':' + String(x.getMinutes()).padStart(2,'0'); };

/* ====== utilitários de data (declarados antes do estado, que já os usa) ====== */
function isoDe(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function dataDeIso(iso){ const p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function segundaDe(iso){
  const d = dataDeIso(iso);
  const dw = d.getDay();
  d.setDate(d.getDate() + (dw === 0 ? -6 : 1 - dw));
  return isoDe(d);
}
function hojeIso(){ return isoDe(new Date()); }
function hojeSegunda(){ return segundaDe(hojeIso()); }
function dataDia(i){ const d = dataDeIso(E.inicio); d.setDate(d.getDate() + i); return d; }
const fmt = d => String(d.getDate()).padStart(2,'0') + ' / ' + String(d.getMonth()+1).padStart(2,'0');
const fmtLongo = d => String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
const fmtCurto = iso => { const p = String(iso).split('-'); return p[2] + '/' + p[1]; };

/* ====== colunas do quadro ======
   A coluna é o dia da semana (0=segunda … 4=sexta), como no arquivo original.
   O status de cada um dos cinco dias continua marcado nas letras STQQS de cada
   tarefa, esteja ela em qual coluna estiver. */
function normaliza(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
const nomeDia = i => (DIAS[i] || '') + '-feira';

/* ====== áreas (agrupamento das linhas do quadro) ======
   Novo na v4: cada tarefa pertence a uma área. Tarefas antigas recebem a área
   por palavra-chave; depois dá para trocar no detalhe da tarefa. */
const AREAS = ['Operação','Contratos','Pessoas','Materiais','Outros'];

/* ====== cores de criticidade (definidas por tarefa, no detalhe) ====== */
const CORES = [
  { k:'vermelho', n:'Crítica',            c:'#d32f3b', bg:'#fdecee' },
  { k:'laranja',  n:'Alta',               c:'#e8772e', bg:'#fef2e8' },
  { k:'amarelo',  n:'Atenção',            c:'#d9a400', bg:'#fdf8e1' },
  { k:'roxo',     n:'Aguardando terceiros',c:'#6d3fd0', bg:'#f3eefd' },
  { k:'azul',     n:'Acompanhar',         c:'#1B5FC1', bg:'#ecf3fd' },
  { k:'verde',    n:'Sob controle',       c:'#1f9d5c', bg:'#e8f6ee' }
];
const corDe = k => CORES.find(c => c.k === k) || null;
function areaDe(txt){
  const n = normaliza(txt);
  if (/^\s*(fca|contratos?)\b/.test(n)) return 'Contratos';
  if (/admiss|deslig|ferias|ponto|atestad|exame|falta|banco de horas|insalub|efetivo|treinam|desvio/.test(n)) return 'Pessoas';
  if (/uniforme|\bepi\b|estoque|compra/.test(n)) return 'Materiais';
  if (/sap|manut|ordens|backlog|limpeza|corretiv/.test(n)) return 'Operação';
  return 'Outros';
}
/* chave estável: é o que permite reconhecer a MESMA tarefa em semanas diferentes */
function chaveDe(txt){
  return normaliza(txt).replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
}

/* ====== estado ======
   v3 — cada semana guarda o seu próprio conjunto de tarefas, metas, anotações e
   dias encerrados, indexado pela segunda-feira em ISO. Nada é compartilhado entre
   semanas: incluir, excluir ou marcar status em uma semana não toca em nenhuma outra. */
const semanaVazia = () => ({ diasFeitos:[false,false,false,false,false], tarefas:[], metas:[], notas:'' });

/* status do assunto (andamento do tema, independente das caixas S T Q Q S) */
const STATUS_AS = [
  { k: '',      n: 'Sem status' },
  { k: 'nao',   n: 'Não iniciado' },
  { k: 'and',   n: 'Em andamento' },
  { k: 'aguard',n: 'Aguardando retorno' },
  { k: 'bloq',  n: 'Bloqueado' },
  { k: 'conc',  n: 'Concluído' }
];
const stNome = k => (STATUS_AS.find(x => x.k === k) || STATUS_AS[0]).n;
const stValido = k => STATUS_AS.some(x => x.k === k) ? k : '';
function normalizaTarefa(t, iOrdem){
  const o = {
    id: t.id || uid(),
    col: Number.isInteger(t.col) ? Math.min(4, Math.max(0, t.col)) : 0,
    txt: typeof t.txt === 'string' ? t.txt : '',
    dias: Array.isArray(t.dias) && t.dias.length === 5 ? t.dias.map(v => +v || 0) : [0,0,0,0,0],
    modo: t.modo === 'diaria' ? 'diaria' : 'demanda',
    urg: !!t.urg,
    resp: t.resp || t.responsavel || '',
    prazo: t.prazo || '',
    obs: t.obs || '',
    area: t.area === 'FCA' ? 'Contratos' : (AREAS.indexOf(t.area) >= 0 ? t.area : areaDe(t.txt)),
    cor: corDe(t.cor) ? t.cor : (t.urg ? 'vermelho' : ''),
    hist: Array.isArray(t.hist) ? t.hist.filter(h => h && h.d && (h.tx || (Array.isArray(h.img) && h.img.length))) : []
  };
  o.chave = t.chave || chaveDe(o.txt);
  /* fio: identidade da tarefa ao longo das semanas — sobrevive a renomear */
  o.fio = t.fio || (o.chave ? 'k:' + o.chave : 'f:' + o.id);
  o.urg = o.cor === 'vermelho';
  o.assuntos = Array.isArray(t.assuntos) ? t.assuntos.filter(a => a && typeof a === 'object').map(a => ({ id: a.id || uid(), nome: typeof a.nome === 'string' ? a.nome : '', resp: a.resp || '', prazo: a.prazo || '', st: stValido(a.st) })) : [];
  o.ativo = t.ativo || '';
  garanteAssuntos(o);
  sincStatus(o);
  return o;
}
/* ====== assuntos: cada contrato/tarefa pode ter vários, cada um com responsável, prazo e comentários próprios ====== */
function garanteAssuntos(t){
  if (!Array.isArray(t.assuntos) || !t.assuntos.length)
    t.assuntos = [{ id: 'geral', nome: 'Geral', resp: t.resp || '', prazo: t.prazo || '', st: stValido(t.st) }];
  t.assuntos.forEach(a => { if (!a.id) a.id = uid(); a.nome = a.nome || ''; a.resp = a.resp || ''; a.prazo = a.prazo || ''; a.st = stValido(a.st); });
  if (!t.assuntos.some(a => a.id === t.ativo)) t.ativo = t.assuntos[0].id;
  return t.assuntos;
}
function sincStatus(t){
  /* status da tarefa: tudo concluído → Concluído; senão o do assunto aberto com prazo mais próximo (ou o primeiro com status) */
  const abertos = t.assuntos.filter(a => a.st !== 'conc');
  const comSt = t.assuntos.filter(a => a.st);
  if (comSt.length && !abertos.length) t.st = 'conc';
  else {
    const abComPz = abertos.filter(a => a.prazo && a.st).sort((x, y) => x.prazo < y.prazo ? -1 : x.prazo > y.prazo ? 1 : 0)[0];
    t.st = (abComPz || abertos.find(a => a.st) || {}).st || '';
  }
}
/* responsável e prazo da tarefa (usados no quadro e nos filtros) = os do assunto com o prazo mais próximo */
function sincAssuntos(t){
  garanteAssuntos(t);
  const comPrazo = t.assuntos.filter(a => a.prazo).sort((x, y) => x.prazo < y.prazo ? -1 : x.prazo > y.prazo ? 1 : 0);
  const ref = comPrazo[0] || t.assuntos.find(a => a.resp) || t.assuntos[0];
  t.prazo = comPrazo[0] ? comPrazo[0].prazo : '';
  sincStatus(t);
  t.resp = (ref && ref.resp) || (t.assuntos.find(a => a.resp) || {}).resp || '';
}
function normalizaMeta(m){
  return { id: m.id || uid(), txt: typeof m.txt === 'string' ? m.txt : '', feito: !!m.feito,
           resp: m.resp || '', prazo: m.prazo || '', chave: m.chave || chaveDe(m.txt || '') };
}

function migra(o){
  if (!o || typeof o !== 'object') return null;
  let base = null;
  if (o.semanas && typeof o.semanas === 'object'){
    base = o;
  } else if (Array.isArray(o.tarefas)){
    /* formato v1: um único bloco servia para todas as semanas */
    const iso = o.inicio || hojeSegunda();
    base = { inicio: iso, semanas: {} };
    base.semanas[iso] = { diasFeitos: o.diasFeitos, tarefas: o.tarefas, metas: o.metas, notas: o.notas };
    if (o.docId) base.docId = o.docId;
    if (o.savedAt) base.savedAt = o.savedAt;
  } else return null;

  const novo = {
    versao: 3,
    inicio: base.inicio || Object.keys(base.semanas).sort()[0] || hojeSegunda(),
    semanas: {},
    ui: (() => { const u = base.ui || { painel:true }; if (u.fechadas && 'FCA' in u.fechadas){ u.fechadas.Contratos = u.fechadas.FCA; delete u.fechadas.FCA; } return u; })(),
    docId: base.docId, savedAt: base.savedAt
  };
  for (const k of Object.keys(base.semanas)){
    const s = base.semanas[k] || {};
    novo.semanas[k] = {
      diasFeitos: Array.isArray(s.diasFeitos) && s.diasFeitos.length === 5 ? s.diasFeitos.map(Boolean) : [false,false,false,false,false],
      tarefas: (Array.isArray(s.tarefas) ? s.tarefas : []).map(normalizaTarefa),
      metas: (Array.isArray(s.metas) ? s.metas : []).map(normalizaMeta),
      notas: typeof s.notas === 'string' ? s.notas : '',
      herdadaDe: s.herdadaDe
    };
  }
  return novo;
}

const EMBUTIDO = migra(JSON.parse(document.getElementById('estado').textContent.trim())) || { versao:3, inicio: hojeSegunda(), semanas:{}, ui:{painel:true} };
let E = EMBUTIDO;
let restaurado = false, mostrarAviso = false;
/* cada arquivo tem sua própria gaveta de gravação, para que duas cópias não se sobreponham */
const DOCID = EMBUTIDO.docId || 'base';
const CHAVE = BASE_CHAVE + ':' + DOCID;

function leChave(k){
  try {
    const bruto = localStorage.getItem(k);
    if (!bruto) return null;
    return migra(JSON.parse(bruto));
  } catch (e){ return null; }
}
(function decideOrigem(){ return; /* nuvem: a fonte da verdade é o arquivo no SharePoint */
  /* pega o mais recente entre: estado embutido, gaveta v3 e gaveta da versão anterior */
  const cands = [];
  const v3 = leChave(CHAVE);                        if (v3) cands.push(v3);
  const v1 = leChave(CHAVE_ANTIGA + ':' + DOCID);   if (v1) cands.push(v1);
  if (!cands.length) return;
  const ta = Date.parse(EMBUTIDO.savedAt || 0) || 0;
  let melhor = null, tm = ta;
  for (const c of cands){ const t = Date.parse(c.savedAt || 0) || 0; if (t > tm){ melhor = c; tm = t; } }
  if (melhor){
    E = melhor; restaurado = true;
    mostrarAviso = !!EMBUTIDO.savedAt;
  }
})();
if (!E.docId) E.docId = DOCID;
if (!E.ui) E.ui = { painel:true };

/* ====== semana em foco ====== */
let S = null, provisoria = null;

function baseDe(iso){
  const ks = Object.keys(E.semanas).sort();
  let ant = null;
  for (const k of ks) if (k < iso) ant = k;
  if (ant) return ant;
  for (const k of ks) if (k > iso) return k;
  return null;
}
/* Herda apenas a LISTA de itens da semana mais próxima já gravada.
   Status STQQS entra todo em branco, metas desmarcadas, anotações vazias.
   Responsável e prazo seguem junto — são atributos da tarefa, não do status. */
function montaSemana(iso, op){
  op = op || {};
  const base = op.base !== undefined ? op.base : baseDe(iso);
  const s = semanaVazia();
  const b = base && E.semanas[base];
  if (b){
    let tarefas = b.tarefas;
    if (op.descartarConcluidas) tarefas = tarefas.filter(t => !(t.modo === 'demanda' && t.dias.some(v => v === 2)));
    s.tarefas = tarefas.map(t => ({ id: uid(), col: t.col, txt: t.txt, chave: t.chave, dias: t.modo === 'diaria' ? [1,1,1,1,1] : [0,0,0,0,0],
                                    modo: t.modo, urg: !!t.urg, resp: t.resp || '', prazo: t.prazo || '', obs: '', area: t.area || areaDe(t.txt), cor: t.cor || '', fio: t.fio || ('k:' + t.chave), hist: [], assuntos: (t.assuntos || []).map(a => ({ id: a.id, nome: a.nome || '', resp: a.resp || '', prazo: a.prazo || '', st: stValido(a.st) })), ativo: t.ativo || '' }));
    s.metas   = b.metas.filter(m => !m.feito || !op.descartarConcluidas)
                       .map(m => ({ id: uid(), txt: m.txt, chave: m.chave, feito: false, resp: m.resp || '', prazo: m.prazo || '' }));
    s.herdadaDe = base;
  }
  return s;
}
function foca(){
  if (E.semanas[E.inicio]){ S = E.semanas[E.inicio]; provisoria = null; }
  else if (provisoria === E.inicio && S){ /* mantém a provisória em edição */ }
  else { S = montaSemana(E.inicio); provisoria = E.inicio; }
  if (!Array.isArray(S.diasFeitos)) S.diasFeitos = [false,false,false,false,false];
  if (!Array.isArray(S.tarefas)) S.tarefas = [];
  if (!Array.isArray(S.metas)) S.metas = [];
  if (typeof S.notas !== 'string') S.notas = '';
  S.tarefas.forEach(t => { if (!(Number.isInteger(t.col) && t.col >= 0 && t.col <= 4)) t.col = 0; });
  return S;
}
function fixa(){
  if (provisoria && provisoria === E.inicio){ E.semanas[E.inicio] = S; provisoria = null; }
}

/* ====== leitura de desempenho ====== */
function statT(t){
  const feitos = t.dias.filter(v => v === 2).length;
  const falhas = t.dias.filter(v => v === 3).length;
  const prev   = t.dias.filter(v => v > 0).length;
  const abertos= t.dias.filter(v => v === 1).length;
  const fech   = feitos + falhas;
  return { feitos, falhas, prev, abertos, fech, ader: fech ? feitos / fech * 100 : null };
}
function venceu(prazo){ return !!prazo && prazo < hojeIso(); }
function prazoClasse(prazo, concluido){
  if (!prazo) return '';
  if (concluido) return 'ok';
  if (prazo < hojeIso()) return 'atras';
  if (prazo === hojeIso()) return 'hoje';
  return 'ok';
}
/* tarefa sob demanda com algum dia concluído = tarefa concluída: sai do quadro, fica só para consulta */
/* Contratos são tarefas constantes: não têm dias S T Q Q S nem saem do quadro */
const semDias = t => t.area === 'Contratos';
const concluida = t => !semDias(t) && t.modo === 'demanda' && t.dias.some(v => v === 2);
const RECEM = new Set(), RECEM_T = {};   // acabaram de ser concluídas: ficam 3 s na tela, para dar tempo de desfazer
function tarefaAtrasada(t){ const s = statT(t); return venceu(t.prazo) && !(s.feitos > 0 && s.falhas === 0 && s.abertos === 0); }

/* ---- histórico entre semanas, pela chave da tarefa ---- */
const HIST_JANELA = 2;      /* semanas comparadas de cada lado */
const HIST_LIMIAR = 10;     /* p.p. de aderência para chamar de melhora ou piora */
const HIST_MAX = 12;        /* semanas mostradas no mapa */

function semanasOrdenadas(){ return Object.keys(E.semanas).sort(); }
function serieTarefa(chave){
  return semanasOrdenadas().map(k => {
    const sm = E.semanas[k];
    const t = sm.tarefas.find(x => (x.fio || ('k:' + (x.chave || chaveDe(x.txt)))) === chave);
    if (!t) return { iso:k, presente:false, apurada:false };
    const s = statT(t);
    return { iso:k, presente:true, apurada: s.fech > 0, feitos:s.feitos, falhas:s.falhas, prev:s.prev, ader:s.ader };
  });
}
function mediana(xs){
  if (!xs.length) return null;
  const s = xs.slice().sort((a,b) => a-b), n = s.length;
  return n % 2 ? s[(n-1)/2] : (s[n/2-1] + s[n/2]) / 2;
}
function avaliaChave(chave){
  const serie = serieTarefa(chave);
  const apuradas = serie.filter(p => p.apurada);
  const comFalha = apuradas.filter(p => p.falhas > 0).length;
  const n = apuradas.length;
  const taxa = n ? comFalha / n : null;
  let selo = 'limpo', seloTxt = 'sem falha';
  if (comFalha === 0){ selo = 'limpo'; seloTxt = n ? 'sem falha' : 'sem histórico'; }
  else if (n >= 3 && taxa >= 0.6){ selo = 'cronico'; seloTxt = 'crônico'; }
  else if (comFalha >= 2){ selo = 'recorrente'; seloTxt = 'recorrente'; }
  else { selo = 'pontual'; seloTxt = 'pontual'; }

  const ad = apuradas.filter(p => p.ader != null).map(p => p.ader);
  let tend = 'curto', tendTxt = 'histórico curto', delta = null;
  if (ad.length >= 2 * HIST_JANELA){
    const rec = mediana(ad.slice(-HIST_JANELA)), ant = mediana(ad.slice(-2*HIST_JANELA, -HIST_JANELA));
    delta = rec - ant;
    if (delta >= HIST_LIMIAR){ tend = 'melhor'; tendTxt = 'melhorando'; }
    else if (delta <= -HIST_LIMIAR){ tend = 'pior'; tendTxt = 'piorando'; }
    else { tend = 'estavel'; tendTxt = 'estável'; }
  } else {
    tendTxt = ad.length ? (ad.length + ' semana(s) apurada(s) — precisa de ' + (2*HIST_JANELA)) : 'sem semana apurada';
  }
  const mediaAder = ad.length ? ad.reduce((a,b)=>a+b,0) / ad.length : null;
  return { chave, serie, n, comFalha, taxa, selo, seloTxt, tend, tendTxt, delta, mediaAder,
           totalFalhas: apuradas.reduce((a,p)=>a+p.falhas,0) };
}
function heatHtml(serie){
  const ult = serie.slice(-HIST_MAX);
  return '<div class="hm">' + ult.map(p => {
    let cls = 'n';
    if (p.apurada) cls = p.ader >= 80 ? 'b' : (p.ader >= 40 ? 'm' : 'r');
    if (p.iso === E.inicio) cls += ' atual';
    const t = fmtCurto(p.iso) + ': ' + (p.presente
      ? (p.apurada ? (p.feitos + ' concluído(s), ' + p.falhas + ' não realizado(s) · aderência ' + Math.round(p.ader) + '%')
                   : 'na lista, sem dia fechado')
      : 'não estava na lista');
    return '<i class="' + cls + '" title="' + esc(t) + '"></i>';
  }).join('') + '</div>';
}

/* ====== gravação automática ====== */
let handle = null;            // FileSystemFileHandle, quando vinculado
let sujo = false, gravando = false, timer = null;
const suportaFS = typeof window.showSaveFilePicker === 'function';
const PASTA_ALVO = 'C:\\Users\\x\\OneDrive - Seven\\Gestão Renato Lima\\Gestão Programação Semanal - Ordens Serviço CGI';
const MOVEL = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let pendente = false;         // há alterações que ainda não foram salvas num arquivo (só quando não há vínculo)

function marcaStatus(classe, texto, clicavel, dica){
  const bv = $('btnVincular');
  if (bv && suportaFS){
    bv.textContent = handle ? '✓ Salvamento automático ligado' : '💾 Ativar salvamento automático';
    bv.classList.toggle('pri', !handle);
    bv.title = handle ? 'Gravando em ' + handle.name + '. Clique para trocar o arquivo.' : 'Escolha uma vez o arquivo na pasta Gestão Programação Semanal - Ordens Serviço CGI.';
  }
  const el = $('statusSave');
  el.className = 'status ' + classe + (clicavel ? ' click' : '');
  $('statusTxt').textContent = texto;
  el.title = dica || '';
  el.onclick = clicavel || null;
}
function statusOcioso(){
  const q = E.savedAt ? ' · ' + hora(E.savedAt) : '';
  if (handle) marcaStatus('arq', 'Gravando em ' + handle.name + q, null, 'Cada alteração é escrita direto neste arquivo.');
  else if (suportaFS) marcaStatus('local', 'Só no navegador' + q, vincular, 'Clique para gravar direto em um arquivo no disco.');
  else if (pendente) marcaStatus('local', 'Não salvo em arquivo — toque para salvar', salvarMovel, 'Há alterações só no navegador. Toque para salvar o .html em Arquivos.');
  else marcaStatus('arq', 'Salvo' + q, salvarMovel, 'Toque para salvar uma nova cópia do .html em Arquivos.');
}

function montaHtml(estado){
  const json = JSON.stringify(estado || E, null, 1).replace(/<\/script>/gi, '<\\/script>');
  const marca = '<script id="estado" type="application/json">';
  const i = TEMPLATE.indexOf(marca);
  const j = TEMPLATE.indexOf('<\/script>', i);
  if (i < 0 || j < 0) return null;
  return TEMPLATE.slice(0, i + marca.length) + '\n' + json + '\n' + TEMPLATE.slice(j);
}

async function gravaAgora(){
  if (gravando) { sujo = true; return; }
  gravando = true; sujo = false;
  E.savedAt = agora();
  let okLocal = false;
  try { localStorage.setItem(CHAVE, JSON.stringify(E)); okLocal = true; } catch (e){ okLocal = false; }

  if (handle){
    marcaStatus('grav', 'Gravando…');
    try {
      const html = montaHtml();
      const w = await handle.createWritable();
      await w.write(html);
      await w.close();
    } catch (e){
      handle = null;
      marcaStatus('erro', 'Falha ao gravar no arquivo — clique para revincular', vincular, String(e && e.message || e));
      gravando = false;
      if (sujo) agenda();
      return;
    }
  } else if (!okLocal){
    marcaStatus('erro', 'Não foi possível gravar automaticamente', null, 'Use Baixar cópia para não perder o trabalho.');
    gravando = false; return;
  }
  gravando = false;
  statusOcioso();
  if (sujo) agenda();
}
function agenda(){ clearTimeout(timer); timer = setTimeout(gravaAgora, 600); }
function mudou(){ sincroniza(); fixa(); if (!handle) pendente = true; agenda(); }

/* ====== salvar em Arquivos (iPad / iPhone / navegadores sem File System Access) ====== */
async function salvarMovel(){
  fechaMenu();
  E.savedAt = agora();
  try { localStorage.setItem(CHAVE, JSON.stringify(E)); } catch (e){}
  const html = montaHtml();
  if (!html){ alert('Falha ao montar o arquivo.'); return; }
  const nome = nomeArquivo('html');
  try {
    const arq = new File([html], nome, { type: 'text/html' });
    if (navigator.canShare && navigator.canShare({ files: [arq] })){
      await navigator.share({ files: [arq], title: nome });
      pendente = false; statusOcioso();
      toast('Planner enviado para o menu de compartilhar. Escolha "Salvar em Arquivos".');
      return;
    }
  } catch (e){
    if (e && e.name === 'AbortError') return;   // usuário fechou o menu
  }
  baixa(nome, html, 'text/html;charset=utf-8');
  pendente = false; statusOcioso();
  toast('Arquivo baixado. Procure em Arquivos › Downloads.');
}

/* ====== vincular arquivo em disco ====== */
async function permissao(h, pedir){
  const op = { mode: 'readwrite' };
  if ((await h.queryPermission(op)) === 'granted') return true;
  if (!pedir) return false;
  return (await h.requestPermission(op)) === 'granted';
}
async function vincular(){
  if (!suportaFS){
    alert('Este navegador não permite gravar direto em um arquivo.\n\nUse o Google Chrome ou o Microsoft Edge, ou continue usando o botão "Baixar cópia".');
    return;
  }
  try {
    const nome = 'Planner_Semanal.html';
    if (!sessionStorage.getItem('plannerAviso')){
      alert('Na próxima janela, abra a pasta:\n\n' + PASTA_ALVO + '\n\ne salve o arquivo "' + nome + '" nela. Se já existir, escolha substituir.\n\nDepois disso, toda alteração é gravada sozinha nesse arquivo.');
      try { sessionStorage.setItem('plannerAviso', '1'); } catch (e){}
    }
    handle = await window.showSaveFilePicker({
      id: 'plannerCGI',
      startIn: 'documents',
      suggestedName: nome,
      types: [{ description: 'Página HTML', accept: { 'text/html': ['.html'] } }]
    });
    if (E.docId === 'base') E.docId = 'a' + Date.now().toString(36);
    await guardaHandle(handle);
    await gravaAgora();
    toast('Gravação automática ativada em ' + handle.name + '. A partir de agora tudo é salvo direto nesse arquivo.');
  } catch (e){
    if (e && e.name === 'AbortError') return;
    handle = null; statusOcioso();
    alert('Não foi possível vincular o arquivo: ' + (e && e.message || e));
  }
}
function bd(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('plannerArquivo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function guardaHandle(h){
  try { const db = await bd(); const t = db.transaction('h','readwrite'); t.objectStore('h').put(h, 'arquivo:' + DOCID); } catch (e){}
}
async function leHandle(){
  try {
    const db = await bd();
    return await new Promise(res => {
      const q = db.transaction('h','readonly').objectStore('h').get('arquivo:' + DOCID);
      q.onsuccess = () => res(q.result || null); q.onerror = () => res(null);
    });
  } catch (e){ return null; }
}
async function tentaReconectar(){
  const h = await leHandle();
  if (!h) { statusOcioso(); return; }
  if (await permissao(h, false)){
    handle = h; statusOcioso();
    toast('Reconectado ao arquivo ' + h.name + ' — gravação automática ativa.');
  } else {
    marcaStatus('local', 'Reconectar ' + h.name, async () => {
      if (await permissao(h, true)){ handle = h; await gravaAgora(); toast('Reconectado. Gravação automática ativa.'); }
      else { alert('Permissão negada. A gravação continua apenas no navegador.'); statusOcioso(); }
    }, 'Clique para reautorizar a gravação neste arquivo.');
  }
}
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3600);
}

/* ====== filtros ====== */
let FBUSCA = '', FDIA = '', FAREA = '', FCOR = '', FSTATUS = '', FRESP = '', FCONCL = false, ABERTAS = {}, ALVO = null;
function passaConcl(t){
  const c = concluida(t);
  if (FCONCL) return c;
  return true;   /* concluídas continuam no quadro: riscadas e em verde */
}
/* responsáveis: lê o responsável da tarefa e de cada assunto; "Katia e Bruno" ou "Ruan / Raphael" contam para cada pessoa */
function nomesResp(t){
  const brutos = [t.resp].concat((t.assuntos || []).map(a => a.resp));
  const r = {};
  brutos.forEach(b => {
    String(b || '').split(/\s*(?:\/|,|;|\+|&|\se\s)\s*/i).forEach(n => {
      n = n.trim(); if (!n) return;
      const k = normaliza(n); if (!r[k]) r[k] = n;
    });
  });
  return r;   /* { chaveNormalizada: nomeParaExibir } */
}
function passa(t){
  if (!passaConcl(t)) return false;
  if (FRESP && !(FRESP in nomesResp(t))) return false;
  if (FAREA && t.area !== FAREA) return false;
  if (FCOR && (FCOR === '-' ? !!t.cor : t.cor !== FCOR)) return false;
  if (FDIA !== '' && !(t.dias[+FDIA] > 0)) return false;
  if (FBUSCA){
    const q = normaliza(FBUSCA);
    if (normaliza(t.txt).indexOf(q) < 0 && normaliza(t.resp).indexOf(q) < 0 && normaliza(t.obs).indexOf(q) < 0 && normaliza((t.hist || []).map(h => h.tx).join(' ')).indexOf(q) < 0) return false;
  }
  if (FSTATUS){
    const s = statT(t);
    if (FSTATUS === 'prev'   && s.prev === 0) return false;
    if (FSTATUS === 'feito'  && s.feitos === 0) return false;
    if (FSTATUS === 'falha'  && s.falhas === 0) return false;
    if (FSTATUS === 'aberta' && s.fech > 0) return false;
    if (FSTATUS === 'urg'    && t.cor !== 'vermelho') return false;
    if (FSTATUS === 'cor'    && !t.cor) return false;
    if (FSTATUS === 'atras'  && !tarefaAtrasada(t)) return false;
    if (FSTATUS === 'semdono'&& (t.resp || '').trim()) return false;
    if (FSTATUS.indexOf('st:') === 0){ const k = FSTATUS.slice(3); if (k === '-' ? !!t.st : t.st !== k) return false; }
  }
  return true;
}
const filtrando = () => !!(FBUSCA || FDIA !== '' || FAREA || FCOR || FSTATUS || FRESP || FCONCL);

/* ====== auxiliares de exibição ====== */
function hojeIdx(){ const h = hojeIso(); for (let i = 0; i < 5; i++) if (isoDe(dataDia(i)) === h) return i; return -1; }
const pct = (a, b) => b ? Math.round(a / b * 100) : null;
const NOMES_ST = ['não previsto','previsto','concluído','não realizado'];
function barra(f, n, p){
  const tot = f + n + p;
  if (!tot) return '<div class="barra"></div>';
  return '<div class="barra"><i class="g" style="width:' + (f/tot*100) + '%"></i><i class="o" style="width:' + (n/tot*100) + '%"></i><i class="b" style="width:' + (p/tot*100) + '%"></i></div>';
}
function rotulo(k){ const c = corDe(k); if (!c) return 'Sem cor'; return (E.ui.rotulos && E.ui.rotulos[k]) || c.n; }
function iniciais(nome){
  const p = String(nome || '').split(/[\s,\/]+/).filter(w => w && !/^(e|de|da|do|dos|das)$/i.test(w));
  return p.slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}
function localIso(iso){ const d = new Date(iso); return isoDe(d) + 'T' + hora(d); }
function dataHora(iso){ const d = new Date(iso); return fmtCurto(isoDe(d)) + ' ' + hora(d); }
function hojeCurto(){ return fmtCurto(hojeIso()); }
function evento(t, tx){ if (!Array.isArray(t.hist)) t.hist = []; t.hist.push({ d: agora(), tx, tipo: 'auto', u: USUARIO() }); }
function eventoAs(t, tx, as){ if (!Array.isArray(t.hist)) t.hist = []; t.hist.push({ d: agora(), tx, tipo: 'auto', as, u: USUARIO() }); }

/* ====== histórico completo da tarefa, em todas as semanas ====== */
function timeline(fio){
  const ev = [];
  for (const k of semanasOrdenadas()){
    const t = E.semanas[k].tarefas.find(x => x.fio === fio);
    if (!t) continue;
    const ano = +k.slice(0, 4);
    String(t.obs || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(l => {
      const m = l.match(/^(\d{2})\/(\d{2})(?:\s+(\d{2}:\d{2}))?\s*:{1,2}\s*([\s\S]*)$/);
      if (m){
        const y = (m[2] === '01' && k.slice(5, 7) === '12') ? ano + 1 : ano;
        ev.push({ d: y + '-' + m[2] + '-' + m[1] + 'T' + (m[3] || '12:00'), tipo: 'nota', tx: m[4], q: m[1] + '/' + m[2] + (m[3] ? ' ' + m[3] : ''), wk: k });
      } else ev.push({ d: k + 'T08:00', tipo: 'nota', tx: l, q: 'semana de ' + fmtCurto(k), wk: k });
    });
    (t.hist || []).forEach((h, i) => ev.push({ d: localIso(h.d), tipo: h.tipo === 'nota' ? 'nota' : 'auto', tx: h.tx, q: dataHora(h.d), wk: k, ref: k === E.inicio && h.tipo === 'nota' ? i : null, eref: h.tipo === 'nota' ? k + '|' + i : null, ed: h.editado || null, as: h.as || null, img: Array.isArray(h.img) ? h.img : null, u: h.u || null }));
    const s = statT(t);
    if (s.fech > 0){
      const sex = dataDeIso(k); sex.setDate(sex.getDate() + 4);
      ev.push({ d: isoDe(sex) + 'T23:59', tipo: 'sem', wk: k, q: (k === E.inicio ? 'parcial da semana' : 'fechamento da semana'),
                tx: '✓ ' + s.feitos + ' concluído(s) · ✕ ' + s.falhas + ' não realizado(s) · aderência ' + Math.round(s.ader) + '%' });
    }
  }
  ev.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
  return ev;
}
const notasDe = fio => timeline(fio).filter(e => e.tipo === 'nota').length;

/* ====== render ====== */
function render(){
  foca();
  if (!E.ui.fechadas) E.ui.fechadas = {};
  $('dtIni').value = E.inicio;
  $('lblSemana').textContent = fmtCurto(isoDe(dataDia(0))) + ' – ' + fmtLongo(dataDia(4));
  $('chkCrit').checked = !!E.ui.critTopo;
  pintaSemanas();
  renderFaixa();
  renderFiltros();
  renderQuadro();
  renderModal();
  liga();
}

function renderFaixa(){
  let f = 0, n = 0, p = 0;
  const df = [0,0,0,0,0], dn = [0,0,0,0,0];
  S.tarefas.forEach(t => {
    const s = statT(t); f += s.feitos; n += s.falhas; p += s.abertos;
    t.dias.forEach((v, i) => { if (v === 2) df[i]++; if (v === 3) dn[i]++; });
  });
  const ader = pct(f, f + n), hi = hojeIdx();
  const ativas = S.tarefas.filter(t => !concluida(t));
  const crit = ativas.filter(t => t.cor === 'vermelho').length;
  const atras = ativas.filter(tarefaAtrasada).length;
  const semdono = ativas.filter(t => t.txt.trim() && !(t.resp || '').trim()).length;
  const semdesc = S.tarefas.filter(t => !t.txt.trim()).length;
  const al = (k, txt, v) => '<button class="alerta" data-alerta="' + k + '">' + txt + ' <b class="num' + (v ? ' on' : '') + '">' + v + '</b></button>';
  $('faixa').innerHTML =
    '<div class="kc"><span class="lb">Aderência</span><span class="v">' + (ader == null ? '—' : ader + '%') + '</span>' + barra(f, n, p) + '</div>' +
    '<div class="kc ok"><span class="lb">Concluídos</span><span class="v">' + f + '</span></div>' +
    '<div class="kc fa"><span class="lb">Não realizados</span><span class="v">' + n + '</span></div>' +
    '<div class="kc"><span class="lb">Previstos</span><span class="v">' + p + '</span></div>' +
    '<div class="kc k-dia"><span class="lb">Aderência por dia</span><span class="pdia">' + LETRAS.map((l, i) => { const a = pct(df[i], df[i] + dn[i]);
        return '<span class="' + (i === hi ? 'hoje' : '') + '" title="' + DIAS[i] + ' ' + fmt(dataDia(i)) + ': ' + df[i] + ' ✓ · ' + dn[i] + ' ✕">' + l + '<b class="num">' + (a == null ? '—' : a + '%') + '</b></span>'; }).join('') + '</span></div>' +
    '<div class="kc k-al"><span class="lb">Atenção</span><div class="alertas">' +
    al('urg', rotulo('vermelho'), crit) + al('atras', 'Prazo vencido', atras) + al('semdono', 'Sem responsável', semdono) +
    (semdesc ? al('semdesc', 'Sem descrição', semdesc) : '') + '</div></div>';
}

function renderFiltros(){
  const ca = {}, cc = {}, base = S.tarefas.filter(passaConcl), nConcl = S.tarefas.filter(concluida).length;
  base.forEach(t => { ca[t.area] = (ca[t.area] || 0) + 1; const k = t.cor || '-'; cc[k] = (cc[k] || 0) + 1; });
  $('fAreas').innerHTML = '<button class="fchip' + (FAREA ? '' : ' on') + '" data-farea="">Todas <em>' + base.length + '</em></button>' +
    AREAS.filter(a => ca[a]).map(a => '<button class="fchip' + (FAREA === a ? ' on' : '') + '" data-farea="' + a + '">' + a + ' <em>' + ca[a] + '</em></button>').join('') +
    '<button class="fchip' + (FCONCL ? ' on' : '') + '" data-fconcl="1" title="Mostra só as tarefas sob demanda já concluídas">✓ Concluídas <em>' + nConcl + '</em></button>';
  const cr = {}, nm = {};
  base.forEach(t => { const r = nomesResp(t); for (const k in r){ nm[k] = nm[k] || r[k]; cr[k] = (cr[k] || 0) + 1; } });
  if (FRESP && !(FRESP in nm)) FRESP = '';
  $('fResp').innerHTML = '<option value="">Todos os responsáveis</option>' +
    Object.keys(nm).sort((a, b) => nm[a].localeCompare(nm[b], 'pt-BR')).map(k => '<option value="' + esc(k) + '"' + (k === FRESP ? ' selected' : '') + '>' + esc(nm[k]) + ' (' + cr[k] + ')</option>').join('');
  const usadas = CORES.filter(c => cc[c.k]);
  $('fCores').innerHTML = usadas.length
    ? usadas.map(c => '<button class="fchip' + (FCOR === c.k ? ' on' : '') + '" data-fcor="' + c.k + '"><i class="bol" style="background:' + c.c + '"></i>' + esc(rotulo(c.k)) + ' <em>' + cc[c.k] + '</em></button>').join('') +
      '<button class="fchip' + (FCOR === '-' ? ' on' : '') + '" data-fcor="-">Sem cor <em>' + (cc['-'] || 0) + '</em></button>'
    : '<span style="font-size:11px;color:var(--muted2)">Nenhuma cor definida ainda — clique numa tarefa para escolher</span>';
}

function ordenada(lista){
  if (!E.ui.critTopo) return lista;
  const r = t => { const i = CORES.findIndex(c => c.k === t.cor); return i < 0 ? 99 : i; };
  return lista.map((t, i) => [t, i]).sort((a, b) => (r(a[0]) - r(b[0])) || (a[1] - b[1])).map(x => x[0]);
}

function renderQuadro(){
  const hi = hojeIdx();
  let html = '', ocultas = 0;
  AREAS.forEach(area => {
    const todas = S.tarefas.filter(t => t.area === area);
    if (!todas.length) return;
    const lista = ordenada(todas.filter(passa));
    const nBase = todas.filter(passaConcl).length;
    ocultas += nBase - lista.length;
    if (!lista.length && filtrando()) return;
    let f = 0, n = 0;
    todas.forEach(t => { const s = statT(t); f += s.feitos; n += s.falhas; });
    const a = pct(f, f + n);
    const fechada = !!E.ui.fechadas[area] && !filtrando();
    html += '<section class="area' + (fechada ? ' fechada' : '') + '">' +
      '<div class="ahead" data-area="' + area + '"><span class="seta">▼</span><span class="n">' + area + '</span>' +
        '<span class="q"><b>' + nBase + '</b>' + (area === 'Contratos' ? '' : ' · aderência <b>' + (a == null ? '—' : a + '%') + '</b>' + (n ? ' · <b style="color:var(--falha)">' + n + ' ✕</b>' : '')) + '</span>' +
        '<span class="sp"></span><button class="mais" data-add="' + area + '" title="Nova tarefa em ' + area + '">＋</button></div>' +
      '<div class="lst">' + lista.map(t => linha(t, hi)).join('') + '</div></section>';
  });
  if (!S.tarefas.length) html = '<div class="nada">Semana sem tarefas. <button class="btn sm" data-add="Outros">＋ Primeira tarefa</button></div>';
  else if (!html) html = '<div class="nada">Nenhuma tarefa passa no filtro atual.</div>';
  $('board').innerHTML = html;
  const nBaseTot = S.tarefas.filter(passaConcl).length, nConclTot = S.tarefas.filter(concluida).length;
  $('filtroCnt').innerHTML = filtrando()
    ? '<b>' + (nBaseTot - ocultas) + '</b> de ' + nBaseTot + ' na tela'
    : nBaseTot + ' tarefas' + (nConclTot ? ' · ' + nConclTot + ' concluída(s)' : '');
}

function stAss(t){
  if (!t.st) return '';
  const n = (t.assuntos || []).filter(a => a.st).length;
  return '<span class="stA ' + t.st + '" title="Status: ' + stNome(t.st) + (n > 1 ? ' (de ' + n + ' assuntos com status)' : '') + '">' + stNome(t.st) + '</span>';
}
function linha(t, hi){
  const c = corDe(t.cor);
  const st = c ? ' style="--cc:' + c.c + ';--cbg:' + c.bg + '"' : '';
  const bx = LETRAS.map((l, i) => '<button class="b s' + t.dias[i] + (i === hi ? ' hj' : '') + '" data-dia="' + t.id + ':' + i + '" title="' + DIAS[i] + ' ' + fmt(dataDia(i)) + ' — ' + NOMES_ST[t.dias[i]] + '">' + l + '</button>').join('');
  const s = statT(t);
  const pz = t.prazo ? '<span class="pz ' + prazoClasse(t.prazo, s.feitos > 0 && s.falhas === 0) + '" title="Prazo ' + fmtLongo(dataDeIso(t.prazo)) + '">' + fmtCurto(t.prazo) + '</span>' : '';
  const nn = notasDe(t.fio);
  const tip = (t.txt || 'Sem descrição') + (c ? '\nCor: ' + rotulo(t.cor) : '') + (t.resp ? '\nResponsável: ' + t.resp : '') + (t.st ? '\nStatus: ' + stNome(t.st) : '') + '\nClique para detalhe e histórico';
  const and = semDias(t) || !s.feitos ? '' : (!s.abertos && !s.falhas ? ' p-tudo' : ' p-parc');
  return '<div class="tk' + (MODAL_ID === t.id ? ' alvo' : '') + and + '" data-tcard="' + t.id + '"' + st + ' title="' + esc(tip) + '">' +
    (semDias(t) ? '' : '<div class="bx">' + bx + '</div>') +
    '<div class="nm' + (t.txt.trim() ? '' : ' vz') + '">' + (t.txt.trim() ? esc(t.txt) : 'Sem descrição') + '</div>' +
    '<div class="ic">' +
      (t.modo === 'diaria' ? '<span class="dia" title="Diária">D</span>' : '') +
      pz +
      (stAss(t)) +
      (nn ? '<span title="' + nn + ' registro(s) no histórico">💬' + nn + '</span>' : '') +
      (t.resp ? '<span class="rs" title="' + esc(t.resp) + '">' + esc(iniciais(t.resp)) + '</span>' : '') +
    '</div>' +
    '<div class="acts"><button data-up="' + t.id + '" title="Subir">↑</button><button data-dn="' + t.id + '" title="Descer">↓</button><button class="del" data-del="' + t.id + '" title="Excluir">✕</button></div>' +
  '</div>';
}

/* ====== gaveta de detalhe ====== */
let NOVA_ABERTA = false;   /* campo de novo comentário só aparece quando pedido */
let MODAL_ID = null, MODAL_FOCAR = false, HF = 'nota', ANTES = {};
let VER_TODOS = false, EDIT_AS = '';   // VER_TODOS: mostra os comentários de todos os assuntos, separados por assunto
let EDIT_REF = null, EDIT_TXT = '';   // comentário em edição ('semana|índice') e o rascunho do texto
let NOVA_IMG = [];   // imagens coladas no comentário em redação (data URLs)
const MAX_IMG = 5;
/* reduz a imagem (lado maior 1400px, JPEG) para não estourar o armazenamento */
function comprimeImagem(file){
  return new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onerror = () => falha();
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => falha();
      im.onload = () => {
        const M = 1400, f = Math.min(1, M / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = Math.round(im.width * f); c.height = Math.round(im.height * f);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.85));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function imgsHtml(arr, removivel){
  if (!arr || !arr.length) return '';
  return '<div class="imgs">' + arr.map((s, i) => '<span class="im"><img src="' + s + '" data-zoom alt="imagem do comentário">' + (removivel ? '<button data-rmimg="' + i + '" title="Remover imagem">×</button>' : '') + '</span>').join('') + '</div>';
}
document.addEventListener('click', e => {
  const z = e.target.closest && e.target.closest('img[data-zoom]');
  if (z){ const lb = document.createElement('div'); lb.id = 'lightbox'; lb.innerHTML = '<img src="' + z.src + '">'; lb.onclick = () => lb.remove(); document.body.appendChild(lb); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ const lb = document.getElementById('lightbox'); if (lb){ lb.remove(); e.stopImmediatePropagation(); } } }, true);
function abrirModal(id, focar){ NOVA_ABERTA = false; NOVA_IMG = []; EDIT_REF = null; VER_TODOS = false; MODAL_ID = id; MODAL_FOCAR = !!focar; render(); }
function fecharModal(){ NOVA_ABERTA = false; NOVA_IMG = []; EDIT_REF = null; VER_TODOS = false; MODAL_ID = null; render(); }

/* a qual assunto pertence um evento (sem marca ou de assunto que não existe mais → primeiro assunto) */
function asDeEv(t, e){ const ids = t.assuntos.map(a => a.id); return (e.as && ids.indexOf(e.as) >= 0) ? e.as : t.assuntos[0].id; }
function notasPorAssunto(t){
  garanteAssuntos(t);
  const m = {}; t.assuntos.forEach(a => m[a.id] = 0);
  timeline(t.fio).forEach(e => { if (e.tipo === 'nota') m[asDeEv(t, e)]++; });
  return m;
}
function listaEv(t, ev){
  let wk = null, h = '<div class="tl">';
  const iUlt = ev.findIndex(e => e.tipo === 'nota');   /* a lista vem do mais novo para o mais antigo */
  ev.forEach((e, iE) => {
    if (e.wk !== wk){ wk = e.wk; const d = dataDeIso(wk), fim = new Date(d); fim.setDate(fim.getDate() + 4); h += '<div class="wk">Semana ' + fmtCurto(wk) + ' – ' + fmtCurto(isoDe(fim)) + (wk === E.inicio ? ' · atual' : '') + '</div>'; }
    const editando = e.eref && EDIT_REF === e.eref;
    const opcoes = t.assuntos.map(a => '<option value="' + a.id + '"' + (a.id === EDIT_AS ? ' selected' : '') + '>' + esc(a.nome || 'Novo assunto') + '</option>').join('');
    h += '<div class="ev ' + e.tipo + (iE === iUlt ? ' ult' : '') + '"><div class="qd">' + (iE === iUlt ? '<b class="ultlb">★ Último comentário</b> ' : '') + esc(e.q) + (e.u ? ' <em>' + esc(e.u) + '</em>' : '') + (e.tipo === 'auto' ? '<em>alteração</em>' : e.tipo === 'sem' ? '<em>resumo</em>' : '') +
      (e.ed ? '<em title="Texto alterado depois de registrado">editado ' + esc(dataHora(e.ed)) + '</em>' : '') +
      (e.eref && !editando ? ' <button class="btn sm" style="padding:0 6px;margin-left:4px" data-editnota="' + e.eref + '" title="Editar este comentário ou mudá-lo de assunto">✎ editar</button>' : '') +
      (e.ref != null && !editando ? ' <button class="btn sm" style="padding:0 5px;margin-left:2px" data-delnota="' + e.ref + '" title="Apagar este registro">✕</button>' : '') +
      '</div>' +
      (editando
        ? '<div class="edbox"><textarea data-medit data-k="medit">' + esc(EDIT_TXT) + '</textarea>' +
          '<div class="r"><label class="edas">Assunto <select data-medit-as>' + opcoes + '</select></label><small>Ctrl+Enter salva · Esc cancela · a data original é mantida</small><button class="btn sm" data-canceledit>Cancelar</button><button class="btn sm pri" data-salvaedit>Salvar</button></div></div>'
        : (e.tx ? '<div class="tx">' + esc(e.tx) + '</div>' : '') + imgsHtml(e.img, false)) +
      '</div>';
  });
  return h + '</div>';
}
function timelineHtml(t){
  garanteAssuntos(t);
  const todos = timeline(t.fio);
  const porHf = ev => HF === 'nota' ? ev.filter(e => e.tipo === 'nota') : HF === 'auto' ? ev.filter(e => e.tipo !== 'nota') : ev;
  if (VER_TODOS){
    let g = '';
    t.assuntos.forEach(a => {
      const ev = porHf(todos.filter(e => e.tipo === 'nota' ? asDeEv(t, e) === a.id : (e.as && asDeEv(t, e) === a.id)));
      g += '<div class="grpAss"><div class="gh"><b>' + esc(a.nome || 'Novo assunto') + '</b>' + (a.st ? '<span class="stA ' + a.st + '">' + stNome(a.st) + '</span>' : '') + '<span>Responsável: ' + esc(a.resp || '—') + ' · Prazo: ' + (a.prazo ? fmtCurto(a.prazo) : '—') + '</span><button class="btn sm" data-ass="' + a.id + '">Abrir assunto</button></div>' +
        (ev.length ? listaEv(t, ev) : '<div class="tl"><div class="vz">Nenhum comentário neste assunto.</div></div>') + '</div>';
    });
    const gerais = HF === 'nota' ? [] : todos.filter(e => e.tipo !== 'nota' && !e.as);
    if (gerais.length) g += '<div class="grpAss"><div class="gh"><b>Alterações gerais do contrato</b></div>' + listaEv(t, gerais) + '</div>';
    return g;
  }
  const nOcultos = todos.filter(e => e.tipo === 'nota' && asDeEv(t, e) !== t.ativo).length;
  const oculto = nOcultos ? '<div class="ocultosNota">🔒 ' + nOcultos + ' comentário(s) de outros assuntos ocultos — escolha o assunto acima ou "Todos" para ver.</div>' : '';
  const ev = porHf(todos.filter(e => e.tipo === 'nota' ? asDeEv(t, e) === t.ativo : (!e.as || asDeEv(t, e) === t.ativo)));
  if (!ev.length) return '<div class="tl"><div class="vz">' + (HF === 'nota' ? 'Nenhum comentário neste assunto ainda. Use ＋ Novo comentário acima.' : 'Nada registrado ainda.') + '</div></div>' + oculto;
  return listaEv(t, ev) + oculto;
}

function renderModal(){
  const ov = $('modalOv');
  if (!MODAL_ID){ ov.classList.remove('on'); ov.innerHTML = ''; return; }
  const t = acha(MODAL_ID);
  if (!t){ MODAL_ID = null; ov.classList.remove('on'); ov.innerHTML = ''; return; }
  const ativo = document.activeElement, kAtivo = ativo && ov.contains(ativo) ? ativo.getAttribute('data-k') : null;
  const vNota = ov.querySelector('[data-mnota]') ? ov.querySelector('[data-mnota]').value : '';
  const rolagem = ov.querySelector('.modalbody') ? ov.querySelector('.modalbody').scrollTop : 0;
  ov.classList.add('on');
  const a = avaliaChave(t.fio);
  const c = corDe(t.cor);
  garanteAssuntos(t);
  const at = t.assuntos.find(x => x.id === t.ativo), cont = notasPorAssunto(t);
  const totalNotas = Object.keys(cont).reduce((s, k) => s + cont[k], 0);
  const chips = '<button class="chipA' + (VER_TODOS ? ' on' : '') + '" data-vertodos title="Mostra todos os comentários, separados por assunto">Todos <em>' + totalNotas + '</em></button>' + t.assuntos.map(x => '<button class="chipA' + (x.st === 'conc' ? ' conc' : '') + (x.id === t.ativo && !VER_TODOS ? ' on' : '') + '" data-ass="' + x.id + '"' + (x.st === 'conc' ? ' title="Assunto concluído"' : '') + '>' + (x.st === 'conc' ? '✓ ' : '') + esc(x.nome || 'Novo assunto') + ' <em>' + (cont[x.id] || 0) + '</em></button>').join('') +
    '<button class="btn sm" data-novoass>＋ Novo assunto</button>' +
    (t.assuntos.length > 1 && !VER_TODOS && !cont[at.id] ? '<button class="btn sm perigo" data-delass title="Só é possível excluir assunto sem comentários">Excluir este assunto</button>' : '');
  const dias = LETRAS.map((l, i) =>
    '<button class="dbtn s' + t.dias[i] + '" data-mdia="' + i + '"><span class="l">' + l + ' ' + fmtCurto(isoDe(dataDia(i))) + '</span>' + ['—','previsto','✓','✕'][t.dias[i]] + '</button>').join('');
  const sw = '<button class="sw nenhuma' + (t.cor ? '' : ' on') + '" data-mcor=""><i></i>Sem cor</button>' +
    CORES.map(x => '<button class="sw' + (t.cor === x.k ? ' on' : '') + '" data-mcor="' + x.k + '" style="' + (t.cor === x.k ? 'background:' + x.bg : '') + '"><i style="background:' + x.c + '"></i>' + esc(rotulo(x.k)) + '</button>').join('');
  ov.innerHTML =
    '<div class="modalbox' + (VER_TODOS ? ' verTodos' : '') + '" style="border-left-color:' + (c ? c.c : 'transparent') + '">' +
      '<header><div class="h"><small>' + esc(t.area) + ' · semana ' + fmtCurto(E.inicio) + (c ? ' · <span style="color:' + c.c + '">' + esc(rotulo(t.cor)) + '</span>' : '') + (concluida(t) ? '<span class="badgeConcl">✓ concluída</span>' : '') + '</small>' +
        '<textarea data-mtxt data-k="txt" rows="1" placeholder="Descreva a tarefa…">' + esc(t.txt) + '</textarea></div>' +
        '<button class="close" data-modalclose title="Fechar (Esc)">×</button></header>' +
      '<div class="modalbody">' +
        (semDias(t) ? '' : '<div class="campo"><div class="lb">Status nos dias</div><div class="diasgrid">' + dias + '</div></div>') +
        '<div class="campo secAss"><div class="lb">Assuntos deste contrato <span style="text-transform:none;letter-spacing:0;font-weight:500">· os comentários dos outros assuntos ficam ocultos</span></div><div class="chipsAss">' + chips + '</div></div>' +
        '<div class="linha3">' +
          '<div class="campo"><label>Responsável</label><input type="text" data-mresp data-k="resp" value="' + esc(at.resp) + '" placeholder="Quem responde por este assunto"></div>' +
          '<div class="campo"><label>Assunto</label><input type="text" data-massunto data-k="assunto" value="' + esc(at.nome) + '" placeholder="Sobre o que se trata (ex.: contratação NVT)"></div>' +
          '<div class="campo"><label>Status</label><select data-mstatus>' + STATUS_AS.map(x => '<option value="' + x.k + '"' + (x.k === at.st ? ' selected' : '') + '>' + x.n + '</option>').join('') + '</select></div>' +
          '<div class="campo"><label>Prazo</label><input type="date" data-mprazo value="' + esc(at.prazo) + '"></div>' +
        '</div>' +
        '<div class="campo secCom"><div class="lb">Comentários e histórico · ' + (VER_TODOS ? 'todos os assuntos, separados' : esc(at.nome || 'novo assunto')) +
          '<span class="hf"><button data-pdfhist class="pdfb" title="Salvar o histórico deste contrato em PDF (na janela de impressão, escolha Salvar como PDF)">⬇ Salvar PDF</button><button data-hf="tudo" class="' + (HF === 'tudo' ? 'on' : '') + '">Tudo</button><button data-hf="nota" class="' + (HF === 'nota' ? 'on' : '') + '">Comentários</button><button data-hf="auto" class="' + (HF === 'auto' ? 'on' : '') + '">Alterações</button></span></div>' +
          '<div class="histbox">' + heatHtml(a.serie) + '<span class="selo ' + a.selo + '">' + a.seloTxt + '</span><span class="tend ' + a.tend + '">' + a.tendTxt + '</span></div>' +
          (NOVA_ABERTA
            ? '<div class="nova"><textarea data-mnota data-k="nota" placeholder="Escreva um comentário. Ex.: reunião com o gestor, chamado aberto, retorno pendente… (Ctrl+V cola imagem)"></textarea>' + imgsHtml(NOVA_IMG, true) +
              '<div class="r"><small>Entra na série abaixo com data e hora de agora · Ctrl+V cola imagem · Ctrl+Enter · Esc cancela</small><button class="btn sm" data-notacancel>Cancelar</button><button class="btn sm pri" data-mnotabtn>Comentar</button></div></div>'
            : '<div class="novaBtn"><button class="btn pri" data-novacom>＋ Novo comentário</button></div>') +
          '<div class="hintTodos ocultosNota">Para escrever um novo comentário, escolha um assunto acima.</div>' + timelineHtml(t) +
          (t.obs && t.obs.trim() ? '<details class="raw"><summary>Editar registros antigos desta semana (texto livre)</summary><textarea data-mobs data-k="obs">' + esc(t.obs) + '</textarea></details>' : '') +
        '</div>' +
      '</div>' +
      '<footer><button class="btn perigo" data-mdel>Excluir</button><span class="sp"></span>' + (concluida(t) ? '<button class="btn" data-mreabrir>↺ Reabrir tarefa</button>' : '') + '<button class="btn pri" data-modalclose>Fechar</button></footer>' +
    '</div>';
  const nt = ov.querySelector('[data-mnota]'); if (nt && vNota) nt.value = vNota;
  ov.querySelector('.modalbody').scrollTop = rolagem;
  const alvo = kAtivo ? ov.querySelector('[data-k="' + kAtivo + '"]') : null;
  if (alvo){ alvo.focus(); if (alvo.setSelectionRange) alvo.setSelectionRange(alvo.value.length, alvo.value.length); }
  if (MODAL_FOCAR){ MODAL_FOCAR = false; setTimeout(() => { const el = ov.querySelector('[data-mtxt]'); if (el) el.focus(); }, 0); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MODAL_ID){ if (EDIT_REF){ EDIT_REF = null; renderModal(); ligaModal(); } else fecharModal(); } });
document.addEventListener('click', e => { const m = $('menuMais'); if (m.open && !m.contains(e.target)) m.open = false; });

/* ====== interações ====== */
const acha = id => S.tarefas.find(t => t.id === id);
function alternaModo(t, modo){
  if (modo === t.modo) return;
  evento(t, 'Modo: ' + (t.modo === 'diaria' ? 'Diária' : 'Sob demanda') + ' → ' + (modo === 'diaria' ? 'Diária' : 'Sob demanda'));
  if (modo === 'demanda'){ t.modo = 'demanda'; t.dias = t.dias.map(v => v === 1 ? 0 : v); }
  else { t.modo = 'diaria'; t.dias = t.dias.map(v => v === 0 ? 1 : v); }
}
function mexeu(){ fixa(); render(); mudou(); }
function leve(){ fixa(); renderFaixa(); renderFiltros(); renderQuadro(); ligaQuadro(); mudou(); }

/* status dos dias: o registro no histórico espera 2,5 s para gravar só o estado final */
const PEND = {};
function marcaDia(t, i){
  const k = t.id + ':' + i;
  if (!PEND[k]) PEND[k] = { orig: t.dias[i], semana: E.inicio };
  const eraConcl = concluida(t);
  t.dias[i] = (t.dias[i] + 1) % 4;
  clearTimeout(PEND[k].h);
  PEND[k].h = setTimeout(() => {
    const p = PEND[k]; delete PEND[k];
    const sm = E.semanas[p.semana]; if (!sm) return;
    const tt = sm.tarefas.find(x => x.id === t.id); if (!tt || tt.dias[i] === p.orig) return;
    evento(tt, DIAS[i] + ' ' + fmtCurto(isoDe((() => { const d = dataDeIso(p.semana); d.setDate(d.getDate() + i); return d; })())) + ': ' + NOMES_ST[p.orig] + ' → ' + NOMES_ST[tt.dias[i]]);
    agenda();
    if (MODAL_ID === tt.id && p.semana === E.inicio) renderModal(), ligaModal();
  }, 2500);
}

function liga(){ ligaQuadro(); ligaModal(); }
function ligaQuadro(){
  document.querySelectorAll('[data-tcard]').forEach(el => el.onclick = () => abrirModal(el.getAttribute('data-tcard')));
  document.querySelectorAll('[data-dia]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const [id, i] = b.getAttribute('data-dia').split(':');
    marcaDia(acha(id), +i);
    if (MODAL_ID) mexeu(); else leve();
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const t = acha(b.getAttribute('data-del'));
    if (confirm('Excluir a tarefa "' + (t.txt || 'sem descrição') + '"?\n\nO histórico das semanas anteriores continua guardado nelas.')){ S.tarefas = S.tarefas.filter(x => x.id !== t.id); if (MODAL_ID === t.id) MODAL_ID = null; mexeu(); }
  });
  document.querySelectorAll('[data-up]').forEach(b => b.onclick = e => { e.stopPropagation(); mover(b.getAttribute('data-up'), -1); });
  document.querySelectorAll('[data-dn]').forEach(b => b.onclick = e => { e.stopPropagation(); mover(b.getAttribute('data-dn'), 1); });
  document.querySelectorAll('[data-area]').forEach(h => h.onclick = () => {
    if (filtrando()) return;
    const a = h.getAttribute('data-area'); E.ui.fechadas[a] = !E.ui.fechadas[a]; render(); agenda();
  });
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const area = b.getAttribute('data-add'), hi = hojeIdx(), id = uid();
    const novo = { id, fio: 'f:' + id, col: hi >= 0 ? hi : 0, area, txt: '', chave: '', dias: [0,0,0,0,0], modo: 'demanda', urg: false, cor: '', resp:'', prazo:'', obs:'', hist: [] };
    evento(novo, 'Tarefa criada em ' + area);
    S.tarefas.push(novo); fixa(); mudou();
    E.ui.fechadas[area] = false;
    abrirModal(novo.id, true);
  });
  document.querySelectorAll('[data-farea]').forEach(b => b.onclick = () => { FAREA = b.getAttribute('data-farea'); render(); });
  document.querySelectorAll('[data-fconcl]').forEach(b => b.onclick = () => { FCONCL = !FCONCL; render(); });
  document.querySelectorAll('[data-fcor]').forEach(b => b.onclick = () => { const k = b.getAttribute('data-fcor'); FCOR = FCOR === k ? '' : k; render(); });
  document.querySelectorAll('[data-alerta]').forEach(b => b.onclick = () => {
    const k = b.getAttribute('data-alerta');
    if (k === 'semdesc'){ const t = S.tarefas.find(x => !x.txt.trim()); if (t) abrirModal(t.id, true); return; }
    if (k === 'urg'){ FCOR = FCOR === 'vermelho' ? '' : 'vermelho'; render(); return; }
    FSTATUS = FSTATUS === k ? '' : k; $('fStatus').value = FSTATUS; render();
  });
}
/* ====== histórico em PDF: monta uma página só com o histórico e abre a impressão (Salvar como PDF) ====== */
function imprimeHistorico(){
  const t = acha(MODAL_ID); if (!t) return;
  const bk = VER_TODOS; VER_TODOS = true;
  let corpo = '';
  try { corpo = timelineHtml(t); } finally { VER_TODOS = bk; }
  const filtro = HF === 'nota' ? 'somente comentários' : HF === 'auto' ? 'somente alterações' : 'comentários e alterações';
  let box = document.getElementById('printHist');
  if (!box){ box = document.createElement('div'); box.id = 'printHist'; document.body.appendChild(box); }
  box.innerHTML = '<h1>' + esc(t.txt || 'Sem descrição') + '</h1>' +
    '<div class="meta">Histórico · ' + esc(t.area) + (t.resp ? ' · Responsável: ' + esc(t.resp) : '') + ' · ' + filtro + ' · gerado em ' + new Date().toLocaleString('pt-BR') + '</div>' + corpo;
  const tituloOrig = document.title;
  const nome = (t.txt || 'tarefa').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);
  document.title = 'Historico - ' + nome + ' - ' + isoDe(new Date());
  document.body.classList.add('imprHist');
  const fim = () => { document.body.classList.remove('imprHist'); document.title = tituloOrig; window.removeEventListener('afterprint', fim); };
  window.addEventListener('afterprint', fim);
  setTimeout(() => window.print(), 80);
}
function ligaModal(){
  const ov = $('modalOv');
  ov.querySelectorAll('[data-modalclose]').forEach(b => b.onclick = fecharModal);
  ov.onclick = e => { if (e.target === ov) fecharModal(); };
  if (!MODAL_ID) return;
  const q = s => ov.querySelector(s), T = () => acha(MODAL_ID);
  const mtxt = q('[data-mtxt]');
  const ajusta = () => { mtxt.style.height = 'auto'; mtxt.style.height = mtxt.scrollHeight + 'px'; };
  ajusta();
  mtxt.onfocus = () => { ANTES.txt = T().txt; };
  mtxt.oninput = () => { const t = T(); t.txt = mtxt.value.replace(/\n/g, ' '); t.chave = chaveDe(t.txt); ajusta(); fixa(); agenda(); renderQuadro(); ligaQuadro(); };
  mtxt.onchange = () => { const t = T(); if (ANTES.txt != null && ANTES.txt.trim() && ANTES.txt !== t.txt) evento(t, 'Descrição alterada (antes: "' + ANTES.txt + '")'); ANTES.txt = t.txt; leve(); };
  mtxt.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); mtxt.blur(); } };
  ov.querySelectorAll('[data-mcor]').forEach(b => b.onclick = () => {
    const t = T(), k = b.getAttribute('data-mcor'); if (k === t.cor) return;
    evento(t, 'Cor: ' + rotulo(t.cor) + ' → ' + rotulo(k));
    t.cor = k; t.urg = k === 'vermelho'; mexeu();
  });
  ov.querySelectorAll('[data-mmodo]').forEach(b => b.onclick = () => { alternaModo(T(), b.getAttribute('data-mmodo')); mexeu(); });
  ov.querySelectorAll('[data-mdia]').forEach(b => b.onclick = () => { marcaDia(T(), +b.getAttribute('data-mdia')); mexeu(); });
  if (q('[data-marea]')) q('[data-marea]').onchange = e => { const t = T(); evento(t, 'Área: ' + t.area + ' → ' + e.target.value); t.area = e.target.value; mexeu(); };
  const AT = () => { const t = T(); garanteAssuntos(t); return t.assuntos.find(x => x.id === t.ativo); };
  const nomeAs = a => a.nome || 'sem nome';
  ov.querySelectorAll('[data-ass]').forEach(b => b.onclick = () => { const t = T(); t.ativo = b.getAttribute('data-ass'); EDIT_REF = null; VER_TODOS = false; mexeu(); });
  const bvt = q('[data-vertodos]'); if (bvt) bvt.onclick = () => { VER_TODOS = true; EDIT_REF = null; renderModal(); ligaModal(); };
  q('[data-novoass]').onclick = () => {
    const t = T(); garanteAssuntos(t);
    const a = { id: uid(), nome: '', resp: '', prazo: '', st: '' };
    t.assuntos.push(a); t.ativo = a.id; EDIT_REF = null; VER_TODOS = false; mexeu();
    const el = $('modalOv').querySelector('[data-massunto]'); if (el) el.focus();
  };
  const bda = q('[data-delass]');
  if (bda) bda.onclick = () => {
    const t = T(), a = AT();
    if (!confirm('Excluir o assunto "' + nomeAs(a) + '"? Ele não tem comentários.')) return;
    t.assuntos = t.assuntos.filter(x => x.id !== a.id); t.ativo = t.assuntos[0].id; sincAssuntos(t); mexeu();
  };
  const massunto = q('[data-massunto]');
  massunto.onfocus = () => { ANTES.assunto = AT().nome; };
  massunto.oninput = () => { AT().nome = massunto.value; fixa(); agenda(); };
  massunto.onchange = () => {
    const t = T(), a = AT();
    if ((ANTES.assunto || '') !== a.nome) eventoAs(t, 'Assunto renomeado: "' + (ANTES.assunto || '—') + '" → "' + (a.nome || '—') + '"', a.id);
    ANTES.assunto = a.nome; mexeu();
  };
  const mresp = q('[data-mresp]');
  mresp.onfocus = () => { ANTES.resp = AT().resp; };
  mresp.oninput = () => { const t = T(); AT().resp = mresp.value; sincAssuntos(t); fixa(); agenda(); };
  mresp.onchange = () => {
    const t = T(), a = AT();
    if ((ANTES.resp || '') !== a.resp) eventoAs(t, 'Responsável (' + nomeAs(a) + '): ' + (ANTES.resp || '—') + ' → ' + (a.resp || '—'), a.id);
    ANTES.resp = a.resp; sincAssuntos(t); leve(); renderModal(); ligaModal();
  };
  q('[data-mstatus]').onchange = e => {
    const t = T(), a = AT(), novo = stValido(e.target.value);
    if (novo !== a.st) eventoAs(t, 'Status (' + nomeAs(a) + '): ' + (a.st ? stNome(a.st) : '—') + ' → ' + (novo ? stNome(novo) : '—'), a.id);
    a.st = novo; sincAssuntos(t); mexeu();
  };
  q('[data-mprazo]').onchange = e => {
    const t = T(), a = AT();
    eventoAs(t, 'Prazo (' + nomeAs(a) + '): ' + (a.prazo ? fmtCurto(a.prazo) : '—') + ' → ' + (e.target.value ? fmtCurto(e.target.value) : '—'), a.id);
    a.prazo = e.target.value; sincAssuntos(t); mexeu();
  };
  const mnota = q('[data-mnota]');
  const abreNova = q('[data-novacom]');
  if (abreNova) abreNova.onclick = () => { NOVA_ABERTA = true; renderModal(); ligaModal(); const n = $('modalOv').querySelector('[data-mnota]'); if (n) n.focus(); };
  if (mnota){
    const registra = () => {
      const v = mnota.value.trim(); if (!v && !NOVA_IMG.length) return;
      const t = T(); if (!Array.isArray(t.hist)) t.hist = [];
      const reg = { d: agora(), tx: v, tipo: 'nota', as: t.ativo, u: USUARIO() };
      if (NOVA_IMG.length) reg.img = NOVA_IMG.slice();
      t.hist.push(reg);
      mnota.value = ''; NOVA_ABERTA = false; NOVA_IMG = []; mexeu();
    };
    const cancela = () => { NOVA_ABERTA = false; NOVA_IMG = []; renderModal(); ligaModal(); };
    mnota.onpaste = e => {
      const itens = Array.from((e.clipboardData && e.clipboardData.items) || []).filter(i => i.kind === 'file' && /^image\//.test(i.type));
      if (!itens.length) return;   /* sem imagem: cola texto normalmente */
      e.preventDefault();
      const rascunho = mnota.value;
      Promise.all(itens.map(i => comprimeImagem(i.getAsFile()).catch(() => null))).then(rs => {
        rs.filter(Boolean).forEach(s => { if (NOVA_IMG.length < MAX_IMG) NOVA_IMG.push(s); else toast('Máximo de ' + MAX_IMG + ' imagens por comentário.'); });
        renderModal(); ligaModal();
        const n = $('modalOv').querySelector('[data-mnota]'); if (n){ n.value = rascunho; n.focus(); }
      });
    };
    ov.querySelectorAll('[data-rmimg]').forEach(b => b.onclick = () => {
      const rascunho = mnota.value; NOVA_IMG.splice(+b.getAttribute('data-rmimg'), 1); renderModal(); ligaModal();
      const n = $('modalOv').querySelector('[data-mnota]'); if (n){ n.value = rascunho; n.focus(); }
    });
    mnota.onkeydown = e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); registra(); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cancela(); }
    };
    q('[data-mnotabtn]').onclick = registra;
    q('[data-notacancel]').onclick = cancela;
  }
  const bpdf = ov.querySelector('[data-pdfhist]'); if (bpdf) bpdf.onclick = imprimeHistorico;
  ov.querySelectorAll('[data-hf]').forEach(b => b.onclick = () => { HF = b.getAttribute('data-hf'); renderModal(); ligaModal(); });
  const histDe = ref => { const [wk, i] = ref.split('|'); const sm = E.semanas[wk]; const tt = sm && sm.tarefas.find(x => x.fio === T().fio); return tt && tt.hist ? tt.hist[+i] : null; };
  ov.querySelectorAll('[data-editnota]').forEach(b => b.onclick = () => {
    const r = b.getAttribute('data-editnota'), hh = histDe(r); if (!hh) return;
    const idsA = T().assuntos.map(x => x.id);
    EDIT_REF = r; EDIT_TXT = hh.tx; EDIT_AS = (hh.as && idsA.indexOf(hh.as) >= 0) ? hh.as : idsA[0]; renderModal(); ligaModal();
    const el = ov.querySelector('[data-medit]'); if (el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });
  const medit = q('[data-medit]');
  if (medit){
    medit.oninput = () => { EDIT_TXT = medit.value; };
    const sel = q('[data-medit-as]'); if (sel) sel.onchange = () => { EDIT_AS = sel.value; };
    const salva = () => {
      const v = medit.value.trim(), hh = histDe(EDIT_REF);
      if (!v && !(hh && hh.img && hh.img.length)){ alert('O comentário não pode ficar vazio. Para remover, use o ✕.'); return; }
      let movido = null;
      if (hh){
        if (hh.tx !== v){ hh.tx = v; hh.editado = agora(); }
        if (hh.as !== EDIT_AS){ const antes = hh.as; hh.as = EDIT_AS; if (antes !== undefined || EDIT_AS !== T().assuntos[0].id) movido = T().assuntos.find(x => x.id === EDIT_AS); }
      }
      EDIT_REF = null; EDIT_TXT = ''; mexeu();
      if (movido && movido.id !== T().ativo && !VER_TODOS) toast('Comentário movido para o assunto "' + (movido.nome || 'Novo assunto') + '".');
    };
    medit.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); salva(); } };
    q('[data-salvaedit]').onclick = salva;
    q('[data-canceledit]').onclick = () => { EDIT_REF = null; EDIT_TXT = ''; renderModal(); ligaModal(); };
  }
  ov.querySelectorAll('[data-delnota]').forEach(b => b.onclick = () => {
    if (!confirm('Apagar este registro?')) return;
    const t = T(); t.hist.splice(+b.getAttribute('data-delnota'), 1); mexeu();
  });
  const mobs = q('[data-mobs]');
  if (mobs){ mobs.oninput = () => { T().obs = mobs.value; fixa(); agenda(); }; mobs.onchange = () => { leve(); renderModal(); ligaModal(); }; }
  const rb = q('[data-mreabrir]');
  if (rb) rb.onclick = () => { const t = T(); t.dias = t.dias.map(v => v === 2 ? 0 : v); evento(t, 'Tarefa reaberta'); RECEM.delete(t.id); mexeu(); toast('Tarefa reaberta — voltou ao quadro.'); };
  q('[data-mdel]').onclick = () => {
    const t = T();
    if (confirm('Excluir a tarefa "' + (t.txt || 'sem descrição') + '"?')){ S.tarefas = S.tarefas.filter(x => x.id !== t.id); MODAL_ID = null; mexeu(); }
  };
}

function mover(id, dir){
  const t = acha(id);
  const irmaos = S.tarefas.filter(x => x.area === t.area);
  const pos = irmaos.indexOf(t);
  if (pos + dir < 0 || pos + dir >= irmaos.length) return;
  const alvo = irmaos[pos + dir];
  const a = S.tarefas.indexOf(t), b = S.tarefas.indexOf(alvo);
  S.tarefas[a] = alvo; S.tarefas[b] = t;
  mexeu();
}
function sincroniza(){ /* a edição acontece nos campos da gaveta, que atualizam o estado a cada tecla */ }

/* ====== semana ====== */
function irPara(iso, silencioso){
  const nova = !E.semanas[iso];
  E.inicio = iso; provisoria = null; ABERTAS = {}; MODAL_ID = null;
  render(); agenda();
  if (silencioso) return;
  if (nova){
    if (S.herdadaDe) toast('Semana de ' + fmtLongo(dataDia(0)) + ' — nova. ' + S.tarefas.length + ' item(ns) herdado(s) da semana de ' + fmtLongo(dataDeIso(S.herdadaDe)) + ', com status em branco.');
    else toast('Semana de ' + fmtLongo(dataDia(0)) + ' — nova e em branco.');
  } else toast('Semana de ' + fmtLongo(dataDia(0)) + ' a ' + fmtLongo(dataDia(4)) + ' — gravada.');
}
function deslocaSemana(dias){ const d = dataDia(0); d.setDate(d.getDate() + dias); irPara(isoDe(d)); }
$('btnPrev').onclick = () => deslocaSemana(-7);
$('btnNext').onclick = () => deslocaSemana(7);
$('dtIni').onchange = e => { if (e.target.value) irPara(segundaDe(e.target.value)); };
$('selSemana').onchange = e => { if (e.target.value) irPara(e.target.value); };

function pintaSemanas(){
  const sel = $('selSemana');
  const ks = Object.keys(E.semanas).sort();
  let html = '<option value="">Semanas gravadas (' + ks.length + ')</option>';
  for (const k of ks){
    const d = dataDeIso(k), sm = E.semanas[k];
    const fim = new Date(d); fim.setDate(fim.getDate() + 4);
    let f = 0, n = 0;
    sm.tarefas.forEach(t => { const s = statT(t); f += s.feitos; n += s.falhas; });
    const ader = (f + n) ? Math.round(f / (f + n) * 100) + '%' : '—';
    html += '<option value="' + k + '"' + (k === E.inicio ? ' selected' : '') + '>' + fmt(d) + ' a ' + fmt(fim) + ' — ' + sm.tarefas.length + ' itens, ' + ader + '</option>';
  }
  sel.innerHTML = html;
  const marca = $('marcaSemana');
  if (provisoria === E.inicio){
    marca.textContent = S && S.herdadaDe ? 'semana nova · itens herdados' : 'semana nova · em branco';
    marca.style.display = '';
  } else marca.style.display = 'none';
}

$('btnNova').onclick = () => {
  fixa();
  const d = dataDia(0); d.setDate(d.getDate() + 7);
  const alvo = isoDe(d);
  if (E.semanas[alvo]){
    if (!confirm('A semana de ' + fmtLongo(d) + ' já existe, com ' + E.semanas[alvo].tarefas.length + ' item(ns).\n\nOK abre essa semana sem alterar nada • Cancelar fica nesta')) return;
    irPara(alvo); return;
  }
  const base = E.inicio;
  const concluidas = S.tarefas.filter(concluida);
  let descartar = false;
  if (concluidas.length) descartar = confirm('Deixar de fora as ' + concluidas.length + ' tarefa(s) sob demanda já concluídas nesta semana?\n\nOK deixa de fora • Cancelar leva todas');
  if (!confirm('Criar a semana de ' + fmtLongo(d) + '?\n\n• Os itens são copiados com área, cor, responsável e prazo.\n• O status vai em branco (as diárias entram como previstas).\n• O histórico de cada tarefa continua visível no detalhe.')) return;
  E.semanas[alvo] = montaSemana(alvo, { base: base, descartarConcluidas: descartar });
  E.inicio = alvo; provisoria = null; ABERTAS = {}; MODAL_ID = null;
  render(); mudou();
  toast('Semana de ' + fmtLongo(dataDia(0)) + ' a ' + fmtLongo(dataDia(4)) + ' criada — status em branco.');
};

/* ====== filtros ====== */
$('fBusca').oninput = e => { FBUSCA = e.target.value; render(); };
$('fDia').onchange = e => { FDIA = e.target.value; render(); };
$('fStatus').onchange = e => { FSTATUS = e.target.value; render(); };
$('fResp').onchange = e => { FRESP = e.target.value; render(); };
$('chkCrit').onchange = e => { E.ui.critTopo = e.target.checked; render(); agenda(); };
$('btnLimpar').onclick = () => { FBUSCA = ''; FDIA = ''; FSTATUS = ''; FRESP = ''; FAREA = ''; FCOR = ''; FCONCL = false; $('fBusca').value = ''; $('fDia').value = ''; $('fStatus').value = ''; render(); };

/* ====== cópias manuais ====== */
function baixa(nome, conteudo, tipo){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const nomeArquivo = ext => 'Planner_Semanal_' + E.inicio.split('-').reverse().join('-') + '.' + ext;
const fechaMenu = () => { $('menuMais').open = false; };
$('btnCopia').onclick = () => {
  fechaMenu(); E.savedAt = agora();
  const copia = JSON.parse(JSON.stringify(E));
  copia.docId = 'c' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
  const h = montaHtml(copia);
  if (!h) return alert('Falha ao montar o arquivo.');
  baixa(nomeArquivo('html'), h, 'text/html;charset=utf-8');
  toast('Cópia baixada com identidade própria — ela não sobrescreve este arquivo.');
};
$('btnJson').onclick = () => { fechaMenu(); baixa(nomeArquivo('json'), JSON.stringify(E, null, 1), 'application/json'); toast('JSON exportado.'); };
$('btnCsv').onclick = () => {
  fechaMenu();
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g,'""').replace(/\n/g,' ') + '"';
  const L = [];
  L.push(['Área','Item','Cor','Modo','Responsável','Prazo','Seg','Ter','Qua','Qui','Sex','Concluídos','Não realizados','Aderência %','Selo histórico','Tendência','Registros da semana'].map(q).join(';'));
  S.tarefas.forEach(t => {
    const s = statT(t), a = avaliaChave(t.fio);
    const regs = [t.obs].concat((t.hist || []).filter(h => h.tipo === 'nota').map(h => dataHora(h.d) + ': ' + (h.tx || '') + (h.img && h.img.length ? ' [' + h.img.length + ' imagem(ns)]' : ''))).filter(Boolean).join(' | ');
    L.push([t.area, t.txt, t.cor ? rotulo(t.cor) : '', t.modo === 'diaria' ? 'Diária' : 'Sob demanda', t.resp, t.prazo,
            ...t.dias.map(v => ['','previsto','concluído','não realizado'][v]), s.feitos, s.falhas, s.ader == null ? '' : Math.round(s.ader), a.seloTxt, a.tendTxt, regs].map(q).join(';'));
  });
  baixa(nomeArquivo('csv'), L.join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV da semana exportado.');
};
$('btnImp').onclick = () => { fechaMenu(); $('fileJson').click(); };
$('fileJson').onchange = ev => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const novo = migra(JSON.parse(r.result));
      if (!novo) throw new Error('estrutura inválida');
      E = novo; provisoria = null; S = null; ABERTAS = {}; MODAL_ID = null;
      if (!E.docId) E.docId = DOCID;
      render(); mudou();
      toast('Importado: ' + Object.keys(E.semanas).length + ' semana(s).');
    } catch (e){ alert('Arquivo inválido: ' + e.message); }
  };
  r.readAsText(f, 'utf-8'); ev.target.value = '';
};
$('btnRotulos').onclick = () => {
  fechaMenu();
  if (!E.ui.rotulos) E.ui.rotulos = {};
  for (const c of CORES){
    const v = prompt('Nome da cor ' + c.k.toUpperCase() + ' (em branco = padrão "' + c.n + '"):', rotulo(c.k));
    if (v === null) break;
    if (v.trim() && v.trim() !== c.n) E.ui.rotulos[c.k] = v.trim(); else delete E.ui.rotulos[c.k];
  }
  render(); mudou();
};
if (suportaFS) $('btnVincular').onclick = vincular;
else { $('btnVincular').textContent = MOVEL ? 'Salvar no iPad' : 'Salvar arquivo'; $('btnVincular').onclick = salvarMovel; }

/* ====== toque longo na linha: mostra ↑ ↓ ✕ (sem mouse não existe hover) ====== */
(function(){
  let tm = null, bloqueio = 0, x0 = 0, y0 = 0;
  const limpa = () => { clearTimeout(tm); tm = null; };
  document.addEventListener('touchstart', ev => {
    const tk = ev.target.closest && ev.target.closest('.tk');
    document.querySelectorAll('.tk.mostra').forEach(el => { if (el !== tk) el.classList.remove('mostra'); });
    if (!tk || ev.target.closest('.b,.acts')) return;
    const t = ev.touches[0]; x0 = t.clientX; y0 = t.clientY;
    limpa();
    tm = setTimeout(() => { tk.classList.add('mostra'); bloqueio = Date.now() + 700; if (navigator.vibrate) navigator.vibrate(15); }, 450);
  }, { passive: true });
  document.addEventListener('touchmove', ev => {
    const t = ev.touches[0];
    if (Math.abs(t.clientX - x0) > 8 || Math.abs(t.clientY - y0) > 8) limpa();
  }, { passive: true });
  document.addEventListener('touchend', limpa, { passive: true });
  document.addEventListener('touchcancel', limpa, { passive: true });
  // o clique que sucede o toque longo não pode abrir o detalhe da tarefa
  document.addEventListener('click', ev => {
    if (Date.now() < bloqueio){ ev.stopPropagation(); ev.preventDefault(); bloqueio = 0; }
  }, true);
})();
$('btnPrintQ').onclick = () => { fechaMenu(); MODAL_ID = null; render(); setTimeout(() => window.print(), 120); };
$('btnAjuda').onclick = () => { fechaMenu(); const a = $('ajuda'); a.open = true; a.scrollIntoView({ behavior: 'smooth' }); };

const guardaRapido = () => { return; try { E.savedAt = agora(); localStorage.setItem(CHAVE, JSON.stringify(E)); } catch (e){} };
window.addEventListener('beforeunload', guardaRapido);
window.addEventListener('pagehide', guardaRapido);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardaRapido(); });
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e){}

/* ====== aviso de restauro ====== */
if (mostrarAviso){
  $('avisoTxt').innerHTML = '<b>Trabalho restaurado.</b> Foi carregada a versão gravada no navegador em <b>' +
    fmtLongo(new Date(E.savedAt)) + ' às ' + hora(E.savedAt) + '</b>, mais recente que a deste arquivo.';
  $('avisoRestauro').classList.add('on');
  $('btnFecharAviso').onclick = () => { $('avisoRestauro').classList.remove('on'); mudou(); };
  $('btnUsarArquivo').onclick = () => {
    if (!confirm('Descartar a versão restaurada e voltar ao conteúdo gravado dentro deste arquivo?')) return;
    E = EMBUTIDO; provisoria = null; S = null; ABERTAS = {};
    render(); $('avisoRestauro').classList.remove('on'); mudou(); toast('Versão do arquivo restaurada.');
  };
}

/* a inicialização (render, status) é feita por nuvem.js depois de carregar os dados */
