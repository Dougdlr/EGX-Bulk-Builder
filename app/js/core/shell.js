'use strict';
/* ---------- PWA Install Prompt Controller ---------- */
(function initPWAInstaller() {
    const btn = $('egx-pwa-install-btn');
    if (!btn) return;
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        btn.classList.add('ring-2', 'ring-emerald-400/50');
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        btn.classList.add('hidden');
        showAppToast('EGX Bulk Builder instalado como aplicativo!', 'success');
    });

    btn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') deferredPrompt = null;
            return;
        }
        showAppToast(
            'No Chrome/Edge: clique no menu (⋮) → "Salvar e compartilhar" → "Instalar página como aplicativo" (ou crie um atalho na Área de Trabalho).',
            'info',
        );
    });
})();

/* ---------- Wallpaper (persistido em IndexedDB) ---------- */
(function initWallpaper() {
    const pick = $('egx-wallpaper-picker'),
        img = $('egx-wallpaper-img');
    if (!pick || !img) return;
    let url = null;
    const kv = (mode, fn) =>
        new Promise((ok, no) => {
            const o = indexedDB.open('egx', 1);
            o.onupgradeneeded = () => o.result.createObjectStore('kv');
            o.onerror = () => no(o.error);
            o.onsuccess = () => {
                const r = fn(o.result.transaction('kv', mode).objectStore('kv'));
                r.onsuccess = () => ok(r.result);
                r.onerror = () => no(r.error);
            };
        });
    const show = b => {
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(b);
        img.src = url;
        img.classList.remove('hidden');
    };
    try {
        kv('readonly', s => s.get('wallpaper'))
            .then(b => {
                if (b) show(b);
            })
            .catch(() => {});
    } catch (e) {
        /* sem IndexedDB */
    }
    pick.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        show(f);
        try {
            kv('readwrite', s => s.put(f, 'wallpaper')).catch(() => {});
        } catch (err) {
            /* ignora */
        }
        showAppToast('Imagem de fundo aplicada (salva neste navegador).', 'success');
    });
})();

/* ---------- Navigation Tabs (3 Modules) ---------- */
(function initTabs() {
    const tabs = [
        ['nav-tab-dashboard', 'egx-project-dashboard'],
        ['nav-tab-meta', 'module-meta-ads'],
        ['nav-tab-extractor', 'module-extractor'],
        ['nav-tab-bulk-editor', 'module-bulk-editor'],
        ['nav-tab-tasks', 'module-tasks'],
    ];
    window.EGXActivateTab = target =>
        tabs.forEach(([b2, m2]) => {
            const on = b2 === target;
            $(b2).setAttribute('aria-selected', on);
            $(m2).classList.toggle('hidden', !on);
            $(m2).classList.toggle('flex', on && m2 !== 'egx-project-dashboard');
            if (on && m2 === 'egx-project-dashboard') $(m2).classList.add('flex');
        });
    tabs.forEach(([b]) =>
        $(b).addEventListener('click', () => {
            window.EGXActivateTab(b);
        }),
    );
    document
        .querySelectorAll('[data-egx-dash-module]')
        .forEach(b => b.addEventListener('click', () => $(b.dataset.egxDashModule).click()));
})();
