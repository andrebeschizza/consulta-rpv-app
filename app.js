// AB SEM CALOTE — app PWA
// Cliente leve. Tudo via fetch para os webhooks do n8n (W05 - API).

const API_BASE = window.AB_API_BASE || 'https://n8n.aposentabrasil.net.br/webhook/abscalote';
const VAPID_PUBLIC = 'BN_LJCRZzyqlBGVeaaiLenhuxLnjwX6t-eU4GEi0wkXJwEfq4OSYiX47aoqjizkbmFKH3XZmXZr8EL-gTW4zEgM';

// ============================================================================
// Service worker + push
// ============================================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(console.error);
}

const btnNotif = document.getElementById('btnNotif');

async function pedirPermissaoPush() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    alert('Push nao suportado neste navegador.');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
  });
  await api('POST', '/push/subscribe', sub);
  btnNotif.hidden = true;
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

(async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') btnNotif.hidden = false;
  btnNotif?.addEventListener('click', pedirPermissaoPush);
})();

// ============================================================================
// Auth simples (token guardado em localStorage)
// ============================================================================
const TOKEN_KEY = 'abscalote_token';
const token = () => localStorage.getItem(TOKEN_KEY);

async function api(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token() && { Authorization: 'Bearer ' + token() })
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error('Nao autorizado');
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function showLogin() {
  document.querySelectorAll('main section').forEach(s => s.hidden = true);
  document.getElementById('loginView').hidden = false;
  document.querySelector('nav.tabs').style.display = 'none';
}

function hideLogin() {
  document.getElementById('loginView').hidden = true;
  document.querySelector('nav.tabs').style.display = 'flex';
  trocarView('alertas');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const errEl = document.getElementById('loginErr');
  errEl.hidden = true;
  try {
    const r = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), senha: fd.get('senha') })
    });
    if (!r.ok) throw new Error('credenciais invalidas');
    const { token: t } = await r.json();
    localStorage.setItem(TOKEN_KEY, t);
    hideLogin();
    carregarAlertas();
  } catch (err) {
    errEl.textContent = 'E-mail ou senha incorretos.';
    errEl.hidden = false;
  }
});

// ============================================================================
// Views (tabs)
// ============================================================================
function trocarView(nome) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === nome));
  document.querySelectorAll('main section').forEach(s => {
    s.hidden = !s.id.startsWith(nome);
  });
  if (nome === 'alertas') carregarAlertas();
  if (nome === 'processos') carregarProcessos();
}

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => trocarView(t.dataset.view));
});

// ============================================================================
// Alertas
// ============================================================================
async function carregarAlertas() {
  const list = document.getElementById('alertasList');
  const count = document.getElementById('alertasCount');
  list.innerHTML = '<p class="loading">Carregando...</p>';
  try {
    const alertas = await api('GET', '/alertas?status=ativo');
    count.textContent = alertas.filter(a => !a.visto_em).length || '';
    if (!alertas.length) {
      list.innerHTML = '<p class="loading">Sem alertas no momento.</p>';
      return;
    }
    list.innerHTML = alertas.map(renderAlerta).join('');
  } catch (e) {
    list.innerHTML = '<p class="error">Erro ao carregar.</p>';
  }
}

function renderAlerta(a) {
  return `
    <div class="card ${a.tipo === 'depositado' ? 'depositado' : 'iminente'}">
      <div class="cliente">${a.nome_cliente} <small>***${a.cpf_ultimos4}</small></div>
      <div class="meta">${a.numero_processo} · ${a.valor_faixa || 'valor a confirmar'}</div>
      <div class="meta">${a.banco || 'banco a confirmar'} · Ag ${a.agencia || '-'} · Conta ${a.conta || '-'}</div>
      <span class="status ${a.status_canonico}">${a.tipo}</span>
    </div>
  `;
}

// ============================================================================
// Processos
// ============================================================================
async function carregarProcessos() {
  const list = document.getElementById('processosList');
  list.innerHTML = '<p class="loading">Carregando...</p>';
  try {
    const procs = await api('GET', '/processos');
    window._procs = procs;
    renderProcessos(procs);
  } catch (e) {
    list.innerHTML = '<p class="error">Erro ao carregar.</p>';
  }
}

function renderProcessos(procs) {
  const list = document.getElementById('processosList');
  if (!procs.length) { list.innerHTML = '<p class="loading">Nenhum processo cadastrado.</p>'; return; }
  list.innerHTML = procs.map(p => `
    <div class="card">
      <div class="cliente">${p.nome_cliente} <small>***${p.cpf_ultimos4}</small></div>
      <div class="meta">${p.numero_processo} · TRF${p.trf} · ${p.tipo}</div>
      <div class="meta">${p.advogado_responsavel} · ${p.valor_faixa || ''}</div>
      <span class="status ${p.status_atual}">${p.status_atual}</span>
    </div>
  `).join('');
}

document.getElementById('filtroProcessos').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const fil = (window._procs || []).filter(p =>
    !q || p.nome_cliente.toLowerCase().includes(q) || (p.cpf_ultimos4 || '').includes(q)
  );
  renderProcessos(fil);
});

// ============================================================================
// Novo processo
// ============================================================================
document.getElementById('novoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  const msg = document.getElementById('novoMsg');
  msg.hidden = true;
  try {
    await api('POST', '/processos', payload);
    msg.textContent = 'Processo cadastrado. CPF e valor foram criptografados.';
    msg.className = 'success';
    msg.hidden = false;
    e.target.reset();
    window._procs = null; // forca recarregar
  } catch (err) {
    msg.textContent = 'Erro ao cadastrar.';
    msg.className = 'error';
    msg.hidden = false;
  }
});

// ============================================================================
// Bootstrap
// ============================================================================
if (token()) {
  hideLogin();
  carregarAlertas();
} else {
  showLogin();
}
