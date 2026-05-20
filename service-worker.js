// Service Worker — AB SEM CALOTE
// Roles:
//  1. Cache shell offline (HTML, JS, CSS, manifest)
//  2. Receber push notifications e mostrar
//  3. Lidar com click na notificacao -> abrir app na tela correspondente

const CACHE = 'abscalote-v1';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
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
