// Service Worker — Taquería Cruz
const CACHE = 'taqueria-v27';
const ASSETS = [
  '/',
  '/index.html',
  '/cliente.html',
  '/css/app.css',
  '/js/error-logger.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/pedidos.js',
  '/js/nuevo-pedido.js',
  '/js/cocina.js',
  '/js/cobrar.js',
  '/js/corte.js',
  '/js/menu-admin.js',
  '/js/tareas.js',
  '/js/inventario.js',
  '/js/auditoria.js',
  '/js/equipo.js',
  '/js/negocio-admin.js',
  '/js/desempeno.js',
  '/js/cliente-app.js',
  '/css/cliente.css',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});

// Notificación tocada — enfocar o abrir la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir una nueva
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
