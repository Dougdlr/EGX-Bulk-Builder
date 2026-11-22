'use strict';
/* ---------- Atalhos de teclado ----------
   Ctrl+1…5  troca de aba        Ctrl+S  salva o projeto agora
   Ctrl+E    exporta (Criador/Editor)   Ctrl+K  busca no painel
   ?         mostra esta lista */
(function initShortcuts() {
    const TABS = ['nav-tab-dashboard', 'nav-tab-meta', 'nav-tab-extractor', 'nav-tab-bulk-editor', 'nav-tab-tasks'];
    const LIST = [
        ['Ctrl 1 … 5', 'Trocar de aba (Visão geral, Criar campanhas, Organizar criativos, Editar planilha, Tarefas)'],
        ['Ctrl S', 'Salvar o projeto agora'],
        ['Ctrl E', 'Exportar planilha (no Criador ou no Editor em lote)'],
        ['Ctrl K', 'Buscar no projeto (painel)'],
        ['Ctrl Enter', 'Processar a lista colada no Criador'],
        ['Esc', 'Fechar diálogos e painéis'],
        ['?', 'Mostrar estes atalhos'],
    ];
    const inLauncher = () => document.body.classList.contains('egx-launcher-active');
    const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const visible = id => {
        const el = $(id);
        return el && !el.classList.contains('hidden');
    };
    const showHelp = () =>
        EGXDialog.alert('', { title: 'Atalhos de teclado', details: LIST.map(([k, d]) => `${k} — ${d}`) });

    document.addEventListener('keydown', e => {
        if (document.querySelector('.egx-dialog-overlay') || inLauncher()) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.shiftKey && !e.altKey && /^[1-5]$/.test(e.key)) {
            e.preventDefault();
            $(TABS[Number(e.key) - 1])?.click();
        } else if (mod && e.key.toLowerCase() === 's') {
            e.preventDefault();
            window.EGXWorkspace?.save();
        } else if (mod && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            if (visible('module-meta-ads')) $('meta-btn-export')?.click();
            else if (visible('module-bulk-editor')) $('be-btn-export')?.click();
        } else if (mod && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            $('nav-tab-dashboard')?.click();
            requestAnimationFrame(() => $('egx-dash-search')?.focus());
        } else if (e.key === '?' && !typing(e.target)) {
            e.preventDefault();
            showHelp();
        }
    });
    $('egx-dash-shortcuts')?.addEventListener('click', showHelp);
})();
