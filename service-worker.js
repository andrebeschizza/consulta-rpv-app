// Service Worker — AB SEM CALOTE v2
// Estrategia: network-first para HTML/JS/CSS/JSON (atualiza sempre que online),
//             cache-first para icones/imagens (raramente mudam).
// Cache offline fallback quando sem conexao.
//  - Push notifications
//  - Click handler abre app na tela do alerta

const CACHE = 'abscalote-v2';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Helper: pega URL e devolve estrategia
function isShellAsset(url) {
  return /\.(html|js|css|json)(\?|$)/.test(url) || url.endsWith('/');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Nao intercepta chamadas pra API (n8n)
  if (url.hostname.includes('n8n.aposentabrasil')) return;
  // Nao intercepta cross-origin nao-app
  if (url.origin !== self.location.origin) return;

  if (isShellAsset(url.pathname)) {
    // Network-first: tenta rede, fallback cache
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Atualiza cache em background com a versao fresca
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
    );
  } else {
    // Cache-first para icones/imagens
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      }))
    );
  }
});

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'AB SEM CALOTE', body: e.data?.text() || '' }; }

  const title = data.title || 'AB SEM CALOTE';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.data || {},
    requireInteraction: data.urgente === true,
    tag: data.alert_id || 'default'
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alertId = e.notification.data?.alert_id;
  const url = alertId ? `/?alerta=${alertId}` : '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const open = clients.find(c => c.url.includes('/') && 'focus' in c);
      if (open) {
        open.focus();
        open.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
