/* ---------- V13.5: tema, cores e papel de parede ---------- */
(function initAppearance() {
    const KEY = 'egx_theme_v1',
        root = document.documentElement;
    const $id = id => document.getElementById(id);
    const btn = $id('egx-appearance-btn'),
        panel = $id('egx-appearance-panel'),
        img = $id('egx-wallpaper-img');
    if (!btn || !panel) return;
    let st = { mode: 'egx', tint: '#8b5cf6', wall: 60, blur: 22 };
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
        syncWall();
    }

    // Abrir / fechar
    const open = () => {
        panel.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
        window.EGXCascade?.(panel.children);
    };
    const close = () => {
        panel.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', e => {
        e.stopPropagation();
        panel.classList.contains('hidden') ? open() : close();
    });
    document.addEventListener('click', e => {
        if (!panel.classList.contains('hidden') && !e.target.closest('#egx-appearance')) close();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
            close();
            btn.focus();
        }
    });

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
