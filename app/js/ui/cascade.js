/* ---------- V13.4: abertura em cachoeira ---------- */
(function initCascade() {
    const reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const MAX = 14,
        STEP = 48,
        DUR = 360;
    const visible = el => el && el.getClientRects().length > 0;
    const timers = new WeakMap();
    function cascade(items) {
        if (reduce.matches) return;
        const list = [...items].filter(visible).slice(0, MAX);
        if (!list.length) return;
        list.forEach((el, i) => {
            el.classList.remove('egx-fall');
            el.style.setProperty('--egx-i', i);
        });
        void document.body.offsetWidth;
        list.forEach(el => {
            el.classList.add('egx-fall');
            clearTimeout(timers.get(el));
            timers.set(
                el,
                setTimeout(() => el.classList.remove('egx-fall'), DUR + STEP * MAX + 80),
            );
        });
    }
    const q = (root, sels) => sels.flatMap(sel => [...root.querySelectorAll(sel)]);
    window.EGXCascade = cascade;

    // Abas
    const panels = {
        'nav-tab-dashboard': [
            'egx-project-dashboard',
            [':scope > div:first-child', ':scope > div:nth-child(2) > article', ':scope > div:nth-child(3) > section'],
        ],
        'nav-tab-meta': [
            'module-meta-ads',
            [':scope > .mc-hero', ':scope > main > section:not(.hidden)', ':scope > aside'],
        ],
        'nav-tab-extractor': [
            'module-extractor',
            [':scope > div:first-of-type', ':scope > section', ':scope > div.grid > div'],
        ],
        'nav-tab-bulk-editor': ['module-bulk-editor', [':scope > main > *:not(.hidden):not(input)']],
        'nav-tab-tasks': [
            'module-tasks',
            [':scope > div:first-child', ':scope > section', ':scope > .egx-td-grid > section'],
        ],
    };
    const activate = window.EGXActivateTab;
    if (typeof activate === 'function') {
        window.EGXActivateTab = target => {
            activate(target);
            const cfg = panels[target];
            const root = cfg && document.getElementById(cfg[0]);
            if (root) cascade(q(root, cfg[1]));
        };
    }

    // Central de projetos
    const launcher = document.getElementById('egx-launcher');
    const launcherItems = () =>
        launcher
            ? q(launcher, ['.egx-home-top', '.egx-home-hero > *', '.egx-home-projects', '.egx-home-side > *', '#egx-project-list > *'])
            : [];
    if (document.body.classList.contains('egx-launcher-active')) {
        launcher.dataset.cascaded = '1';
        cascade(launcherItems());
    }
    document.documentElement.classList.remove('egx-intro');
    new MutationObserver(() => {
        if (document.body.classList.contains('egx-launcher-active') && !launcher.dataset.cascaded) {
            launcher.dataset.cascaded = '1';
            cascade(launcherItems());
        }
        if (!document.body.classList.contains('egx-launcher-active')) delete launcher.dataset.cascaded;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Janelas que aparecem ao remover "hidden"
    function onReveal(id, items) {
        const el = document.getElementById(id);
        if (!el) return;
        let wasHidden = el.classList.contains('hidden');
        new MutationObserver(() => {
            const hidden = el.classList.contains('hidden');
            if (wasHidden && !hidden) cascade(items(el));
            wasHidden = hidden;
        }).observe(el, { attributes: true, attributeFilter: ['class'] });
    }
    onReveal('meta-step-1', el => q(el, [':scope > *']));
    onReveal('meta-step-2', el => q(el, [':scope > div > div:not(.overflow-x-auto)']));
    onReveal('be-import-preview', el => [el, ...q(el, ['#be-preview-content > *'])]);
    onReveal('be-workspace', el => q(el, [':scope > *']));

    // Painéis que abrem (details)
    [
        ['meta-name-builder', ':scope > div > *, :scope > div > div > *'],
        ['be-edit-details', '.be-edit-content > *:not(.be-edit-grid), .be-edit-grid > *'],
    ].forEach(([id, sel]) => {
        const d = document.getElementById(id);
        if (!d) return;
        d.addEventListener('toggle', () => {
            if (d.open) cascade(d.querySelectorAll(sel));
        });
    });

    // Editor de propriedades: campos caem ao abrir um item
    const insp = document.getElementById('be-inspector-content');
    if (insp)
        new MutationObserver(() => {
            if (insp.children.length)
                cascade(q(insp, ['.be-editor-head', '.be-editor-grid > *', '.be-editor-actions']));
        }).observe(insp, { childList: true });

    // Resultado da validação (só quando o usuário clica em validar)
    const vbtn = document.getElementById('be-btn-validate');
    if (vbtn)
        vbtn.addEventListener('click', () =>
            requestAnimationFrame(() => cascade(document.querySelectorAll('#be-validation-results > *'))),
        );
})();
