// Service Worker — Taquería Cruz
const CACHE = 'taqueria-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/supabase.js',
  '/js/app.js',
  '/js/pedidos.js',
  '/js/nuevo-pedido.js',
  '/js/cocina.js',
  '/js/cobrar.js',
  '/js/corte.js',
  '/js/menu-admin.js',
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
  // Network first for API calls, cache first for assets
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
