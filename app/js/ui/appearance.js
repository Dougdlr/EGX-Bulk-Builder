/* ---------- V13.5: tema, cores e papel de parede ---------- */
(function initAppearance() {
    const KEY = 'egx_theme_v1',
        root = document.documentElement;
    const $id = id => document.getElementById(id);
    const btn = $id('egx-appearance-btn'),
        panel = $id('egx-appearance-panel'),
        img = $id('egx-wallpaper-img');
    if (!btn || !panel) return;
    // O painel fica no <body> para abrir tanto no app quanto na página inicial (onde o cabeçalho some)
    document.body.appendChild(panel);
    let st = { mode: 'egx', tint: '#8b5cf6', wall: 60, blur: 22, home: 'default', homeDim: 30 };
    try {
        st = Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {}
    const save = () => {
        try {
            localStorage.setItem(KEY, JSON.stringify(st));
        } catch (e) {}
    };

    function hasWall() {
        return !!img && !img.classList.contains('hidden') && img.naturalWidth > 0 && !!img.getAttribute('src');
    }
    function syncWall() {
        root.dataset.egxWall = hasWall() ? 'on' : 'off';
        $id('egx-wallpaper-remove').disabled = !hasWall();
    }
    function apply() {
        root.dataset.egxTheme = st.mode;
        root.style.setProperty('--egx-tint', st.tint);
        root.style.setProperty('--egx-wall-opacity', st.wall / 100);
        root.style.setProperty('--egx-glass-blur', st.blur + 'px');
        panel
            .querySelectorAll('[data-egx-theme]')
            .forEach(b => b.setAttribute('aria-pressed', b.dataset.egxTheme === st.mode));
        panel
            .querySelectorAll('[data-egx-tint]')
            .forEach(b => b.setAttribute('aria-pressed', b.dataset.egxTint === st.tint));
        $id('egx-wall-opacity').value = st.wall;
        $id('egx-glass-blur').value = st.blur;
        $id('egx-glass-blur-wrap').classList.toggle('hidden', st.mode === 'egx' || st.mode === 'solid');
        root.dataset.egxHome = st.home;
        root.style.setProperty('--egx-home-dim', st.homeDim / 100);
        panel.querySelectorAll('[data-egx-home]').forEach(b => b.setAttribute('aria-pressed', b.dataset.egxHome === st.home));
        $id('egx-home-dim').value = st.homeDim;
        syncWall();
    }

    // Abrir / fechar (botão do cabeçalho ou qualquer [data-egx-appearance-open])
    const triggers = () => [btn, ...document.querySelectorAll('[data-egx-appearance-open]')];
    let opener = btn;
    const open = (from = btn) => {
        opener = from && from.getClientRects().length ? from : btn;
        const r = opener.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 10) + 'px';
        panel.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
        panel.classList.remove('hidden');
        triggers().forEach(t => t.setAttribute('aria-expanded', String(t === opener)));
        window.EGXCascade?.(panel.children);
    };
    const close = () => {
        panel.classList.add('hidden');
        triggers().forEach(t => t.setAttribute('aria-expanded', 'false'));
    };
    const toggle = from => (panel.classList.contains('hidden') ? open(from) : close());
    document.addEventListener('click', e => {
        const t = e.target.closest('#egx-appearance-btn, [data-egx-appearance-open]');
        if (t) {
            e.stopPropagation();
            return toggle(t);
        }
        if (!panel.classList.contains('hidden') && !e.target.closest('#egx-appearance-panel')) close();
    });
    window.addEventListener('resize', () => !panel.classList.contains('hidden') && open(opener));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
            close();
            opener.focus();
        }
    });
    window.EGXAppearance = { open, close, toggle };

    // Fundo da página inicial: imagem padrão, imagem própria (IndexedDB) ou nenhuma
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
    let homeUrl = null;
    const showHome = blob => {
        if (homeUrl) URL.revokeObjectURL(homeUrl);
        homeUrl = blob ? URL.createObjectURL(blob) : null;
        root.style.setProperty('--egx-home-custom', homeUrl ? `url("${homeUrl}")` : 'none');
    };
    try {
        kv('readonly', s => s.get('homeWallpaper'))
            .then(b => b && showHome(b))
            .catch(() => {});
    } catch (e) {
        /* sem IndexedDB */
    }
    panel.querySelectorAll('[data-egx-home]').forEach(b =>
        b.addEventListener('click', () => {
            if (b.dataset.egxHome === 'custom' && !homeUrl) return $id('egx-home-picker').click();
            st.home = b.dataset.egxHome;
            apply();
            save();
        }),
    );
    $id('egx-home-picker').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        showHome(f);
        try {
            kv('readwrite', s => s.put(f, 'homeWallpaper')).catch(() => {});
        } catch (err) {
            /* ignora */
        }
        st.home = 'custom';
        apply();
        save();
        e.target.value = '';
        showAppToast('Imagem da página inicial aplicada.', 'success');
    });
    $id('egx-home-dim').addEventListener('input', e => {
        st.homeDim = +e.target.value;
        root.style.setProperty('--egx-home-dim', st.homeDim / 100);
    });
    $id('egx-home-dim').addEventListener('change', save);

    // Escolhas
    panel.querySelectorAll('[data-egx-theme]').forEach(b =>
        b.addEventListener('click', () => {
            st.mode = b.dataset.egxTheme;
            apply();
            save();
        }),
    );
    panel.querySelectorAll('[data-egx-tint]').forEach(b =>
        b.addEventListener('click', () => {
            st.tint = b.dataset.egxTint;
            apply();
            save();
        }),
    );
    $id('egx-wall-opacity').addEventListener('input', e => {
        st.wall = +e.target.value;
        root.style.setProperty('--egx-wall-opacity', st.wall / 100);
    });
    $id('egx-wall-opacity').addEventListener('change', save);
    $id('egx-glass-blur').addEventListener('input', e => {
        st.blur = +e.target.value;
        root.style.setProperty('--egx-glass-blur', st.blur + 'px');
    });
    $id('egx-glass-blur').addEventListener('change', save);

    // Papel de parede: ao escolher uma imagem no tema sólido, troca para o Padrão para ela aparecer
    $id('egx-wallpaper-picker').addEventListener('change', e => {
        if (e.target.files && e.target.files[0] && st.mode === 'solid') {
            st.mode = 'egx';
            apply();
            save();
        }
    });
    if (img) {
        img.addEventListener('load', syncWall);
        img.addEventListener('error', syncWall);
    }
    $id('egx-wallpaper-remove').addEventListener('click', () => {
        try {
            const o = indexedDB.open('egx', 1);
            o.onupgradeneeded = () => o.result.createObjectStore('kv');
            o.onsuccess = () => {
                try {
                    o.result.transaction('kv', 'readwrite').objectStore('kv').delete('wallpaper');
                } catch (err) {}
            };
        } catch (err) {}
        if (img) {
            img.dataset.t = '1';
            img.removeAttribute('src');
            img.classList.add('hidden');
        }
        syncWall();
        showAppToast('Imagem de fundo removida.', 'info');
    });

    apply();
})();
