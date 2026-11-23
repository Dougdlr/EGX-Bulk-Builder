'use strict';
/* ---------- Criador: barra lateral em seções com status ----------
   Cada seção mostra um resumo do que foi preenchido e quantos campos
   obrigatórios faltam. Clicar no aviso abre a seção e foca o campo. */
(function initCreatorSidebar() {
    const byId = id => document.getElementById(id);
    const aside = byId('meta-sidebar');
    if (!aside) return;
    const val = id => (byId(id)?.value || '').trim();
    const digits = v => String(v || '').replace(/\D/g, '');
    const money = v => {
        const n = parseFloat(v);
        return isNaN(n) ? '' : 'R$ ' + n.toFixed(2).replace('.', ',');
    };
    const isImage = () => byId('meta-sidebar-mode-badge')?.classList.contains('on-purple');

    // Para cada seção: campos obrigatórios que faltam [id, rótulo] e o resumo
    const SECTIONS = {
        campaign: () => {
            const miss = [];
            if (!val('meta-camp-name')) miss.push(['meta-camp-name', 'nome']);
            if (!(parseFloat(val('meta-budget')) > 0)) miss.push(['meta-budget', 'orçamento']);
            if (val('meta-strategy') === 'BID' && !(parseFloat(val('meta-bid-amount')) > 0))
                miss.push(['meta-bid-amount', 'bid']);
            const strat = val('meta-strategy');
            const digest = [strat, money(val('meta-budget')) && money(val('meta-budget')) + '/dia', strat === 'BID' && val('meta-bid-amount') && 'bid ' + money(val('meta-bid-amount'))]
                .filter(Boolean)
                .join(' · ');
            return { miss, digest };
        },
        audience: () => {
            const max = val('meta-age-max');
            const ages = `${val('meta-age-min')}–${max === '65' ? '65+' : max}`;
            const digest = isImage()
                ? `${ages} · ${val('meta-img-adset-name') || 'IMGs'} · ${val('meta-img-adset-gender')}`
                : `${ages} · gênero por anúncio`;
            const miss = Number(val('meta-age-min')) > Number(max) ? [['meta-age-min', 'idade mín. > máx.']] : [];
            return { miss, digest };
        },
        destination: () => {
            const link = val('meta-link');
            const miss = [];
            if (!link) miss.push(['meta-link', 'link']);
            else if (!/^https?:\/\/\S+\.\S+/i.test(link)) miss.push(['meta-link', 'link inválido']);
            let host = '';
            try {
                host = link ? new URL(link).hostname.replace(/^www\./, '') : '';
            } catch (e) {
                host = '';
            }
            const utm = val('meta-url-tags') ? 'UTM ok' : 'sem UTM';
            return { miss, digest: [host, utm].filter(Boolean).join(' · ') };
        },
        account: () => {
            const f = [
                ['meta-page-id', 'Página'],
                ['meta-ig-id', 'Instagram'],
                ['meta-pixel-id', 'Pixel'],
                ['meta-beneficiary', 'beneficiário'],
            ];
            const miss = f.filter(([id]) => !digits(val(id)));
            return { miss, digest: `${f.length - miss.length}/${f.length} IDs` };
        },
    };

    // Seções: a barra da campanha (topo) + as da coluna Oferta
    const root = byId('module-meta-ads') || aside;
    const secs = [...root.querySelectorAll('[data-sec]')];
    const PREF = 'egx_creator_sections_v2';
    let pref = {};
    try {
        pref = JSON.parse(localStorage.getItem(PREF) || '{}');
    } catch (e) {
        pref = {};
    }
    // Primeira vez (sem preferência): seções completas começam recolhidas — só o resumo aparece
    const firstPass = new Set(secs.filter(d => d.tagName === 'DETAILS' && pref[d.dataset.sec] === undefined));
    secs.forEach(d => {
        if (d.tagName !== 'DETAILS') return;
        if (pref[d.dataset.sec] === false) d.open = false;
        if (pref[d.dataset.sec] === true) d.open = true;
        d.addEventListener('toggle', () => {
            if (d.dataset.auto) return void delete d.dataset.auto;
            firstPass.delete(d); // o usuário escolheu: não mexe mais sozinho
            pref[d.dataset.sec] = d.open;
            try {
                localStorage.setItem(PREF, JSON.stringify(pref));
            } catch (e) {
                /* ignora */
            }
        });
    });

    let lastMiss = [];
    function update() {
        let done = 0;
        lastMiss = [];
        secs.forEach(d => {
            const { miss, digest } = SECTIONS[d.dataset.sec]();
            const st = d.querySelector('[data-state]');
            d.querySelector('[data-digest]').textContent = digest;
            d.classList.toggle('is-done', !miss.length);
            d.classList.toggle('is-pending', !!miss.length);
            if (miss.length) {
                st.textContent = miss.length === 1 ? miss[0][1] : `${miss.length} pendentes`;
                st.title = 'Falta: ' + miss.map(m => m[1]).join(', ') + ' — clique para preencher';
                st.dataset.go = miss[0][0];
                lastMiss.push(...miss.map(m => ({ sec: d, id: m[0] })));
            } else {
                done++;
                st.textContent = '✓';
                st.title = 'Seção completa';
                delete st.dataset.go;
            }
            // Campos obrigatórios vazios recebem uma marca discreta
            d.querySelectorAll('.mc-field').forEach(f => f.classList.remove('is-missing'));
            miss.forEach(([id]) => byId(id)?.closest('.mc-field')?.classList.add('is-missing'));
        });
        const total = secs.length;
        byId('mc-progress-bar').style.width = (done / total) * 100 + '%';
        byId('mc-progress-text').textContent =
            done === total ? 'Tudo pronto para gerar a planilha' : `${done} de ${total} partes completas`;
        aside.classList.toggle('is-complete', done === total);
        syncStrategy();
    }
    // Ao abrir/carregar (nunca enquanto digita): recolhe o que já está completo, se o usuário
    // ainda não escolheu abrir/fechar aquela seção
    function autoCollapse() {
        update();
        firstPass.forEach(d => {
            if (d.classList.contains('is-done') && d.open) {
                d.dataset.auto = '1';
                d.open = false;
            }
        });
    }

    /* Tipo CBO / ABO / BID em botões (o <select id="meta-strategy"> continua sendo a fonte) */
    const strat = byId('meta-strategy');
    const segBtns = [...root.querySelectorAll('[data-strategy]')];
    function syncStrategy() {
        const v = strat?.value;
        segBtns.forEach(b => {
            const on = b.dataset.strategy === v;
            b.classList.toggle('on', on);
            b.setAttribute('aria-checked', String(on));
        });
        const scope = byId('mc-budget-scope');
        if (scope) scope.textContent = v === 'ABO' ? 'em cada conjunto' : 'na campanha';
    }
    segBtns.forEach(b =>
        b.addEventListener('click', () => {
            if (!strat || strat.value === b.dataset.strategy) return;
            strat.value = b.dataset.strategy;
            strat.dispatchEvent(new Event('input', { bubbles: true }));
            strat.dispatchEvent(new Event('change', { bubbles: true }));
            syncStrategy();
            window.EGXFlash?.(b);
        }),
    );

    /* Montador de nome como janelinha: fecha ao clicar fora ou com Esc */
    const builder = byId('meta-name-builder');
    document.addEventListener('click', e => {
        if (builder?.open && !e.target.closest('#meta-name-builder')) builder.open = false;
    });
    builder?.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            builder.open = false;
            builder.querySelector('summary')?.focus();
        }
    });
    byId('nb-apply')?.addEventListener('click', () => setTimeout(() => (builder.open = false), 80));

    /* Barra da campanha compacta ao rolar — sem mexer no layout:
       quando ela encolhe, a diferença de altura vira margem embaixo dela, então nada
       abaixo se move (sem salto de rolagem, sem tremor). A coluna Oferta é reposicionada
       uma vez por troca (com transição), não a cada quadro. */
    const hero = root.querySelector('.mc-hero');
    const docEl = document.documentElement;
    let compact = false,
        fullH = 0;
    function measureHero() {
        if (!hero || !hero.offsetParent) return;
        const cur = hero.offsetHeight;
        if (!compact) fullH = cur; // altura cheia só é medida com a barra aberta
        root.style.setProperty('--mc-hero-delta', compact ? Math.max(0, fullH - cur) + 'px' : '0px');
        docEl.style.setProperty('--mc-hero-cur', cur + 'px');
    }
    function setCompact(on) {
        if (on === compact) return;
        if (!compact) measureHero(); // guarda a altura cheia antes de encolher
        compact = on;
        root.classList.toggle('mc-scrolled', on);
        measureHero(); // mesma passada: a margem compensa antes de o navegador desenhar
    }
    window.addEventListener(
        'scroll',
        () => {
            if (!hero?.offsetParent) return; // aba do Criador fechada
            // folga entre ligar e desligar evita alternar perto do limite
            setCompact(compact ? window.scrollY > 24 : window.scrollY > 90);
        },
        { passive: true },
    );
    // Mudanças reais de tamanho (largura da janela, campo de lance aparecendo…)
    let rzT = 0;
    const remeasure = () => {
        clearTimeout(rzT);
        rzT = setTimeout(() => {
            if (compact) {
                // mede a altura cheia de novo sem deixar o usuário ver a troca
                root.classList.remove('mc-scrolled');
                compact = false;
                measureHero();
                compact = true;
                root.classList.add('mc-scrolled');
            }
            measureHero();
        }, 120);
    };
    window.addEventListener('resize', remeasure);
    hero?.addEventListener('click', remeasure); // ex.: BID mostra o campo de lance
    hero?.addEventListener('transitionend', () => !compact && measureHero());
    if (hero && window.ResizeObserver)
        new ResizeObserver(() => {
            if (!compact) measureHero(); // ignora o encolhimento causado pelo próprio modo compacto
        }).observe(hero);
    window.addEventListener('egx:section', e => e.detail?.tab === 'nav-tab-meta' && setTimeout(measureHero, 450));

    function go(sec, id) {
        if (sec && sec.tagName === 'DETAILS') sec.open = true;
        const el = byId(id);
        if (!el) return;
        // Campo dentro do construtor de nome fechado: abre também
        el.closest('details:not(.mc-sec)')?.setAttribute('open', '');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
        window.EGXFlash?.(el);
    }
    root.addEventListener('click', e => {
        const st = e.target.closest('[data-state][data-go]');
        if (!st) return;
        e.preventDefault(); // não recolhe a seção
        go(st.closest('[data-sec]'), st.dataset.go);
    });

    let t = 0;
    const schedule = () => {
        clearTimeout(t);
        t = setTimeout(update, 60);
    };
    root.addEventListener('input', schedule);
    root.addEventListener('change', schedule);
    // Troca de modo, presets e restauração mudam valores sem digitação
    new MutationObserver(schedule).observe(byId('meta-sidebar-mode-badge'), { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', e => e.target.closest?.('#module-meta-ads') && schedule());
    window.addEventListener('egx:project-loaded', () => setTimeout(autoCollapse, 250));
    window.addEventListener('egx:section', e => e.detail?.tab === 'nav-tab-meta' && update());
    update();
    setTimeout(autoCollapse, 700);

    window.EGXCreatorSidebar = {
        refresh: update,
        nextPending: () => {
            update();
            const m = lastMiss[0];
            if (m) go(m.sec, m.id);
            else showAppToast('Nenhum campo obrigatório pendente na estrutura.', 'success');
        },
    };
})();
