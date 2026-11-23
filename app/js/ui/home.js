'use strict';
/* ---------- Página inicial: saudação, relógio, avatar e cartões clicáveis ---------- */
(function initHome() {
    const byId = id => document.getElementById(id);
    const greetEl = byId('egx-home-greet'),
        nameEl = byId('egx-home-name'),
        profile = byId('egx-profile-label'),
        avatar = byId('egx-home-avatar'),
        clock = byId('egx-home-clock'),
        list = byId('egx-project-list');
    if (!greetEl || !profile) return;

    function greet() {
        const h = new Date().getHours();
        const g = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
        const raw = (profile.textContent || '').trim();
        const named = raw && !/^meu perfil$/i.test(raw);
        greetEl.textContent = named ? g + ', ' : g + '!';
        nameEl.textContent = named ? raw.split(/\s+/)[0] : '';
        if (avatar) {
            const ini = named
                ? raw
                      .split(/\s+/)
                      .slice(0, 2)
                      .map(w => w[0])
                      .join('')
                      .toUpperCase()
                : '👤';
            avatar.textContent = ini;
        }
    }
    function tick() {
        if (!clock) return;
        const d = new Date();
        clock.textContent =
            d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }) +
            ' · ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    new MutationObserver(greet).observe(profile, { childList: true, characterData: true, subtree: true });
    greet();
    tick();
    setInterval(() => {
        tick();
        greet();
    }, 30000);

    // O cartão inteiro abre o projeto (os botões ✎ e 🗑 continuam com a própria ação)
    list?.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const card = e.target.closest('.egx-project-card');
        card?.querySelector('[data-open]')?.click();
    });
})();
