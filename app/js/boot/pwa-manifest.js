(function bootstrapPWA() {
    try {
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0B0F19"/><stop offset="100%" stop-color="#3b0764"/></linearGradient></defs><rect width="512" height="512" rx="96" fill="url(#g)"/><text x="256" y="165" font-family="Arial,sans-serif" font-weight="700" font-size="34" letter-spacing="16" fill="#cbd5e1" text-anchor="middle">GRUPO</text><text x="256" y="295" font-family="Arial,sans-serif" font-weight="900" font-size="148" fill="#ffffff" text-anchor="middle">EGX</text><text x="256" y="365" font-family="Arial,sans-serif" font-weight="700" font-size="28" letter-spacing="10" fill="#c084fc" text-anchor="middle">BULK BUILDER</text></svg>`;
        const iconUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg);
        const startUrl = location.protocol === 'http:' || location.protocol === 'https:' ? location.href : './';
        const manifestObj = {
            name: 'EGX Bulk Builder — Meta Ads',
            short_name: 'EGX Builder',
            description: 'Automação offline de planilhas Meta Ads, extrator de nomenclaturas e editor em lote.',
            start_url: startUrl,
            display: 'standalone',
            background_color: '#000000',
            theme_color: '#0B0F19',
            icons: [
                { src: iconUrl, sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
                { src: iconUrl, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
            ],
        };
        const manifestBlob = new Blob([JSON.stringify(manifestObj)], { type: 'application/manifest+json' });
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = URL.createObjectURL(manifestBlob);
        document.head.appendChild(link);

        if (
            'serviceWorker' in navigator &&
            (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ) {
            const swCode = `
                self.addEventListener('install', e => self.skipWaiting());
                self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
                self.addEventListener('fetch', e => {
                    if (e.request.method !== 'GET') return;
                    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
                });
            `;
            const swBlob = new Blob([swCode], { type: 'application/javascript' });
            navigator.serviceWorker.register(URL.createObjectURL(swBlob)).catch(() => {});
        }
    } catch (e) {
        /* Fallback silencioso em ambientes restritos */
    }
})();
