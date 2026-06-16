// AB SEM CALOTE - app PWA v1.3 (backend: Google Apps Script)
// API_BASE deve ser a URL Web app do GAS, terminada em /exec.
// Se ainda nao foi configurada, o app mostra erro claro no login.

// Lista oficial de advogados do escritorio (dropdown nos forms)
const ADVOGADOS = [
  'André Beschizza',
  'Cláudio Henrique',
  'Luana Barbosa',
  'Meiriane Oliveira'
];

// Gera <option>s. Se currentValue nao esta na lista, adiciona como opcao extra
// no topo (preserva dado historico) marcada como "(antigo)".
function optsAdvogados(currentValue) {
  const cur = (currentValue || '').trim();
  const isInList = ADVOGADOS.some(a => a.toLowerCase() === cur.toLowerCase());
  const extras = (cur && !isInList) ? [`<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)} (antigo)</option>`] : [];
  const baseOpts = ADVOGADOS.map(a =>
    `<option value="${escapeHtml(a)}"${cur.toLowerCase() === a.toLowerCase() ? ' selected' : ''}>${escapeHtml(a)}</option>`
  );
  const placeholder = !cur ? `<option value="" disabled selected>Selecione o advogado</option>` : '';
  return [placeholder, ...extras, ...baseOpts].join('');
}
const API_BASE = 'https://script.google.com/macros/s/AKfycbwE-j_WyiD8YHQRli_cFjmCRzFFLsveTq2g-LRfUdg0MNw7B8sUr-UMROrkDim888UG/exec';
const VAPID_PUBLIC = 'BN_LJCRZzyqlBGVeaaiLenhuxLnjwX6t-eU4GEi0wkXJwEfq4OSYiX47aoqjizkbmFKH3XZmXZr8EL-gTW4zEgM';
const TOKEN_KEY = 'abscalote_token';
const EMAIL_KEY = 'abscalote_email';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ============================================================================
// Formatadores BR
// ============================================================================
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '-';

function formatCPF(v) {
  v = (v || '').replace(/\D/g, '').slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return v.replace(/(\d{3})(\d+)/, '$1.$2');
  if (v.length <= 9) return v.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
}
function unmaskCPF(v) { return (v || '').replace(/\D/g, ''); }

// Formata CPF pra display garantindo 11 digitos com leading zero
function formatCPFDisplay(cpf) {
  let d = String(cpf || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) d = '0' + d;
  if (d.length !== 11) return d; // retorna cru se nao for 11
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Valida CPF brasileiro pelos digitos verificadores
function validarCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false; // todos digitos iguais (000.000.000-00, 111.111.111-11, etc)
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let dig1 = 11 - (soma % 11);
  if (dig1 >= 10) dig1 = 0;
  if (dig1 !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  let dig2 = 11 - (soma % 11);
  if (dig2 >= 10) dig2 = 0;
  if (dig2 !== parseInt(cpf[10])) return false;
  return true;
}

function formatValor(v) {
  // Aceita "1234,56" ou "123456" e formata como R$ 1.234,56
  const digits = (v || '').replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return fmtBRL(num).replace(/ /g, ' ');
}
function unmaskValor(v) {
  if (!v) return 0;
  const digits = String(v).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
}

// ============================================================================
// Helpers UI
// ============================================================================
function setBtnLoading(btn, loading) {
  const txt = btn.querySelector('.btn-text');
  const sp = btn.querySelector('.spinner');
  if (loading) { btn.disabled = true; if (sp) sp.hidden = false; if (txt) txt.style.opacity = '0.6'; }
  else { btn.disabled = false; if (sp) sp.hidden = true; if (txt) txt.style.opacity = '1'; }
}
function showError(el, msg) { el.textContent = msg; el.className = 'error'; el.hidden = false; }
function showSuccess(el, msg) { el.textContent = msg; el.className = 'success'; el.hidden = false; }
function setConnStatus(ok, msg) {
  const el = $('#connStatus');
  el.className = ok ? 'conn-ok' : 'conn-err';
  el.textContent = msg || (ok ? 'Conectado' : 'Sem conexao');
}

// ============================================================================
// Service worker + push
// ============================================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(reg => {
    // Verifica updates a cada carregamento
    reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // Nova versao pronta; ja vai assumir no proximo navigate (skipWaiting + claim)
          console.info('Nova versao do app disponivel. Recarregue se nao atualizar sozinho.');
        }
      });
    });
  }).catch(e => console.warn('SW falhou:', e));
}

async function pedirPermissaoPush() {
  if (!('Notification' in window) || !('PushManager' in window)) { alert('Push nao suportado.'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    });
    // TODO: implementar endpoint push/subscribe no GAS (ou manter no n8n W04)
    console.info('Push subscription pronta. Endpoint do servidor ainda nao implementado:', sub);
    $('#btnNotif').hidden = true;
  } catch (e) { console.error('Push falhou:', e); }
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// ============================================================================
// API
// ============================================================================
const token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

// API protocol (Google Apps Script):
//  - Sempre POST com Content-Type text/plain (evita preflight CORS)
//  - Body JSON contem { path, _token, ...payload }
//  - Resposta sempre 200 OK com envelope { ok, status, data?, id?, erro?, mensagem? }
async function api(path, payload) {
  if (API_BASE.includes('__GAS_WEB_APP_URL__')) {
    throw new Error('API ainda nao configurada. Dr. Andre precisa publicar o Apps Script e atualizar API_BASE.');
  }
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const body = Object.assign({ path: cleanPath }, payload || {});
  const tk = token();
  if (tk && cleanPath !== 'auth/login') body._token = tk;

  let res;
  try {
    res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
  } catch (e) {
    setConnStatus(false, 'Sem internet');
    throw new Error('Sem conexao com o servidor.');
  }
  setConnStatus(true);

  let j;
  try { j = await res.json(); }
  catch (e) {
    throw new Error('Resposta invalida do servidor (nao e JSON).');
  }

  if (!j.ok) {
    if (j.status === 401) {
      try { localStorage.removeItem(TOKEN_KEY); } catch {}
      showLogin();
      throw new Error('Sessao expirada');
    }
    const msg = j.mensagem || j.erro || `Erro (status ${j.status || '?'})`;
    throw new Error(msg);
  }
  return j;
}

// ============================================================================
// Login / Logout / Views
// ============================================================================
function showLogin() {
  $$('main section').forEach(s => s.hidden = true);
  $('#loginView').hidden = false;
  $('#tabs').hidden = true;
  $('#btnLogout').hidden = true;
  $('#btnRefresh').hidden = true;
  $('#btnNotif').hidden = true;
  try {
    const lastEmail = localStorage.getItem(EMAIL_KEY);
    if (lastEmail) $('#loginForm [name=email]').value = lastEmail;
  } catch {}
}

function hideLogin() {
  $('#loginView').hidden = true;
  $('#tabs').hidden = false;
  $('#btnLogout').hidden = false;
  $('#btnRefresh').hidden = false;
  if ('Notification' in window && Notification.permission === 'default') $('#btnNotif').hidden = false;
  // Popula dropdown de advogados (sem valor inicial — usuario seleciona)
  $('#inpAdv').innerHTML = optsAdvogados('');
  trocarView('home');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const errEl = $('#loginErr');
  errEl.hidden = true;
  const fd = new FormData(e.target);
  const email = fd.get('email').trim().toLowerCase();
  const senha = fd.get('senha');
  setBtnLoading(btn, true);
  try {
    const r = await api('auth/login', { email, senha });
    if (!r.token) throw new Error('Resposta invalida do servidor.');
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(EMAIL_KEY, email);
    hideLogin();
  } catch (err) {
    showError(errEl, err.message || 'Falha no login.');
  } finally {
    setBtnLoading(btn, false);
  }
});

$('#btnLogout').addEventListener('click', () => {
  if (!confirm('Deseja sair?')) return;
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  showLogin();
});
$('#btnNotif').addEventListener('click', pedirPermissaoPush);
$('#btnRefresh').addEventListener('click', () => {
  const v = document.querySelector('.tab.active')?.dataset.view;
  if (v === 'home') carregarHome();
  if (v === 'alertas') carregarAlertas();
  if (v === 'processos') carregarProcessos();
});

function trocarView(nome) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === nome));
  $$('main section').forEach(s => s.hidden = s.id !== nome + 'View');
  if (nome === 'home') carregarHome();
  if (nome === 'alertas') carregarAlertas();
  if (nome === 'processos') carregarProcessos();
}
$$('.tab').forEach(t => t.addEventListener('click', () => trocarView(t.dataset.view)));

// ============================================================================
// Estados
// ============================================================================
function renderSkeleton(c, n = 3) { c.innerHTML = Array(n).fill('<div class="skeleton"></div>').join(''); }
function renderEmpty(c, icon, title, desc) {
  c.innerHTML = `<div class="state"><div class="icon">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`;
}
function renderError(c, msg, onRetry) {
  c.innerHTML = `<div class="state"><div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg></div><h3>Nao foi possivel carregar</h3><p>${msg}</p><button class="retry" onclick="(${onRetry.toString()})()">Tentar novamente</button></div>`;
}

// ============================================================================
// Alertas
// ============================================================================
async function carregarAlertas() {
  const list = $('#alertasList');
  const count = $('#alertasCount');
  renderSkeleton(list, 3);
  try {
    const r = await api('alertas/list');
    const arr = Array.isArray(r.data) ? r.data : [];
    count.textContent = arr.filter(a => !a.visto_em).length || '';
    if (!arr.length) {
      renderEmpty(list,
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
        'Sem alertas', 'Voce esta em dia. Os processos sao verificados a cada 72h.');
      return;
    }
    list.innerHTML = arr.map(renderAlerta).join('');
  } catch (e) {
    if (e.message === 'Sessao expirada') return;
    renderError(list, e.message, 'carregarAlertas');
  }
}

function renderAlerta(a) {
  // Alerta de FALHA em consulta de tribunal
  if (a.tipo === 'consulta_erro') {
    return `<div class="card depositado">
      <div class="cliente">⚠ Falha na consulta do tribunal</div>
      <div class="meta">Processo: <strong>${escapeHtml(a.numero_processo || '-')}</strong></div>
      <div class="meta">Tribunal: <strong>TRF${escapeHtml(a.trf || '?')}</strong></div>
      <div class="meta">Erro: ${escapeHtml(a.mensagem || 'sem detalhes')}</div>
      <div class="meta">Tentativa em: ${fmtDate(a.criado_em)}</div>
      <span class="status depositado">consulta falhou</span>
    </div>`;
  }
  // Alertas tradicionais (deposito, iminente)
  const cls = a.tipo === 'depositado' ? 'depositado' : 'iminente';
  return `<div class="card ${cls}">
    <div class="cliente">${escapeHtml(a.nome_cliente || 'Cliente')} <small>CPF ***${escapeHtml(a.cpf_ultimos4 || '----')}</small></div>
    <div class="meta"><strong>${escapeHtml(a.numero_processo || '-')}</strong></div>
    <div class="meta">${escapeHtml(a.valor_faixa || 'valor a confirmar')}</div>
    <span class="status ${a.status_canonico || ''}">${escapeHtml(a.tipo || 'alerta')}</span></div>`;
}

// ============================================================================
// Processos
// ============================================================================
async function carregarProcessos() {
  const list = $('#processosList');
  renderSkeleton(list, 4);
  try {
    const r = await api('processos/list');
    const arrAll = Array.isArray(r.data) ? r.data : [];
    // Filtra linhas-fantasma (defensivo; GAS ja filtra server-side)
    const arr = arrAll.filter(p => (p.id && String(p.id).trim()) || (p.nome_cliente && String(p.nome_cliente).trim()) || (p.cpf && String(p.cpf).trim()));
    const filtradas = arrAll.length - arr.length;
    window._procs = arr;
    popularFiltroAdv();
    if (!arr.length) {
      renderEmpty(list,
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>',
        'Nenhum processo', filtradas > 0
          ? `${filtradas} linha(s) vazia(s) na Sheets foram ocultada(s). Cadastre na aba "Novo".`
          : 'Cadastre o primeiro na aba "Novo".');
      $('#filtroContador').textContent = '0 processos';
      return;
    }
    aplicarFiltros(); // ja renderiza com filtros vigentes
    if (filtradas > 0) {
      const aviso = document.createElement('div');
      aviso.className = 'aviso-banner';
      aviso.innerHTML = `<strong>Aviso:</strong> ${filtradas} linha(s) vazia(s) na Sheets foram ocultada(s) automaticamente.`;
      list.insertBefore(aviso, list.firstChild);
    }
  } catch (e) {
    if (e.message === 'Sessao expirada') return;
    renderError(list, e.message, 'carregarProcessos');
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Retorna URL do portal do TRF correspondente, com numero do processo quando aplicavel.
// Cada tribunal tem URL/sistema diferente — esse mapa cresce conforme validamos um a um.
function urlPortalTribunal(p) {
  const trf = parseInt(p.trf, 10);
  const cnj = String(p.numero_processo || '').replace(/\D/g, '');
  switch (trf) {
    case 1: {
      // TRF1 — busca por CPF do cliente (mais robusto que numero do processo).
      // Se a busca por CPF retornar varios processos, o usuario cruza com o
      // numero_processo cadastrado no card pra achar o certo.
      const cpfTrf1 = String(p.cpf || '').replace(/\D/g, '');
      return `https://processual.trf1.jus.br/consultaProcessual/cpfCnpjParte.php?secao=TRF1${cpfTrf1 ? '&filtroCPF=' + cpfTrf1 : ''}`;
    }
    case 5:
      // TRF5 — Joomla legado, aceita busca direta por numero
      return `https://cp.trf5.jus.br/cp/cp.do?tipo=xmlproc&filtro=${encodeURIComponent(p.numero_processo || '')}`;
    case 2:
      return `https://eproc.jfrj.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica`;
    case 3:
      return `https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam`;
    case 4:
      return `http://www2.trf4.jus.br/trf4/controlador.php?acao=consulta_processual_pesquisa&selForma=NU&txtValor=${cnj}&selOrigem=TRF`;
    case 6:
      return `https://pje2g.trf6.jus.br/pje/ConsultaPublica/listView.seam`;
    default:
      return null;
  }
}

// Resumo da ultima consulta em texto curto p/ card + classe CSS
function ultimaConsultaResumo(uc) {
  if (!uc) return { texto: 'Nunca consultado', cls: 'sem-consulta', icone: '○' };
  const data = fmtDate(uc.processado_em || uc.solicitado_em);
  const trf = uc.trf ? `TRF${uc.trf}` : '';
  switch ((uc.status || '').toLowerCase()) {
    case 'erro':
      return { texto: `Última consulta: ${data} ⚠ Falha ${trf}`, cls: 'consulta-erro', icone: '⚠' };
    case 'processado':
    case 'ok':
    case 'sucesso':
      return { texto: `Última consulta: ${data} ✓ ${trf}`, cls: 'consulta-ok', icone: '✓' };
    case 'pendente':
    default:
      return { texto: `Consulta agendada: ${data}`, cls: 'consulta-pendente', icone: '⏱' };
  }
}

// Bool tolerante: aceita true, "TRUE", "true", "1", 1, "sim"
function asBool(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') return /^(true|sim|1|yes|y|s)$/i.test(v.trim());
  return false;
}

function calcResumo(p) {
  const valor = parseFloat(p.valor_estimado || 0) || 0;
  const pct = parseFloat(p.percentual_honorarios || 0);
  const hon = p.tipo === 'SUCUMBENCIA' ? 0 : valor * (pct / 100);
  const divParc = parseFloat(p.divida_parcelas_implantacao || 0) || 0;
  const divHon = parseFloat(p.divida_honorarios_iniciais || 0) || 0;
  const inadimp = asBool(p.cliente_inadimplente) && (divParc + divHon) > 0;
  const debito = inadimp ? (divParc + divHon) : 0;
  return {
    valor, pct, hon, divParc, divHon, inadimp,
    debito,
    devidoEscritorio: hon + debito,
    liquidoCliente: p.tipo === 'SUCUMBENCIA' ? 0 : Math.max(valor - hon - debito, 0)
  };
}

// Set global de processos selecionados (bulk consulta)
window._selectedIds = window._selectedIds || new Set();

function renderProcessos(procs) {
  const list = $('#processosList');
  if (!procs.length) { list.innerHTML = '<div class="state"><p>Nenhum processo encontrado.</p></div>'; return; }
  list.innerHTML = procs.map(p => {
    const r = calcResumo(p);
    const tipoLabel = { RPV: 'RPV', PRECATORIO: 'Precatorio', SUCUMBENCIA: 'Sucumbencia' }[p.tipo] || p.tipo;
    const cpfDisplay = formatCPFDisplay(p.cpf) || ('***' + (p.cpf_ultimos4 || '----'));
    const inadimpBadge = r.inadimp
      ? `<span class="badge-inadimp" title="Cliente inadimplente">DEBITO ${fmtBRL(r.debito)}</span>`
      : '';
    const isSelected = window._selectedIds.has(String(p.id));
    const uc = ultimaConsultaResumo(p.ultima_consulta);
    return `<div class="card clickable${r.inadimp ? ' inadimp' : ''}${isSelected ? ' selected' : ''}" data-id="${escapeHtml(p.id)}">
      <input type="checkbox" class="card-check" data-cid="${escapeHtml(p.id)}"${isSelected ? ' checked' : ''} title="Selecionar para consulta em lote" />
      <div class="cliente">${escapeHtml(p.nome_cliente || '-')} ${inadimpBadge}</div>
      <div class="meta">CPF: <strong>${escapeHtml(cpfDisplay)}</strong></div>
      <div class="meta">Processo: <strong>${escapeHtml(p.numero_processo || '-')}</strong>${p.numero_rpv ? ' · RPV: ' + escapeHtml(p.numero_rpv) : ''}</div>
      <div class="meta">TRF${escapeHtml(p.trf)} · ${tipoLabel}${p.tipo !== 'SUCUMBENCIA' && r.pct ? ' · ' + r.pct + '% hon.' : ''}</div>
      <div class="meta">Advogado: ${escapeHtml(p.advogado_responsavel || '-')}</div>
      ${r.valor > 0 ? `<div class="meta">Valor: <strong>${fmtBRL(r.valor)}</strong> · ${p.tipo === 'SUCUMBENCIA' ? 'Sucumbencia' : 'Honorarios'}: <strong>${fmtBRL(r.hon || r.valor)}</strong></div>` : ''}
      <div class="meta consulta-line ${uc.cls}">${escapeHtml(uc.texto)}</div>
      <span class="status ${p.status_atual || ''}">${(p.status_atual || 'cadastrado').replace(/_/g, ' ')}</span>
      <span class="card-chevron" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </div>`;
  }).join('');
  list.querySelectorAll('.card[data-id]').forEach(c => {
    c.addEventListener('click', (e) => {
      // Click no checkbox nao abre modal
      if (e.target.closest('.card-check')) return;
      abrirDetalhe(c.dataset.id);
    });
  });
  list.querySelectorAll('.card-check').forEach(chk => {
    chk.addEventListener('click', (e) => e.stopPropagation());
    chk.addEventListener('change', (e) => {
      const id = String(chk.dataset.cid);
      if (chk.checked) window._selectedIds.add(id);
      else window._selectedIds.delete(id);
      chk.closest('.card').classList.toggle('selected', chk.checked);
      atualizarBulkBar();
    });
  });
  atualizarBulkBar();
}

function atualizarBulkBar() {
  const bar = $('#bulkBar');
  const count = window._selectedIds.size;
  if (count === 0) { bar.hidden = true; return; }
  bar.hidden = false;
  $('#bulkCount').textContent = count;
}

$('#bulkClear').addEventListener('click', () => {
  window._selectedIds.clear();
  document.querySelectorAll('.card-check').forEach(c => { c.checked = false; c.closest('.card').classList.remove('selected'); });
  atualizarBulkBar();
});

$('#bulkConsultar').addEventListener('click', async () => {
  const ids = Array.from(window._selectedIds);
  if (!ids.length) return;
  const btn = $('#bulkConsultar');
  setBtnLoading(btn, true);
  try {
    const r = await api('consulta/trigger', { ids: ids });
    const msg = r.mensagem || `${r.enfileirados} consulta(s) processada(s).`;
    alert(msg + (r.ignorados ? `\n\n${r.ignorados} ignorado(s) (processo nao encontrado).` : ''));
    window._selectedIds.clear();
    atualizarBulkBar();
    // Recarrega processos pra refletir resultados frescos
    try {
      const rL = await api('processos/list');
      const arrAll = Array.isArray(rL.data) ? rL.data : [];
      window._procs = arrAll.filter(x => (x.id && String(x.id).trim()) || (x.nome_cliente && String(x.nome_cliente).trim()));
      aplicarFiltros();
    } catch (e) {
      renderProcessos(window._procs || []);
    }
  } catch (err) {
    alert('Erro: ' + (err.message || 'falha ao consultar'));
  } finally {
    setBtnLoading(btn, false);
  }
});

// ============================================================================
// Modal de detalhes / edicao do processo
// ============================================================================
let _modalProcId = null;

function abrirDetalhe(id) {
  const p = (window._procs || []).find(x => String(x.id) === String(id));
  if (!p) { alert('Processo nao encontrado. Atualize a lista.'); return; }
  _modalProcId = p.id;
  renderDetalhe(p);
  $('#modalOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function renderDetalhe(p) {
  const r = calcResumo(p);
  const tipoLabel = { RPV: 'RPV', PRECATORIO: 'Precatorio', SUCUMBENCIA: 'Sucumbencia' }[p.tipo] || p.tipo || '-';
  const cpfDisplay = p.cpf || ('***' + (p.cpf_ultimos4 || '----'));
  const statusLabel = (p.status_atual || 'cadastrado').replace(/_/g, ' ');
  const trfLabel = `TRF${p.trf || '-'}`;
  const numeroRPV = p.numero_rpv ? escapeHtml(p.numero_rpv) : '<span class="muted-inline">nao informado</span>';
  const linhas = [
    ['Cliente', escapeHtml(p.nome_cliente || '-')],
    ['CPF', escapeHtml(cpfDisplay)],
    ['Numero do processo', `<code>${escapeHtml(p.numero_processo || '-')}</code>`],
    ['Numero RPV/Precatorio', numeroRPV],
    ['Tipo', escapeHtml(tipoLabel)],
    ['Tribunal', escapeHtml(trfLabel)],
    ['Valor estimado', `<strong>${fmtBRL(r.valor)}</strong>`],
    p.tipo === 'SUCUMBENCIA'
      ? ['Sucumbencia', `<strong>${fmtBRL(r.valor)}</strong>`]
      : ['Honorarios', `<strong>${fmtBRL(r.hon)}</strong> <span class="muted-inline">(${r.pct || 0}%)</span>`],
    ['Advogado responsavel', escapeHtml(p.advogado_responsavel || '-')],
    ['Status atual', `<span class="status ${p.status_atual || ''}">${escapeHtml(statusLabel)}</span>`],
    ['Cadastrado em', fmtDate(p.criado_em)],
    ['Atualizado em', fmtDate(p.atualizado_em)],
    ['ID interno', `<code class="tiny">${escapeHtml(p.id || '-')}</code>`]
  ];
  const linhasHtml = linhas.map(([k, v]) =>
    `<div class="detalhe-linha"><span class="detalhe-label">${k}</span><span class="detalhe-valor">${v}</span></div>`
  ).join('');

  // Bloco de inadimplencia + resumo financeiro (so quando faz sentido)
  let blocoFin = '';
  if (p.tipo !== 'SUCUMBENCIA' && r.valor > 0) {
    const inadimpHtml = r.inadimp
      ? `<div class="inadimp-box on">
          <div class="inadimp-row"><span class="inadimp-badge on">INADIMPLENTE</span><span class="inadimp-total">Total em debito: <strong>${fmtBRL(r.debito)}</strong></span></div>
          <div class="inadimp-grid">
            <span>Parcelas de implantacao</span><strong>${fmtBRL(r.divParc)}</strong>
            <span>Honorarios iniciais</span><strong>${fmtBRL(r.divHon)}</strong>
          </div>
         </div>`
      : `<div class="inadimp-box off">
          <span class="inadimp-badge off">CLIENTE EM DIA</span>
          <span class="muted-inline">Sem debitos pendentes.</span>
         </div>`;
    blocoFin = `
      <h4 class="modal-sec-title">Inadimplencia</h4>
      ${inadimpHtml}
      <h4 class="modal-sec-title">Resumo financeiro</h4>
      <div class="resumo-fin">
        <div class="resumo-row"><span>Valor estimado do ${tipoLabel}</span><strong>${fmtBRL(r.valor)}</strong></div>
        <div class="resumo-row sub"><span>(-) Honorarios ${r.pct || 0}%</span><strong>${fmtBRL(r.hon)}</strong></div>
        ${r.debito > 0 ? `<div class="resumo-row sub debito"><span>(-) Debito a abater</span><strong>${fmtBRL(r.debito)}</strong></div>` : ''}
        <div class="resumo-row total"><span>Total devido ao escritorio</span><strong>${fmtBRL(r.devidoEscritorio)}</strong></div>
        <div class="resumo-row liquido"><span>Liquido ao cliente</span><strong>${fmtBRL(r.liquidoCliente)}</strong></div>
      </div>`;
  }

  // Bloco da ultima consulta no tribunal
  let blocoConsulta = '';
  const uc = p.ultima_consulta;
  if (uc) {
    const stStr = (uc.status || '').toLowerCase();
    const isErr = stStr === 'erro';
    const isOk = stStr === 'processado' || stStr === 'ok' || stStr === 'sucesso';
    const cls = isErr ? 'consulta-box erro' : (isOk ? 'consulta-box ok' : 'consulta-box pendente');
    const labelStatus = isErr ? '⚠ FALHA' : (isOk ? '✓ OK' : '⏱ AGENDADA');
    blocoConsulta = `
      <h4 class="modal-sec-title">Ultima consulta no tribunal</h4>
      <div class="${cls}">
        <div class="consulta-row"><span>Status</span><strong>${labelStatus}</strong></div>
        <div class="consulta-row"><span>Tribunal</span><strong>TRF${escapeHtml(uc.trf || '?')}</strong></div>
        <div class="consulta-row"><span>Agendada em</span><strong>${fmtDate(uc.solicitado_em)}</strong></div>
        ${uc.processado_em ? `<div class="consulta-row"><span>Processada em</span><strong>${fmtDate(uc.processado_em)}</strong></div>` : ''}
        ${uc.resultado ? `<div class="consulta-msg ${isErr ? 'erro' : ''}">${escapeHtml(uc.resultado)}</div>` : ''}
      </div>`;
  } else {
    blocoConsulta = `
      <h4 class="modal-sec-title">Ultima consulta no tribunal</h4>
      <div class="consulta-box vazio">
        <span class="muted-inline">Nunca consultado pelo robo. Use o botao abaixo pra agendar.</span>
      </div>`;
  }

  const urlPortal = urlPortalTribunal(p);
  // TRF1 busca por CPF — mostra dica visual pra cruzar com o numero do processo
  const dicaCross = (parseInt(p.trf, 10) === 1 && p.numero_processo)
    ? `<div class="dica-cross">⚡ Busca por CPF abre lista. Procura o processo <code>${escapeHtml(p.numero_processo)}</code> na tabela que abrir.</div>`
    : '';
  const btnPortal = urlPortal
    ? `<a class="btn-consulta secondary" href="${urlPortal}" target="_blank" rel="noopener">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
         <span class="btn-text">Abrir no portal TRF${p.trf}</span>
       </a>${dicaCross}`
    : '';

  const html = linhasHtml + blocoConsulta + blocoFin +
    `<div class="modal-actions"><button class="primary" id="btnEditar"><span class="btn-text">Editar processo</span></button></div>
     <button class="btn-consulta" id="btnConsultarUnico" type="button">
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
       <span class="btn-text">Consultar tribunal agora</span>
       <span class="spinner" hidden></span>
     </button>
     ${btnPortal}`;
  $('#modalBody').innerHTML = html;
  const btn = $('#btnEditar');
  if (btn) btn.addEventListener('click', () => renderEdicao(p));
  const btnC = $('#btnConsultarUnico');
  if (btnC) btnC.addEventListener('click', async () => {
    setBtnLoading(btnC, true);
    try {
      const r = await api('consulta/trigger', { ids: [p.id] });
      // Recarrega processos pra puxar resultado fresco e reabre modal
      try {
        const rL = await api('processos/list');
        const arrAll = Array.isArray(rL.data) ? rL.data : [];
        window._procs = arrAll.filter(x => (x.id && String(x.id).trim()) || (x.nome_cliente && String(x.nome_cliente).trim()));
        const atualizado = (window._procs || []).find(x => String(x.id) === String(p.id));
        if (atualizado) {
          renderDetalhe(atualizado); // re-renderiza modal com nova ultima_consulta
          renderProcessos(window._procs); // atualiza card no fundo tb
          return;
        }
      } catch (e) { /* fallback abaixo */ }
      btnC.querySelector('.btn-text').textContent = '✓ ' + (r.mensagem || 'Concluido');
      btnC.disabled = true;
      btnC.querySelector('.spinner').hidden = true;
    } catch (err) {
      alert('Erro: ' + (err.message || 'falha ao consultar'));
      setBtnLoading(btnC, false);
    }
  });
}

function renderEdicao(p) {
  const valorRaw = parseFloat(p.valor_estimado || 0) || 0;
  const valorFmt = valorRaw ? formatValor(String(Math.round(valorRaw * 100))) : '';
  const divParcRaw = parseFloat(p.divida_parcelas_implantacao || 0) || 0;
  const divHonRaw = parseFloat(p.divida_honorarios_iniciais || 0) || 0;
  const divParcFmt = divParcRaw ? formatValor(String(Math.round(divParcRaw * 100))) : '';
  const divHonFmt = divHonRaw ? formatValor(String(Math.round(divHonRaw * 100))) : '';
  const isInadimp = asBool(p.cliente_inadimplente);
  const html = `
    <form id="editForm" class="edit-form">
      <div class="row">
        <label>
          <span>Tipo</span>
          <select name="tipo">
            <option value="RPV"${p.tipo === 'RPV' ? ' selected' : ''}>RPV</option>
            <option value="PRECATORIO"${p.tipo === 'PRECATORIO' ? ' selected' : ''}>Precatorio</option>
            <option value="SUCUMBENCIA"${p.tipo === 'SUCUMBENCIA' ? ' selected' : ''}>Sucumbencia</option>
          </select>
        </label>
        <label>
          <span>TRF</span>
          <select name="trf">
            ${[1,2,3,4,5,6].map(n => `<option value="${n}"${parseInt(p.trf,10) === n ? ' selected' : ''}>TRF${n}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>
        <span>Numero do processo</span>
        <input name="numero_processo" value="${escapeHtml(p.numero_processo || '')}" />
      </label>
      <label>
        <span>Numero RPV/Precatorio</span>
        <input name="numero_rpv" value="${escapeHtml(p.numero_rpv || '')}" />
      </label>
      <label>
        <span>Nome do cliente</span>
        <input name="nome_cliente" value="${escapeHtml(p.nome_cliente || '')}" />
      </label>
      <label>
        <span>Valor estimado</span>
        <input name="valor_estimado" id="editValor" value="${escapeHtml(valorFmt)}" inputmode="decimal" />
      </label>
      <label>
        <span>Percentual de honorarios (%)</span>
        <input name="percentual_honorarios" type="number" step="0.5" min="0" max="100" value="${escapeHtml(p.percentual_honorarios || 35)}" />
      </label>
      <label>
        <span>Advogado responsavel</span>
        <select name="advogado_responsavel" required>
          ${optsAdvogados(p.advogado_responsavel || '')}
        </select>
      </label>
      <label>
        <span>Status atual</span>
        <select name="status_atual">
          ${['cadastrado','em_pagamento','encaminhado_banco','depositado','sacado'].map(s =>
            `<option value="${s}"${p.status_atual === s ? ' selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </label>

      <fieldset class="inadimp-block edit">
        <label class="switch-row">
          <input type="checkbox" name="cliente_inadimplente" id="editInadimp"${isInadimp ? ' checked' : ''} />
          <span class="switch"></span>
          <span class="switch-label">Cliente esta inadimplente</span>
        </label>
        <div id="editDividasArea" class="dividas-area"${isInadimp ? '' : ' hidden'}>
          <small class="hint">Valores abatidos do total no depositado.</small>
          <label>
            <span>Debito parcelas de implantacao</span>
            <input name="divida_parcelas_implantacao" id="editDivParc" value="${escapeHtml(divParcFmt)}" inputmode="decimal" placeholder="R$ 0,00" />
          </label>
          <label>
            <span>Debito honorarios iniciais</span>
            <input name="divida_honorarios_iniciais" id="editDivHon" value="${escapeHtml(divHonFmt)}" inputmode="decimal" placeholder="R$ 0,00" />
          </label>
          <small class="hint" id="editDivTotal">Total em debito: <strong>${fmtBRL(divParcRaw + divHonRaw)}</strong></small>
        </div>
      </fieldset>

      <p id="editMsg" hidden></p>
      <div class="modal-actions split">
        <button type="button" id="btnCancelEdit" class="secondary-ghost">Cancelar</button>
        <button type="submit" class="primary"><span class="btn-text">Salvar alteracoes</span><span class="spinner" hidden></span></button>
      </div>
    </form>`;
  $('#modalBody').innerHTML = html;
  // mascaras + handlers
  $('#editValor').addEventListener('input', (e) => { e.target.value = formatValor(e.target.value); });
  const recalcEditDiv = () => {
    const a = unmaskValor($('#editDivParc').value);
    const b = unmaskValor($('#editDivHon').value);
    $('#editDivTotal').innerHTML = `Total em debito: <strong>${fmtBRL(a + b)}</strong>`;
  };
  $('#editDivParc').addEventListener('input', (e) => { e.target.value = formatValor(e.target.value); recalcEditDiv(); });
  $('#editDivHon').addEventListener('input', (e) => { e.target.value = formatValor(e.target.value); recalcEditDiv(); });
  $('#editInadimp').addEventListener('change', (e) => {
    $('#editDividasArea').hidden = !e.target.checked;
    if (!e.target.checked) {
      $('#editDivParc').value = '';
      $('#editDivHon').value = '';
      recalcEditDiv();
    }
  });
  $('#btnCancelEdit').addEventListener('click', () => renderDetalhe(p));
  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const msg = $('#editMsg');
    msg.hidden = true;
    const fd = new FormData(e.target);
    const valor = unmaskValor(fd.get('valor_estimado'));
    const inadimp = $('#editInadimp').checked;
    const divParc = inadimp ? unmaskValor(fd.get('divida_parcelas_implantacao')) : 0;
    const divHon = inadimp ? unmaskValor(fd.get('divida_honorarios_iniciais')) : 0;
    const payload = {
      tipo: fd.get('tipo'),
      trf: parseInt(fd.get('trf'), 10),
      numero_processo: fd.get('numero_processo'),
      numero_rpv: fd.get('numero_rpv') || '',
      nome_cliente: fd.get('nome_cliente'),
      valor_estimado: valor,
      percentual_honorarios: parseFloat(fd.get('percentual_honorarios') || 0),
      advogado_responsavel: fd.get('advogado_responsavel'),
      status_atual: fd.get('status_atual'),
      cliente_inadimplente: inadimp,
      divida_parcelas_implantacao: divParc,
      divida_honorarios_iniciais: divHon
    };
    setBtnLoading(btn, true);
    try {
      await api('processos/update', { id: p.id, ...payload });
      const idx = (window._procs || []).findIndex(x => String(x.id) === String(p.id));
      if (idx >= 0) {
        window._procs[idx] = { ...window._procs[idx], ...payload, atualizado_em: new Date().toISOString() };
        renderProcessos(window._procs);
      }
      showSuccess(msg, 'Alteracoes salvas.');
      setTimeout(() => {
        const atualizado = (window._procs || []).find(x => String(x.id) === String(p.id)) || p;
        renderDetalhe(atualizado);
      }, 800);
    } catch (err) {
      showError(msg, err.message || 'Falha ao salvar.');
    } finally {
      setBtnLoading(btn, false);
    }
  });
}

function fecharModal() {
  $('#modalOverlay').hidden = true;
  document.body.style.overflow = '';
  _modalProcId = null;
}

$('#btnFecharModal').addEventListener('click', fecharModal);
$('#modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') fecharModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modalOverlay').hidden) fecharModal();
});

// ============================================================================
// Filtros da aba Processos
// ============================================================================
window._filtros = { trf: '', status: '', inadimp: '', adv: '', busca: '' };

function aplicarFiltros() {
  const f = window._filtros;
  const q = (f.busca || '').toLowerCase().trim();
  const arr = (window._procs || []).filter(p => {
    if (f.trf && String(p.trf) !== f.trf) return false;
    if (f.status && (p.status_atual || '') !== f.status) return false;
    if (f.inadimp === 'sim' && !calcResumo(p).inadimp) return false;
    if (f.inadimp === 'nao' && calcResumo(p).inadimp) return false;
    if (f.adv && (p.advogado_responsavel || '') !== f.adv) return false;
    if (q) {
      const hay = `${p.nome_cliente || ''} ${p.cpf || ''} ${p.cpf_ultimos4 || ''} ${p.numero_processo || ''} ${p.numero_rpv || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderProcessos(arr);
  $('#filtroContador').textContent = `${arr.length} processo${arr.length !== 1 ? 's' : ''}`;
  const algum = f.trf || f.status || f.inadimp || f.adv || f.busca;
  $('#filtroLimpar').hidden = !algum;
}

$('#filtroProcessos').addEventListener('input', (e) => {
  window._filtros.busca = e.target.value;
  aplicarFiltros();
});

// Chips handlers
function bindChips(container, key) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    window._filtros[key] = btn.dataset[key] || '';
    aplicarFiltros();
  });
}
bindChips($('#chipsTrf'), 'trf');
bindChips($('#chipsStatus'), 'status');
bindChips($('#chipsInadimp'), 'inadimp');

$('#filtroAdv').addEventListener('change', (e) => {
  window._filtros.adv = e.target.value;
  aplicarFiltros();
});

$('#filtroLimpar').addEventListener('click', () => {
  window._filtros = { trf: '', status: '', inadimp: '', adv: '', busca: '' };
  $('#filtroProcessos').value = '';
  $('#filtroAdv').value = '';
  document.querySelectorAll('.chips').forEach(c => {
    c.querySelectorAll('.chip').forEach((b, i) => b.classList.toggle('active', i === 0));
  });
  aplicarFiltros();
});

// Popula dropdown de advogados do filtro com os realmente usados nos processos
function popularFiltroAdv() {
  const sel = $('#filtroAdv');
  const usados = Array.from(new Set((window._procs || []).map(p => p.advogado_responsavel).filter(Boolean))).sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' +
    usados.map(a => `<option value="${escapeHtml(a)}"${a === cur ? ' selected' : ''}>${escapeHtml(a)}</option>`).join('');
}

// ============================================================================
// HOME / Dashboard
// ============================================================================
async function carregarHome() {
  const saudacao = $('#homeSaudacao');
  // Greeting baseado na hora
  const h = new Date().getHours();
  const periodo = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  try {
    const email = localStorage.getItem(EMAIL_KEY) || '';
    const nome = email.split('@')[0].split('.')[0];
    const nomeFmt = nome.charAt(0).toUpperCase() + nome.slice(1);
    saudacao.textContent = `${periodo}, ${nomeFmt}. Resumo do escritorio.`;
  } catch {}

  // Garante dados carregados (mesmo cache de processos)
  let procs = window._procs;
  if (!procs) {
    try {
      const r = await api('processos/list');
      procs = Array.isArray(r.data) ? r.data.filter(p => p.id || p.nome_cliente || p.cpf) : [];
      window._procs = procs;
    } catch (e) {
      console.warn('Falha ao carregar processos pro home:', e);
      procs = [];
    }
  }

  // Conta alertas via API alertas/list
  let nAlertas = 0;
  try {
    const ra = await api('alertas/list');
    nAlertas = Array.isArray(ra.data) ? ra.data.filter(a => !a.visto_em).length : 0;
  } catch (e) {
    nAlertas = 0;
  }

  // KPIs
  const ativos = procs.filter(p => p.status_atual !== 'sacado');
  let totalReceber = 0, totalAtraso = 0, nInadimp = 0;
  ativos.forEach(p => {
    const r = calcResumo(p);
    if (p.tipo === 'SUCUMBENCIA') totalReceber += r.valor;
    else totalReceber += r.hon;
    if (r.inadimp) {
      totalAtraso += r.debito;
      nInadimp++;
    }
  });

  $('#kpiAtivos').textContent = ativos.length;
  $('#kpiAtivosDetail').textContent = `de ${procs.length} cadastrado${procs.length !== 1 ? 's' : ''}`;
  $('#kpiReceber').textContent = fmtBRL(totalReceber);
  $('#kpiAtraso').textContent = fmtBRL(totalAtraso);
  $('#kpiAtrasoDetail').textContent = `${nInadimp} inadimplente${nInadimp !== 1 ? 's' : ''}`;
  $('#kpiAlertas').textContent = nAlertas;

  // Distribuicao por status
  const statusOrder = ['cadastrado', 'em_pagamento', 'encaminhado_banco', 'depositado', 'sacado'];
  const statusLabel = {
    cadastrado: 'Cadastrado',
    em_pagamento: 'Em pagamento',
    encaminhado_banco: 'Encam. banco',
    depositado: 'Depositado',
    sacado: 'Sacado'
  };
  const statusCount = {};
  procs.forEach(p => {
    const s = p.status_atual || 'cadastrado';
    statusCount[s] = (statusCount[s] || 0) + 1;
  });
  const maxStatus = Math.max(1, ...Object.values(statusCount));
  $('#homeStatus').innerHTML = statusOrder.map(s => {
    const n = statusCount[s] || 0;
    const pct = (n / maxStatus * 100).toFixed(1);
    return `<div class="bar-row">
      <span class="bar-label">${statusLabel[s]}</span>
      <div class="bar-track"><div class="bar-fill ${s}" style="width:${pct}%"></div></div>
      <span class="bar-count">${n}</span>
    </div>`;
  }).join('') || '<p class="muted" style="text-align:center;padding:20px">Sem dados</p>';

  // Distribuicao por TRF
  const trfCount = {};
  procs.forEach(p => {
    const t = String(p.trf || '-');
    trfCount[t] = (trfCount[t] || 0) + 1;
  });
  const trfKeys = Object.keys(trfCount).sort();
  const maxTrf = Math.max(1, ...Object.values(trfCount));
  $('#homeTrf').innerHTML = trfKeys.length ? trfKeys.map(t => {
    const n = trfCount[t];
    const pct = (n / maxTrf * 100).toFixed(1);
    return `<div class="bar-row">
      <span class="bar-label">TRF${escapeHtml(t)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-count">${n}</span>
    </div>`;
  }).join('') : '<p class="muted" style="text-align:center;padding:20px">Sem dados</p>';
}

// ============================================================================
// Cadastro (form Novo)
// ============================================================================
$('#inpCPF').addEventListener('input', (e) => { e.target.value = formatCPF(e.target.value); });
$('#inpValor').addEventListener('input', (e) => {
  e.target.value = formatValor(e.target.value);
  recalcHonorarios();
});
$('#inpPct').addEventListener('input', recalcHonorarios);

function recalcHonorarios() {
  const valor = unmaskValor($('#inpValor').value);
  const pct = parseFloat($('#inpPct').value || 0);
  const hon = valor * (pct / 100);
  $('#hintHonorarios').innerHTML = `Honorarios estimados: <strong>${fmtBRL(hon)}</strong>`;
}

// Toggle inadimplencia no form Novo
$('#chkInadimp').addEventListener('change', (e) => {
  $('#divDividas').hidden = !e.target.checked;
  if (!e.target.checked) {
    $('#inpDivParc').value = '';
    $('#inpDivHon').value = '';
    recalcDividaTotal();
  }
});
function recalcDividaTotal() {
  const a = unmaskValor($('#inpDivParc').value);
  const b = unmaskValor($('#inpDivHon').value);
  $('#hintDivTotal').innerHTML = `Total em debito: <strong>${fmtBRL(a + b)}</strong>`;
}
$('#inpDivParc').addEventListener('input', (e) => { e.target.value = formatValor(e.target.value); recalcDividaTotal(); });
$('#inpDivHon').addEventListener('input', (e) => { e.target.value = formatValor(e.target.value); recalcDividaTotal(); });

// Sucumbencia esconde campos de cliente
$('#selTipo').addEventListener('change', (e) => {
  const isSucumb = e.target.value === 'SUCUMBENCIA';
  $('#lblNumeroRPV').hidden = isSucumb;
  // Em sucumbencia, "cliente" vira "credor/devedor" mas mantemos os campos pra simplicidade
  $('#lblNome').querySelector('span').firstChild.textContent = isSucumb ? 'Parte (devedor) ' : 'Nome do cliente ';
});

$('#novoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const msg = $('#novoMsg');
  msg.hidden = true;
  const fd = new FormData(e.target);
  const cpfClean = unmaskCPF(fd.get('cpf'));
  if (cpfClean.length !== 11) {
    showError(msg, 'CPF deve ter 11 dígitos (formato 000.000.000-00).');
    return;
  }
  if (!validarCPF(cpfClean)) {
    showError(msg, 'CPF inválido — confira os dígitos verificadores.');
    return;
  }
  const valor = unmaskValor(fd.get('valor_estimado'));
  if (!valor || valor <= 0) {
    showError(msg, 'Valor estimado invalido.');
    return;
  }
  const inadimpNovo = $('#chkInadimp').checked;
  const divParcNovo = inadimpNovo ? unmaskValor(fd.get('divida_parcelas_implantacao')) : 0;
  const divHonNovo = inadimpNovo ? unmaskValor(fd.get('divida_honorarios_iniciais')) : 0;
  const payload = {
    tipo: fd.get('tipo'),
    trf: parseInt(fd.get('trf'), 10),
    numero_processo: fd.get('numero_processo'),
    numero_rpv: fd.get('numero_rpv') || '',
    cpf: cpfClean,
    nome_cliente: fd.get('nome_cliente'),
    valor_estimado: valor,
    percentual_honorarios: parseFloat(fd.get('percentual_honorarios') || 0),
    advogado_responsavel: fd.get('advogado_responsavel'),
    cliente_inadimplente: inadimpNovo,
    divida_parcelas_implantacao: divParcNovo,
    divida_honorarios_iniciais: divHonNovo
  };
  setBtnLoading(btn, true);
  try {
    await api('processos', payload);
    showSuccess(msg, `Cadastrado. Honorarios estimados: ${fmtBRL(valor * payload.percentual_honorarios / 100)}.`);
    e.target.reset();
    $('#inpPct').value = '35';
    $('#hintHonorarios').innerHTML = 'Honorarios estimados: <strong>R$ 0,00</strong>';
    $('#divDividas').hidden = true;
    $('#hintDivTotal').innerHTML = 'Total em debito: <strong>R$ 0,00</strong>';
    window._procs = null;
    setTimeout(() => trocarView('processos'), 1500);
  } catch (err) {
    showError(msg, err.message || 'Falha ao cadastrar.');
  } finally {
    setBtnLoading(btn, false);
  }
});

// ============================================================================
// Relatorio
// ============================================================================
$('#btnGerarRelatorio').addEventListener('click', async () => {
  const btn = $('#btnGerarRelatorio');
  setBtnLoading(btn, true);
  try {
    let procs = window._procs;
    if (!procs) {
      const r = await api('GET', '/processos');
      procs = Array.isArray(r) ? r : (r?.body && Array.isArray(r.body) ? r.body : []);
      window._procs = procs;
    }
    const from = $('#repFrom').value;
    const to = $('#repTo').value;
    const status = $('#repStatus').value;
    const filtered = procs.filter(p => {
      const d = (p.criado_em || '').slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (status && p.status_atual !== status) return false;
      return true;
    });
    window._relatorioFiltered = filtered;
    let sumHon = 0, nHon = 0, sumSuc = 0, nSuc = 0, sumAtraso = 0, nAtraso = 0;
    filtered.forEach(p => {
      const v = parseFloat(p.valor_estimado || 0) || 0;
      const pct = parseFloat(p.percentual_honorarios || 0);
      if (p.tipo === 'SUCUMBENCIA') { sumSuc += v; nSuc++; }
      else { sumHon += v * (pct / 100); nHon++; }
      // Honorarios em atraso (dividas do cliente)
      const r = calcResumo(p);
      if (r.inadimp) {
        sumAtraso += r.debito;
        nAtraso++;
      }
    });
    $('#sumHonorarios').textContent = fmtBRL(sumHon);
    $('#sumHonorariosDetail').textContent = `${nHon} processo${nHon !== 1 ? 's' : ''}`;
    $('#sumSucumbencias').textContent = fmtBRL(sumSuc);
    $('#sumSucumbenciasDetail').textContent = `${nSuc} processo${nSuc !== 1 ? 's' : ''}`;
    $('#sumAtraso').textContent = fmtBRL(sumAtraso);
    $('#sumAtrasoDetail').textContent = `${nAtraso} inadimplente${nAtraso !== 1 ? 's' : ''}`;
    $('#sumTotal').textContent = fmtBRL(sumHon + sumSuc + sumAtraso);
    $('#sumTotalDetail').textContent = `${nHon + nSuc} processo${(nHon + nSuc) !== 1 ? 's' : ''}`;
    $('#relatorioResultado').hidden = false;
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    setBtnLoading(btn, false);
  }
});

$('#btnExportarCSV').addEventListener('click', () => {
  const procs = window._relatorioFiltered || [];
  const headers = [
    'Data cadastro', 'Tipo', 'TRF', 'Processo', 'RPV', 'Cliente', 'CPF', 'Advogado',
    'Valor estimado', 'Percentual honorarios', 'Honorarios estimados',
    'Inadimplente', 'Debito parcelas implantacao', 'Debito honorarios iniciais', 'Total em debito',
    'Total devido escritorio', 'Liquido cliente',
    'Status processo', 'Ultima consulta status', 'Ultima consulta TRF', 'Ultima consulta data', 'Ultima consulta resultado'
  ];
  const num = (n) => (n || 0).toFixed(2).replace('.', ',');
  const rows = procs.map(p => {
    const r = calcResumo(p);
    const uc = p.ultima_consulta || {};
    return [
      fmtDate(p.criado_em),
      p.tipo || '',
      'TRF' + p.trf,
      p.numero_processo || '',
      p.numero_rpv || '',
      p.nome_cliente || '',
      formatCPFDisplay(p.cpf) || ('***' + (p.cpf_ultimos4 || '')),
      p.advogado_responsavel || '',
      num(r.valor),
      p.tipo === 'SUCUMBENCIA' ? '-' : (r.pct + '%'),
      num(p.tipo === 'SUCUMBENCIA' ? r.valor : r.hon),
      r.inadimp ? 'Sim' : 'Nao',
      num(r.divParc),
      num(r.divHon),
      num(r.debito),
      num(r.devidoEscritorio + (p.tipo === 'SUCUMBENCIA' ? r.valor : 0)),
      num(r.liquidoCliente),
      p.status_atual || '',
      uc.status || 'nunca_consultado',
      uc.trf ? 'TRF' + uc.trf : '',
      uc.processado_em || uc.solicitado_em ? fmtDate(uc.processado_em || uc.solicitado_em) : '',
      uc.resultado || ''
    ];
  });
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `abscalote_relatorio_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================================
// Bootstrap
// ============================================================================
if (token()) hideLogin();
else showLogin();
