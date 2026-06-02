// AB SEM CALOTE - app PWA v0.6
const API_BASE = 'https://n8n.aposentabrasil.net.br/webhook/abscalote';
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
  navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW falhou:', e));
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
    await api('POST', '/push/subscribe', sub);
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

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token() && { Authorization: 'Bearer ' + token() }) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    setConnStatus(false, 'Sem internet');
    throw new Error('Sem conexao com o servidor.');
  }
  setConnStatus(true);
  if (res.status === 401) {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    showLogin();
    throw new Error('Sessao expirada');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Erro do servidor (HTTP ${res.status}). ${txt.slice(0, 100)}`);
  }
  try { return await res.json(); } catch { return null; }
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
  // Auto-preenche advogado com email logado
  try {
    const email = localStorage.getItem(EMAIL_KEY) || '';
    if (email && !$('#inpAdv').value) $('#inpAdv').value = email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {}
  trocarView('alertas');
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
    const r = await fetch(API_BASE + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    if (!r.ok) {
      if (r.status === 401) throw new Error('E-mail ou senha incorretos.');
      throw new Error(`Erro do servidor (HTTP ${r.status}).`);
    }
    const data = await r.json();
    if (!data.token) throw new Error('Resposta invalida do servidor.');
    localStorage.setItem(TOKEN_KEY, data.token);
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
  if (v === 'alertas') carregarAlertas();
  if (v === 'processos') carregarProcessos();
});

function trocarView(nome) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === nome));
  $$('main section').forEach(s => s.hidden = s.id !== nome + 'View');
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
    const r = await api('GET', '/alertas?status=ativo');
    const arr = Array.isArray(r) ? r : (r?.body && Array.isArray(r.body) ? r.body : []);
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
  const cls = a.tipo === 'depositado' ? 'depositado' : 'iminente';
  return `<div class="card ${cls}">
    <div class="cliente">${a.nome_cliente || 'Cliente'} <small>CPF ***${a.cpf_ultimos4 || '----'}</small></div>
    <div class="meta"><strong>${a.numero_processo || '-'}</strong></div>
    <div class="meta">${a.valor_faixa || 'valor a confirmar'}</div>
    <span class="status ${a.status_canonico || ''}">${a.tipo || 'alerta'}</span></div>`;
}

// ============================================================================
// Processos
// ============================================================================
async function carregarProcessos() {
  const list = $('#processosList');
  renderSkeleton(list, 4);
  try {
    const r = await api('GET', '/processos');
    const arr = Array.isArray(r) ? r : (r?.body && Array.isArray(r.body) ? r.body : []);
    window._procs = arr;
    if (!arr.length) {
      renderEmpty(list,
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>',
        'Nenhum processo', 'Cadastre o primeiro na aba "Novo".');
      return;
    }
    renderProcessos(arr);
  } catch (e) {
    if (e.message === 'Sessao expirada') return;
    renderError(list, e.message, 'carregarProcessos');
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderProcessos(procs) {
  const list = $('#processosList');
  if (!procs.length) { list.innerHTML = '<div class="state"><p>Nenhum processo encontrado.</p></div>'; return; }
  list.innerHTML = procs.map(p => {
    const valor = parseFloat(p.valor_estimado || 0) || 0;
    const pct = parseFloat(p.percentual_honorarios || 0);
    const hon = p.tipo === 'SUCUMBENCIA' ? valor : valor * (pct / 100);
    const tipoLabel = { RPV: 'RPV', PRECATORIO: 'Precatorio', SUCUMBENCIA: 'Sucumbencia' }[p.tipo] || p.tipo;
    const cpfDisplay = p.cpf || ('***' + (p.cpf_ultimos4 || '----'));
    return `<div class="card clickable" data-id="${escapeHtml(p.id)}">
      <div class="cliente">${escapeHtml(p.nome_cliente || '-')}</div>
      <div class="meta">CPF: <strong>${escapeHtml(cpfDisplay)}</strong></div>
      <div class="meta">Processo: <strong>${escapeHtml(p.numero_processo || '-')}</strong>${p.numero_rpv ? ' · RPV: ' + escapeHtml(p.numero_rpv) : ''}</div>
      <div class="meta">TRF${escapeHtml(p.trf)} · ${tipoLabel}${p.tipo !== 'SUCUMBENCIA' && pct ? ' · ' + pct + '% hon.' : ''}</div>
      <div class="meta">Advogado: ${escapeHtml(p.advogado_responsavel || '-')}</div>
      ${valor > 0 ? `<div class="meta">Valor: <strong>${fmtBRL(valor)}</strong> · ${p.tipo === 'SUCUMBENCIA' ? 'Sucumbencia' : 'Honorarios'}: <strong>${fmtBRL(hon)}</strong></div>` : ''}
      <span class="status ${p.status_atual || ''}">${(p.status_atual || 'cadastrado').replace(/_/g, ' ')}</span>
      <span class="card-chevron" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </div>`;
  }).join('');
  // ativa click pra abrir detalhe
  list.querySelectorAll('.card[data-id]').forEach(c => {
    c.addEventListener('click', () => abrirDetalhe(c.dataset.id));
  });
}

// ============================================================================
// Modal de detalhes do processo
// ============================================================================
function abrirDetalhe(id) {
  const p = (window._procs || []).find(x => String(x.id) === String(id));
  if (!p) { alert('Processo nao encontrado. Atualize a lista.'); return; }
  const valor = parseFloat(p.valor_estimado || 0) || 0;
  const pct = parseFloat(p.percentual_honorarios || 0);
  const hon = p.tipo === 'SUCUMBENCIA' ? valor : valor * (pct / 100);
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
    ['Valor estimado', `<strong>${fmtBRL(valor)}</strong>`],
    p.tipo === 'SUCUMBENCIA'
      ? ['Sucumbencia', `<strong>${fmtBRL(hon)}</strong>`]
      : ['Honorarios', `<strong>${fmtBRL(hon)}</strong> <span class="muted-inline">(${pct || 0}%)</span>`],
    ['Advogado responsavel', escapeHtml(p.advogado_responsavel || '-')],
    ['Status atual', `<span class="status ${p.status_atual || ''}">${escapeHtml(statusLabel)}</span>`],
    ['Cadastrado em', fmtDate(p.criado_em)],
    ['Atualizado em', fmtDate(p.atualizado_em)],
    ['ID interno', `<code class="tiny">${escapeHtml(p.id || '-')}</code>`]
  ];
  $('#modalBody').innerHTML = linhas.map(([k, v]) =>
    `<div class="detalhe-linha"><span class="detalhe-label">${k}</span><span class="detalhe-valor">${v}</span></div>`
  ).join('');
  $('#modalOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function fecharModal() {
  $('#modalOverlay').hidden = true;
  document.body.style.overflow = '';
}

$('#btnFecharModal').addEventListener('click', fecharModal);
$('#modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') fecharModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modalOverlay').hidden) fecharModal();
});

$('#filtroProcessos').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const fil = (window._procs || []).filter(p =>
    !q || (p.nome_cliente || '').toLowerCase().includes(q) || (p.cpf_ultimos4 || '').includes(q)
  );
  renderProcessos(fil);
});

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
  if (!/^\d{11}$/.test(cpfClean)) {
    showError(msg, 'CPF deve ter 11 digitos.');
    return;
  }
  const valor = unmaskValor(fd.get('valor_estimado'));
  if (!valor || valor <= 0) {
    showError(msg, 'Valor estimado invalido.');
    return;
  }
  const payload = {
    tipo: fd.get('tipo'),
    trf: parseInt(fd.get('trf'), 10),
    numero_processo: fd.get('numero_processo'),
    numero_rpv: fd.get('numero_rpv') || '',
    cpf: cpfClean,
    nome_cliente: fd.get('nome_cliente'),
    valor_estimado: valor,
    percentual_honorarios: parseFloat(fd.get('percentual_honorarios') || 0),
    advogado_responsavel: fd.get('advogado_responsavel')
  };
  setBtnLoading(btn, true);
  try {
    await api('POST', '/processos', payload);
    showSuccess(msg, `Cadastrado. Honorarios estimados: ${fmtBRL(valor * payload.percentual_honorarios / 100)}.`);
    e.target.reset();
    $('#inpPct').value = '35';
    $('#hintHonorarios').innerHTML = 'Honorarios estimados: <strong>R$ 0,00</strong>';
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
    let sumHon = 0, nHon = 0, sumSuc = 0, nSuc = 0;
    filtered.forEach(p => {
      const v = parseFloat(p.valor_estimado || 0) || 0;
      const pct = parseFloat(p.percentual_honorarios || 0);
      if (p.tipo === 'SUCUMBENCIA') { sumSuc += v; nSuc++; }
      else { sumHon += v * (pct / 100); nHon++; }
    });
    $('#sumHonorarios').textContent = fmtBRL(sumHon);
    $('#sumHonorariosDetail').textContent = `${nHon} processo${nHon !== 1 ? 's' : ''}`;
    $('#sumSucumbencias').textContent = fmtBRL(sumSuc);
    $('#sumSucumbenciasDetail').textContent = `${nSuc} processo${nSuc !== 1 ? 's' : ''}`;
    $('#sumTotal').textContent = fmtBRL(sumHon + sumSuc);
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
  const headers = ['Data cadastro', 'Tipo', 'TRF', 'Processo', 'RPV', 'Cliente', 'CPF', 'Advogado', 'Valor estimado', 'Percentual honorarios', 'Honorarios estimados', 'Status'];
  const rows = procs.map(p => {
    const v = parseFloat(p.valor_estimado || 0) || 0;
    const pct = parseFloat(p.percentual_honorarios || 0);
    const hon = p.tipo === 'SUCUMBENCIA' ? v : v * (pct / 100);
    return [
      fmtDate(p.criado_em),
      p.tipo || '',
      'TRF' + p.trf,
      p.numero_processo || '',
      p.numero_rpv || '',
      p.nome_cliente || '',
      p.cpf || ('***' + (p.cpf_ultimos4 || '')),
      p.advogado_responsavel || '',
      v.toFixed(2).replace('.', ','),
      p.tipo === 'SUCUMBENCIA' ? '-' : (pct + '%'),
      hon.toFixed(2).replace('.', ','),
      p.status_atual || ''
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
