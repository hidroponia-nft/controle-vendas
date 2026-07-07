/* Service Worker do Controle de Vendas — estrategia "REDE PRIMEIRO" (network-first).
   Sempre busca a versao fresca na rede; so cai no cache quando esta SEM INTERNET.
   Assim toda atualizacao publicada aparece NA HORA — sem cache teimoso segurando
   versao velha (era o que acontecia com a estrategia "cache primeiro" anterior). */

const CACHE = 'vendas-app-v12';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  // Guarda o basico pra funcionar offline, e ja assume o controle na hora.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Apaga caches de versoes antigas.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ignora Firebase/CDNs externos

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // REDE PRIMEIRO: sempre tenta a versao fresca e atualiza o cache.
      const fresh = await fetch(req, { cache: 'no-store' });
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      // Sem internet: usa a ultima versao guardada.
      const cached = await cache.match(req);
      if (cached) return cached;
      // Navegacao sem cache: tenta a home como ultimo recurso.
      if (req.mode === 'navigate') {
        const home = (await cache.match('./index.html')) || (await cache.match('./'));
        if (home) return home;
      }
      return Response.error();
    }
  })());
});
