/* EGX Bulk Builder — service worker
   Rede primeiro (sempre a versão mais nova), com cópia em cache para abrir sem internet.
   Só guarda arquivos do próprio app (mesma origem, dentro desta pasta). */
const CACHE = 'egx-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e =>
    e.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('egx-app-') && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim()),
    ),
);

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const scope = new URL(self.registration.scope);
    // Só o app (não mexe em CDN, nem em arquivos de projetos servidos pela mesma porta)
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
    e.respondWith(
        (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' }))
            .then(res => {
                if (res.ok && res.type === 'basic') {
                    const copy = res.clone();
                    // Guarda sem o ?v= para o offline achar o arquivo mesmo depois de trocar a versão
                    caches.open(CACHE).then(c => c.put(url.pathname, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() =>
                caches
                    .match(url.pathname)
                    .then(hit => hit || (req.mode === 'navigate' ? caches.match(scope.pathname + 'index.html') : undefined))
                    .then(hit => hit || Response.error()),
            ),
    );
});
