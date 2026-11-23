'use strict';
/* ===================================================================
   MÓDULO: 🗂️ EDITOR DE PLANILHAS — interface
   Árvore (campanha → conjunto → anúncio) | tabela do nível | propriedades.
   Toda alteração passa por act(), que registra desfazer/refazer, revalida
   e salva no projeto (Projects/<projeto>/bulkEditor.json).
   =================================================================== */
(function bulkEditorModule() {
    const root = $('module-bulk-editor');
    if (!root) return;
    const SM = window.EGXSheetModel;
    const { Sheet } = SM;

    const LEVELS = ['campaign', 'adset', 'ad'];
    const LABEL = { campaign: 'Campanha', adset: 'Conjunto', ad: 'Anúncio' };
    const PLURAL = { campaign: 'campanhas', adset: 'conjuntos', ad: 'anúncios' };
    const MAX_SAVED_FILE = 8 * 1024 * 1024;
    const TEXT_PRESETS = 'egx_text_presets_v1';
    const TEMPLATE_DIR = 'Templates/estruturas';
    const CTA = [
        ['LEARN_MORE', 'Saiba mais'],
        ['SHOP_NOW', 'Comprar agora'],
        ['BUY_NOW', 'Comprar'],
        ['ORDER_NOW', 'Pedir agora'],
        ['GET_OFFER', 'Obter oferta'],
        ['SIGN_UP', 'Cadastre-se'],
        ['SUBSCRIBE', 'Assinar'],
        ['CONTACT_US', 'Fale conosco'],
        ['APPLY_NOW', 'Candidatar-se'],
        ['SEE_DETAILS', 'Ver detalhes'],
    ];
    const BID_STRATEGIES = ['Highest volume or value', 'Bid cap', 'Cost per result goal', 'Lowest cost'];
    // Tradução "Português (English)" dos termos do Meta Ads (js/config/meta-labels.js)
    const T = window.EGXMetaPT || { col: h => h, short: h => h, value: v => v, valueShort: v => v, has: () => false };
    const BT_HELP = {
        CBO: 'Orçamento na campanha (Advantage+ campaign budget); lance “Maior volume”. Conjuntos sem orçamento.',
        ABO: 'Orçamento e estratégia de lance em cada conjunto. Campanha sem orçamento e sem estratégia.',
        BID: 'Orçamento na campanha + estratégia “Limite de lance (Bid cap)”; o limite de lance (Bid Amount) fica em cada conjunto.',
    };
    // Bloqueia edições que criariam "orçamento misto" (rejeitado pela Meta)
    function guardField(key, header, value) {
        if (String(value ?? '').trim() === '') return '';
        const h = String(header).trim().toLowerCase();
        const t = sheet.budgetType(sheet.campaignOf(key));
        if (/^campaign (daily|lifetime) budget$/.test(h) && t === 'ABO')
            return 'Campanha ABO: o orçamento fica nos conjuntos — Orçamento diário do conjunto (Ad Set Daily Budget). Para orçamento na campanha, mude o tipo para CBO ou BID.';
        if (/^ad set (daily|lifetime) budget$/.test(h) && t !== 'ABO')
            return `Campanha ${t}: o orçamento fica só na campanha — Orçamento diário da campanha (Campaign Daily Budget). Para orçamento por conjunto, mude o tipo para ABO.`;
        if (h === 'campaign bid strategy' && t === 'ABO')
            return 'Campanha ABO: a estratégia de lance fica nos conjuntos — Estratégia de lance do conjunto (Ad Set Bid Strategy).';
        if (h === 'ad set bid strategy' && t !== 'ABO') return `Campanha ${t}: a estratégia de lance fica na campanha.`;
        if (h === 'bid amount' && t === 'CBO')
            return 'Campanha CBO (maior volume) não usa limite de lance. Mude o tipo para BID para definir o Limite de lance (Bid Amount).';
        return '';
    }
    const GENDERS = [
        ['', 'Ambos'],
        ['Men', 'Masculino'],
        ['Women', 'Feminino'],
    ];
    const STRIP_COLS = [
        'campaign id',
        'ad set id',
        'ad id',
        'campaign id (optional)',
        'ad set id (optional)',
        'ad id (optional)',
        'campaign start time',
        'campaign stop time',
        'ad set time start',
        'ad set time stop',
        'ad start time',
        'ad stop time',
    ];

    /* ---------- Estado ---------- */
    let sheet = null,
        original = null;
    let history = [],
        hIndex = -1;
    let fileName = '',
        sheetName = '',
        workbookB64 = null,
        importWorkbook = null,
        importRows = [],
        pendingFile = null;
    let level = 'campaign',
        scope = '',
        focus = '';
    const selected = new Set();
    let lastClicked = null;
    const filters = { q: '', status: '', problems: false, changed: false, used: false, nolink: false };
    let treeQ = '';
    const expanded = new Set();
    let prefs = { columns: { campaign: [], adset: [], ad: [] }, model: 'auto' };
    let validation = { errors: [], warnings: [], byKey: new Map(), global: [] };
    let diffCache = null,
        suppressSave = false,
        valTimer = null;

    const el = id => document.getElementById(id);
    const esc = v =>
        String(v ?? '').replace(
            /[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
    const levelOf = SM.levelOfKey;
    const toast = (m, v = 'info', a) => showAppToast(m, v, a);

    /* =================================================================
       Persistência, histórico e revalidação
       ================================================================= */
    function notifyChange() {
        if (!suppressSave) window.EGXModules?.changed('bulkEditor');
    }
    function initHistory(label) {
        history = [{ label, snap: sheet.snapshot() }];
        hIndex = 0;
        syncUndo();
    }
    function commit(label) {
        history = history.slice(0, hIndex + 1);
        history.push({ label, snap: sheet.snapshot() });
        if (history.length > 40) history.shift();
        hIndex = history.length - 1;
        syncUndo();
        invalidate();
        renderAll();
        notifyChange();
    }
    // Executa uma alteração. Se der erro, volta ao último estado salvo.
    function act(label, fn) {
        try {
            const r = fn();
            commit(label);
            return r;
        } catch (e) {
            sheet = Sheet.fromSnapshot(history[hIndex].snap);
            toast(e.message || 'Não foi possível concluir a ação.', 'error');
            renderAll();
            return undefined;
        }
    }
    function syncUndo() {
        const u = el('be-btn-undo'),
            r = el('be-btn-redo');
        u.disabled = hIndex <= 0;
        r.disabled = hIndex >= history.length - 1;
        u.title = hIndex > 0 ? `Desfazer: ${history[hIndex].label} (Ctrl+Z)` : 'Nada para desfazer';
        r.title = hIndex < history.length - 1 ? `Refazer: ${history[hIndex + 1].label} (Ctrl+Y)` : 'Nada para refazer';
    }
    function travel(step) {
        const next = hIndex + step;
        if (next < 0 || next >= history.length) return;
        const label = step < 0 ? history[hIndex].label : history[next].label;
        hIndex = next;
        sheet = Sheet.fromSnapshot(history[hIndex].snap);
        fixRefs();
        syncUndo();
        invalidate();
        renderAll();
        notifyChange();
        toast(`${step < 0 ? 'Desfeito' : 'Refeito'}: ${label}`, 'info');
    }
    el('be-btn-undo').addEventListener('click', () => travel(-1));
    el('be-btn-redo').addEventListener('click', () => travel(1));
    // Remove referências a itens que deixaram de existir.
    function fixRefs() {
        if (focus && !sheet.node(focus)) focus = '';
        if (scope && !sheet.node(scope)) scope = '';
        [...selected].forEach(k => {
            if (!sheet.node(k)) selected.delete(k);
        });
    }
    function invalidate() {
        diffCache = null;
        clearTimeout(valTimer);
        valTimer = setTimeout(() => {
            runValidation();
            renderAll();
        }, 200);
    }
    function getDiff() {
        if (!diffCache) {
            diffCache = sheet.diff(original);
            diffCache.addedSet = new Set(diffCache.added);
        }
        return diffCache;
    }

    /* ---------- Validação ao vivo ---------- */
    function modelKey() {
        if (prefs.model && prefs.model !== 'auto') return prefs.model;
        const c = sheet?.nodes('campaign')[0];
        if (!c) return 'general';
        return EGXValidation.guessModel(c.name, sheet.budgetType(c.key));
    }
    function runValidation() {
        validation = { errors: [], warnings: [], byKey: new Map(), global: [] };
        if (!sheet || !sheet.rows.length) return;
        let res;
        try {
            res = EGXValidation.validateSheet(sheet.headers, sheet.rows, modelKey());
        } catch (e) {
            console.error('EGX: validação', e);
            return;
        }
        validation.errors = res.errors;
        validation.warnings = res.warnings;
        const add = (key, sev, msg) => {
            if (!validation.byKey.has(key)) validation.byKey.set(key, { e: 0, w: 0, msgs: [] });
            const v = validation.byKey.get(key);
            v[sev === 'error' ? 'e' : 'w']++;
            if (v.msgs.length < 8 && !v.msgs.some(m => m.text === msg)) v.msgs.push({ sev, text: msg });
        };
        [
            ...res.errors.map(x => ({ ...x, sev: 'error' })),
            ...res.warnings.map(x => ({ ...x, sev: 'warning' })),
        ].forEach(f => {
            const isGlobal = String(f.type || '').startsWith('model-');
            const r = f.row - 1;
            if (isGlobal || r < 0 || r >= sheet.rows.length) return validation.global.push(f);
            const cn = sheet.get(r, 'campName'),
                sn = sheet.get(r, 'adsetName');
            const lvl = /campanha/i.test(f.level)
                ? 'campaign'
                : /conjunto|público|orçamento/i.test(f.level)
                  ? 'adset'
                  : 'ad';
            add('c:' + cn, f.sev, f.message);
            if (lvl !== 'campaign') add('s:' + cn + '\u0001' + sn, f.sev, f.message);
            if (lvl === 'ad' && sheet.get(r, 'adName')) add('a:' + sheet.keys[r], f.sev, f.message);
        });
        // Avisos de estrutura do Editor: nome diz um tipo e a estrutura é outra; limite de lance sobrando
        sheet.nodes('campaign').forEach(c =>
            sheet
                .budgetIssues(c.key)
                .filter(i => i.code === 'name' || i.code === 'bidextra' || i.code === 'high')
                .forEach(i => {
                    add(c.key, 'warning', i.text);
                    validation.warnings.push({
                        row: (sheet.rowsOf(c.key)[0] ?? 0) + 1,
                        level: 'Campanha',
                        message: `${i.text} — ${c.name}`,
                        type: 'budget-name',
                    });
                }),
        );
    }

    /* =================================================================
       Importação
       ================================================================= */
    const dropzone = el('be-dropzone'),
        fileInp = el('be-file-input'),
        fileInfo = el('be-file-info');
    const importPreview = el('be-import-preview'),
        sheetSelect = el('be-sheet-select'),
        headerSelect = el('be-header-row');
    const DEFAULT_INFO = fileInfo.textContent;

    dropzone.addEventListener('click', e => {
        if (!e.target.closest('button')) fileInp.click();
    });
    dropzone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInp.click();
        }
    });
    el('be-btn-pick').addEventListener('click', e => {
        e.stopPropagation();
        fileInp.click();
    });
    ['dragenter', 'dragover'].forEach(t =>
        dropzone.addEventListener(t, e => {
            e.preventDefault();
            dropzone.classList.add('is-over');
        }),
    );
    ['dragleave', 'drop'].forEach(t =>
        dropzone.addEventListener(t, e => {
            e.preventDefault();
            dropzone.classList.remove('is-over');
        }),
    );
    dropzone.addEventListener('drop', e => {
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    });
    fileInp.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = '';
    });

    const bytesToBase64 = bytes => {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    };
    const normalizeHeader = v =>
        String(v ?? '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    const KNOWN = [
        'campaign name',
        'campaign id',
        'campaign status',
        'campaign daily budget',
        'ad set name',
        'ad set id',
        'ad set run status',
        'ad set daily budget',
        'ad name',
        'ad id',
        'ad status',
        'link',
        'url tags',
        'gender',
        'age min',
        'age max',
    ];
    const scoreHeaderRow = row =>
        row
            .map(normalizeHeader)
            .reduce(
                (s, v) =>
                    s +
                    (KNOWN.includes(v)
                        ? 3
                        : KNOWN.some(k => v && v.length > 3 && (v.includes(k) || k.includes(v)))
                          ? 1
                          : 0),
                0,
            );
    function detectHeaderRow(rows) {
        let best = 0,
            score = -1;
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const s = scoreHeaderRow(rows[i] || []);
            if (s > score) {
                score = s;
                best = i;
            }
        }
        return score >= 3 ? best : 0;
    }

    async function handleFile(file) {
        if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast('Formato inválido. Use XLSX, XLS ou CSV.', 'error');
        if (file.size > 25 * 1024 * 1024) return toast('Arquivo muito grande (limite de 25 MB).', 'error');
        if (sheet && getDiff().changedKeys.size) {
            const ok = await EGXDialog.confirm(
                'A planilha aberta tem alterações. Ao importar outro arquivo ela será substituída (o projeto guarda backups automáticos).',
                { title: 'Substituir planilha aberta?', okLabel: 'Importar mesmo assim' },
            );
            if (!ok) return;
        }
        fileInfo.textContent = `Lendo ${file.name}…`;
        try {
            const data = new Uint8Array(await file.arrayBuffer());
            const wb = XLSX.read(data, { type: 'array' });
            if (!wb.SheetNames?.length) throw new Error('sem abas');
            importWorkbook = wb;
            pendingFile = { name: file.name, b64: data.length <= MAX_SAVED_FILE ? bytesToBase64(data) : null };
            sheetSelect.replaceChildren(...wb.SheetNames.map(n => new Option(n, n)));
            sheetSelect.value = wb.SheetNames[0];
            showPreview();
            fileInfo.textContent = `${file.name} · ${wb.SheetNames.length} aba(s)`;
            showApp(false);
            el('bx-history-list').classList.add('hidden');
            importPreview.classList.remove('hidden');
            importPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {
            fileInfo.textContent = DEFAULT_INFO;
            toast('Não foi possível ler a planilha. Verifique se o arquivo está íntegro.', 'error');
        }
    }
    function showPreview() {
        importRows = XLSX.utils.sheet_to_json(importWorkbook.Sheets[sheetSelect.value], { header: 1, defval: '' });
        const detected = detectHeaderRow(importRows);
        headerSelect.replaceChildren();
        for (let i = 0; i < Math.min(Math.max(importRows.length, 1), 40); i++)
            headerSelect.appendChild(new Option(`Linha ${i + 1}${i === detected ? ' (detectada)' : ''}`, String(i)));
        headerSelect.value = String(detected);
        renderPreview();
    }
    function renderPreview() {
        const hi = Number(headerSelect.value || 0);
        const body = el('be-preview-tbody');
        body.replaceChildren();
        importRows.slice(hi, hi + 6).forEach(row => {
            const tr = document.createElement('tr');
            row.slice(0, 12).forEach(c => {
                const td = document.createElement('td');
                td.textContent = String(c ?? '');
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        const heads = (importRows[hi] || []).map(normalizeHeader).filter(Boolean);
        const recog = KNOWN.filter(h => heads.includes(h)).length;
        el('be-import-summary').textContent =
            `${sheetSelect.value}: ${Math.max(0, importRows.length - hi - 1)} linhas de dados · ${recog} cabeçalhos do Meta reconhecidos` +
            (recog < 2 ? ' — confira a linha dos cabeçalhos.' : '.');
    }
    sheetSelect.addEventListener('change', showPreview);
    headerSelect.addEventListener('change', renderPreview);
    el('bx-cancel-import').addEventListener('click', () => {
        importPreview.classList.add('hidden');
        importWorkbook = null;
        pendingFile = null;
        fileInfo.textContent = DEFAULT_INFO;
        if (sheet) showApp(true);
    });
    el('be-btn-load-sheet').addEventListener('click', () => {
        const hi = Number(headerSelect.value || 0);
        const headers = (importRows[hi] || []).map(h => String(h ?? '').trim());
        if (!headers.some(Boolean)) return toast('A linha selecionada não parece conter cabeçalhos.', 'error');
        const rows = importRows.slice(hi + 1).filter(r => r.some(c => String(c ?? '').trim() !== ''));
        loadSheet({
            headers,
            rows,
            fileName: pendingFile?.name || 'planilha.xlsx',
            sheetName: sheetSelect.value,
            workbook: pendingFile?.b64 || null,
        });
        importPreview.classList.add('hidden');
        fileInfo.textContent = DEFAULT_INFO;
        window.EGXWorkspace?.log('Planilha importada no Editor', `${fileName} · ${sheet.rows.length} linha(s)`);
        toast(
            `Planilha carregada: ${sheet.nodes('campaign').length} campanha(s), ${sheet.rows.length} linha(s).`,
            'success',
        );
    });

    function loadSheet({ headers, rows, keys, fileName: fn, sheetName: sn, workbook, original: orig, prefs: p }) {
        sheet = new Sheet(headers, rows, keys);
        original = orig ? { headers: orig.headers, rows: orig.rows, keys: orig.keys } : sheet.snapshot();
        fileName = fn || 'planilha.xlsx';
        sheetName = sn || '';
        workbookB64 = workbook || null;
        importWorkbook = null;
        if (workbookB64) {
            try {
                importWorkbook = XLSX.read(workbookB64, { type: 'base64' });
            } catch (e) {
                importWorkbook = null;
            }
        }
        if (p) prefs = { columns: { campaign: [], adset: [], ad: [], ...(p.columns || {}) }, model: p.model || 'auto' };
        el('be-validation-model').value = prefs.model;
        level = 'campaign';
        scope = '';
        focus = '';
        selected.clear();
        expanded.clear();
        sheet.nodes('campaign').forEach(c => expanded.add(c.key));
        initHistory('Planilha carregada');
        runValidation();
        diffCache = null;
        showApp(true);
        renderAll();
        notifyChange();
    }
    function showApp(on) {
        el('bx-app').classList.toggle('hidden', !on);
        el('bx-empty').classList.toggle('hidden', on);
    }

    /* =================================================================
       Navegação
       ================================================================= */
    function effectiveScope(lvl) {
        if (!scope || lvl === 'campaign') return '';
        const sl = levelOf(scope);
        if (lvl === 'adset') {
            if (sl === 'campaign') return scope;
            const n = sheet.node(scope);
            return n ? 'c:' + n.campaign : '';
        }
        if (sl === 'ad') {
            const n = sheet.node(scope);
            return n ? 's:' + n.campaign + '\u0001' + n.adset : '';
        }
        return scope;
    }
    function setLevel(lvl) {
        if (lvl === level) return;
        level = lvl;
        selected.clear();
        renderAll();
    }
    function focusFromTree(key) {
        const lvl = levelOf(key);
        focus = key;
        if (lvl === 'campaign') {
            scope = key;
            level = 'adset';
            expanded.add(key);
        } else if (lvl === 'adset') {
            scope = key;
            level = 'ad';
            expanded.add(key);
            expanded.add('c:' + sheet.node(key)?.campaign);
        } else {
            const n = sheet.node(key);
            scope = 's:' + n.campaign + '\u0001' + n.adset;
            level = 'ad';
            expanded.add('c:' + n.campaign);
            expanded.add(scope);
        }
        selected.clear();
        openInspectorDrawer();
        renderAll();
    }
    // Ir até um item (a partir de problemas/alterações).
    function goTo(key) {
        if (!sheet.node(key)) return toast('Esse item não existe mais.', 'info');
        const lvl = levelOf(key);
        focus = key;
        level = lvl;
        if (lvl === 'campaign') scope = '';
        else if (lvl === 'adset') scope = 'c:' + sheet.node(key).campaign;
        else {
            const n = sheet.node(key);
            scope = 's:' + n.campaign + '\u0001' + n.adset;
            expanded.add('c:' + n.campaign);
            expanded.add(scope);
        }
        selected.clear();
        openInspectorDrawer();
        renderAll();
        requestAnimationFrame(() =>
            document.querySelector(`#bx-tbody tr[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' }),
        );
    }
    function openInspectorDrawer() {
        if (window.innerWidth <= 1080) root.classList.add('insp-open');
    }

    /* =================================================================
       Renderização
       ================================================================= */
    function renderAll() {
        if (!sheet) return;
        renderToolbar();
        renderTree();
        renderLevelbar();
        renderTable();
        renderSelbar();
        renderInspector();
        renderStatus();
    }

    function statusClass(v) {
        return v === 'ACTIVE' ? 'on' : v === 'PAUSED' ? 'off' : v === null ? 'mixed' : '';
    }
    function nodeStatus(n) {
        return sheet.value(n.key, sheet.statusCol(n.level));
    }
    function nodeFlags(n) {
        const v = validation.byKey.get(n.key);
        const d = getDiff();
        const isNew = n.rows.length > 0 && n.rows.every(r => d.addedSet.has(sheet.keys[r]));
        const isEdited = !isNew && n.rows.some(r => d.changedKeys.has(sheet.keys[r]));
        return { e: v?.e || 0, w: v?.w || 0, isNew, isEdited, msgs: v?.msgs || [] };
    }

    function renderToolbar() {
        el('bx-file').textContent = fileName || 'planilha.xlsx';
        el('bx-file').title = fileName;
        el('bx-file-sub').textContent =
            `${sheetName ? 'Aba ' + sheetName + ' · ' : ''}${sheet.rows.length} linha(s) · ${sheet.headers.length} coluna(s)`;
        const pb = el('bx-problems-btn');
        const ne = validation.errors.length,
            nw = validation.warnings.length;
        pb.dataset.state = ne ? 'err' : nw ? 'warn' : 'ok';
        el('bx-problems-label').textContent = ne || nw ? `${ne} erro(s) · ${nw} aviso(s)` : 'Sem problemas';
        const d = getDiff();
        const nc = d.added.length + d.changed.length + d.removed.length;
        const cb = el('bx-changes-btn');
        cb.dataset.state = nc ? 'changed' : '';
        el('bx-changes-label').textContent = nc ? `${nc} linha(s) alterada(s)` : 'Sem alterações';
    }

    /* ---------- Árvore ---------- */
    const treeEl = el('bx-tree');
    function renderTree() {
        const q = treeQ.trim().toLowerCase();
        const match = s => !q || String(s).toLowerCase().includes(q);
        const frag = document.createDocumentFragment();
        const tree = sheet.tree();
        const rootNode = document.createElement('div');
        rootNode.className = 'bx-node is-root' + (!scope ? ' is-scope' : '');
        rootNode.dataset.key = '';
        rootNode.innerHTML = `<span class="bx-caret">▾</span><span class="bx-node-name">Todas as campanhas</span><span class="bx-node-count">${tree.length}</span>`;
        frag.appendChild(rootNode);
        tree.forEach(c => {
            const adsetsMatch = c.adsets.filter(s => match(s.name) || s.ads.some(a => match(a.name)));
            if (q && !match(c.name) && !adsetsMatch.length) return;
            const open = expanded.has(c.key) || !!q;
            frag.appendChild(treeNode(c, open, `${c.adsets.length} · ${c.rows.length}`));
            if (!open) return;
            (q && !match(c.name) ? adsetsMatch : c.adsets).forEach(s => {
                const adsMatch = s.ads.filter(a => match(a.name));
                const sOpen = expanded.has(s.key) || (!!q && adsMatch.length > 0 && !match(s.name));
                frag.appendChild(treeNode(s, sOpen, String(s.ads.length)));
                if (!sOpen) return;
                (q && !match(s.name) ? adsMatch : s.ads).forEach(a => frag.appendChild(treeNode(a, false, '')));
            });
        });
        treeEl.replaceChildren(frag);
    }
    function treeNode(n, open, count) {
        const d = document.createElement('div');
        const f = nodeFlags(n);
        const st = nodeStatus(n);
        d.className =
            'bx-node' + (n.key === focus ? ' is-focus' : '') + (n.key === scope && n.key !== focus ? ' is-scope' : '');
        d.dataset.key = n.key;
        d.dataset.level = n.level;
        d.setAttribute('role', 'treeitem');
        if (n.level !== 'campaign') d.draggable = true;
        const caret = n.level === 'ad' ? '' : open ? '▾' : '▸';
        const flag = f.e ? '🔴' : f.w ? '🟡' : '';
        d.innerHTML = `<span class="bx-caret" data-toggle>${caret}</span><span class="bx-dot ${statusClass(st)}" title="${esc(st || 'vários status')}"></span><span class="bx-node-name"></span>${f.isNew ? '<span class="bx-mark new">novo</span>' : f.isEdited ? '<span class="bx-mark edit">editado</span>' : ''}${flag ? `<span class="bx-node-flag" title="${esc(f.msgs.map(m => m.text).join('\n'))}">${flag}</span>` : ''}<span class="bx-node-count">${esc(count)}</span><span class="bx-node-actions"><button type="button" data-tact="rename" title="Renomear (F2)">✎</button><button type="button" data-tact="duplicate" title="Duplicar (Ctrl+D)">⧉</button><button type="button" data-tact="delete" title="Excluir">🗑</button></span>`;
        const name = d.querySelector('.bx-node-name');
        name.textContent = n.name || '(sem nome)';
        name.title = n.name;
        return d;
    }
    treeEl.addEventListener('click', e => {
        const node = e.target.closest('.bx-node');
        if (!node) return;
        const key = node.dataset.key;
        if (!key) {
            scope = '';
            focus = '';
            level = 'campaign';
            selected.clear();
            return renderAll();
        }
        const tact = e.target.closest('[data-tact]')?.dataset.tact;
        if (tact === 'rename') return inlineRenameTree(node, key);
        if (tact === 'duplicate') return actDuplicate([key]);
        if (tact === 'delete') return actDelete([key]);
        if (e.target.closest('[data-toggle]') && levelOf(key) !== 'ad') {
            expanded.has(key) ? expanded.delete(key) : expanded.add(key);
            return renderTree();
        }
        focusFromTree(key);
    });
    treeEl.addEventListener('dblclick', e => {
        const node = e.target.closest('.bx-node');
        if (node?.dataset.key && e.target.closest('.bx-node-name')) inlineRenameTree(node, node.dataset.key);
    });
    function inlineRenameTree(nodeEl, key) {
        const n = sheet.node(key);
        if (!n) return;
        const nameEl = nodeEl.querySelector('.bx-node-name');
        const inp = document.createElement('input');
        inp.className = 'fld bx-node-input';
        inp.value = n.name;
        nameEl.replaceWith(inp);
        inp.focus();
        inp.select();
        let done = false;
        const finish = save => {
            if (done) return;
            done = true;
            if (save && inp.value.trim() && inp.value.trim() !== n.name) doRename(key, inp.value);
            else renderTree();
        };
        inp.addEventListener('keydown', ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') finish(true);
            if (ev.key === 'Escape') finish(false);
        });
        inp.addEventListener('blur', () => finish(true));
        inp.addEventListener('click', ev => ev.stopPropagation());
    }
    // Arrastar e soltar: anúncio → conjunto, conjunto → campanha.
    let dragKey = null;
    treeEl.addEventListener('dragstart', e => {
        const node = e.target.closest('.bx-node');
        if (!node?.dataset.key) return;
        dragKey = node.dataset.key;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragKey);
    });
    const validDrop = (from, to) =>
        from &&
        to &&
        ((levelOf(from) === 'ad' && levelOf(to) === 'adset') ||
            (levelOf(from) === 'adset' && levelOf(to) === 'campaign'));
    treeEl.addEventListener('dragover', e => {
        const node = e.target.closest('.bx-node');
        treeEl.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok'));
        if (node && validDrop(dragKey, node.dataset.key)) {
            e.preventDefault();
            node.classList.add('drop-ok');
        }
    });
    treeEl.addEventListener('dragleave', e => e.target.closest?.('.bx-node')?.classList.remove('drop-ok'));
    treeEl.addEventListener('drop', async e => {
        const node = e.target.closest('.bx-node');
        treeEl.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok'));
        const from = dragKey;
        dragKey = null;
        if (!node || !validDrop(from, node.dataset.key)) return;
        e.preventDefault();
        const src = sheet.node(from),
            dst = sheet.node(node.dataset.key);
        const current = src.level === 'ad' ? 's:' + src.campaign + '\u0001' + src.adset : 'c:' + src.campaign;
        if (current === dst.key) return;
        const ok = await EGXDialog.confirm(
            `Mover ${LABEL[src.level].toLowerCase()} “${src.name}” para “${dst.name}”?\n\nItens movidos ganham os dados do novo destino e perdem o ID (o Meta cria como novos).`,
            { title: 'Mover item', okLabel: 'Mover' },
        );
        if (!ok) return;
        const nk = act(`Mover ${src.name}`, () => sheet.move(from, dst.key));
        if (nk) {
            focus = nk;
            renderAll();
        }
    });
    treeEl.addEventListener('dragend', () => {
        dragKey = null;
        treeEl.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok'));
    });
    el('bx-tree-search').addEventListener('input', e => {
        treeQ = e.target.value;
        renderTree();
    });
    el('bx-tree-expand').addEventListener('click', () => {
        sheet.tree().forEach(c => {
            expanded.add(c.key);
            c.adsets.forEach(s => expanded.add(s.key));
        });
        renderTree();
    });
    el('bx-tree-collapse').addEventListener('click', () => {
        expanded.clear();
        renderTree();
    });

    /* ---------- Barra de nível ---------- */
    function renderLevelbar() {
        LEVELS.forEach(l => {
            el('bx-count-' + l).textContent = sheet.nodes(l, effectiveScope(l)).length;
        });
        root.querySelectorAll('.bx-tab').forEach(t =>
            t.setAttribute('aria-selected', String(t.dataset.level === level)),
        );
        const sc = el('bx-scope');
        const es = effectiveScope(level);
        if (es) {
            const n = sheet.node(es);
            sc.innerHTML = `<span></span><button type="button" title="Mostrar tudo">✕</button>`;
            sc.querySelector('span').textContent = `${LABEL[n.level]}: ${n.name}`;
            sc.querySelector('span').title = n.name;
            sc.classList.remove('hidden');
        } else sc.classList.add('hidden');
        root.querySelectorAll('.bx-toggle').forEach(b => {
            b.classList.toggle('on', !!filters[b.dataset.filter]);
            b.hidden = !!b.dataset.levelOnly && b.dataset.levelOnly !== level;
        });
    }
    root.querySelectorAll('.bx-tab').forEach(t => t.addEventListener('click', () => setLevel(t.dataset.level)));
    el('bx-scope').addEventListener('click', e => {
        if (!e.target.closest('button')) return;
        scope = '';
        selected.clear();
        renderAll();
    });
    el('bx-q').addEventListener('input', e => {
        filters.q = e.target.value.trim().toLowerCase();
        renderTable();
        renderSelbar();
    });
    el('bx-f-status').addEventListener('change', e => {
        filters.status = e.target.value;
        renderTable();
    });
    root.querySelectorAll('.bx-toggle').forEach(b =>
        b.addEventListener('click', () => {
            filters[b.dataset.filter] = !filters[b.dataset.filter];
            renderLevelbar();
            renderTable();
        }),
    );

    /* ---------- Tabela ---------- */
    function columnsFor(lvl) {
        // Coluna da planilha: título em português e o nome original da Meta embaixo
        const metaCol = (h, label, cls) => ({ id: h, label: label || T.short(h), sub: h, header: h, cls });
        const num = (h, label) => metaCol(h, label, 'c-num');
        const base = {
            campaign: [
                { id: '_name', label: 'Campanha', sub: 'Campaign Name' },
                { id: '_status', label: 'Status', sub: 'Status' },
                { id: '_type', label: 'Tipo', sub: 'CBO · ABO · BID' },
                num('Campaign Daily Budget', 'Orçamento diário'),
                metaCol('Campaign Bid Strategy', 'Estratégia de lance'),
                { id: '_adsets', label: 'Conjuntos', sub: 'Ad Sets', cls: 'c-num' },
                { id: '_ads', label: 'Anúncios', sub: 'Ads', cls: 'c-num' },
            ],
            adset: [
                { id: '_name', label: 'Conjunto', sub: 'Ad Set Name' },
                { id: '_campaign', label: 'Campanha', sub: 'Campaign' },
                { id: '_status', label: 'Status', sub: 'Status' },
                num('Ad Set Daily Budget', 'Orçamento diário'),
                num('Bid Amount', 'Limite de lance'),
                { id: '_gender', label: 'Gênero', sub: 'Gender' },
                { id: '_age', label: 'Idade', sub: 'Age' },
                { id: '_ads', label: 'Anúncios', sub: 'Ads', cls: 'c-num' },
            ],
            ad: [
                { id: '_name', label: 'Anúncio', sub: 'Ad Name' },
                { id: '_adset', label: 'Conjunto', sub: 'Ad Set' },
                { id: '_status', label: 'Status', sub: 'Status' },
                metaCol('Title', 'Título'),
                { id: '_cta', label: 'Botão', sub: 'Call to Action' },
                metaCol('Link', 'Link'),
            ],
        }[lvl];
        const extra = (prefs.columns[lvl] || [])
            .filter(h => sheet.has(h) && !base.some(c => c.header && c.header.toLowerCase() === h.toLowerCase()))
            .map(h => (T.has(h) ? metaCol(h) : { id: h, label: h, header: h }));
        return [
            ...base.filter(c => !c.header || sheet.has(c.header) || ['Title', 'Link'].includes(c.header)),
            ...extra,
        ];
    }
    function cellValue(n, c) {
        switch (c.id) {
            case '_name':
                return n.name;
            case '_status':
                return nodeStatus(n);
            case '_type':
                return sheet.budgetType(n.key);
            case '_adsets':
                return sheet.nodes('adset', n.key).length;
            case '_ads':
                return n.level === 'campaign'
                    ? sheet.nodes('ad', n.key).length
                    : (n.ads || sheet.nodes('ad', n.key)).length;
            case '_campaign':
                return n.campaign;
            case '_adset':
                return n.adset;
            case '_gender': {
                const g = sheet.value(n.key, 'gender');
                return g === null ? null : (GENDERS.find(x => x[0] === g) || [g, g])[1];
            }
            case '_age': {
                const a = sheet.value(n.key, 'ageMin'),
                    b = sheet.value(n.key, 'ageMax');
                return a === null || b === null ? null : a || b ? `${a || '?'}–${b || '?'}` : '';
            }
            case '_cta': {
                const v = sheet.value(n.key, 'cta');
                return v === null ? null : (CTA.find(x => x[0] === v) || [v, v])[1];
            }
            default: {
                const h = String(c.header || '').toLowerCase();
                if (n.level !== 'ad' && /daily budget|bid amount/.test(h)) {
                    const t = sheet.budgetType(sheet.campaignOf(n.key));
                    if (h === 'campaign daily budget' && t === 'ABO') return '↓ nos conjuntos';
                    if (h === 'ad set daily budget' && t !== 'ABO') return '↑ na campanha';
                    if (h === 'bid amount' && t === 'CBO' && !sheet.value(n.key, c.header)) return '—';
                }
                const v = sheet.value(n.key, c.header);
                return /bid strategy|status/i.test(c.header || '') && v ? T.valueShort(v) : v;
            }
        }
    }
    function visibleNodes() {
        const d = getDiff();
        const usage = filters.used ? window.EGXWorkspace?.creativeUsage?.() : null;
        return sheet.nodes(level, effectiveScope(level)).filter(n => {
            if (filters.q) {
                const hay = `${n.name} ${n.campaign || ''} ${n.adset || ''}`.toLowerCase();
                if (!hay.includes(filters.q)) return false;
            }
            if (filters.status) {
                const s = nodeStatus(n);
                if (s !== null && s !== filters.status) return false;
            }
            if (filters.problems && !validation.byKey.has(n.key)) return false;
            if (filters.changed && !n.rows.some(r => d.changedKeys.has(sheet.keys[r]))) return false;
            if (level === 'ad' && filters.used && !(usage && usage.get(codeOf(n.name))?.length)) return false;
            if (level === 'ad' && filters.nolink && sheet.value(n.key, 'link')) return false;
            return true;
        });
    }
    function renderTable() {
        const cols = columnsFor(level);
        const nodes = visibleNodes();
        const allSel = nodes.length > 0 && nodes.every(n => selected.has(n.key));
        el('bx-thead').innerHTML =
            `<tr><th class="c-sel"><input type="checkbox" id="bx-sel-all" ${allSel ? 'checked' : ''} aria-label="Selecionar todos"></th>${cols.map(c => `<th class="${c.cls || ''}" title="${esc(c.sub || c.header || '')}">${esc(c.label)}${c.sub ? `<small class="bx-th-en">${esc(c.sub)}</small>` : ''}</th>`).join('')}</tr>`;
        const usage = level === 'ad' ? window.EGXWorkspace?.creativeUsage?.() : null;
        const frag = document.createDocumentFragment();
        nodes.slice(0, 2000).forEach(n => {
            const tr = document.createElement('tr');
            tr.dataset.key = n.key;
            tr.className = (selected.has(n.key) ? 'is-sel ' : '') + (n.key === focus ? 'is-focus' : '');
            const f = nodeFlags(n);
            let html = `<td class="c-sel"><input type="checkbox" data-sel ${selected.has(n.key) ? 'checked' : ''} aria-label="Selecionar"></td>`;
            cols.forEach(c => {
                const v = cellValue(n, c);
                if (c.id === '_name') {
                    const used = usage?.get(codeOf(n.name))?.length;
                    html += `<td class="c-name editable" data-edit="_name" title="${esc(n.name)}">${esc(n.name || '(sem nome)')}${f.isNew ? '<span class="bx-mark new">novo</span>' : f.isEdited ? '<span class="bx-mark edit">editado</span>' : ''}${f.e ? `<span class="bx-mark err" title="${esc(f.msgs.map(m => m.text).join('\n'))}">${f.e} erro</span>` : f.w ? `<span class="bx-mark warn" title="${esc(f.msgs.map(m => m.text).join('\n'))}">${f.w} aviso</span>` : ''}${used ? `<span class="egx-used-badge" title="Já usado em exportações anteriores deste projeto">já usado</span>` : ''}</td>`;
                } else if (c.id === '_status') {
                    const lbl =
                        v === 'ACTIVE' ? 'Ativo' : v === 'PAUSED' ? 'Pausado' : v === null ? 'Vários' : v || '—';
                    html += `<td><button type="button" class="bx-status ${statusClass(v)}" data-status title="Clique para ${v === 'ACTIVE' ? 'pausar' : 'ativar'}">${v === 'ACTIVE' ? '●' : '❚❚'} ${esc(lbl)}</button></td>`;
                } else {
                    const shown = v === null ? 'vários' : v === '' || v === undefined ? '—' : v;
                    const empty = v === '' || v === undefined || v === null;
                    html += `<td class="${c.cls || ''} ${c.header ? 'editable' : ''} ${empty ? 'empty' : ''}" ${c.header ? `data-edit="${esc(c.header)}"` : ''} title="${esc(v ?? '')}">${esc(shown)}</td>`;
                }
            });
            tr.innerHTML = html;
            frag.appendChild(tr);
        });
        const body = el('bx-tbody');
        body.replaceChildren(frag);
        const empty = el('bx-table-empty');
        empty.hidden = nodes.length > 0;
        if (!nodes.length)
            empty.textContent = sheet.nodes(level, effectiveScope(level)).length
                ? 'Nenhum item corresponde aos filtros.'
                : `Nenhum(a) ${LABEL[level].toLowerCase()} aqui.`;
        if (nodes.length > 2000)
            toast(`Mostrando 2000 de ${nodes.length} itens. Use a busca ou a árvore para filtrar.`, 'info');
    }
    const tbody = el('bx-tbody');
    tbody.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-key]');
        if (!tr) return;
        const key = tr.dataset.key;
        if (e.target.closest('[data-sel]')) {
            const nodes = visibleNodes().map(n => n.key);
            if (e.shiftKey && lastClicked && nodes.includes(lastClicked)) {
                const [a, b] = [nodes.indexOf(lastClicked), nodes.indexOf(key)].sort((x, y) => x - y);
                nodes.slice(a, b + 1).forEach(k => selected.add(k));
            } else selected.has(key) ? selected.delete(key) : selected.add(key);
            lastClicked = key;
            renderTable();
            renderSelbar();
            return;
        }
        if (e.target.closest('[data-status]')) {
            const cur = sheet.value(key, sheet.statusCol(levelOf(key)));
            const next = cur === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
            act(`${next === 'ACTIVE' ? 'Ativar' : 'Pausar'} ${sheet.node(key).name}`, () =>
                sheet.setStatus([key], next, false),
            );
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            selected.has(key) ? selected.delete(key) : selected.add(key);
            lastClicked = key;
            renderTable();
            renderSelbar();
            return;
        }
        focus = key;
        openInspectorDrawer();
        renderTable();
        renderTree();
        renderInspector();
    });
    tbody.addEventListener('dblclick', e => {
        const td = e.target.closest('td[data-edit]');
        const tr = e.target.closest('tr[data-key]');
        if (!td || !tr) return;
        if (levelOf(tr.dataset.key) !== 'ad' && sheet.node(tr.dataset.key) && e.target.closest('[data-status]')) return;
        inlineEditCell(td, tr.dataset.key, td.dataset.edit);
    });
    el('bx-thead').addEventListener('change', e => {
        if (e.target.id !== 'bx-sel-all') return;
        const nodes = visibleNodes();
        if (e.target.checked) nodes.forEach(n => selected.add(n.key));
        else nodes.forEach(n => selected.delete(n.key));
        renderTable();
        renderSelbar();
    });
    function inlineEditCell(td, key, field) {
        const n = sheet.node(key);
        if (!n) return;
        const blocked = field !== '_name' && guardField(key, field, 'x');
        if (blocked) return toast(blocked, 'info');
        const cur = field === '_name' ? n.name : (sheet.value(key, field) ?? '');
        const inp = document.createElement('input');
        inp.className = 'fld bx-cell-input';
        inp.value = cur;
        if (field !== '_name' && sheet.value(key, field) === null) inp.placeholder = '(vários valores)';
        td.replaceChildren(inp);
        inp.focus();
        inp.select();
        let done = false;
        const finish = save => {
            if (done) return;
            done = true;
            const v = inp.value.trim();
            if (save && v !== cur) {
                if (field === '_name') doRename(key, v);
                else act(`Editar ${field}`, () => sheet.setField(key, field, v));
            } else renderTable();
        };
        inp.addEventListener('keydown', ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') finish(true);
            if (ev.key === 'Escape') finish(false);
        });
        inp.addEventListener('blur', () => finish(true));
        inp.addEventListener('click', ev => ev.stopPropagation());
    }

    /* ---------- Barra de seleção ---------- */
    function renderSelbar() {
        const bar = el('bx-selbar');
        bar.hidden = selected.size === 0;
        el('bx-sel-count').textContent = selected.size;
        bar.querySelectorAll('[data-act]').forEach(b => {
            const only = b.dataset.only,
                not = b.dataset.not;
            b.hidden = (only && only !== level) || (not && not === level);
        });
    }
    el('bx-sel-clear').addEventListener('click', () => {
        selected.clear();
        renderTable();
        renderSelbar();
    });
    el('bx-selbar').addEventListener('click', e => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a) runAction(a, [...selected]);
    });
    function runAction(a, keys) {
        keys = keys.filter(k => sheet.node(k));
        if (!keys.length) return toast('Selecione pelo menos um item.', 'info');
        const map = {
            rename: actRename,
            duplicate: actDuplicate,
            move: actMove,
            activate: k => actStatus(k, 'ACTIVE'),
            pause: k => actStatus(k, 'PAUSED'),
            budget: actBudget,
            bid: actBid,
            convert: actConvert,
            fixbudget: k => actConvert(k),
            audience: actAudience,
            split: actSplit,
            addads: actAddAds,
            texts: actTexts,
            link: actLink,
            template: actSaveTemplate,
            delete: actDelete,
        };
        map[a]?.(keys);
    }

    /* =================================================================
       Ações
       ================================================================= */
    function doRename(key, name) {
        const n = sheet.node(key);
        const nk = act(`Renomear ${LABEL[n.level].toLowerCase()} ${n.name}`, () => sheet.rename(key, name));
        if (nk) remapKey(key, nk);
    }
    function remapKey(oldK, newK) {
        if (oldK === newK) return renderAll();
        if (focus === oldK) focus = newK;
        if (scope === oldK) scope = newK;
        if (selected.delete(oldK)) selected.add(newK);
        if (expanded.delete(oldK)) expanded.add(newK);
        fixRefs();
        renderAll();
    }

    async function actRename(keys) {
        const lvl = levelOf(keys[0]);
        if (keys.length === 1) {
            const n = sheet.node(keys[0]);
            const v = await EGXDialog.prompt(`Renomear ${LABEL[lvl].toLowerCase()}`, n.name);
            if (v !== null && v.trim()) doRename(keys[0], v);
            return;
        }
        const v = await EGXDialog.form({
            title: `Renomear ${keys.length} ${PLURAL[lvl]}`,
            okLabel: 'Renomear',
            fields: [
                {
                    id: 'mode',
                    type: 'radio',
                    value: 'affix',
                    options: [
                        { value: 'affix', label: 'Adicionar prefixo / sufixo' },
                        { value: 'replace', label: 'Localizar e substituir' },
                        { value: 'date', label: 'Trocar a data do início do nome (dd_mm_aa)' },
                        {
                            value: 'pattern',
                            label: 'Modelo de nome',
                            hint: '{nome} nome atual · {n} sequência · {data} hoje · {campanha} · {conjunto}',
                        },
                    ],
                },
                { id: 'prefix', label: 'Prefixo', show: x => x.mode === 'affix' },
                { id: 'suffix', label: 'Sufixo', show: x => x.mode === 'affix' },
                { id: 'find', label: 'Localizar', show: x => x.mode === 'replace' },
                { id: 'repl', label: 'Substituir por', show: x => x.mode === 'replace' },
                {
                    id: 'date',
                    label: 'Nova data',
                    value: SM.todayTag(),
                    show: x => x.mode === 'date',
                    hint: 'Nomes sem data no início ganham a data na frente.',
                },
                { id: 'pattern', label: 'Modelo', value: '{nome}', show: x => x.mode === 'pattern' },
                {
                    id: 'start',
                    label: 'Começar {n} em',
                    type: 'number',
                    value: 1,
                    min: 0,
                    show: x => x.mode === 'pattern',
                },
            ],
            validate: x => (x.mode === 'replace' && !x.find ? 'Informe o texto a localizar.' : ''),
        });
        if (!v) return;
        const fn = (name, i, n) => {
            if (v.mode === 'affix') return `${v.prefix || ''}${name}${v.suffix || ''}`;
            if (v.mode === 'replace') return name.split(v.find).join(v.repl || '');
            if (v.mode === 'date')
                return SM.DATE_RE.test(name) ? name.replace(SM.DATE_RE, v.date) : `${v.date}_${name}`;
            return String(v.pattern || '{nome}')
                .replaceAll('{nome}', name)
                .replaceAll('{n}', String((Number(v.start) || 0) + i))
                .replaceAll('{data}', SM.todayTag())
                .replaceAll('{campanha}', n.campaign || n.name)
                .replaceAll('{conjunto}', n.adset || (n.level === 'adset' ? n.name : ''));
        };
        const res = act(`Renomear ${keys.length} ${PLURAL[lvl]}`, () => sheet.bulkRename(keys, fn));
        if (!res) return;
        keys.forEach((k, i) => {
            if (selected.delete(k)) selected.add(res.keys[i]);
            if (focus === k) focus = res.keys[i];
            if (scope === k) scope = res.keys[i];
        });
        fixRefs();
        renderAll();
        toast(`${res.changed} nome(s) alterado(s).`, 'success');
    }

    const campaignOptions = (exclude = '') =>
        sheet
            .nodes('campaign')
            .filter(c => c.key !== exclude)
            .map(c => ({ value: c.key, label: c.name }));
    const adsetOptions = (exclude = '') =>
        sheet
            .nodes('adset')
            .filter(s => s.key !== exclude)
            .map(s => ({ value: s.key, label: `${s.campaign} › ${s.name}` }));

    async function actDuplicate(keys) {
        const lvl = levelOf(keys[0]);
        const first = sheet.node(keys[0]);
        const fields = [
            { id: 'copies', label: 'Quantidade de cópias de cada item', type: 'number', value: 1, min: 1, max: 50 },
        ];
        if (lvl === 'adset')
            fields.push(
                {
                    id: 'where',
                    type: 'radio',
                    label: 'Onde criar',
                    value: 'same',
                    options: [
                        { value: 'same', label: 'Na mesma campanha' },
                        { value: 'other', label: 'Em outra(s) campanha(s)' },
                    ],
                },
                {
                    id: 'targets',
                    type: 'checks',
                    label: 'Campanhas de destino',
                    options: campaignOptions(),
                    show: x => x.where === 'other',
                },
            );
        if (lvl === 'ad')
            fields.push(
                {
                    id: 'where',
                    type: 'radio',
                    label: 'Onde criar',
                    value: 'same',
                    options: [
                        { value: 'same', label: 'No mesmo conjunto' },
                        { value: 'other', label: 'Copiar para outro(s) conjunto(s)' },
                    ],
                },
                {
                    id: 'targets',
                    type: 'checks',
                    label: 'Conjuntos de destino',
                    options: adsetOptions(),
                    show: x => x.where === 'other',
                },
            );
        if (keys.length === 1 && lvl !== 'ad')
            fields.push({
                id: 'name',
                label: 'Nome da cópia (opcional)',
                placeholder: SM.nextCopyName(first.name, sheet.siblingsNames(lvl, first)),
                hint: 'Vazio = próximo #n livre ou sufixo _COPIA. Só vale para 1 cópia.',
            });
        fields.push(
            { id: 'paused', type: 'checkbox', label: 'Criar as cópias pausadas', value: true },
            {
                id: 'info',
                type: 'info',
                value: 'As cópias saem sem Campaign/Ad Set/Ad ID e sem datas, então o Meta cria itens novos.',
            },
        );
        const v = await EGXDialog.form({
            title: `Duplicar ${keys.length} ${keys.length > 1 ? PLURAL[lvl] : LABEL[lvl].toLowerCase()}`,
            okLabel: 'Duplicar',
            fields,
            wide: lvl !== 'campaign',
            validate: x => (x.where === 'other' && !(x.targets || []).length ? 'Escolha pelo menos um destino.' : ''),
        });
        if (!v) return;
        const created = act(`Duplicar ${keys.length} ${PLURAL[lvl]}`, () => {
            const out = [];
            keys.forEach(k =>
                out.push(
                    ...sheet.duplicate(k, {
                        copies: v.copies,
                        paused: v.paused,
                        targets: v.where === 'other' ? v.targets : null,
                        name: (v.name || '').trim() || undefined,
                    }),
                ),
            );
            return out;
        });
        if (!created) return;
        selected.clear();
        created.forEach(k => levelOf(k) === level && selected.add(k));
        if (created.length === 1) focus = created[0];
        renderAll();
        toast(`${created.length} cópia(s) criada(s).`, 'success');
    }

    async function actMove(keys) {
        const lvl = levelOf(keys[0]);
        if (lvl === 'campaign') return;
        const opts = lvl === 'ad' ? adsetOptions() : campaignOptions();
        const v = await EGXDialog.form({
            title: `Mover ${keys.length} ${PLURAL[lvl]}`,
            okLabel: 'Mover',
            fields: [
                {
                    id: 'target',
                    type: 'select',
                    label: lvl === 'ad' ? 'Conjunto de destino' : 'Campanha de destino',
                    options: opts,
                    value: opts[0]?.value,
                },
                {
                    id: 'info',
                    type: 'info',
                    value: 'Os itens movidos recebem os dados do destino (orçamento, público...) e perdem o ID — o Meta cria como novos. Os originais saem da planilha.',
                },
            ],
        });
        if (!v?.target) return;
        const moved = act(`Mover ${keys.length} ${PLURAL[lvl]}`, () => keys.map(k => sheet.move(k, v.target)));
        if (!moved) return;
        selected.clear();
        moved.forEach(k => selected.add(k));
        fixRefs();
        renderAll();
        toast(`${moved.length} item(ns) movido(s).`, 'success');
    }

    function actStatus(keys, status) {
        const lvl = levelOf(keys[0]);
        if (status === 'PAUSED') {
            act(`Pausar ${keys.length} ${PLURAL[lvl]}`, () => sheet.setStatus(keys, 'PAUSED', true));
            toast(
                `${keys.length} ${PLURAL[lvl]} pausado(s)${lvl !== 'ad' ? ', com tudo o que está dentro' : ''}.`,
                'success',
            );
        } else {
            act(`Ativar ${keys.length} ${PLURAL[lvl]}`, () => sheet.setStatus(keys, 'ACTIVE', false));
            toast(
                `${keys.length} ${PLURAL[lvl]} ativado(s).`,
                'success',
                lvl !== 'ad'
                    ? {
                          label: 'Ativar também o que está dentro',
                          fn: () =>
                              act(`Ativar ${PLURAL[lvl]} e itens internos`, () =>
                                  sheet.setStatus(keys, 'ACTIVE', true),
                              ),
                      }
                    : undefined,
            );
        }
    }

    async function actBudget(keys) {
        const lvl = levelOf(keys[0]);
        // Só itens do nível certo: CBO/BID → campanha; ABO → conjuntos
        const ok = keys.filter(k => sheet.budgetLevel(k) === levelOf(k));
        if (!ok.length)
            return toast(
                lvl === 'adset'
                    ? 'Esses conjuntos são de campanhas CBO/BID: o orçamento fica na campanha. Selecione a campanha (ou mude o tipo para ABO).'
                    : 'Essas campanhas são ABO: o orçamento fica nos conjuntos. Selecione os conjuntos (ou mude o tipo para CBO/BID).',
                'info',
            );
        if (ok.length < keys.length)
            toast(`${keys.length - ok.length} item(ns) ignorado(s): o orçamento deles fica em outro nível.`, 'info');
        keys = ok;
        const v = await EGXDialog.form({
            title: `Orçamento diário de ${keys.length} ${PLURAL[lvl]} (${lvl === 'adset' ? 'Ad Set' : 'Campaign'} Daily Budget)`,
            okLabel: 'Aplicar',
            fields: [
                {
                    id: 'mode',
                    type: 'radio',
                    value: 'pct',
                    options: [
                        { value: 'pct', label: 'Aumentar ou reduzir em %', hint: 'Ex.: 20 para +20%, -10 para −10%.' },
                        { value: 'set', label: 'Definir um valor para cada item' },
                        { value: 'split', label: 'Dividir um total igualmente entre os itens' },
                    ],
                },
                { id: 'value', type: 'number', label: 'Valor', step: 'any' },
            ],
            validate: x =>
                x.value === '' || !Number.isFinite(Number(x.value))
                    ? 'Informe um número.'
                    : x.mode !== 'pct' && Number(x.value) < 0
                      ? 'O valor não pode ser negativo.'
                      : '',
        });
        if (!v) return;
        const r = act(`Orçamento (${keys.length} ${PLURAL[lvl]})`, () => sheet.budget(keys, v.mode, Number(v.value)));
        if (r)
            toast(
                `Orçamento atualizado em ${r.changed} item(ns)${r.skipped ? `; ${r.skipped} ignorado(s) sem orçamento neste nível` : ''}.`,
                'success',
            );
    }

    // Tipo de campanha (CBO / ABO / BID). Também corrige "orçamento misto": limpa o que é do outro nível.
    async function actConvert(keys, preset) {
        keys = [...new Set(keys.map(k => sheet.campaignOf(k)).filter(Boolean))];
        if (!keys.length) return;
        const one = keys.length === 1 ? keys[0] : null;
        const cur = one ? sheet.budgetType(one) : '';
        const to0 = preset || (one ? sheet.intendedType(one) : 'CBO');
        const campB = one ? Number(sheet.value(one, 'campBudget')) || 0 : 0;
        const sets = one ? sheet.nodes('adset', one) : [];
        const setB = sets.map(s => Number(sheet.value(s.key, 'adsetBudget')) || 0);
        const sumSets = setB.reduce((a, b) => a + b, 0);
        const bidNow = one ? sheet.value(one, 'bidAmount') : '';
        const v = await EGXDialog.form({
            title: one ? `Tipo de orçamento — ${sheet.node(one).name}` : `Tipo de orçamento de ${keys.length} campanhas`,
            okLabel: 'Aplicar',
            fields: [
                {
                    id: 'to',
                    type: 'radio',
                    value: to0,
                    options: ['CBO', 'ABO', 'BID'].map(x => ({ value: x, label: x + (x === cur ? ' (atual)' : ''), hint: BT_HELP[x] })),
                },
                {
                    id: 'budget',
                    type: 'number',
                    step: 'any',
                    label: 'Orçamento diário da campanha (Campaign Daily Budget)',
                    value: campB || sumSets || '',
                    hint: 'Vazio = mantém o atual (ou soma o dos conjuntos).',
                    show: x => x.to !== 'ABO',
                },
                {
                    id: 'each',
                    type: 'number',
                    step: 'any',
                    label: 'Orçamento diário de cada conjunto (Ad Set Daily Budget)',
                    value: setB.length && setB.every(b => b === setB[0] && b > 0) ? setB[0] : sets.length && campB ? Math.round((campB / sets.length) * 100) / 100 : '',
                    hint: 'Vazio = mantém o de cada conjunto (ou divide o da campanha igualmente).',
                    show: x => x.to === 'ABO',
                },
                {
                    id: 'bid',
                    type: 'number',
                    step: 'any',
                    label: 'Limite de lance para todos os conjuntos (Bid Amount)',
                    value: bidNow && bidNow !== null ? bidNow : '',
                    hint: 'A estratégia “Limite de lance (Bid cap)” é marcada automaticamente. Depois dá para ajustar conjunto por conjunto.',
                    show: x => x.to === 'BID',
                },
            ],
            validate: x => {
                if (x.to === 'BID' && !(Number(x.bid) > 0) && !(Number(bidNow) > 0)) return 'Informe o limite de lance (Bid Amount).';
                return '';
            },
        });
        if (!v) return;
        const r = act(`Tipo de orçamento: ${v.to}`, () =>
            keys.map(k =>
                sheet.setBudgetType(k, v.to, {
                    budget: Number(v.to === 'ABO' ? v.each : v.budget) || 0,
                    bid: Number(v.bid) || 0,
                }),
            ),
        );
        if (r) toast(`${keys.length} campanha(s) agora como ${v.to}. Orçamento e lance ajustados no nível certo.`, 'success');
    }

    // Limite de lance (Bid Amount) nos conjuntos — campanha BID (ou conjunto ABO com Bid cap)
    async function actBid(keys) {
        const allowed = k => {
            const t = sheet.budgetType(sheet.campaignOf(k));
            if (t === 'BID') return true;
            return t === 'ABO' && levelOf(k) === 'adset' && /bid\s*cap|cost/i.test(sheet.value(k, 'adsetBid') || '');
        };
        const ok = keys.filter(allowed);
        if (!ok.length)
            return toast('O limite de lance só vale em campanhas BID. Mude o tipo da campanha para BID (⇄ Tipo) primeiro.', 'info');
        if (ok.length < keys.length) toast(`${keys.length - ok.length} item(ns) ignorado(s): não são de campanhas BID.`, 'info');
        const lvl = levelOf(ok[0]);
        const v = await EGXDialog.form({
            title: `Limite de lance (Bid Amount) — ${ok.length} ${PLURAL[lvl]}`,
            okLabel: 'Aplicar',
            message: lvl === 'campaign' ? 'Aplica a todos os conjuntos das campanhas selecionadas.' : '',
            fields: [
                {
                    id: 'mode',
                    type: 'radio',
                    value: 'set',
                    options: [
                        { value: 'set', label: 'Mesmo valor para todos os selecionados' },
                        { value: 'pct', label: 'Aumentar ou reduzir em %', hint: 'Ex.: 10 para +10%, -5 para −5%.' },
                    ],
                },
                { id: 'value', type: 'number', label: 'Valor', step: 'any' },
            ],
            validate: x =>
                x.value === '' || !Number.isFinite(Number(x.value))
                    ? 'Informe um número.'
                    : x.mode === 'set' && Number(x.value) <= 0
                      ? 'O limite de lance precisa ser maior que zero.'
                      : '',
        });
        if (!v) return;
        const r = act(`Limite de lance (${ok.length} ${PLURAL[lvl]})`, () => sheet.setBidAmount(ok, v.mode, Number(v.value)));
        if (r)
            toast(
                `Limite de lance atualizado em ${r.changed} conjunto(s)${r.skipped ? `; ${r.skipped} sem valor anterior (modo %)` : ''}.`,
                'success',
            );
    }

    async function actAudience(keys) {
        const v = await EGXDialog.form({
            title: `Público de ${keys.length} conjunto(s)`,
            okLabel: 'Aplicar',
            message: 'Campos vazios mantêm o valor atual.',
            fields: [
                {
                    id: 'gender',
                    type: 'select',
                    label: 'Gênero',
                    value: '__keep',
                    options: [
                        { value: '__keep', label: 'Manter' },
                        ...GENDERS.map(([value, label]) => ({ value, label })),
                    ],
                },
                { id: 'ageMin', type: 'number', label: 'Idade mínima', min: 13, max: 65 },
                { id: 'ageMax', type: 'number', label: 'Idade máxima', min: 13, max: 65 },
                { id: 'countries', label: 'Países', placeholder: 'Ex.: BR' },
            ],
            validate: x =>
                x.ageMin !== '' && x.ageMax !== '' && Number(x.ageMin) > Number(x.ageMax)
                    ? 'A idade mínima não pode ser maior que a máxima.'
                    : '',
        });
        if (!v) return;
        const fields = {};
        if (v.gender !== '__keep') fields.gender = v.gender;
        if (v.ageMin !== '') fields.ageMin = String(v.ageMin);
        if (v.ageMax !== '') fields.ageMax = String(v.ageMax);
        if (v.countries.trim()) fields.countries = v.countries.trim().toUpperCase();
        if (!Object.keys(fields).length) return toast('Nada para alterar.', 'info');
        act(`Público (${keys.length} conjuntos)`, () => sheet.setFields(keys, fields));
        toast('Público atualizado.', 'success');
    }

    async function actSplit(keys) {
        const eligible = keys.filter(k => !sheet.value(k, 'gender'));
        if (!eligible.length) return toast('Os conjuntos selecionados já têm gênero definido.', 'info');
        const ok = await EGXDialog.confirm(
            `${eligible.length} conjunto(s) com público "Ambos" serão divididos em 2: o original vira Masculino (_M, mantém o ID) e uma cópia nova vira Feminino (_F), com os mesmos anúncios.`,
            { title: 'Dividir por gênero', okLabel: 'Dividir' },
        );
        if (!ok) return;
        const r = act(`Dividir ${eligible.length} conjunto(s) por gênero`, () =>
            eligible
                .map(k => sheet.splitByGender(k))
                .flat()
                .filter(Boolean),
        );
        if (!r) return;
        selected.clear();
        r.forEach(k => selected.add(k));
        fixRefs();
        renderAll();
        toast(`${eligible.length} conjunto(s) divididos.`, 'success');
    }

    async function actAddAds(keys) {
        const ext = window.EGXExtractorProjectBridge?.exportData?.()?.output || '';
        const v = await EGXDialog.form({
            title: `Adicionar anúncios em ${keys.length} conjunto(s)`,
            okLabel: 'Adicionar',
            message:
                'Cada anúncio novo copia textos, link e criativo do primeiro anúncio do conjunto, com o nome trocado.',
            fields: [
                {
                    id: 'names',
                    type: 'textarea',
                    label: 'Nomes / códigos (um por linha)',
                    value: ext,
                    rows: 8,
                    hint: ext
                        ? 'Preenchido com a última lista do Extrator.'
                        : 'Dica: a lista do Extrator aparece aqui automaticamente.',
                },
                {
                    id: 'normalize',
                    type: 'checkbox',
                    label: 'Padronizar códigos (ex.: lfrad 836 v2 → LFRAD836-V2)',
                    value: true,
                },
            ],
            validate: x => (!x.names.trim() ? 'Informe pelo menos um nome.' : ''),
        });
        if (!v) return;
        const names = [
            ...new Set(
                v.names
                    .split(/[\n,;]+/)
                    .map(s => s.trim())
                    .filter(Boolean)
                    .map(s => (v.normalize ? normName(s) : s)),
            ),
        ];
        const created = act(`Adicionar ${names.length} anúncio(s)`, () => keys.flatMap(k => sheet.addAds(k, names)));
        if (!created) return;
        toast(
            `${created.length} anúncio(s) adicionado(s)${created.length < names.length * keys.length ? ' (nomes repetidos foram ignorados)' : ''}.`,
            'success',
        );
    }

    async function actTexts(keys) {
        const presets = lsGet(TEXT_PRESETS, {});
        const pnames = Object.keys(presets).sort();
        const single = keys.length === 1;
        const v = await EGXDialog.form({
            title: `Textos de ${keys.length} anúncio(s)`,
            okLabel: 'Aplicar',
            wide: true,
            message: single ? '' : 'Campos vazios mantêm o texto atual de cada anúncio.',
            fields: [
                ...(pnames.length
                    ? [
                          {
                              id: 'preset',
                              type: 'select',
                              label: 'Usar modelo de texto (do Criador)',
                              value: '',
                              options: [{ value: '', label: '— nenhum —' }, ...pnames],
                          },
                      ]
                    : []),
                { id: 'title', label: 'Título', value: single ? sheet.value(keys[0], 'title') || '' : '' },
                {
                    id: 'body',
                    type: 'textarea',
                    label: 'Texto principal',
                    value: single ? sheet.value(keys[0], 'body') || '' : '',
                    rows: 5,
                },
                {
                    id: 'cta',
                    type: 'select',
                    label: 'Botão (CTA)',
                    value: single ? sheet.value(keys[0], 'cta') || '__keep' : '__keep',
                    options: [
                        { value: '__keep', label: 'Manter' },
                        ...CTA.map(([value, label]) => ({ value, label: `${label} (${value})` })),
                    ],
                },
                {
                    id: 'info',
                    type: 'info',
                    value: 'Se um modelo for escolhido, ele preenche os campos que ficarem vazios.',
                    show: () => pnames.length > 0,
                },
            ],
        });
        if (!v) return;
        const p = v.preset ? presets[v.preset] : null;
        const fields = {};
        const title = v.title.trim() || p?.title || '';
        const body = v.body.trim() || p?.body || '';
        const cta = v.cta !== '__keep' ? v.cta : p?.cta || '';
        if (single) {
            fields.title = title;
            fields.body = body;
            if (cta) fields.cta = cta;
        } else {
            if (title) fields.title = title;
            if (body) fields.body = body;
            if (cta) fields.cta = cta;
        }
        if (!Object.keys(fields).length) return toast('Nada para alterar.', 'info');
        act(`Textos (${keys.length} anúncios)`, () => sheet.setFields(keys, fields));
        toast('Textos atualizados.', 'success');
    }

    async function actLink(keys) {
        const v = await EGXDialog.form({
            title: `Link e UTM de ${keys.length} anúncio(s)`,
            okLabel: 'Aplicar',
            wide: true,
            fields: [
                {
                    id: 'link',
                    label: 'Link de destino',
                    placeholder: 'Vazio = manter',
                    value: keys.length === 1 ? sheet.value(keys[0], 'link') || '' : '',
                },
                {
                    id: 'tagsMode',
                    type: 'radio',
                    label: 'Parâmetros de URL (URL Tags)',
                    value: 'keep',
                    options: [
                        { value: 'keep', label: 'Manter' },
                        { value: 'set', label: 'Substituir por' },
                        { value: 'append', label: 'Acrescentar ao final' },
                    ],
                },
                {
                    id: 'tags',
                    label: 'Parâmetros',
                    placeholder: 'utm_source=facebook&utm_medium=paid',
                    show: x => x.tagsMode !== 'keep',
                },
            ],
        });
        if (!v) return;
        const done = act(`Link/UTM (${keys.length} anúncios)`, () => {
            keys.forEach(k => {
                if (v.link.trim()) sheet.setField(k, 'link', v.link.trim());
                if (v.tagsMode === 'set') sheet.setField(k, 'urlTags', (v.tags || '').trim());
                if (v.tagsMode === 'append' && (v.tags || '').trim()) {
                    const cur = sheet.value(k, 'urlTags') || '';
                    const add = v.tags.trim().replace(/^[&?]/, '');
                    sheet.setField(k, 'urlTags', cur ? `${cur.replace(/&$/, '')}&${add}` : add);
                }
            });
            return true;
        });
        if (done) toast('Link/UTM atualizados.', 'success');
    }

    async function actDelete(keys) {
        const lvl = levelOf(keys[0]);
        const rows = new Set();
        keys.forEach(k => sheet.rowsOf(k).forEach(r => rows.add(r)));
        const ok = await EGXDialog.confirm(
            `${keys.length === 1 ? `“${sheet.node(keys[0]).name}”` : `${keys.length} ${PLURAL[lvl]}`} e tudo o que está dentro (${rows.size} linha(s)) sairão da planilha. Dá para desfazer com Ctrl+Z.`,
            { title: 'Excluir da planilha', okLabel: 'Excluir', danger: true },
        );
        if (!ok) return;
        act(`Excluir ${keys.length} ${PLURAL[lvl]}`, () => sheet.remove(keys));
        keys.forEach(k => selected.delete(k));
        fixRefs();
        renderAll();
        toast(`${rows.size} linha(s) excluída(s).`, 'success', { label: 'Desfazer', fn: () => travel(-1) });
    }

    /* ---------- Templates de estrutura ---------- */
    const slug = s =>
        String(s)
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80) || 'template';
    async function listTemplates() {
        const files = (await EGXStorage.list(TEMPLATE_DIR).catch(() => [])).filter(
            f => f.kind === 'file' && f.name.endsWith('.json'),
        );
        const out = [];
        for (const f of files) {
            const t = await EGXStorage.readJSON(`${TEMPLATE_DIR}/${f.name}`, null);
            if (t?.headers && t?.rows) out.push({ ...t, file: f.name });
        }
        return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    async function actSaveTemplate(keys) {
        for (const k of keys) {
            const n = sheet.node(k);
            const name = await EGXDialog.prompt('Nome do template', n.name, {
                message: `Salva a estrutura da campanha (${sheet.nodes('adset', k).length} conjunto(s), ${n.rows.length} linha(s)) para reutilizar. Fica em ${TEMPLATE_DIR}/ e vale para todos os projetos.`,
            });
            if (name === null || !name.trim()) continue;
            const tpl = sheet.extract(k);
            try {
                await EGXStorage.writeJSON(`${TEMPLATE_DIR}/${slug(name)}.json`, {
                    schemaVersion: 1,
                    name: name.trim(),
                    createdAt: new Date().toISOString(),
                    ...tpl,
                });
                window.EGXWorkspace?.log('Template de estrutura salvo', name.trim());
                toast(`Template “${name.trim()}” salvo.`, 'success');
            } catch (e) {
                toast('Não foi possível salvar o template.', 'error');
            }
        }
    }
    async function insertTemplate() {
        const tpls = await listTemplates();
        if (!tpls.length)
            return EGXDialog.alert('Selecione uma campanha e use “Salvar template” para criar o primeiro.', {
                title: 'Nenhum template salvo',
            });
        const v = await EGXDialog.form({
            title: sheet ? 'Inserir campanha de template' : 'Começar de um template',
            okLabel: 'Inserir',
            fields: [
                {
                    id: 'tpl',
                    type: 'select',
                    label: 'Template',
                    options: tpls.map((t, i) => ({ value: String(i), label: `${t.name} — ${t.rows.length} linha(s)` })),
                    value: '0',
                },
                { id: 'name', label: 'Nome da nova campanha', placeholder: 'Vazio = nome do template' },
                {
                    id: 'del',
                    type: 'checkbox',
                    label: 'Excluir o template selecionado em vez de inserir',
                    value: false,
                },
            ],
        });
        if (!v) return;
        const t = tpls[Number(v.tpl)];
        if (v.del) {
            if (!(await EGXDialog.confirm(`Excluir o template “${t.name}”?`, { danger: true, okLabel: 'Excluir' })))
                return;
            await EGXStorage.remove(`${TEMPLATE_DIR}/${t.file}`);
            return toast('Template excluído.', 'success');
        }
        if (!sheet) {
            loadSheet({
                headers: t.headers,
                rows: [],
                fileName: `${slug(v.name || t.name)}.xlsx`,
                sheetName: 'Meta Ads Bulk Import',
            });
        }
        const nk = act(`Inserir template ${t.name}`, () => sheet.insertTemplate(t, v.name || t.campaign || t.name));
        if (nk) {
            expanded.add(nk);
            focusFromTree(nk);
            toast(`Campanha criada a partir de “${t.name}”.`, 'success');
        }
    }

    /* =================================================================
       Propriedades (painel direito)
       ================================================================= */
    const insp = el('bx-inspector');
    function renderInspector() {
        const n = focus ? sheet.node(focus) : null;
        if (!n) {
            const tree = sheet.tree();
            insp.innerHTML = `<div class="bx-insp-empty"><div class="big">🧭</div><p><b>Nada selecionado</b></p><p>Clique em um item da árvore ou da tabela para ver e editar as propriedades.</p></div><div class="bx-insp-section"><h4>Planilha</h4><div class="bx-insp-stats"><div><b>${tree.length}</b><small>campanhas</small></div><div><b>${sheet.nodes('adset').length}</b><small>conjuntos</small></div><div><b>${sheet.nodes('ad').length}</b><small>anúncios</small></div></div></div>`;
            return;
        }
        const lvl = n.level;
        const f = nodeFlags(n);
        const parts = [];
        const path = lvl === 'campaign' ? '' : lvl === 'adset' ? n.campaign : `${n.campaign} › ${n.adset}`;
        parts.push(`<div class="bx-insp-head"><div class="flex items-center justify-between gap-2"><span class="bx-insp-level">${LABEL[lvl]}</span><button type="button" class="bx-icon-btn bx-insp-close" data-iact="close" title="Fechar">✕</button></div>
            ${path ? `<div class="bx-insp-path" title="${esc(path)}">${esc(path)}</div>` : ''}
            <label class="bx-insp-field" style="margin-top:8px"><span>Nome</span><input class="fld" data-name value="${esc(n.name)}"></label>
            <div class="bx-insp-actions">
                <button type="button" data-iact="duplicate">⧉ Duplicar</button>
                ${lvl !== 'campaign' ? '<button type="button" data-iact="move">↪ Mover</button>' : ''}
                ${lvl === 'campaign' ? '<button type="button" data-iact="convert">⇄ Tipo CBO/ABO/BID</button><button type="button" data-iact="template">⬚ Template</button>' : ''}
                ${lvl === 'adset' ? '<button type="button" data-iact="split">⚥ Dividir gênero</button><button type="button" data-iact="addads">＋ Anúncios</button>' : ''}
                ${lvl === 'ad' ? '<button type="button" data-iact="texts">📝 Textos</button>' : ''}
                <button type="button" data-iact="delete" class="danger">🗑 Excluir</button>
            </div></div>`);
        const st = nodeStatus(n);
        parts.push(
            `<div class="bx-insp-section"><h4>Status</h4><div class="bx-seg" data-seg="status"><button type="button" data-v="ACTIVE" class="${st === 'ACTIVE' ? 'on' : ''}">● Ativo</button><button type="button" data-v="PAUSED" class="${st === 'PAUSED' ? 'on' : ''}">❚❚ Pausado</button></div>${st === null ? '<small class="egx-form-hint">Linhas com status diferentes.</small>' : ''}</div>`,
        );

        if (lvl === 'campaign') {
            const t = sheet.budgetType(n.key);
            const issues = sheet.budgetIssues(n.key);
            const bidAll = sheet.value(n.key, 'bidAmount');
            const intended = sheet.intendedType(n.key);
            const issueHtml = issues.length
                ? `<div class="bx-budget-issues ${issues.some(i => i.sev === 'error') ? '' : 'only-warn'}">${issues
                      .map(
                          i =>
                              `<p class="${i.sev === 'error' ? 'is-err' : 'is-warn'}">${i.sev === 'error' ? '🔴' : '🟡'} ${esc(i.text)}</p>`,
                      )
                      .join('')}<button type="button" class="bx-fix-btn" data-iact="fixbudget" data-v="${intended}">🛠 Corrigir como ${intended}${intended === sheet.nameType(n.key) ? ' (pelo nome)' : ''}</button></div>`
                : '';
            parts.push(`<div class="bx-insp-section"><h4>Orçamento e lance</h4>
                <div class="bx-insp-field"><span>Tipo de campanha</span><div class="bx-seg bx-btype" data-seg="btype">${['CBO', 'ABO', 'BID']
                    .map(x => `<button type="button" data-v="${x}" class="${t === x ? 'on' : ''}" title="${esc(BT_HELP[x])}">${x}</button>`)
                    .join('')}</div></div>
                <small class="egx-form-hint">${esc(BT_HELP[t])}</small>
                ${issueHtml}
                ${t !== 'ABO' ? field('Orçamento diário da campanha', 'Campaign Daily Budget', n, 'number') : ''}
                ${t === 'CBO' ? field('Estratégia de lance da campanha', 'Campaign Bid Strategy', n, 'select', BID_STRATEGIES.filter(s => s !== 'Bid cap')) : ''}
                ${
                    t === 'BID'
                        ? `<div class="bx-lock">🎯 Estratégia: <b>Limite de lance (Bid cap)</b> <span>marcada automaticamente</span></div>
                           <label class="bx-insp-field ${bidAll === null ? 'is-mixed' : ''}"><span>Limite de lance para todos os conjuntos (Bid Amount)${bidAll === null ? ' <em>vários</em>' : ''}</span><input class="fld" type="number" step="any" data-bid-all value="${esc(bidAll ?? '')}" placeholder="${bidAll === null ? '(cada conjunto com um valor)' : 'Ex.: 25'}"></label>
                           <small class="egx-form-hint">Valor diferente por conjunto: abra o conjunto, ou selecione vários e use 🎯 Limite de lance.</small>`
                        : ''
                }
                ${t === 'ABO' ? '<small class="egx-form-hint">Selecione os conjuntos e use 💰 Orçamento para ajustar vários de uma vez.</small>' : ''}
                <div class="bx-insp-stats"><div><b>${t}</b><small>tipo</small></div><div><b>${sheet.nodes('adset', n.key).length}</b><small>conjuntos</small></div><div><b>${sheet.nodes('ad', n.key).length}</b><small>anúncios</small></div></div>
                ${sheet.has('Campaign Objective') ? field('Objetivo', 'Campaign Objective', n, 'text') : ''}</div>`);
        } else if (lvl === 'adset') {
            const t = sheet.budgetType('c:' + n.campaign);
            const g = sheet.value(n.key, 'gender');
            const capOn = /bid\s*cap|cost/i.test(sheet.value(n.key, 'adsetBid') || '');
            parts.push(`<div class="bx-insp-section"><h4>Orçamento e lance <span class="bx-type-tag">${t}</span></h4>
                ${t === 'CBO' ? '<small class="egx-form-hint">Campanha CBO: orçamento e estratégia ficam na campanha. Nada para definir no conjunto.</small>' : ''}
                ${t === 'BID' ? field('Limite de lance deste conjunto', 'Bid Amount', n, 'number') + '<small class="egx-form-hint">Campanha BID: o orçamento fica na campanha; aqui vai só o limite de lance.</small>' : ''}
                ${t === 'ABO' ? field('Orçamento diário do conjunto', 'Ad Set Daily Budget', n, 'number') + field('Estratégia de lance do conjunto', 'Ad Set Bid Strategy', n, 'select', BID_STRATEGIES) + (capOn ? field('Limite de lance', 'Bid Amount', n, 'number') : '') : ''}
                </div>`);
            parts.push(`<div class="bx-insp-section"><h4>Público</h4>
                <div class="bx-insp-field"><span>Gênero ${g === null ? '<em>vários</em>' : ''}</span><div class="bx-seg" data-seg="gender">${GENDERS.map(([v, l]) => `<button type="button" data-v="${v}" class="${g === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
                <div class="bx-insp-row">${field('Idade mínima', 'Age Min', n, 'number')}${field('Idade máxima', 'Age Max', n, 'number')}</div>
                ${field('Países', 'Countries', n, 'text')}
                <small class="egx-form-hint">${n.ads.length} anúncio(s) neste conjunto.</small></div>`);
        } else {
            const usage = window.EGXWorkspace?.creativeUsage?.().get(codeOf(n.name));
            parts.push(`<div class="bx-insp-section"><h4>Textos</h4>
                ${field('Título', 'Title', n, 'text')}
                ${field('Texto principal', 'Body', n, 'textarea')}
                ${field('Botão (CTA)', 'Call to Action', n, 'select', ['', ...CTA.map(c => c[0])])}</div>`);
            parts.push(`<div class="bx-insp-section"><h4>Destino</h4>
                ${field('Link', 'Link', n, 'text')}
                ${field('Parâmetros de URL', 'URL Tags', n, 'text')}
                ${
                    usage?.length
                        ? `<small class="egx-form-hint">↺ Já usado em ${usage.length} exportação(ões): ${esc(
                              usage
                                  .slice(0, 3)
                                  .map(u => u.campaign)
                                  .join(', '),
                          )}</small>`
                        : ''
                }</div>`);
        }
        if (f.msgs.length || (lvl === 'campaign' && validation.global.length && sheet.nodes('campaign').length === 1)) {
            const msgs = [...f.msgs];
            if (lvl === 'campaign')
                validation.global.slice(0, 5).forEach(g => msgs.push({ sev: g.sev, text: g.message }));
            parts.push(
                `<div class="bx-insp-section"><h4>Problemas</h4><div class="bx-insp-problems">${msgs.map(m => `<p class="${m.sev === 'error' ? '' : 'warn'}">${m.sev === 'error' ? '🔴' : '🟡'} ${esc(m.text)}</p>`).join('')}</div></div>`,
            );
        }
        // Todas as colunas do nível (edição avançada)
        const shown = new Set([
            'campaign name',
            'ad set name',
            'ad name',
            'campaign status',
            'ad set run status',
            'ad set status',
            'ad status',
            'campaign daily budget',
            'campaign bid strategy',
            'campaign objective',
            'ad set daily budget',
            'ad set bid strategy',
            'bid amount',
            'gender',
            'age min',
            'age max',
            'countries',
            'title',
            'body',
            'call to action',
            'link',
            'url tags',
        ]);
        // Lifetime budget também é controlado pelo tipo da campanha
        ['campaign lifetime budget', 'ad set lifetime budget'].forEach(h => shown.add(h));
        const adv = sheet.colsOfLevel(lvl).filter(c => !shown.has(c.h.toLowerCase()));
        if (adv.length)
            parts.push(
                `<div class="bx-insp-section"><details><summary>Todas as colunas (${adv.length})</summary>${adv.map(c => field(T.short(c.h), c.h, n, 'text')).join('')}</details></div>`,
            );
        insp.innerHTML = parts.join('');
    }
    function field(label, header, n, type, options) {
        const v = sheet.value(n.key, header);
        const mixed = v === null;
        const val = esc(mixed ? '' : v);
        const ph = mixed ? 'placeholder="(vários valores)"' : '';
        let input;
        if (type === 'textarea')
            input = `<textarea class="fld" data-field="${esc(header)}" rows="4" ${ph}>${val}</textarea>`;
        else if (type === 'select') {
            const opts = [...new Set([...(options || []), ...(mixed || !v ? [] : [v])])];
            input = `<select class="fld" data-field="${esc(header)}">${mixed ? '<option value="__mixed" selected>(vários valores)</option>' : ''}${opts.map(o => `<option value="${esc(o)}" ${!mixed && o === v ? 'selected' : ''}>${esc(o === '' ? '— vazio —' : CTA.find(c => c[0] === o)?.[1] ? `${CTA.find(c => c[0] === o)[1]} (${o})` : T.value(o))}</option>`).join('')}</select>`;
        } else
            input = `<input class="fld" data-field="${esc(header)}" type="${type === 'number' ? 'number' : 'text'}" ${type === 'number' ? 'step="any"' : ''} value="${val}" ${ph}>`;
        // Rótulo em português com o nome original da Meta ao lado: "Limite de lance (Bid Amount)"
        const en = String(header).trim();
        const full = label.toLowerCase() === en.toLowerCase() || label.includes('(') ? label : `${label} (${en})`;
        return `<label class="bx-insp-field ${mixed ? 'is-mixed' : ''}"><span>${esc(full)}${mixed ? ' <em>vários</em>' : ''}</span>${input}</label>`;
    }
    insp.addEventListener('change', e => {
        const t = e.target;
        if (!focus) return;
        if (t.matches('[data-name]')) {
            if (t.value.trim() && t.value.trim() !== sheet.node(focus)?.name) doRename(focus, t.value);
            return;
        }
        if (t.matches('[data-bid-all]')) {
            const v = Number(t.value);
            if (!(v > 0)) return toast('O limite de lance precisa ser maior que zero.', 'info');
            act('Limite de lance em todos os conjuntos', () => sheet.setBidAmount([focus], 'set', v));
            return;
        }
        const h = t.dataset.field;
        if (!h || t.value === '__mixed') return;
        const blocked = guardField(focus, h, t.value);
        if (blocked) {
            toast(blocked, 'info');
            return renderInspector();
        }
        act(`Editar ${T.short(h)}`, () => sheet.setField(focus, h, t.value.trim()));
    });
    insp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
    });
    insp.addEventListener('click', e => {
        const seg = e.target.closest('[data-seg] button');
        if (seg && focus) {
            const kind = seg.parentElement.dataset.seg;
            const n = sheet.node(focus);
            if (kind === 'status')
                act(`${seg.dataset.v === 'ACTIVE' ? 'Ativar' : 'Pausar'} ${n.name}`, () =>
                    sheet.setStatus([focus], seg.dataset.v, false),
                );
            if (kind === 'gender') act(`Gênero de ${n.name}`, () => sheet.setField(focus, 'gender', seg.dataset.v));
            if (kind === 'btype' && (seg.dataset.v !== sheet.budgetType(focus) || sheet.budgetIssues(focus).length))
                actConvert([focus], seg.dataset.v);
            return;
        }
        const btn = e.target.closest('[data-iact]');
        const a = btn?.dataset.iact;
        if (!a) return;
        if (a === 'fixbudget') return actConvert([focus], btn.dataset.v);
        if (a === 'close') {
            root.classList.remove('insp-open');
            focus = '';
            return renderAll();
        }
        runAction(a, [focus]);
    });

    function renderStatus() {
        const d = getDiff();
        el('bx-status-counts').textContent =
            `${sheet.nodes('campaign').length} campanha(s) · ${sheet.nodes('adset').length} conjunto(s) · ${sheet.nodes('ad').length} anúncio(s) · ${d.added.length} nova(s), ${d.changed.length} editada(s), ${d.removed.length} removida(s)`;
    }

    /* =================================================================
       Problemas, alterações, colunas
       ================================================================= */
    function panel(title, build, { wide = true, footer } = {}) {
        const overlay = document.createElement('div');
        overlay.className = 'egx-dialog-overlay';
        const box = document.createElement('div');
        box.className = 'egx-dialog' + (wide ? ' egx-dialog-wide' : '');
        box.setAttribute('role', 'dialog');
        box.innerHTML = `<div class="flex items-center justify-between gap-2"><h2 class="egx-dialog-title"></h2><button type="button" class="bx-icon-btn" data-close>✕</button></div><div class="bx-report"></div><div class="egx-dialog-actions"></div>`;
        box.querySelector('h2').textContent = title;
        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
        };
        const onKey = e => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('mousedown', e => e.target === overlay && close());
        box.querySelector('[data-close]').addEventListener('click', close);
        build(box.querySelector('.bx-report'), close);
        const acts = box.querySelector('.egx-dialog-actions');
        (footer || []).forEach(([label, fn, cls]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'egx-launcher-btn ' + (cls || '');
            b.textContent = label;
            b.addEventListener('click', () => fn(close));
            acts.appendChild(b);
        });
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'egx-launcher-btn primary';
        ok.textContent = 'Fechar';
        ok.addEventListener('click', close);
        acts.appendChild(ok);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }
    const reportItem = (box, { title, sub, cls, onClick }) => {
        const it = document.createElement(onClick ? 'button' : 'div');
        if (onClick) {
            it.type = 'button';
            it.addEventListener('click', onClick);
        }
        it.className = 'bx-report-item ' + (cls || '');
        it.textContent = title;
        if (sub) {
            const s = document.createElement('small');
            if (sub instanceof Node) s.appendChild(sub);
            else s.textContent = sub;
            it.appendChild(s);
        }
        box.appendChild(it);
    };
    const group = (box, text) => {
        const g = document.createElement('div');
        g.className = 'bx-report-group';
        g.textContent = text;
        box.appendChild(g);
    };
    function openProblems() {
        panel('Problemas encontrados', (box, close) => {
            const all = [
                ...validation.errors.map(x => ({ ...x, sev: 'error' })),
                ...validation.warnings.map(x => ({ ...x, sev: 'warning' })),
            ];
            if (!all.length)
                return reportItem(box, {
                    title: '✅ Nenhum problema encontrado.',
                    sub: 'A planilha passou em todas as verificações.',
                });
            all.slice(0, 200).forEach(f => {
                const r = f.row - 1;
                const isGlobal = String(f.type || '').startsWith('model-') || r < 0 || r >= sheet.rows.length;
                let key = '';
                if (!isGlobal) {
                    const cn = sheet.get(r, 'campName'),
                        sn = sheet.get(r, 'adsetName');
                    key = /campanha/i.test(f.level)
                        ? 'c:' + cn
                        : /conjunto|público|orçamento/i.test(f.level)
                          ? 's:' + cn + '\u0001' + sn
                          : sheet.get(r, 'adName')
                            ? 'a:' + sheet.keys[r]
                            : 's:' + cn + '\u0001' + sn;
                }
                reportItem(box, {
                    title: `${f.sev === 'error' ? '🔴' : '🟡'} ${f.level}: ${f.message}`,
                    sub: isGlobal
                        ? 'Configuração geral da planilha'
                        : `${sheet.get(r, 'campName')} › ${sheet.get(r, 'adsetName')}${sheet.get(r, 'adName') ? ' › ' + sheet.get(r, 'adName') : ''}`,
                    cls: f.sev === 'error' ? 'err' : 'warn',
                    onClick: key ? () => (close(), goTo(key)) : null,
                });
            });
            if (all.length > 200) reportItem(box, { title: `+ ${all.length - 200} ocorrência(s).` });
        });
    }
    function openChanges(afterReview) {
        const d = getDiff();
        const total = d.added.length + d.changed.length + d.removed.length;
        panel(
            `Alterações em relação ao original (${total} linha(s))`,
            (box, close) => {
                if (!total)
                    return reportItem(box, {
                        title: 'Nenhuma alteração ainda.',
                        sub: 'A planilha está igual à importada.',
                    });
                const nameOf = k => {
                    const r = sheet.rowOfKey(k);
                    return `${sheet.get(r, 'campName')} › ${sheet.get(r, 'adsetName')} › ${sheet.get(r, 'adName') || '(sem anúncio)'}`;
                };
                if (d.added.length) {
                    group(box, `Novas linhas (${d.added.length})`);
                    d.added
                        .slice(0, 100)
                        .forEach(k =>
                            reportItem(box, { title: '＋ ' + nameOf(k), onClick: () => (close(), goTo('a:' + k)) }),
                        );
                }
                if (d.changed.length) {
                    group(box, `Linhas editadas (${d.changed.length})`);
                    d.changed.slice(0, 150).forEach(c => {
                        const sub = document.createElement('span');
                        c.cols.slice(0, 6).forEach((x, i) => {
                            if (i) sub.append('\n');
                            const from = document.createElement('span');
                            from.className = 'from';
                            from.textContent = x.from || '∅';
                            const to = document.createElement('span');
                            to.className = 'to';
                            to.textContent = x.to || '∅';
                            sub.append(`${x.h}: `, from, ' → ', to);
                        });
                        if (c.cols.length > 6) sub.append(`\n+ ${c.cols.length - 6} campo(s)`);
                        reportItem(box, {
                            title: '✎ ' + nameOf(c.key),
                            sub,
                            onClick: () => (close(), goTo('a:' + c.key)),
                        });
                    });
                }
                if (d.removed.length) {
                    group(box, `Linhas removidas (${d.removed.length})`);
                    d.removed
                        .slice(0, 100)
                        .forEach(r =>
                            reportItem(box, { title: `− ${r.campaign} › ${r.adset} › ${r.ad || '(sem anúncio)'}` }),
                        );
                }
            },
            {
                footer: [
                    ['⟲ Restaurar original', close => (close(), restoreOriginal())],
                    ...(afterReview ? [['📥 Continuar para exportar', close => (close(), openExport())]] : []),
                ],
            },
        );
    }
    async function restoreOriginal() {
        const ok = await EGXDialog.confirm(
            'Voltar a planilha exatamente como foi importada? Dá para desfazer com Ctrl+Z.',
            { title: 'Restaurar original', okLabel: 'Restaurar' },
        );
        if (!ok) return;
        act('Restaurar original', () => {
            sheet = Sheet.fromSnapshot(original);
        });
        fixRefs();
        renderAll();
    }
    async function chooseColumns() {
        const all = sheet.headers.filter(Boolean);
        const lvlCols = all.filter(h => SM.levelOfHeader(h) === level);
        const others = all.filter(h => SM.levelOfHeader(h) !== level);
        const v = await EGXDialog.form({
            title: `Colunas extras — ${PLURAL[level]}`,
            okLabel: 'Salvar',
            wide: true,
            message:
                'As colunas principais já aparecem. Marque outras para ver e editar direto na tabela (duplo clique na célula). Fica salvo no projeto.',
            fields: [
                {
                    id: 'cols',
                    type: 'checks',
                    label: `Colunas de ${PLURAL[level]}`,
                    value: prefs.columns[level] || [],
                    options: lvlCols.map(h => ({ value: h, label: T.col(h) })),
                },
                ...(others.length
                    ? [
                          {
                              id: 'other',
                              type: 'checks',
                              label: 'Outras colunas',
                              value: prefs.columns[level] || [],
                              options: others.map(h => ({ value: h, label: T.col(h) })),
                          },
                      ]
                    : []),
            ],
        });
        if (!v) return;
        prefs.columns[level] = [...(v.cols || []), ...(v.other || [])];
        renderTable();
        notifyChange();
    }
    el('bx-problems-btn').addEventListener('click', openProblems);
    el('bx-changes-btn').addEventListener('click', () => openChanges(false));
    el('bx-columns').addEventListener('click', chooseColumns);
    el('be-validation-model').addEventListener('change', e => {
        prefs.model = e.target.value;
        runValidation();
        renderAll();
        notifyChange();
    });

    /* =================================================================
       Exportação
       ================================================================= */
    async function openExport() {
        if (!sheet?.rows.length) return toast('Não há linhas para exportar.', 'error');
        const d = getDiff();
        const changedRows = sheet.keys.filter(k => d.changedKeys.has(k)).length;
        const selRows = new Set();
        selected.forEach(k => sheet.rowsOf(k).forEach(r => selRows.add(r)));
        const ne = validation.errors.length,
            nw = validation.warnings.length;
        // Nome do arquivo: nome ATUAL da campanha (se houver uma só), não o nome do arquivo importado
        const safe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
        const camps = sheet.nodes('campaign').map(c => c.name);
        const suggested = safe(
            camps.length === 1
                ? `${camps[0]}_bulk`
                : (fileName || 'meta_ads_bulk').replace(/\.(xlsx|xls|csv)$/i, '').replace(/_(revisado|alterados|selecao)$/i, ''),
        );
        const v = await EGXDialog.form({
            title: 'Exportar planilha',
            okLabel: 'Exportar .xlsx',
            wide: true,
            fields: [
                {
                    id: 'summary',
                    type: 'info',
                    value: `${ne ? `🔴 ${ne} erro(s)` : '✅ sem erros'} · ${nw ? `🟡 ${nw} aviso(s)` : 'sem avisos'}\n✎ ${d.added.length} linha(s) nova(s), ${d.changed.length} editada(s), ${d.removed.length} removida(s)`,
                },
                {
                    id: 'fname',
                    label: 'Nome do arquivo',
                    value: suggested,
                    hint:
                        camps.length === 1
                            ? 'Sugerido pelo nome atual da campanha. “.xlsx” é adicionado no final; “_alterados” ou “_selecao” quando exportar só parte.'
                            : `${camps.length} campanhas na planilha: ajuste o nome se quiser. “.xlsx” é adicionado no final.`,
                },
                {
                    id: 'scope',
                    type: 'radio',
                    label: 'O que exportar',
                    value: 'all',
                    options: [
                        {
                            value: 'all',
                            label: `Planilha inteira (${sheet.rows.length} linhas)`,
                            hint: 'Mantém as outras abas do arquivo original.',
                        },
                        {
                            value: 'changed',
                            label: `Só o que é novo ou foi editado (${changedRows} linhas)`,
                            hint: 'Importação mais rápida e com menos risco no Meta.',
                        },
                        ...(selRows.size
                            ? [{ value: 'sel', label: `Só a seleção atual (${selRows.size} linhas)` }]
                            : []),
                    ],
                },
                {
                    id: 'strip',
                    type: 'checkbox',
                    label: 'Remover colunas de ID e datas (o Meta cria tudo como novo)',
                    value: false,
                },
                {
                    id: 'hint',
                    type: 'info',
                    value: 'Deixe desmarcado para atualizar campanhas que já existem no Meta (os IDs indicam o que atualizar). Itens duplicados ou movidos já saem sem ID.',
                },
            ],
            validate: x =>
                !safe(x.fname)
                    ? 'Informe o nome do arquivo.'
                    : x.scope === 'changed' && !changedRows
                      ? 'Não há linhas novas ou editadas.'
                      : '',
        });
        if (!v) return;
        if (
            ne &&
            !(await EGXDialog.confirm(`A planilha tem ${ne} erro(s). Exportar mesmo assim?`, {
                title: 'Há erros na validação',
                okLabel: 'Exportar mesmo assim',
                danger: true,
                cancelLabel: 'Ver problemas',
            }))
        )
            return openProblems();
        let idx = sheet.rows.map((_, i) => i);
        if (v.scope === 'changed') idx = idx.filter(i => d.changedKeys.has(sheet.keys[i]));
        if (v.scope === 'sel') idx = [...selRows].sort((a, b) => a - b);
        let headers = [...sheet.headers];
        let rows = idx.map(i => [...sheet.rows[i]]);
        if (v.strip) {
            const drop = headers
                .map((h, i) => (STRIP_COLS.includes(h.trim().toLowerCase()) ? i : -1))
                .filter(i => i >= 0);
            headers = headers.filter((_, i) => !drop.includes(i));
            rows = rows.map(r => r.filter((_, i) => !drop.includes(i)));
        }
        try {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            let wb;
            if (v.scope === 'all' && importWorkbook && sheetName && importWorkbook.SheetNames.includes(sheetName)) {
                wb = importWorkbook;
                wb.Sheets[sheetName] = ws;
            } else {
                wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Meta Ads Bulk Import').slice(0, 31));
            }
            const base = safe(v.fname).replace(/\.(xlsx|xls|csv)$/i, '');
            const outName = `${base}${v.scope === 'all' ? '' : v.scope === 'changed' ? '_alterados' : '_selecao'}.xlsx`;
            XLSX.writeFile(wb, outName);
            if (v.scope === 'all') {
                fileName = outName; // o cabeçalho do Editor passa a mostrar o nome novo
                el('bx-file').textContent = outName;
                notifyChange();
            }
            const ci = headers.findIndex(h => h.toLowerCase() === 'campaign name'),
                ai = headers.findIndex(h => h.toLowerCase() === 'ad name');
            window.EGXWorkspace?.recordExport({
                fileName: outName,
                data: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }),
                module: 'Editor de planilhas',
                campaigns: ci >= 0 ? [...new Set(rows.map(r => String(r[ci] ?? '').trim()).filter(Boolean))] : [],
                ads: ai >= 0 ? [...new Set(rows.map(r => String(r[ai] ?? '').trim()).filter(Boolean))] : [],
                rows: rows.length,
            });
            toast(`Planilha ${outName} exportada (${rows.length} linhas).`, 'success');
        } catch (e) {
            console.error('EGX export', e);
            toast('Erro ao gerar o arquivo .xlsx.', 'error');
        }
    }
    el('be-btn-export').addEventListener('click', openExport);

    /* =================================================================
       Menu Arquivo, histórico, atalhos
       ================================================================= */
    root.addEventListener('click', e => {
        const btn = e.target.closest('[data-menu]');
        root.querySelectorAll('.bx-menu-pop').forEach(p => {
            if (!btn || p.id !== btn.dataset.menu) p.hidden = true;
        });
        if (btn) {
            const pop = el(btn.dataset.menu);
            pop.hidden = !pop.hidden;
        }
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.bx-menu')) root.querySelectorAll('.bx-menu-pop').forEach(p => (p.hidden = true));
    });
    el('bx-reimport').addEventListener('click', () => fileInp.click());
    el('bx-insert-template').addEventListener('click', insertTemplate);
    el('bx-new-from-template').addEventListener('click', insertTemplate);
    el('bx-restore-original').addEventListener('click', restoreOriginal);
    el('bx-close-sheet').addEventListener('click', async () => {
        const d = getDiff();
        if (d.changedKeys.size || d.removed.length) {
            const ok = await EGXDialog.confirm(
                'A planilha tem alterações que ainda não foram exportadas. Fechar mesmo assim? (o projeto guarda backups automáticos)',
                { title: 'Fechar planilha', okLabel: 'Fechar', danger: true },
            );
            if (!ok) return;
        }
        clear();
        notifyChange();
    });
    async function showHistory() {
        const list = el('bx-history-list');
        const items = (window.EGXWorkspace?.exportsIndex?.() || []).filter(x => x.savedAs);
        showApp(false);
        importPreview.classList.add('hidden');
        list.classList.remove('hidden');
        list.innerHTML = '<h3>Abrir do histórico de exportações</h3>';
        if (!items.length) {
            const p = document.createElement('p');
            p.className = 'text-sm text-slate-400';
            p.textContent = window.EGXWorkspace?.activeProject?.()
                ? 'Nenhuma planilha guardada em Exports/ neste projeto. As cópias são salvas quando a pasta do Workspace está vinculada.'
                : 'Abra um projeto para usar o histórico de exportações.';
            list.appendChild(p);
        }
        items.slice(0, 30).forEach(x => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bx-history-item';
            b.innerHTML = `<span>📄</span><span class="flex-1 min-w-0"><span class="block truncate"></span><small></small></span>`;
            b.querySelector('.block').textContent = x.campaigns?.[0] || x.fileName;
            b.querySelector('small').textContent =
                `${new Date(x.at).toLocaleString('pt-BR')} · ${x.rows} linha(s) · ${x.module}`;
            b.addEventListener('click', async () => {
                const f = await window.EGXWorkspace?.readExportFile?.(x.id);
                if (!f) return toast('Arquivo não encontrado em Exports/ (autorize a pasta do Workspace).', 'error');
                handleFile(new File([f], x.fileName));
            });
            list.appendChild(b);
        });
        const back = document.createElement('div');
        back.className = 'bx-row-end';
        back.innerHTML = '<button type="button" class="bx-btn">Voltar</button>';
        back.querySelector('button').addEventListener('click', () => {
            list.classList.add('hidden');
            if (sheet) showApp(true);
        });
        list.appendChild(back);
    }
    el('bx-open-history').addEventListener('click', showHistory);
    el('bx-history-btn').addEventListener('click', showHistory);

    const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    document.addEventListener('keydown', e => {
        if (!sheet || root.classList.contains('hidden') || document.querySelector('.egx-dialog-overlay')) return;
        if (el('bx-app').classList.contains('hidden')) return;
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if (mod && k === 'z' && !e.shiftKey && !typing(e.target)) {
            e.preventDefault();
            travel(-1);
        } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey)) && !typing(e.target)) {
            e.preventDefault();
            travel(1);
        } else if (mod && k === 'd') {
            e.preventDefault();
            const keys = selected.size ? [...selected] : focus ? [focus] : [];
            if (keys.length) actDuplicate(keys);
        } else if (e.key === 'F2' && focus) {
            e.preventDefault();
            actRename([focus]);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing(e.target)) {
            const keys = selected.size ? [...selected] : focus ? [focus] : [];
            if (keys.length) {
                e.preventDefault();
                actDelete(keys);
            }
        } else if (e.key === 'Escape' && !typing(e.target)) {
            if (selected.size) {
                selected.clear();
                renderTable();
                renderSelbar();
            } else if (root.classList.contains('insp-open')) root.classList.remove('insp-open');
        } else if (mod && k === 'a' && !typing(e.target) && e.target.closest?.('.bx-main')) {
            e.preventDefault();
            visibleNodes().forEach(n => selected.add(n.key));
            renderTable();
            renderSelbar();
        }
    });

    /* =================================================================
       API para o workspace (salvar/restaurar por projeto) e Criador
       ================================================================= */
    function exportData() {
        if (!sheet) return null;
        return {
            version: 2,
            fileName,
            sheetName,
            ...sheet.snapshot(),
            original,
            workbook: workbookB64,
            prefs,
        };
    }
    function importData(d) {
        if (!d || !Array.isArray(d.headers) || !d.headers.length) return clear();
        suppressSave = true;
        try {
            let orig = d.original;
            let keys = d.keys;
            if (d.version !== 2) {
                // V14.0: original era uma string JSON { sheetHeaders, sheetData } e não havia chaves.
                keys = d.rows.map((_, i) => 'v1_' + i);
                try {
                    const o = typeof orig === 'string' ? JSON.parse(orig) : null;
                    orig = o
                        ? { headers: o.sheetHeaders, rows: o.sheetData, keys: o.sheetData.map((_, i) => 'v1_' + i) }
                        : null;
                } catch (e) {
                    orig = null;
                }
            }
            loadSheet({
                headers: d.headers,
                rows: d.rows || [],
                keys,
                fileName: d.fileName,
                sheetName: d.sheetName,
                workbook: d.workbook,
                original: orig,
                prefs: d.prefs,
            });
        } finally {
            suppressSave = false;
        }
    }
    function clear() {
        sheet = null;
        original = null;
        history = [];
        hIndex = -1;
        fileName = '';
        sheetName = '';
        workbookB64 = null;
        importWorkbook = null;
        pendingFile = null;
        focus = '';
        scope = '';
        level = 'campaign';
        selected.clear();
        validation = { errors: [], warnings: [], byKey: new Map(), global: [] };
        diffCache = null;
        importPreview.classList.add('hidden');
        el('bx-history-list').classList.add('hidden');
        fileInfo.textContent = DEFAULT_INFO;
        root.classList.remove('insp-open');
        showApp(false);
    }
    function openGenerated({ fileName: fn, headers, rows, workbookB64: wb }) {
        loadSheet({
            headers,
            rows,
            fileName: fn,
            sheetName: 'Meta Ads Bulk Import',
            workbook: wb && wb.length <= MAX_SAVED_FILE * 1.4 ? wb : null,
        });
    }
    const api = {
        file: 'bulkEditor.json',
        exportData,
        importData,
        clear,
        openGenerated,
        summary: () => ({ rows: sheet ? sheet.rows.length : 0, fileName }),
    };
    window.EGXBulkEditorBridge = api;
    window.EGXModules?.register('bulkEditor', api);
    window.addEventListener('egx:project-loaded', () => sheet && renderAll());
})();
