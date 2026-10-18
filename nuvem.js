/* Planner Semanal — camada de nuvem (login Microsoft + dados no SharePoint/OneDrive via Microsoft Graph).
   Carrega os dados, injeta o app (app.js) e troca a gravação em arquivo por gravação na nuvem. */
'use strict';
let MODO_EDICAO = false, CONTA = null;
function PODE(){ return MODO_EDICAO; }
function USUARIO(){ return CONTA ? (CONTA.name || CONTA.username) : null; }

(function(){
const CFG = window.PLANNER_CFG || {};
const SCOPES = ['User.Read', 'Files.ReadWrite.All'];
const GRAPH = 'https://graph.microsoft.com/v1.0';
const $n = id => document.getElementById(id);
const LS_EDIT = 'plannerNuvem:edicao';

function tela(html){ const t = $n('nuvemTela'); t.innerHTML = '<div class="nvBox">' + html + '</div>'; t.classList.add('on'); }
function telaOff(){ $n('nuvemTela').classList.remove('on'); }
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function erroTela(titulo, detalhe, acoes){
  tela('<h2>' + escH(titulo) + '</h2><p>' + escH(detalhe) + '</p><div class="nvAc">' + (acoes || '<button class="btn pri" onclick="location.reload()">Tentar de novo</button>') + '</div>');
}

/* ---------- login ---------- */
let msalApp = null;
async function iniciaLogin(){
  if (!CFG.CLIENT_ID || !CFG.TENANT_ID || !(CFG.LINK_DADOS || (CFG.DRIVE_ID && CFG.ITEM_ID))){
    erroTela('Configuração incompleta', 'Abra o arquivo config.js e preencha CLIENT_ID, TENANT_ID e LINK_DADOS (ou DRIVE_ID e ITEM_ID).', '');
    return false;
  }
  if (!window.msal){ erroTela('Biblioteca de login não carregou', 'Confirme que o arquivo msal-browser.min.js está publicado junto com a página.'); return false; }
  msalApp = new msal.PublicClientApplication({
    auth: { clientId: CFG.CLIENT_ID, authority: 'https://login.microsoftonline.com/' + CFG.TENANT_ID, redirectUri: CFG.REDIRECT_URI || (location.origin + location.pathname) },
    cache: { cacheLocation: 'localStorage' }
  });
  await msalApp.initialize();
  const r = await msalApp.handleRedirectPromise();
  CONTA = (r && r.account) || msalApp.getAllAccounts()[0] || null;
  if (!CONTA){
    tela('<h2>Planner Semanal</h2><p>Entre com sua conta Microsoft da Seven para abrir o planner.</p><div class="nvAc"><button class="btn pri" id="nvEntrar">Entrar com Microsoft</button></div>');
    $n('nvEntrar').onclick = () => msalApp.loginRedirect({ scopes: SCOPES });
    return false;
  }
  msalApp.setActiveAccount(CONTA);
  return true;
}
async function token(){
  try { return (await msalApp.acquireTokenSilent({ scopes: SCOPES, account: CONTA })).accessToken; }
  catch (e){ await msalApp.acquireTokenRedirect({ scopes: SCOPES, account: CONTA }); throw e; }
}
async function graph(caminho, op){
  op = op || {};
  const r = await fetch(GRAPH + caminho, Object.assign({}, op, { headers: Object.assign({ Authorization: 'Bearer ' + await token() }, op.headers || {}) }));
  if (!r.ok){ const err = new Error('Graph ' + r.status); err.status = r.status; try { err.corpo = await r.text(); } catch (e){} throw err; }
  return r;
}

/* ---------- arquivo de dados ---------- */
const NUVEM = window.NUVEM = { etag: null, drive: null, item: null, pronto: false, modificadoPor: null };
async function resolveItem(){
  if (CFG.DRIVE_ID && CFG.ITEM_ID){ NUVEM.drive = CFG.DRIVE_ID; NUVEM.item = CFG.ITEM_ID; return; }
  const enc = 'u!' + btoa(unescape(encodeURIComponent(CFG.LINK_DADOS))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  const j = await (await graph('/shares/' + enc + '/driveItem?$select=id,name,parentReference')).json();
  NUVEM.drive = j.parentReference.driveId; NUVEM.item = j.id;
}
NUVEM.meta = async function(){
  const j = await (await graph('/drives/' + NUVEM.drive + '/items/' + NUVEM.item)).json();
  return j;
};
NUVEM.carrega = async function(){
  const m = await NUVEM.meta();
  const url = m['@microsoft.graph.downloadUrl'];
  const r = url ? await fetch(url) : await graph('/drives/' + NUVEM.drive + '/items/' + NUVEM.item + '/content');
  if (!r.ok){ const err = new Error('Download ' + r.status); err.status = r.status; throw err; }
  const texto = (await r.text()).replace(/^﻿/, '');
  NUVEM.etag = m.eTag;
  NUVEM.modificadoPor = m.lastModifiedBy && m.lastModifiedBy.user ? m.lastModifiedBy.user.displayName : null;
  return { texto, meta: m };
};
NUVEM.salva = async function(texto){
  const r = await graph('/drives/' + NUVEM.drive + '/items/' + NUVEM.item + '/content', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': NUVEM.etag }, body: texto
  });
  return await r.json();
};

/* ---------- inicialização ---------- */
(async function(){
  try {
    tela('<h2>Planner Semanal</h2><p>Carregando…</p>');
    if (!(await iniciaLogin())) return;
    await resolveItem();
    const d = await NUVEM.carrega();
    $n('estado').textContent = d.texto.trim() ? d.texto : 'null';
    await carregaScript('app.js');
    instalaCamada();
    try { MODO_EDICAO = localStorage.getItem(LS_EDIT) === '1'; } catch (e){}
    aplicaModo(false);
    render(); statusOcioso();
    NUVEM.pronto = true;
    telaOff();
  } catch (e){
    if (e && e.status === 404 || e && e.status === 403 || e && e.status === 401){
      erroTela('Sem acesso ao arquivo de dados', 'Sua conta não enxerga o arquivo do planner (erro ' + e.status + '). Peça acesso ao responsável pela pasta no SharePoint.',
        '<button class="btn" id="nvSair">Trocar de conta</button><button class="btn pri" onclick="location.reload()">Tentar de novo</button>');
      const s = $n('nvSair'); if (s) s.onclick = () => msalApp.logoutRedirect({ account: CONTA });
    } else erroTela('Não foi possível abrir o planner', (e && e.message) || String(e));
    console.error(e);
  }
})();

function carregaScript(src){
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src + '?v=' + (window.PLANNER_VERSAO || '1'); s.onload = ok; s.onerror = () => no(new Error('Falha ao carregar ' + src)); document.body.appendChild(s); });
}

/* ---------- modo leitura / edição ---------- */
const EDIT_SEL = '[data-dia],[data-del],[data-up],[data-dn],[data-add],[data-mcor],[data-mmodo],[data-mdia],[data-marea],[data-novoass],[data-delass],[data-massunto],[data-mresp],[data-mstatus],[data-mprazo],[data-novacom],[data-mnota],[data-mnotabtn],[data-notacancel],[data-editnota],[data-medit],[data-medit-as],[data-salvaedit],[data-canceledit],[data-delnota],[data-mobs],[data-mreabrir],[data-mdel],[data-mtxt],[data-rmimg],#btnNova,#btnImp,#fileJson,#btnRotulos,#btnUsarArquivo,#btnFecharAviso';
let ultAviso = 0;
function bloqueia(ev){
  if (PODE()) return;
  const el = ev.target && ev.target.closest ? ev.target.closest(EDIT_SEL) : null;
  if (!el) return;
  if (ev.type === 'keydown' || ev.type === 'keyup'){ if (['Tab','Shift','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Control','Meta'].indexOf(ev.key) >= 0) return; }
  ev.stopPropagation(); ev.preventDefault();
  if ((ev.type === 'click' || ev.type === 'change') && Date.now() - ultAviso > 2500){ ultAviso = Date.now(); toast('Somente leitura. Clique em ✏ Editar (topo) para alterar.'); }
}
function travaCampos(){
  if (PODE()) return;
  const ov = $n('modalOv'); if (!ov) return;
  ov.querySelectorAll('textarea,input').forEach(x => { x.readOnly = true; });
  ov.querySelectorAll('select').forEach(x => { x.disabled = true; });
}
function aplicaModo(rerender){
  const ro = !PODE();
  document.body.classList.toggle('leitura', ro);
  const b = $n('btnAcesso');
  if (ro){ b.textContent = '✏ Editar'; b.className = 'btn pri'; b.title = 'Você está em modo leitura. Clique para editar (a permissão é verificada na nuvem).'; }
  else { b.textContent = '✓ Concluir edição · ' + (USUARIO() || ''); b.className = 'btn ok'; b.title = 'Salva e volta ao modo leitura.'; }
  travaCampos();
  if (rerender){ render(); statusOcioso(); }
}
async function recarrega(){
  const d = await NUVEM.carrega();
  const novo = migra(d.texto.trim() ? JSON.parse(d.texto) : null);
  if (novo){ E = novo; provisoria = null; S = null; ABERTAS = {}; MODAL_ID = null; }
  render(); statusOcioso();
}
async function entraEdicao(){
  try {
    toast('Verificando permissão de edição…');
    const r = await NUVEM.salva(JSON.stringify(E));   /* regrava o mesmo conteúdo: confirma permissão e que a versão está atual */
    NUVEM.etag = r.eTag;
  } catch (e){
    if (e.status === 412){ await recarrega(); toast('A nuvem tinha uma versão mais nova e ela foi carregada. Clique em Editar de novo.'); }
    else if (e.status === 403 || e.status === 401) toast('Você só tem permissão de leitura neste arquivo.');
    else toast('Não foi possível verificar a permissão: ' + e.message);
    return;
  }
  MODO_EDICAO = true; try { localStorage.setItem(LS_EDIT, '1'); } catch (e){}
  aplicaModo(true);
  toast('Edição liberada. Cada alteração é salva na nuvem.');
}
async function saiEdicao(){
  if (timer){ clearTimeout(timer); timer = null; await gravaAgora(); }
  while (gravando) await new Promise(r => setTimeout(r, 100));
  MODO_EDICAO = false; try { localStorage.removeItem(LS_EDIT); } catch (e){}
  aplicaModo(true);
}

/* ---------- troca da gravação em arquivo pela gravação na nuvem ---------- */
let falhasRede = 0;
function conflito(){
  return new Promise(res => {
    tela('<h2>Outra pessoa salvou antes</h2><p>A versão na nuvem é mais nova que a que você abriu. Se continuar, uma das duas versões será perdida.</p><div class="nvAc"><button class="btn" id="nvNuvem">Carregar a versão da nuvem (descarta minhas alterações não salvas)</button><button class="btn pri" id="nvMinha">Sobrescrever com a minha</button></div>');
    $n('nvNuvem').onclick = async () => { telaOff(); try { await recarrega(); toast('Versão da nuvem carregada.'); } catch (e){ toast('Falha ao carregar: ' + e.message); } res('nuvem'); };
    $n('nvMinha').onclick = async () => { try { const m = await NUVEM.meta(); NUVEM.etag = m.eTag; sujo = true; } catch (e){} telaOff(); res('minha'); };
  });
}
function instalaCamada(){
  const dispara = ms => { clearTimeout(timer); timer = setTimeout(() => { timer = null; window.gravaAgora(); }, ms); };
  window.gravaAgora = async function(){
    if (!PODE()) return;
    if (gravando){ sujo = true; return; }
    gravando = true; sujo = false;
    E.savedAt = agora();
    marcaStatus('grav', 'Salvando na nuvem…');
    let falhou = false;
    try {
      const r = await NUVEM.salva(JSON.stringify(E));
      NUVEM.etag = r.eTag; falhasRede = 0;
    } catch (e){
      falhou = true;
      if (e.status === 412){ gravando = false; await conflito(); gravando = false; statusOcioso(); if (sujo) agenda(); return; }
      if (e.status === 403 || e.status === 401){
        MODO_EDICAO = false; try { localStorage.removeItem(LS_EDIT); } catch (x){}
        gravando = false; aplicaModo(false);
        try { await recarrega(); } catch (x){}
        toast('Você não tem permissão de edição neste arquivo. Suas alterações não foram salvas.');
        return;
      }
      falhasRede++; sujo = true;
      marcaStatus('erro', 'Sem conexão — tentando de novo', null, String(e.message || e));
    }
    gravando = false;
    if (!falhou) statusOcioso();
    if (sujo) dispara(falhou ? Math.min(30000, 4000 * falhasRede) : 600);
  };
  window.agenda = function(){ if (!PODE()) return; dispara(600); };
  window.mudou = function(){ if (!PODE()) return; E.ultimaEdicao = { u: USUARIO(), em: agora() }; sincroniza(); fixa(); agenda(); };
  window.statusOcioso = function(){
    const ue = E.ultimaEdicao ? ' · ' + E.ultimaEdicao.u + ' ' + fmtCurto(isoDe(new Date(E.ultimaEdicao.em))) + ' ' + hora(E.ultimaEdicao.em) : '';
    if (!PODE()) marcaStatus('local', 'Somente leitura' + (ue ? ' · última edição' + ue : ''), null, 'Dados na nuvem. Clique em ✏ Editar para alterar.');
    else marcaStatus('arq', '☁ Sincronizado ' + hora(E.savedAt || agora()) + (ue ? ' · ' + ue.slice(3) : ''), null, 'Cada alteração é gravada no arquivo da nuvem.');
  };
  window.salvarMovel = window.vincular = window.tentaReconectar = function(){};
  ['btnVincular', 'btnCopia'].forEach(id => { const b = $n(id); if (b) b.style.display = 'none'; });

  ['click','change','input','beforeinput','paste','cut','keydown','keyup'].forEach(n => document.addEventListener(n, bloqueia, true));
  new MutationObserver(travaCampos).observe($n('modalOv'), { childList: true, subtree: true });
  $n('btnAcesso').onclick = () => { if (PODE()) saiEdicao(); else entraEdicao(); };

  /* atualização automática: outro dispositivo salvou? */
  async function confere(){
    if (!NUVEM.pronto || gravando || sujo || timer || MODAL_ID || document.hidden) return;
    const a = document.activeElement;
    if (PODE() && a && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)) return;
    try {
      const m = await NUVEM.meta();
      if (m.eTag !== NUVEM.etag){
        await recarrega();
        const quem = m.lastModifiedBy && m.lastModifiedBy.user ? m.lastModifiedBy.user.displayName : 'outro dispositivo';
        toast('Atualizado com as alterações de ' + quem + '.');
      }
    } catch (e){}
  }
  setInterval(confere, 40000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') confere();
    else if (PODE() && timer){ clearTimeout(timer); timer = null; gravaAgora(); }
  });
  window.addEventListener('beforeunload', ev => { if (PODE() && (sujo || gravando || timer)){ ev.preventDefault(); ev.returnValue = ''; } });
}
})();
