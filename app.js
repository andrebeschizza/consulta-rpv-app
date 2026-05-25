// AB SEM CALOTE - app PWA v0.2
// Cliente leve. Tudo via fetch para os webhooks do n8n (W05 - API).

const API_BASE = 'https://n8n.aposentabrasil.net.br/webhook/abscalote';
const VAPID_PUBLIC = 'BN_LJCRZzyqlBGVeaaiLenhuxLnjwX6t-eU4GEi0wkXJwEfq4OSYiX47aoqjizkbmFKH3XZmXZr8EL-gTW4zEgM';
const TOKEN_KEY = 'abscalote_token';
const EMAIL_KEY = 'abscalote_email';

// ============================================================================
// Helpers DOM
// ============================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

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
  navigator.serviceWorker.register('service-worker.js')
    .catch(e => console.warn('SW falhou:', e));
}

async function pedirPermissaoPush() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    alert('Push nao suportado neste navegador.');
    return;
  }
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
  } catch (e) {
    console.error('Push falhou:', e);
  }
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ============================================================================
// API
// ============================================================================
const token = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token() && { Authorization: 'Bearer ' + token() })
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    setConnStatus(false, 'Sem internet');
    throw new Error('Sem conexao com o servidor. Verifique sua internet.');
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
// Login / Logout
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
  if ('Notification' in window && Notification.permission === 'default') {
    $('#btnNotif').hidden = false;
  }
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const view = document.querySelector('.tab.active')?.dataset.view;
  if (view === 'alertas') carregarAlertas();
  if (view === 'processos') carregarProcessos();
});

// ============================================================================
// Views / Tabs
// ============================================================================
function trocarView(nome) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === nome));
  $$('main section').forEach(s => s.hidden = s.id !== nome + 'View');
  if (nome === 'alertas') carregarAlertas();
  if (nome === 'processos') carregarProcessos();
}

$$('.tab').forEach(t => t.addEventListener('click', () => trocarView(t.dataset.view)));

// ============================================================================
// Estados visuais (loading / empty / error)
// ============================================================================
function renderSkeleton(container, n = 3) {
  container.innerHTML = Array(n).fill('<div class="skeleton"></div>').join('');
}
function renderEmpty(container, icon, title, desc) {
  container.innerHTML = `
    <div class="state">
      <div class="icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>`;
}
function renderError(container, msg, onRetry) {
  container.innerHTML = `
    <div class="state">
      <div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg></div>
      <h3>Nao foi possivel carregar</h3>
      <p>${msg}</p>
      <button class="retry" onclick="(${onRetry.toString()})()">Tentar novamente</button>
    </div>`;
}

// ============================================================================
// Alertas
// ============================================================================
async function carregarAlertas() {
  const list = $('#alertasList');
  const count = $('#alertasCount');
  renderSkeleton(list, 3);
  try {
    const alertas = await api('GET', '/alertas?status=ativo');
    const arr = Array.isArray(alertas) ? alertas : [];
    count.textContent = arr.filter(a => !a.visto_em).length || '';
    if (!arr.length) {
      renderEmpty(list,
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
        'Sem alertas',
        'Voce esta em dia. Os processos serao verificados a cada 72h.');
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
  return `
    <div class="card ${cls}">
      <div class="cliente">${a.nome_cliente || 'Cliente'} <small>CPF ***${a.cpf_ultimos4 || '----'}</small></div>
      <div class="meta"><strong>${a.numero_processo || '-'}</strong></div>
      <div class="meta">${a.valor_faixa || 'valor a confirmar'}</div>
      <span class="status ${a.status_canonico || ''}">${a.tipo || 'alerta'}</span>
    </div>`;
}

// ============================================================================
// Processos
// ============================================================================
async function carregarProcessos() {
  const list = $('#processosList');
  renderSkeleton(list, 4);
  try {
    const procs = await api('GET', '/processos');
    const arr = Array.isArray(procs) ? procs : [];
    window._procs = arr;
    if (!arr.length) {
      renderEmpty(list,
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>',
        'Nenhum processo',
        'Cadastre o primeiro processo na aba "Novo".');
      return;
    }
    renderProcessos(arr);
  } catch (e) {
    if (e.message === 'Sessao expirada') return;
    renderError(list, e.message, 'carregarProcessos');
  }
}

function renderProcessos(procs) {
  const list = $('#processosList');
  if (!procs.length) {
    list.innerHTML = '<div class="state"><p>Nenhum processo encontrado para a busca.</p></div>';
    return;
  }
  list.innerHTML = procs.map(p => `
    <div class="card">
      <div class="cliente">${p.nome_cliente || 'Cliente'} <small>CPF ***${p.cpf_ultimos4 || '----'}</small></div>
      <div class="meta"><strong>${p.numero_processo || '-'}</strong></div>
      <div class="meta">TRF${p.trf} - ${p.tipo} - ${p.valor_faixa || 'valor a confirmar'}</div>
      <div class="meta">Advogado: ${p.advogado_responsavel || '-'}</div>
      <span class="status ${p.status_atual || ''}">${(p.status_atual || 'cadastrado').replace('_', ' ')}</span>
    </div>`).join('');
}

$('#filtroProcessos').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const fil = (window._procs || []).filter(p =>
    !q || (p.nome_cliente || '').toLowerCase().includes(q) || (p.cpf_ultimos4 || '').includes(q)
  );
  renderProcessos(fil);
});

// ============================================================================
// Novo processo
// ============================================================================
$('#novoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const msg = $('#novoMsg');
  msg.hidden = true;
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  if (!/^\d{11}$/.test(payload.cpf || '')) {
    showError(msg, 'CPF deve ter exatamente 11 digitos.');
    return;
  }
  setBtnLoading(btn, true);
  try {
    await api('POST', '/processos', payload);
    showSuccess(msg, 'Processo cadastrado. CPF e valor foram criptografados.');
    e.target.reset();
    window._procs = null;
    setTimeout(() => trocarView('processos'), 1200);
  } catch (err) {
    showError(msg, err.message || 'Falha ao cadastrar.');
  } finally {
    setBtnLoading(btn, false);
  }
});

// ============================================================================
// Bootstrap
// ============================================================================
if (token()) hideLogin();
else showLogin();
