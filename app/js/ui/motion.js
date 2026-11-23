'use strict';
/* ---------- Movimento e interações da interface ----------
   - indicador deslizante sob a aba ativa
   - transição direcional entre seções (entra pela esquerda/direita)
   - altura da barra superior e do rodapé em variáveis CSS
   - brilho que segue o cursor nos cartões
   - contagem animada nos números do painel
   - Alt pressionado revela os números das abas / projetos */
(function initMotion() {
    const root = document.documentElement;
    const body = document.body;
    const reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const header = document.getElementById('egx-topbar');
    const nav = document.getElementById('egx-nav');
    const ink = nav && nav.querySelector('.egx-nav-ink');
    const tabs = nav ? [...nav.querySelectorAll('.tab-btn')] : [];

    /* Indicador da aba ativa */
    function moveInk(instant) {
        if (!ink) return;
        const on = tabs.find(t => t.getAttribute('aria-selected') === 'true');
        if (!on || !on.offsetWidth) return;
        if (instant) ink.style.transition = 'none';
        ink.style.width = on.offsetWidth + 'px';
        ink.style.transform = `translateX(${on.offsetLeft}px)`;
        ink.classList.add('is-ready');
        if (instant) {
            void ink.offsetWidth;
            ink.style.transition = '';
        }
        // Mantém a aba ativa visível quando o trilho rola (telas estreitas)
        const l = on.offsetLeft,
            r = l + on.offsetWidth;
        if (l < nav.scrollLeft || r > nav.scrollLeft + nav.clientWidth)
            nav.scrollTo({ left: l - 24, behavior: reduce.matches ? 'auto' : 'smooth' });
    }

    /* Alturas da barra superior e do rodapé (usadas no Editor e na barra lateral do Criador) */
    function syncHeights() {
        if (header) root.style.setProperty('--egx-header-h', header.offsetHeight + 'px');
        const kb = document.getElementById('egx-keybar');
        const shown =
            kb && getComputedStyle(kb).display !== 'none' && !body.classList.contains('egx-kb-collapsed');
        root.style.setProperty('--egx-keybar-h', shown ? kb.offsetHeight + 'px' : '0px');
    }
    window.EGXSyncLayout = () => {
        syncHeights();
        moveInk(true);
    };
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            syncHeights();
            moveInk(true);
        });
        if (header) ro.observe(header);
        if (nav) ro.observe(nav);
    }
    window.addEventListener('resize', syncHeights);
    document.fonts?.ready?.then(() => moveInk(true));

    window.addEventListener(
        'scroll',
        () => header && header.classList.toggle('is-scrolled', window.scrollY > 4),
        { passive: true },
    );

    /* Transição direcional entre seções */
    const order = tabs.map(t => t.id);
    let current = tabs.find(t => t.getAttribute('aria-selected') === 'true')?.id || order[0];
    const activate = window.EGXActivateTab;
    if (typeof activate === 'function') {
        window.EGXActivateTab = target => {
            const from = order.indexOf(current),
                to = order.indexOf(target);
            activate(target);
            moveInk(false);
            const panel = document.getElementById(document.getElementById(target)?.getAttribute('aria-controls'));
            if (panel && target !== current && !reduce.matches) {
                panel.style.setProperty('--egx-dir', to >= from ? 1 : -1);
                panel.classList.remove('egx-sec-in');
                void panel.offsetWidth;
                panel.classList.add('egx-sec-in');
                panel.addEventListener('animationend', () => panel.classList.remove('egx-sec-in'), { once: true });
            }
            if (target !== current) window.scrollTo({ top: 0, behavior: 'auto' });
            current = target;
            window.dispatchEvent(new CustomEvent('egx:section', { detail: { tab: target } }));
        };
    }
    // Quando a Central fecha, o trilho reaparece: reposiciona o indicador
    new MutationObserver(() => requestAnimationFrame(() => window.EGXSyncLayout())).observe(body, {
        attributes: true,
        attributeFilter: ['class'],
    });
    requestAnimationFrame(() => window.EGXSyncLayout());

    /* Brilho que segue o cursor */
    const SPOT = '.egx-dash-card, .egx-launcher-card, .egx-td-card';
    document.addEventListener(
        'pointermove',
        e => {
            const card = e.target.closest && e.target.closest(SPOT);
            if (!card) return;
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', e.clientX - r.left + 'px');
            card.style.setProperty('--my', e.clientY - r.top + 'px');
        },
        { passive: true },
    );

    /* Contagem animada nos números do painel */
    const animating = new WeakSet();
    const last = new WeakMap();
    const written = new WeakMap();
    const pending = new WeakMap();
    function onStatChange(el) {
        if (animating.has(el)) {
            // valor novo chegou no meio da animação: aplica quando terminar
            const t = el.textContent.trim();
            if (t !== written.get(el)) pending.set(el, t);
            return;
        }
        countUp(el);
    }
    function countUp(el) {
        const txt = el.textContent.trim();
        if (!/^\d+$/.test(txt)) {
            last.set(el, NaN);
            return;
        }
        const to = Number(txt);
        const from = last.has(el) && !Number.isNaN(last.get(el)) ? last.get(el) : 0;
        last.set(el, to);
        if (reduce.matches || from === to || !el.getClientRects().length) return;
        animating.add(el);
        el.classList.add('is-counting');
        const t0 = performance.now(),
            dur = Math.min(900, 300 + Math.abs(to - from) * 25);
        const step = now => {
            const k = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            const v = String(Math.round(from + (to - from) * e));
            written.set(el, v);
            el.textContent = v;
            if (k < 1) requestAnimationFrame(step);
            else {
                written.set(el, String(to));
                el.textContent = String(to);
                el.classList.remove('is-counting');
                // libera depois que o observer processar a última troca de texto
                setTimeout(() => {
                    animating.delete(el);
                    if (pending.has(el)) {
                        const p = pending.get(el);
                        pending.delete(el);
                        el.textContent = p;
                    }
                }, 0);
            }
        };
        requestAnimationFrame(step);
    }
    document.querySelectorAll('.egx-dash-stat').forEach(el => {
        last.set(el, 0);
        new MutationObserver(() => onStatChange(el)).observe(el, { childList: true, characterData: true, subtree: true });
    });
    // Ao voltar para o painel, os números contam de novo a partir de zero
    window.addEventListener('egx:section', e => {
        if (e.detail.tab !== 'nav-tab-dashboard') return;
        document.querySelectorAll('.egx-dash-stat').forEach(el => {
            last.set(el, 0);
            const v = el.textContent.trim();
            if (/^\d+$/.test(v) && v !== '0') {
                el.textContent = '0';
                el.textContent = v;
            }
        });
    });

    /* Alt segurado revela os números das abas */
    // No app instalado a tecla das seções é o Ctrl (ver shortcuts.js); no navegador, o Alt.
    let altTimer = null;
    const isSecMod = key => key === (body.classList.contains('egx-standalone') ? 'Control' : 'Alt');
    document.addEventListener('keydown', e => {
        if (isSecMod(e.key) && !e.repeat) {
            clearTimeout(altTimer);
            altTimer = setTimeout(() => body.classList.add('egx-alt-held'), 350);
        } else if (!isSecMod(e.key)) {
            // outra tecla junto (ex.: Ctrl+C): não é para mostrar as dicas
            if (!/^[0-9]$/.test(e.key) && !/^Digit/.test(e.code)) altOff();
        }
    });
    const altOff = () => {
        clearTimeout(altTimer);
        body.classList.remove('egx-alt-held');
    };
    document.addEventListener('keyup', e => {
        if (isSecMod(e.key)) {
            if (e.key === 'Alt') e.preventDefault(); // evita que o Alt solto foque o menu do navegador
            altOff();
        }
    });
    window.addEventListener('blur', altOff);

    /* Números 1–9 nos cartões da Central de projetos */
    const plist = document.getElementById('egx-project-list');
    if (plist) {
        const number = () =>
            [...plist.children].forEach((c, i) => {
                if (i < 9) c.dataset.key = String(i + 1);
                else delete c.dataset.key;
            });
        new MutationObserver(number).observe(plist, { childList: true });
        number();
    }

    /* Realce rápido em um elemento acionado por atalho */
    window.EGXFlash = el => {
        if (!el || reduce.matches) return;
        el.classList.remove('egx-flash');
        void el.offsetWidth;
        el.classList.add('egx-flash');
        setTimeout(() => el.classList.remove('egx-flash'), 600);
    };
})();
