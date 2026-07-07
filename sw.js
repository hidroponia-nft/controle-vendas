/* Service Worker do Controle de Vendas — estrategia "cache primeiro, atualiza por tras"
   (stale-while-revalidate). O app ABRE NA HORA usando a versao ja salva no celular e,
   ao mesmo tempo, baixa a versao nova por tras para a proxima abertura. Assim fica
   rapido para abrir e continua atualizando sozinho (sem cache teimoso no iOS). */

const CACHE = 'vendas-app-v11';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
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
    const cached = await cache.match(req);

    // Baixa a versao nova por tras e guarda para a proxima abertura.
    const fetching = fetch(req, { cache: 'no-store' })
      .then((fresh) => { cache.put(req, fresh.clone()); return fresh; })
      .catch(() => null);

    // Se ja tem no cache, responde NA HORA (nao espera a internet).
    if (cached) { e.waitUntil(fetching); return cached; }

    // Primeira vez / sem cache: espera a rede.
    const fresh = await fetching;
    if (fresh) return fresh;

    // Sem rede e sem cache: tenta a home como ultimo recurso.
    if (req.mode === 'navigate') {
      const home = await cache.match('./index.html') || await cache.match('./');
      if (home) return home;
    }
    return Response.error();
  })());
});
