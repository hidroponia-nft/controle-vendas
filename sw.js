/* Service Worker do Controle de Vendas — estrategia "REDE PRIMEIRO" (network-first)
   COM LIMITE DE TEMPO (3s). Tenta a versao fresca na rede; se a rede demorar mais
   que 3s (conexao ruim), cai IMEDIATAMENTE no cache em vez de deixar o app travado
   esperando. Sem internet, usa direto o cache. Assim atualizacoes aparecem na hora
   quando ha rede boa, mas o app nunca "congela" numa conexao fraca. */

const CACHE = 'vendas-app-v14';
const REDE_TIMEOUT = 3000; // ms — acima disso, serve o cache pra nao travar
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
      // REDE PRIMEIRO, mas com LIMITE DE TEMPO: se a rede nao responder em
      // REDE_TIMEOUT ms, aborta e cai no cache — evita o app travar esperando.
      const fresh = await fetchComTimeout(req, REDE_TIMEOUT);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      // Rede lenta/abortada ou sem internet: usa a ultima versao guardada.
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

/* fetch com timeout: aborta a requisicao se passar de `ms` milissegundos.
   Rejeita a Promise (cai no catch acima, que serve o cache). */
function fetchComTimeout(req, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { cache: 'no-store', signal: ctrl.signal })
    .finally(() => clearTimeout(t));
}
