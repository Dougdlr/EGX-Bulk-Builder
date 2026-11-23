'use strict';
/* =====================================================================
   Atalhos de teclado do EGX
   Um único registro alimenta três coisas, sempre em sincronia:
     1. o tratamento das teclas
     2. a barra de atalhos no rodapé (muda conforme a seção/etapa)
     3. a paleta de comandos (Ctrl K) e a folha de atalhos (?)
   Para adicionar um atalho: inclua um item em SHORTCUTS.
   ===================================================================== */
(function initShortcuts() {
    const byId = id => document.getElementById(id);
    const body = document.body;
    const typing = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const isShown = el => !!el && !el.hidden && !el.classList.contains('hidden') && el.getClientRects().length > 0;
    const flash = el => window.EGXFlash && window.EGXFlash(el);
    const reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const escapeHtml = v =>
        String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    /* ---------- Ações básicas ---------- */
    function press(id) {
        const el = typeof id === 'string' ? byId(id) : id;
        if (!el || el.disabled) return false;
        if (isShown(el)) {
            el.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
            flash(el);
        }
        el.click();
        return true;
    }
    function focusField(id) {
        const el = byId(id);
        if (!el) return false;
        el.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
        el.focus({ preventScroll: true });
        if (el.select && el.value) el.select();
        flash(el);
        return true;
    }
    const disabled = id => {
        const el = byId(id);
        return !el || el.disabled;
    };
    // Teclas que o Editor de planilhas já trata: a barra só repassa o evento
    function sendNative(key, opts = {}) {
        const target = byId('bx-tbody') || document;
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
    }

    /* App instalado (janela própria): o Alt abre o menu da janela e "engole" Alt+número,
       mas Ctrl+número chega à página (não há abas do navegador). No navegador é o contrário:
       Ctrl+número troca a aba do Chrome. Os dois funcionam; a tela mostra o que vale aqui. */
    const standalone = (() => {
        try {
            return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
        } catch (e) {
            return false;
        }
    })();
    const SEC_MOD = standalone ? 'Ctrl' : 'Alt';
    body.classList.toggle('egx-standalone', standalone);
    document.querySelectorAll('.tab-btn[title]').forEach(b => (b.title = b.title.replace(/\((Alt|Ctrl)\+/, `(${SEC_MOD}+`)));
    document.querySelectorAll('.egx-dash-shortcut .egx-kbd, .egx-home-tips .egx-kbd').forEach(k => {
        k.textContent = k.textContent.replace(/^(Alt|Ctrl)(?= ?[1-5])/, SEC_MOD);
    });

    /* ---------- Seções ---------- */
    const SECTIONS = [
        { tab: 'nav-tab-dashboard', name: 'Visão geral', ico: '⌂' },
        { tab: 'nav-tab-meta', name: 'Criar campanhas', ico: '📊' },
        { tab: 'nav-tab-extractor', name: 'Organizar criativos', ico: '🧹' },
        { tab: 'nav-tab-bulk-editor', name: 'Editar planilha', ico: '🗂️' },
        { tab: 'nav-tab-tasks', name: 'Tarefas do dia', ico: '📝' },
    ];
    const inLauncher = () => body.classList.contains('egx-launcher-active');
    const activeTab = () => SECTIONS.findIndex(s => byId(s.tab)?.getAttribute('aria-selected') === 'true');
    function goSection(i) {
        const s = SECTIONS[(i + SECTIONS.length) % SECTIONS.length];
        if (inLauncher() || !s) return;
        byId(s.tab).click();
        byId(s.tab).focus({ preventScroll: true });
    }

    /* Contexto atual (seção + etapa) */
    const CTX = {
        launcher: { name: 'Central de projetos', ico: '▦' },
        dashboard: { name: 'Visão geral', ico: '⌂' },
        meta: { name: 'Criar campanhas · Entrada', ico: '📊' },
        meta2: { name: 'Criar campanhas · Conferência', ico: '📊' },
        extractor: { name: 'Organizar criativos', ico: '🧹' },
        'bulk-empty': { name: 'Editar planilha · Importar', ico: '🗂️' },
        bulk: { name: 'Editar planilha', ico: '🗂️' },
        tasks: { name: 'Tarefas do dia', ico: '📝' },
    };
    function context() {
        if (inLauncher()) return 'launcher';
        switch (SECTIONS[activeTab()]?.tab) {
            case 'nav-tab-meta':
                return byId('meta-step-2')?.classList.contains('hidden') ? 'meta' : 'meta2';
            case 'nav-tab-extractor':
                return 'extractor';
            case 'nav-tab-bulk-editor':
                return byId('bx-app')?.classList.contains('hidden') ? 'bulk-empty' : 'bulk';
            case 'nav-tab-tasks':
                return 'tasks';
            default:
                return 'dashboard';
        }
    }
    const hasSelection = () => !!byId('bx-selbar') && !byId('bx-selbar').hidden;

    /* ---------- Registro ----------
       ctx:     contextos onde vale ('app' = qualquer seção fora da Central, '*' = todos)
       combo:   teclas ('ctrl+enter', 'alt+1', '/', 'f2'…); pode ser lista
       show:    texto das teclas na tela (quando difere do combo)
       native:  a tecla já é tratada pelo módulo; aqui só aparece e pisca
       typing:  vale também com o cursor num campo de texto
       bar:     false = só na paleta e na ajuda;  'global' = lado direito da barra
       visible: some da barra quando retorna false;  enabled: fica apagado quando false */
    const SHORTCUTS = [
        // Gerais
        {
            id: 'sections', ctx: 'app', combo: ['alt+1', 'alt+2', 'alt+3', 'alt+4', 'alt+5', 'ctrl+1', 'ctrl+2', 'ctrl+3', 'ctrl+4', 'ctrl+5'],
            show: [SEC_MOD, '1–5'], label: 'Seções', help: standalone ? 'Ir para a seção 1 a 5 (app instalado: Ctrl; no navegador: Alt)' : 'Ir para a seção 1 a 5 (no app instalado: Ctrl 1–5)', ico: '⇆', typing: true, bar: 'global', palette: false,
            run: e => (e ? goSection(Number(evKey(e)) - 1) : openPalette('')),
        },
        { id: 'prev', ctx: 'app', combo: 'ctrl+arrowleft', label: 'Seção anterior', ico: '←', bar: false, run: () => goSection(activeTab() - 1) },
        { id: 'next', ctx: 'app', combo: 'ctrl+arrowright', label: 'Próxima seção', ico: '→', bar: false, run: () => goSection(activeTab() + 1) },
        { id: 'launcher', ctx: 'app', combo: 'alt+0', label: 'Central de projetos', ico: '▦', typing: true, bar: false, run: () => press('egx-return-launcher') },
        { id: 'palette', ctx: '*', combo: 'ctrl+k', label: 'Comandos', help: 'Paleta de comandos: buscar e executar qualquer ação', ico: '⌕', typing: true, bar: 'global', palette: false, run: () => openPalette('') },
        { id: 'save', ctx: 'app', combo: 'ctrl+s', label: 'Salvar projeto agora', ico: '💾', typing: true, bar: false, run: () => window.EGXWorkspace?.save() },
        { id: 'help', ctx: '*', combo: '?', label: 'Ajuda', help: 'Mostrar todos os atalhos', ico: '?', bar: 'global', run: () => openHelp() },
        { id: 'togglebar', ctx: '*', combo: 'ctrl+/', label: 'Mostrar/ocultar barra de atalhos', ico: '⌨', typing: true, bar: false, run: () => toggleBar() },

        // Central de projetos
        { id: 'l-new', ctx: 'launcher', combo: 'n', label: 'Novo projeto', ico: '＋', run: () => focusField('egx-project-name') },
        {
            id: 'l-open', ctx: 'launcher', combo: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], show: ['1–9'], label: 'Abrir projeto', ico: '📁', palette: false,
            enabled: () => !!document.querySelector('#egx-project-list [data-open]'),
            run: e => {
                const n = e ? Number(evKey(e)) - 1 : 0;
                const btn = document.querySelectorAll('#egx-project-list [data-open]')[n];
                if (btn) flash(btn.closest('.egx-project-card')), btn.click();
            },
        },
        { id: 'l-enter', ctx: 'launcher', combo: 'e', label: 'Entrar sem projeto', ico: '↪', run: () => press('egx-launch-enter') },
        { id: 'l-folder', ctx: 'launcher', combo: 'w', label: 'Pasta do workspace', ico: '🗂️', run: () => press('egx-workspace-select') },
        { id: 'l-theme', ctx: 'launcher', combo: 't', label: 'Temas', ico: '🎨', run: () => window.EGXAppearance?.toggle(document.querySelector('[data-egx-appearance-open]')) },

        // Visão geral
        { id: 'd-search', ctx: 'dashboard', combo: '/', label: 'Buscar no projeto', ico: '⌕', run: () => focusField('egx-dash-search') },
        { id: 'd-task', ctx: 'dashboard', combo: 'n', label: 'Nova tarefa', ico: '📝', run: () => { goSection(4); requestAnimationFrame(() => focusField('td-text')); } },
        { id: 'd-refresh', ctx: 'dashboard', combo: 'r', label: 'Atualizar painel', ico: '⟳', run: () => press('egx-dash-refresh') },
        { id: 'd-backup', ctx: 'dashboard', combo: 'b', label: 'Criar backup', ico: '🛟', run: () => press('egx-dash-backup-now') },

        // Criar campanhas — entrada
        { id: 'm-process', ctx: 'meta', combo: 'ctrl+enter', label: 'Processar lista', ico: '⚡', typing: true, run: e => { if (e?.target?.id !== 'meta-raw-textarea') press('meta-btn-process'); } },
        { id: 'm-paste', ctx: 'meta', combo: '/', label: 'Colar lista', ico: '📋', run: () => focusField('meta-raw-textarea') },
        { id: 'm-prefix', ctx: 'meta', combo: 'p', label: 'Prefixos', ico: '🏷️', run: () => focusField('egx-filter-prefix-input') },
        { id: 'm-builder', ctx: 'meta', combo: 'b', label: 'Construtor de nome', ico: '🏗️', run: () => { const d = byId('meta-name-builder'); d.open = !d.open; flash(d); if (d.open) focusField('nb-bm'); } },
        { id: 'm-name', ctx: ['meta', 'meta2'], combo: 'c', label: 'Nome da campanha', ico: '✎', bar: false, run: () => focusField('meta-camp-name') },

        // Criar campanhas — modo (vale nas duas etapas)
        { id: 'm-mode', ctx: ['meta', 'meta2'], combo: 'm', label: 'Catálogo ⇄ Imagem', ico: '⇄', run: () => press(byId('meta-btn-mode-image').classList.contains('on-purple') ? 'meta-btn-mode-catalog' : 'meta-btn-mode-image') },

        // Criar campanhas — conferência
        { id: 'm-variants', ctx: 'meta2', combo: 'v', label: 'Variações CBO/ABO/BID', ico: '⧉', bar: false, run: () => press('meta-btn-variants') },
        { id: 'm-dedup', ctx: 'meta2', combo: 'r', label: 'Remover repetidos', ico: '🧹', bar: false, run: () => {
            const b = document.querySelector('#meta-chk-issues [data-go="fix:dedup"]');
            if (b) b.click();
            else showAppToast('Não há anúncios repetidos.', 'info');
        } },
        { id: 'm-editor', ctx: 'meta2', combo: 'ctrl+shift+e', label: 'Revisar no Editor', ico: '🗂️', typing: true, run: () => press('meta-btn-to-editor') },
        { id: 'm-export', ctx: 'meta2', combo: 'ctrl+e', label: 'Exportar .xlsx', ico: '📥', typing: true, run: () => press('meta-btn-export') },
        { id: 'm-pending', ctx: ['meta', 'meta2'], combo: 'alt+p', label: 'Ir ao próximo campo pendente', ico: '⚠', typing: true, bar: false, run: () => window.EGXCreatorSidebar?.nextPending() },
        { id: 'm-filter', ctx: 'meta2', combo: '/', label: 'Filtrar nomes', ico: '⌕', run: () => focusField('meta-filter') },
        { id: 'm-add', ctx: 'meta2', combo: 'a', label: 'Adicionar anúncio', ico: '＋', run: () => press('meta-btn-add-row') },
        { id: 'm-texts', ctx: 'meta2', combo: 't', label: 'Editar textos', ico: '✏️', enabled: () => !disabled('meta-edit-texts'), run: () => press('meta-edit-texts') },
        { id: 'm-undo', ctx: 'meta2', combo: 'ctrl+z', label: 'Desfazer', ico: '↶', enabled: () => !disabled('meta-undo'), run: () => press('meta-undo') },
        { id: 'm-sort', ctx: 'meta2', combo: 'o', label: 'Ordenar', ico: '↕', run: () => press('meta-sort') },
        { id: 'm-suffix', ctx: 'meta2', combo: 's', label: 'Sufixo', ico: '✚', bar: false, run: () => focusField('meta-suffix') },
        { id: 'm-back', ctx: 'meta2', combo: 'backspace', label: 'Voltar à lista', ico: '←', run: () => press('meta-btn-back') },

        // Organizar criativos
        { id: 'x-run', ctx: 'extractor', combo: 'ctrl+enter', label: 'Extrair e ordenar', ico: '✨', typing: true, run: () => press('ext-btn-run') },
        { id: 'x-input', ctx: 'extractor', combo: '/', label: 'Colar lista', ico: '📋', run: () => focusField('ext-raw-input') },
        { id: 'x-copy', ctx: 'extractor', combo: 'c', label: 'Copiar resultado', ico: '⧉', run: () => press('ext-btn-copy') },
        { id: 'x-send', ctx: 'extractor', combo: 'ctrl+shift+enter', label: 'Enviar ao Criador', ico: '📊', typing: true, run: () => press('ext-btn-to-creator') },
        { id: 'x-detect', ctx: 'extractor', combo: 'd', label: 'Detectar prefixos', ico: '🔎', run: () => press('ext-prefix-detect') },
        { id: 'x-prefix', ctx: 'extractor', combo: 'p', label: 'Prefixos', ico: '🏷️', bar: false, run: () => focusField('ext-prefix-input') },
        { id: 'x-clear', ctx: 'extractor', combo: 'x', label: 'Limpar', ico: '⌫', run: () => press('ext-btn-clear') },

        // Editar planilha — sem planilha
        { id: 'b-open', ctx: 'bulk-empty', combo: 'ctrl+o', label: 'Abrir arquivo', ico: '📂', typing: true, run: () => press('be-btn-pick') },
        { id: 'b-history', ctx: 'bulk-empty', combo: 'h', label: 'Abrir do histórico', ico: '🕘', run: () => press('bx-open-history') },
        { id: 'b-template', ctx: 'bulk-empty', combo: 't', label: 'Começar de template', ico: '⬚', run: () => press('bx-new-from-template') },

        // Editar planilha — planilha aberta
        { id: 'b-undo', ctx: 'bulk', combo: 'ctrl+z', label: 'Desfazer', ico: '↶', native: true, enabled: () => !disabled('be-btn-undo'), run: () => press('be-btn-undo') },
        { id: 'b-redo', ctx: 'bulk', combo: ['ctrl+y', 'ctrl+shift+z'], label: 'Refazer', ico: '↷', native: true, enabled: () => !disabled('be-btn-redo'), run: () => press('be-btn-redo') },
        {
            id: 'b-level', ctx: 'bulk', combo: ['1', '2', '3'], show: ['1', '2', '3'], label: 'Nível', help: 'Campanhas · Conjuntos · Anúncios', ico: '☰', palette: false,
            run: e => {
                const lv = ['campaign', 'adset', 'ad'][e ? Number(evKey(e)) - 1 : 0];
                press(document.querySelector(`.bx-tab[data-level="${lv}"]`));
            },
        },
        { id: 'b-lv-c', ctx: 'bulk', label: 'Ver campanhas', ico: '☰', bar: false, help: false, run: () => press(document.querySelector('.bx-tab[data-level="campaign"]')) },
        { id: 'b-lv-s', ctx: 'bulk', label: 'Ver conjuntos', ico: '☰', bar: false, help: false, run: () => press(document.querySelector('.bx-tab[data-level="adset"]')) },
        { id: 'b-lv-a', ctx: 'bulk', label: 'Ver anúncios', ico: '☰', bar: false, help: false, run: () => press(document.querySelector('.bx-tab[data-level="ad"]')) },
        { id: 'b-search', ctx: 'bulk', combo: '/', label: 'Buscar', ico: '⌕', run: () => focusField('bx-q') },
        { id: 'b-tree', ctx: 'bulk', combo: 'f', label: 'Filtrar árvore', ico: '🌳', bar: false, run: () => focusField('bx-tree-search') },
        { id: 'b-selall', ctx: 'bulk', combo: 'ctrl+a', label: 'Selecionar tudo', ico: '☑', native: true, visible: () => !hasSelection(), run: () => sendNative('a', { ctrlKey: true }) },
        { id: 'b-rename', ctx: 'bulk', combo: 'f2', label: 'Renomear', ico: '✎', native: true, run: () => (hasSelection() ? press(document.querySelector('#bx-selbar [data-act="rename"]')) : sendNative('F2')) },
        { id: 'b-dup', ctx: 'bulk', combo: 'ctrl+d', label: 'Duplicar', ico: '⧉', native: true, visible: hasSelection, run: () => sendNative('d', { ctrlKey: true }) },
        { id: 'b-del', ctx: 'bulk', combo: 'delete', label: 'Excluir', ico: '🗑', native: true, visible: hasSelection, run: () => sendNative('Delete') },
        { id: 'b-esc', ctx: 'bulk', combo: 'escape', label: 'Limpar seleção', ico: '✕', native: true, visible: hasSelection, run: () => sendNative('Escape') },
        { id: 'b-problems', ctx: 'bulk', combo: 'p', label: 'Problemas', ico: '🛡️', run: () => press('bx-problems-btn') },
        { id: 'b-changes', ctx: 'bulk', combo: 'c', label: 'Alterações', ico: '✎', bar: false, run: () => press('bx-changes-btn') },
        { id: 'b-expand', ctx: 'bulk', combo: 'plus', show: ['+'], label: 'Expandir árvore', ico: '⊞', bar: false, run: () => press('bx-tree-expand') },
        { id: 'b-collapse', ctx: 'bulk', combo: '-', label: 'Recolher árvore', ico: '⊟', bar: false, run: () => press('bx-tree-collapse') },
        { id: 'b-export', ctx: 'bulk', combo: 'ctrl+e', label: 'Exportar', ico: '📥', typing: true, run: () => press('be-btn-export') },

        // Tarefas
        { id: 't-new', ctx: 'tasks', combo: ['n', '/'], show: ['N'], label: 'Nova tarefa', ico: '＋', run: () => focusField('td-text') },
        { id: 't-prev', ctx: 'tasks', combo: 'arrowleft', label: 'Dia anterior', ico: '‹', repeat: true, run: () => press('td-prev') },
        { id: 't-next', ctx: 'tasks', combo: 'arrowright', label: 'Próximo dia', ico: '›', repeat: true, run: () => press('td-next') },
        { id: 't-today', ctx: 'tasks', combo: 'h', label: 'Hoje', ico: '◉', run: () => press('td-today') },
        { id: 't-urgent', ctx: 'tasks', combo: 'u', label: 'Marcar urgente', ico: '⚑', run: () => { const c = byId('td-urg'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); flash(c.closest('label')); } },
        { id: 't-roll', ctx: 'tasks', combo: 'l', label: 'Levar pendentes', ico: '→', run: () => press('td-roll') },
    ];

    /* ---------- Teclas ---------- */
    const KEYNAMES = {
        ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', enter: 'Enter', escape: 'Esc', delete: 'Del', backspace: '⌫',
        arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', plus: '+', f2: 'F2',
    };
    const isSymbol = k => k.length === 1 && !/[a-z0-9]/.test(k);
    function parse(c) {
        const parts = c.split('+');
        const key = parts.pop();
        return { ctrl: parts.includes('ctrl'), shift: parts.includes('shift'), alt: parts.includes('alt'), key };
    }
    // Tecla pelo caractere digitado (para símbolos como / ? + -)
    function charKey(e) {
        const k = e.key || '';
        return k === '+' ? 'plus' : k.toLowerCase();
    }
    // Tecla física (para letras e números): com Alt/AltGr o caractere muda (ex.: AltGr+2 = ²)
    function evKey(e) {
        const k = e.key || '';
        if (k.length === 1 && !e.altKey) return k === '+' ? 'plus' : k.toLowerCase();
        if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
        if (/^(Digit|Numpad)\d$/.test(e.code)) return e.code.slice(-1);
        return k === '+' ? 'plus' : k.toLowerCase();
    }
    function matches(sc, e) {
        const ctrl = e.ctrlKey || e.metaKey;
        return [].concat(sc.combo || []).some(c => {
            const p = parse(c);
            const k = isSymbol(p.key) || p.key === 'plus' ? charKey(e) : evKey(e);
            if (p.key !== k) return false;
            const altGr = e.ctrlKey && e.altKey; // Alt direito no Windows = Ctrl+Alt
            if (isSymbol(p.key) || p.key === 'plus') {
                if (altGr && !p.ctrl) return true; // símbolos via AltGr (teclado ABNT2)
                return ctrl === p.ctrl && e.altKey === p.alt;
            }
            if (p.alt && !p.ctrl && altGr) return e.shiftKey === p.shift; // Alt+n também pelo Alt direito
            return ctrl === p.ctrl && e.altKey === p.alt && e.shiftKey === p.shift;
        });
    }
    const keysOf = sc => sc.show || (sc.combo ? comboKeys([].concat(sc.combo)[0]) : []);
    function comboKeys(c) {
        const p = parse(c);
        return [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', KEYNAMES[p.key] || p.key.toUpperCase()].filter(Boolean);
    }
    const kbd = keys => keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('');
    const inCtx = (sc, ctx) => {
        const c = sc.ctx;
        if (c === '*') return true;
        if (c === 'app') return ctx !== 'launcher';
        return [].concat(c).includes(ctx);
    };
    const isVisible = sc => !sc.visible || sc.visible();
    const isEnabled = sc => !sc.enabled || sc.enabled();

    function blocked() {
        return (
            !!document.querySelector('.egx-dialog-overlay') ||
            (byId('meta-text-modal') && !byId('meta-text-modal').classList.contains('hidden'))
        );
    }

    /* Modo "Alt solto": tocar e soltar o Alt (sem outra tecla) e depois apertar 0–5,
       como nas dicas de tecla do Office. Fica ativo por 3 s. */
    let altDown = false,
        altOther = false,
        tipTimer = 0;
    const tipsOn = () => body.classList.contains('egx-keytips');
    function setTips(on) {
        clearTimeout(tipTimer);
        body.classList.toggle('egx-keytips', on);
        if (on) tipTimer = setTimeout(() => setTips(false), 3000);
    }
    window.addEventListener(
        'keyup',
        e => {
            if (e.key !== 'Alt') return;
            const tap = altDown && !altOther && !e.ctrlKey && !e.shiftKey && !e.metaKey;
            altDown = false;
            if (tap && !inLauncher() && !blocked() && !typing(e.target)) {
                e.preventDefault();
                setTips(!tipsOn());
            }
        },
        true,
    );
    window.addEventListener('blur', () => {
        altDown = false;
        setTips(false);
    });

    // Fase de captura: roda antes de qualquer outro tratamento de tecla da página
    window.addEventListener('keydown', e => {
        if (e.key === 'Alt') {
            if (!e.repeat) {
                altDown = true;
                altOther = false;
            }
            return;
        }
        if (altDown) altOther = true;
        if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta') return;
        if (tipsOn()) {
            setTips(false);
            const n = /^(Digit|Numpad)[0-5]$/.test(e.code) ? Number(e.code.slice(-1)) : /^[0-5]$/.test(e.key) ? Number(e.key) : -1;
            if (n >= 0 && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                if (n === 0) press('egx-return-launcher');
                else {
                    hit('sections');
                    goSection(n - 1);
                }
                return;
            }
            if (e.key === 'Escape') return e.preventDefault();
        }
        if (blocked()) return;
        const ctx = context();
        const inField = typing(e.target);
        // Contexto atual primeiro, depois os gerais
        const list = SHORTCUTS.filter(sc => sc.combo && inCtx(sc, ctx)).sort(
            (a, b) => (a.ctx === '*' || a.ctx === 'app') - (b.ctx === '*' || b.ctx === 'app'),
        );
        for (const sc of list) {
            if (!matches(sc, e)) continue;
            if (inField && !sc.typing && !sc.native) continue;
            if (sc.native) {
                // O módulo já tratou (ou vai tratar); só confirma visualmente
                if (!inField || /^(ctrl\+|f2)/.test([].concat(sc.combo)[0])) hit(sc.id);
                return;
            }
            if (e.repeat && !sc.repeat) {
                e.preventDefault();
                return;
            }
            if (!isEnabled(sc)) return;
            e.preventDefault();
            hit(sc.id);
            sc.run(e);
            return;
        }
    }, true);

    /* ---------- Barra de atalhos ---------- */
    const bar = byId('egx-keybar');
    const barList = byId('egx-kb-list');
    const barGlobal = byId('egx-kb-global');
    const barCtx = byId('egx-kb-ctx');
    const PREF = 'egx_keybar_v1';
    let lastSig = '';

    function item(sc, i) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'egx-kb-item' + (isEnabled(sc) ? '' : ' is-off');
        b.dataset.sc = sc.id;
        b.style.setProperty('--i', i);
        b.title = (sc.help && sc.help !== false ? sc.help : sc.label) + ' — ' + keysOf(sc).join(' ');
        b.innerHTML = `<span class="egx-kb-keys">${kbd(keysOf(sc))}</span><span class="egx-kb-label">${escapeHtml(sc.label)}</span>`;
        b.addEventListener('click', () => {
            if (!isEnabled(sc)) return;
            hit(sc.id);
            sc.run(null);
        });
        return b;
    }
    function renderBar(force) {
        if (!bar) return;
        const ctx = context();
        const local = SHORTCUTS.filter(sc => sc.combo && inCtx(sc, ctx) && !sc.bar && sc.bar !== false && isVisible(sc));
        const global = SHORTCUTS.filter(sc => sc.bar === 'global' && inCtx(sc, ctx));
        const sig = ctx + '|' + local.map(s => s.id).join(',');
        if (sig === lastSig && !force) {
            // Só atualiza o estado (habilitado/apagado)
            barList.querySelectorAll('.egx-kb-item').forEach(b => {
                const sc = SHORTCUTS.find(s => s.id === b.dataset.sc);
                if (sc) b.classList.toggle('is-off', !isEnabled(sc));
            });
            return;
        }
        const ctxChanged = lastSig.split('|')[0] !== ctx;
        lastSig = sig;
        barCtx.querySelector('span').textContent = CTX[ctx].name;
        if (ctxChanged) {
            barCtx.classList.remove('is-swap');
            void barCtx.offsetWidth;
            barCtx.classList.add('is-swap');
        }
        barList.replaceChildren(...local.map(item));
        barGlobal.replaceChildren(...global.map((sc, i) => item(sc, i)));
    }
    let raf = 0;
    const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            renderBar(false);
        });
    };
    function hit(id) {
        const b = bar && bar.querySelector(`[data-sc="${id}"]`);
        if (!b) return;
        b.classList.remove('is-hit');
        void b.offsetWidth;
        b.classList.add('is-hit');
        setTimeout(() => b.classList.remove('is-hit'), 520);
    }
    function setCollapsed(on) {
        body.classList.toggle('egx-kb-collapsed', on);
        try {
            localStorage.setItem(PREF, JSON.stringify({ collapsed: on }));
        } catch (e) {
            /* sem armazenamento */
        }
        setTimeout(() => window.EGXSyncLayout && window.EGXSyncLayout(), 0);
    }
    function toggleBar() {
        setCollapsed(!body.classList.contains('egx-kb-collapsed'));
    }
    try {
        if (JSON.parse(localStorage.getItem(PREF) || '{}').collapsed) body.classList.add('egx-kb-collapsed');
    } catch (e) {
        /* ignora */
    }
    byId('egx-kb-hide')?.addEventListener('click', () => setCollapsed(true));
    byId('egx-kb-pill')?.addEventListener('click', () => setCollapsed(false));

    // O que muda o contexto: seção, Central, etapa do Criador, planilha aberta, seleção no Editor
    const watch = [
        [body, ['class']],
        [byId('meta-step-2'), ['class']],
        [byId('bx-app'), ['class']],
        [byId('bx-selbar'), ['hidden']],
        [byId('be-btn-undo'), ['disabled']],
        [byId('be-btn-redo'), ['disabled']],
        [byId('meta-undo'), ['disabled']],
        [byId('meta-edit-texts'), ['disabled']],
        [byId('egx-project-list'), null],
    ];
    watch.forEach(([el, attrs]) => {
        if (!el) return;
        new MutationObserver(schedule).observe(el, attrs ? { attributes: true, attributeFilter: attrs } : { childList: true });
    });
    window.addEventListener('egx:section', schedule);
    document.addEventListener('click', schedule, true);
    renderBar(true);
    requestAnimationFrame(() => window.EGXSyncLayout && window.EGXSyncLayout());

    /* ---------- Sobreposições (paleta e ajuda) ---------- */
    let overlay = null;
    let returnFocus = null;
    function openOverlay(build) {
        closeOverlay(true);
        returnFocus = document.activeElement;
        overlay = document.createElement('div');
        overlay.className = 'egx-dialog-overlay egx-pal-overlay';
        overlay.addEventListener('mousedown', e => {
            if (e.target === overlay) closeOverlay();
        });
        build(overlay);
        document.body.appendChild(overlay);
        return overlay;
    }
    function closeOverlay(instant) {
        if (!overlay) return;
        const o = overlay;
        overlay = null;
        if (instant || reduce.matches) o.remove();
        else {
            o.classList.add('is-closing');
            setTimeout(() => o.remove(), 140);
        }
        if (!instant && returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    }

    /* Paleta de comandos */
    function normalize(s) {
        return String(s)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    }
    function score(text, q) {
        if (!q) return 1;
        const t = normalize(text);
        const i = t.indexOf(q);
        if (i === 0) return 100;
        if (i > 0) return 80 - Math.min(i, 40) + (t[i - 1] === ' ' ? 15 : 0);
        // sequência de letras na ordem
        let pos = -1;
        for (const ch of q) {
            pos = t.indexOf(ch, pos + 1);
            if (pos < 0) return 0;
        }
        return 10;
    }
    function highlight(text, q) {
        if (!q) return escapeHtml(text);
        const i = normalize(text).indexOf(q);
        if (i < 0) return escapeHtml(text);
        return escapeHtml(text.slice(0, i)) + '<mark>' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' + escapeHtml(text.slice(i + q.length));
    }
    function paletteItems() {
        const ctx = context();
        const out = [];
        if (ctx === 'launcher') {
            document.querySelectorAll('#egx-project-list .egx-project-card').forEach((card, i) => {
                const name = card.querySelector('h3')?.textContent || 'Projeto';
                out.push({ group: 'Projetos', ico: '📁', label: 'Abrir ' + name, keys: i < 9 ? [String(i + 1)] : [], run: () => card.querySelector('[data-open]')?.click() });
            });
        } else {
            SECTIONS.forEach((s, i) =>
                out.push({ group: 'Ir para', ico: s.ico, label: s.name, keys: [SEC_MOD, String(i + 1)], run: () => goSection(i) }),
            );
            out.push({ group: 'Ir para', ico: '▦', label: 'Central de projetos', keys: ['Alt', '0'], run: () => press('egx-return-launcher') });
        }
        SHORTCUTS.filter(sc => inCtx(sc, ctx) && sc.palette !== false && sc.id !== 'launcher' && isVisible(sc) && isEnabled(sc)).forEach(sc =>
            out.push({
                group: sc.ctx === '*' || sc.ctx === 'app' ? 'Geral' : CTX[ctx].name,
                ico: sc.ico || '•',
                label: sc.label,
                keys: sc.combo ? keysOf(sc) : [],
                run: () => sc.run(null),
            }),
        );
        if (ctx !== 'launcher') {
            out.push({ group: 'Geral', ico: '🎨', label: 'Aparência (tema e cores)', keys: [], run: () => press('egx-appearance-btn') });
            out.push({ group: 'Geral', ico: '📲', label: 'Instalar como aplicativo', keys: [], run: () => press('egx-pwa-install-btn') });
        }
        return out;
    }
    function openPalette(initial) {
        if (overlay && overlay.querySelector('.egx-pal-search')) return closeOverlay();
        const all = paletteItems();
        let shown = [];
        let active = 0;
        openOverlay(o => {
            o.innerHTML = `<div class="egx-pal" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
                <div class="egx-pal-search"><span aria-hidden="true">⌕</span><input type="text" placeholder="Digite um comando, seção ou o que procurar no projeto…" aria-label="Comando" autocomplete="off" spellcheck="false"></div>
                <div class="egx-pal-list" role="listbox"></div>
                <div class="egx-pal-foot"><span><kbd>↑↓</kbd>navegar</span><span><kbd>Enter</kbd>executar</span><span><kbd>Esc</kbd>fechar</span><span style="margin-left:auto">${escapeHtml(CTX[context()].name)}</span></div>
            </div>`;
        });
        const input = overlay.querySelector('input');
        const list = overlay.querySelector('.egx-pal-list');
        function render() {
            const raw = input.value.trim();
            const q = normalize(raw);
            shown = all
                .map((it, i) => ({ it, s: score(it.label, q) + (q ? 0 : -i / 1000) }))
                .filter(x => x.s > 0)
                .sort((a, b) => (q ? b.s - a.s : 0))
                .map(x => x.it);
            if (raw && context() !== 'launcher' && window.EGXWorkspace?.activeProject?.())
                shown.push({
                    group: 'Buscar',
                    ico: '⌕',
                    label: `Buscar “${raw}” no projeto`,
                    keys: [],
                    run: () => {
                        goSection(0);
                        const s = byId('egx-dash-search');
                        s.value = raw;
                        s.dispatchEvent(new Event('input', { bubbles: true }));
                        requestAnimationFrame(() => focusField('egx-dash-search'));
                    },
                });
            active = Math.min(active, Math.max(0, shown.length - 1));
            if (!shown.length) {
                list.innerHTML = '<div class="egx-pal-empty">Nada encontrado.</div>';
                return;
            }
            let group = '';
            const frag = document.createDocumentFragment();
            shown.forEach((it, i) => {
                // Agrupa só quando não há busca (com busca, ordena por relevância)
                if (!q && it.group !== group) {
                    group = it.group;
                    const g = document.createElement('div');
                    g.className = 'egx-pal-group';
                    g.textContent = group;
                    frag.appendChild(g);
                }
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'egx-pal-item' + (i === active ? ' is-active' : '');
                b.setAttribute('role', 'option');
                b.dataset.i = i;
                b.innerHTML = `<span class="ico">${it.ico}</span><span class="lbl">${highlight(it.label, q)}${q ? `<small>${escapeHtml(it.group)}</small>` : ''}</span><span class="egx-pal-keys">${kbd(it.keys)}</span>`;
                b.addEventListener('mousemove', () => {
                    if (active !== i) {
                        active = i;
                        paint();
                    }
                });
                b.addEventListener('click', () => runItem(i));
                frag.appendChild(b);
            });
            list.replaceChildren(frag);
        }
        function paint() {
            list.querySelectorAll('.egx-pal-item').forEach(b => b.classList.toggle('is-active', Number(b.dataset.i) === active));
            list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
        }
        function runItem(i) {
            const it = shown[i];
            if (!it) return;
            closeOverlay(true);
            requestAnimationFrame(() => it.run());
        }
        input.addEventListener('input', () => {
            active = 0;
            render();
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!shown.length) return;
                active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
                paint();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                runItem(active);
            } else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
                e.preventDefault();
                closeOverlay();
            }
            e.stopPropagation();
        });
        input.value = initial || '';
        render();
        input.focus();
    }

    /* Folha de atalhos */
    const HELP_ORDER = ['launcher', 'dashboard', 'meta', 'meta2', 'extractor', 'bulk-empty', 'bulk', 'tasks'];
    function openHelp() {
        if (overlay && overlay.querySelector('.egx-help')) return closeOverlay();
        const ctx = context();
        const rows = list =>
            list
                .filter(sc => sc.combo && sc.help !== false)
                .map(sc => `<div class="egx-help-row"><span>${escapeHtml(sc.help || sc.label)}</span><span>${kbd(keysOf(sc))}</span></div>`)
                .join('');
        const general = SHORTCUTS.filter(sc => sc.ctx === '*' || sc.ctx === 'app');
        const order = [ctx, ...HELP_ORDER.filter(c => c !== ctx)];
        const secs = order.map(c => {
            const list = SHORTCUTS.filter(sc => sc.ctx !== '*' && sc.ctx !== 'app' && [].concat(sc.ctx).includes(c));
            return `<section class="egx-help-sec${c === ctx ? ' is-current' : ''}"><h3>${CTX[c].ico} ${escapeHtml(CTX[c].name)}${c === ctx ? '<em>você está aqui</em>' : ''}</h3>${rows(list)}</section>`;
        });
        secs.splice(1, 0, `<section class="egx-help-sec"><h3>⌨ Em qualquer seção</h3>${rows(general)}</section>`);
        openOverlay(o => {
            o.innerHTML = `<div class="egx-pal egx-help" role="dialog" aria-modal="true" aria-label="Atalhos de teclado" tabindex="-1">
                <div class="egx-help-head"><div><h2>Atalhos de teclado</h2><p>Atalhos de uma letra funcionam quando o cursor não está num campo de texto. Segure <b>${SEC_MOD}</b> para ver os números das seções.</p></div><button type="button" class="egx-top-icon" data-close aria-label="Fechar">✕</button></div>
                <div class="egx-help-grid">${secs.join('')}</div>
            </div>`;
            o.querySelectorAll('.egx-help-sec').forEach((s, i) => s.style.setProperty('--i', i));
            o.querySelector('[data-close]').addEventListener('click', () => closeOverlay());
            o.addEventListener('keydown', e => {
                if (e.key === 'Escape' || e.key === '?') {
                    e.preventDefault();
                    closeOverlay();
                }
                e.stopPropagation();
            });
        });
        overlay.querySelector('.egx-help').focus();
    }

    byId('egx-palette-btn')?.addEventListener('click', () => openPalette(''));
    byId('egx-dash-shortcuts')?.addEventListener('click', openHelp);
    window.EGXShortcuts = { openPalette, openHelp, toggleBar, refresh: () => renderBar(true) };
})();
