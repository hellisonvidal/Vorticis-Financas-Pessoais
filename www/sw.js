/* Service worker: permite usar o app sem internet (versão web/PWA). */
const CACHE = 'financas-v1.3.0';
const FILES = [
  './', './index.html', './manifest.webmanifest', './config.js', './version.js', './css/app.css',
  './js/util.js', './js/store.js', './js/sync.js', './js/finance.js', './js/debts.js', './js/openfinance.js', './js/updater.js', './js/charts.js', './js/importers.js', './js/reports.js', './js/sample.js',
  './js/ui.js', './js/app.js', './js/views/painel.js', './js/views/lancamentos.js', './js/views/contas.js', './js/views/cadastros.js',
  './js/views/importar.js', './js/views/relatorios.js', './js/views/dividas.js', './js/views/bancos.js', './js/views/config.js',
  './vendor/xlsx.full.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js', './vendor/pdf.min.js', './vendor/pdf.worker.min.js',
  './vendor/fonts/inter.woff2', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase e outros: direto na rede
  // rede primeiro (pega atualizações), cache se estiver offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
