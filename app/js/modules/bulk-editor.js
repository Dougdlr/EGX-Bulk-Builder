'use strict';
/* ===================================================================
   MÓDULO 3: EDITOR EM LOTE DE PLANILHAS (.XLSX)
   =================================================================== */
(function bulkEditorModule() {
    let sheetData = [],
        sheetHeaders = [],
        originalBackup = null;
    let historyStack = [],
        historyIndex = -1,
        selectedRows = new Set(),
        selectedCampaigns = new Set(),
        selectedAdsets = new Set(),
        compareOriginal = false;
    let importWorkbook = null,
        importFileName = '',
        importSheetName = '',
        importRows = [];
    let activeEditorLevel = 'campaign';
    // Persistência no projeto
    const MAX_SAVED_FILE = 8 * 1024 * 1024;
    let importFileB64 = null,
        suppressSave = false;
    const bytesToBase64 = bytes => {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    };
    const notifyChange = () => {
        if (!suppressSave) window.EGXModules?.changed('bulkEditor');
    };

    const dropzone = $('be-dropzone'),
        fileInp = $('be-file-input'),
        fileInfo = $('be-file-info');
    const workspace = $('be-workspace'),
        tbody = $('be-tbody');
    const rowCount = $('be-row-count'),
        colCount = $('be-col-count');
    const importPreview = $('be-import-preview'),
        sheetSelect = $('be-sheet-select'),
        headerSelect = $('be-header-row');

    dropzone.addEventListener('click', e => {
        if (!e.target.closest('button')) fileInp.click();
    });
    $('be-btn-pick').addEventListener('click', e => {
        e.stopPropagation();
        fileInp.click();
    });
    const bulkRoot = $('module-bulk-editor');
    const editDetails = $('be-edit-details');
    const editBackdrop = document.createElement('div');
    editBackdrop.id = 'be-edit-backdrop';
    editBackdrop.className = 'hidden';
    document.body.appendChild(editBackdrop);
    const closeEditDrawer = () => {
        editDetails.open = false;
        editBackdrop.classList.add('hidden');
    };
    editDetails.addEventListener('toggle', () => editBackdrop.classList.toggle('hidden', !editDetails.open));
    editBackdrop.addEventListener('click', closeEditDrawer);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeEditDrawer();
    });
    $('be-workspace-tools-toggle').addEventListener('click', () => {
        editDetails.open = true;
        editBackdrop.classList.remove('hidden');
    });
    $('be-btn-reimport').addEventListener('click', () => fileInp.click());

    ['dragenter', 'dragover'].forEach(evt =>
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            dropzone.classList.add('border-purple-400', 'bg-purple-950/20');
        }),
    );
    ['dragleave', 'drop'].forEach(evt =>
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            dropzone.classList.remove('border-purple-400', 'bg-purple-950/20');
        }),
    );

    dropzone.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files && files.length) handleFile(files[0]);
    });
    fileInp.addEventListener('change', e => {
        if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
        e.target.value = '';
    });

    function normalizeHeader(value) {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
    function scoreHeaderRow(row) {
        const vals = row.map(normalizeHeader);
        const known = [
            'campaign name',
            'campaign id',
            'campaign status',
            'campaign daily budget',
            'ad set name',
            'ad set id',
            'ad set status',
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
        return vals.reduce(
            (score, v) =>
                score +
                (known.includes(v)
                    ? 3
                    : known.some(k => v && (v.includes(k) || k.includes(v)) && v.length > 3)
                      ? 1
                      : 0),
            0,
        );
    }
    function detectHeaderRow(rows) {
        let bestIndex = 0,
            bestScore = -1;
        const limit = Math.min(rows.length, 25);
        for (let i = 0; i < limit; i++) {
            const score = scoreHeaderRow(rows[i] || []);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }
        return bestScore >= 3 ? bestIndex : 0;
    }
    function fillHeaderChoices(rows, detected) {
        headerSelect.replaceChildren();
        const count = Math.min(Math.max(rows.length, 1), 40);
        for (let i = 0; i < count; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `Linha ${i + 1}${i === detected ? ' (detectada)' : ''}`;
            headerSelect.appendChild(opt);
        }
        headerSelect.value = String(detected);
    }
    function showImportPreview() {
        if (!importWorkbook || !importSheetName) return;
        importRows = XLSX.utils.sheet_to_json(importWorkbook.Sheets[importSheetName], { header: 1, defval: '' });
        const detected = detectHeaderRow(importRows);
        fillHeaderChoices(importRows, detected);
        renderImportPreview();
        importPreview.classList.remove('hidden');
        setPreviewCollapsed(false);
    }
    function renderImportPreview() {
        const headerIndex = Number(headerSelect.value || 0);
        const previewRows = importRows.slice(Math.max(0, headerIndex), Math.max(0, headerIndex) + 6);
        const previewBody = $('be-preview-tbody');
        previewBody.replaceChildren();
        previewRows.forEach((row, r) => {
            const tr = document.createElement('tr');
            tr.className =
                r === 0 ? 'bg-purple-950/40 text-purple-200 font-bold' : 'border-t border-egx-border/50 text-slate-300';
            row.slice(0, 12).forEach(cell => {
                const td = document.createElement('td');
                td.className = 'px-2 py-1.5 whitespace-nowrap max-w-48 truncate';
                td.textContent = String(cell ?? '');
                tr.appendChild(td);
            });
            previewBody.appendChild(tr);
        });
        const sheet = importWorkbook.Sheets[importSheetName];
        const range = sheet && sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
        const totalRows = range ? range.e.r + 1 : importRows.length;
        const chosenHeaders = (importRows[headerIndex] || []).map(normalizeHeader).filter(Boolean);
        const recognized = [
            'campaign name',
            'ad set name',
            'ad name',
            'campaign id',
            'ad set id',
            'ad id',
            'campaign status',
            'ad set status',
            'ad status',
            'campaign daily budget',
            'ad set daily budget',
            'link',
            'url tags',
            'gender',
            'age min',
            'age max',
        ].filter(h => chosenHeaders.includes(h));
        const duplicateHeaders = chosenHeaders.filter((h, i) => chosenHeaders.indexOf(h) !== i);
        const warning =
            recognized.length < 2 ? ' Atenção: poucos cabeçalhos reconhecidos; confira a linha selecionada.' : '';
        const duplicates = duplicateHeaders.length
            ? ` Cabeçalhos duplicados: ${[...new Set(duplicateHeaders)].join(', ')}.`
            : '';
        $('be-import-summary').textContent =
            `${importSheetName}: ${totalRows} linhas. Cabeçalho sugerido: linha ${detectHeaderRow(importRows) + 1}. ${recognized.length} cabeçalhos reconhecidos.${warning}${duplicates} Prévia de até 6 linhas e 12 colunas.`;
    }
    sheetSelect.addEventListener('change', () => {
        importSheetName = sheetSelect.value;
        showImportPreview();
    });
    headerSelect.addEventListener('change', renderImportPreview);
    $('be-btn-preview-refresh').addEventListener('click', renderImportPreview);
    const previewContent = $('be-preview-content'),
        previewToggle = $('be-preview-toggle');
    function setPreviewCollapsed(collapsed) {
        previewContent.hidden = collapsed;
        previewToggle.setAttribute('aria-expanded', String(!collapsed));
        previewToggle.textContent = collapsed ? '▸ Mostrar prévia' : '▾ Ocultar prévia';
        importPreview.classList.toggle('preview-collapsed', collapsed);
    }
    previewToggle.addEventListener('click', () => setPreviewCollapsed(!previewContent.hidden));
    $('be-btn-load-sheet').addEventListener('click', () => loadSelectedSheet());

    function handleFile(file) {
        if (!file) return;
        const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
        if (!allowed) {
            showAppToast('Formato inválido. Use XLSX, XLS ou CSV.', 'error');
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            showAppToast('Arquivo muito grande (limite de 25 MB).', 'error');
            return;
        }
        fileInfo.textContent = `Carregando: ${file.name}...`;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                importWorkbook = XLSX.read(data, { type: 'array' });
                if (!importWorkbook.SheetNames || !importWorkbook.SheetNames.length)
                    throw new Error('Arquivo sem abas');
                importFileName = file.name;
                // Guarda o arquivo original (até 8 MB) para manter as outras abas ao reabrir o projeto.
                importFileB64 = data.length <= MAX_SAVED_FILE ? bytesToBase64(data) : null;
                bulkRoot.classList.remove('editor-loaded');
                sheetSelect.replaceChildren();
                importWorkbook.SheetNames.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sheetSelect.appendChild(opt);
                });
                importSheetName = importWorkbook.SheetNames[0];
                sheetSelect.value = importSheetName;
                showImportPreview();
                fileInfo.textContent = `Arquivo selecionado: ${file.name} (${importWorkbook.SheetNames.length} aba(s))`;
                showAppToast('Arquivo lido. Confira a prévia e selecione a aba/cabeçalho.', 'success');
            } catch (err) {
                importWorkbook = null;
                importPreview.classList.add('hidden');
                fileInfo.textContent = 'Erro ao carregar arquivo.';
                showAppToast('Erro ao ler planilha. Verifique se o arquivo está íntegro.', 'error');
            }
        };
        reader.onerror = () => showAppToast('Falha na leitura do arquivo.', 'error');
        reader.readAsArrayBuffer(file);
    }
    function loadSelectedSheet() {
        if (!importWorkbook) return showAppToast('Selecione um arquivo primeiro.', 'error');
        importSheetName = sheetSelect.value;
        const headerIndex = Number(headerSelect.value || 0);
        const rawJson = importRows;
        if (!rawJson || rawJson.length <= headerIndex) return showAppToast('Linha de cabeçalho inválida.', 'error');
        sheetHeaders = (rawJson[headerIndex] || []).map(h => String(h ?? '').trim());
        if (!sheetHeaders.some(h => h))
            return showAppToast('A linha selecionada não parece conter cabeçalhos.', 'error');
        const width = sheetHeaders.length;
        sheetData = rawJson
            .slice(headerIndex + 1)
            .filter(r => r.some(c => c !== ''))
            .map(r => {
                const row = [...r];
                while (row.length < width) row.push('');
                return row;
            });
        originalBackup = JSON.stringify({ sheetHeaders, sheetData });
        historyStack = [];
        historyIndex = -1;
        selectedRows.clear();
        selectedCampaigns.clear();
        selectedAdsets.clear();
        compareOriginal = false;
        activeEditorLevel = 'campaign';
        pushHistory('Importação');
        fileInfo.textContent = `Carregado: ${importFileName} • Aba: ${importSheetName} • Cabeçalho: linha ${headerIndex + 1}`;
        renderTable();
        workspace.classList.remove('hidden');
        workspace.classList.add('flex');
        bulkRoot.classList.add('editor-loaded');
        setPreviewCollapsed(true);
        closeEditDrawer();
        showAppToast(`Aba carregada com ${sheetData.length} linhas e ${sheetHeaders.length} colunas.`, 'success');
    }

    function getColIdx(name) {
        return sheetHeaders.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase());
    }

    function snapshot() {
        return JSON.stringify({ sheetHeaders, sheetData });
    }
    function pushHistory(label = 'Alteração') {
        const snap = snapshot();
        if (historyIndex >= 0 && historyStack[historyIndex]?.snap === snap) return;
        historyStack = historyStack.slice(0, historyIndex + 1);
        historyStack.push({ snap, label });
        if (historyStack.length > 25) historyStack.shift();
        historyIndex = historyStack.length - 1;
        updateHistoryButtons();
        notifyChange();
    }
    function restoreSnapshot(snap) {
        const obj = JSON.parse(snap);
        sheetHeaders = obj.sheetHeaders;
        sheetData = obj.sheetData;
        selectedRows.clear();
        selectedCampaigns.clear();
        selectedAdsets.clear();
        renderTable();
        updateHistoryButtons();
        notifyChange();
    }
    function updateHistoryButtons() {
        $('be-btn-undo').disabled = historyIndex <= 0;
        $('be-btn-redo').disabled = historyIndex >= historyStack.length - 1;
        $('be-btn-undo').title =
            historyIndex > 0 ? `Desfazer: ${historyStack[historyIndex].label}` : 'Nada para desfazer';
        $('be-btn-redo').title =
            historyIndex < historyStack.length - 1
                ? `Refazer: ${historyStack[historyIndex + 1].label}`
                : 'Nada para refazer';
    }
    function undoHistory() {
        if (historyIndex <= 0) return;
        historyIndex--;
        restoreSnapshot(historyStack[historyIndex].snap);
        showAppToast('Ação desfeita.', 'info');
    }
    function redoHistory() {
        if (historyIndex >= historyStack.length - 1) return;
        historyIndex++;
        restoreSnapshot(historyStack[historyIndex].snap);
        showAppToast('Ação refeita.', 'info');
    }
    function rowIsChanged(rowIndex) {
        if (!compareOriginal || !originalBackup) return false;
        const orig = JSON.parse(originalBackup).sheetData;
        return JSON.stringify(sheetData[rowIndex]) !== JSON.stringify(orig[rowIndex]);
    }
    function renderTable() {
        const filterText = $('be-search').value.toLowerCase().trim();
        const statusFilter = $('be-filter-status').value;
        tbody.replaceChildren();
        const idxCamp = getColIdx('Campaign Name'),
            idxAdset = getColIdx('Ad Set Name'),
            idxAd = getColIdx('Ad Name');
        const idxStatus = getColIdx('Ad Status') !== -1 ? getColIdx('Ad Status') : getColIdx('Campaign Status');
        const idxAdStatus = getColIdx('Ad Status');
        const idxBudget =
            getColIdx('Campaign Daily Budget') !== -1
                ? getColIdx('Campaign Daily Budget')
                : getColIdx('Ad Set Daily Budget');
        const idxGender = getColIdx('Gender'),
            idxLink = getColIdx('Link');
        const idxCampStatus = getColIdx('Campaign Status'),
            idxCampBudget = getColIdx('Campaign Daily Budget'),
            idxCampObjective = getColIdx('Campaign Objective');
        const idxSetStatus =
            getColIdx('Ad Set Run Status') !== -1 ? getColIdx('Ad Set Run Status') : getColIdx('Ad Set Status');
        const idxSetBudget = getColIdx('Ad Set Daily Budget'),
            idxAgeMin = getColIdx('Age Min'),
            idxAgeMax = getColIdx('Age Max'),
            idxBid = getColIdx('Bid Amount'),
            idxBidStrategy =
                getColIdx('Ad Set Bid Strategy') !== -1 ? getColIdx('Ad Set Bid Strategy') : getColIdx('Bid Strategy');
        const findCol = (...names) => {
            for (const n of names) {
                const i = getColIdx(n);
                if (i !== -1) return i;
            }
            return -1;
        };
        const fieldHelp = {
            'Nome da campanha': 'Nome interno para identificar sua campanha.',
            Status: 'Define se a campanha está ativa ou pausada.',
            Objetivo: 'O resultado principal que você quer alcançar com os anúncios.',
            'Tipo de compra': 'Normalmente Leilão (Auction).',
            'Orçamento diário': 'Valor diário controlado no nível da campanha (CBO).',
            'Estratégia de lance da campanha': 'Como o Meta tenta gastar o orçamento para obter resultados.',
            'Novo objetivo': 'Campo de compatibilidade de exportações; normalmente deixe vazio.',
            'Programação de orçamento': 'Ativa orçamento programado, quando suportado.',
            'Categoria de anúncio especial':
                'Obrigatório em anúncios sobre crédito, emprego, moradia ou temas sociais/políticos, conforme regras.',
            'Nome do conjunto': 'Nome para identificar o público e as configurações deste conjunto.',
            'Estratégia de lance': 'Define o controle de custo/lance do conjunto.',
            'Bid Amount / limite de lance': 'Limite máximo de lance por leilão. Só preencha se sua estratégia exigir.',
            'Evento de cobrança': 'Como a plataforma cobra (ex.: impressões).',
            'Meta de otimização': 'O que o Meta prioriza entregar (ex.: conversões, alcance).',
            'Evento otimizado': 'Evento de conversão usado para otimizar (ex.: compra ou lead).',
            Países: 'País ou países incluídos no público.',
            'Tipo de localização': 'Se inclui pessoas que moram ou estiveram recentemente na localização.',
            Gênero: 'Quem pode receber o anúncio. “Todos” deixa sem restrição de gênero.',
            'Idade mínima': 'Limite inferior de idade do público.',
            'Idade máxima': 'Limite superior de idade do público.',
            'Advantage Audience': 'Indica se o público Advantage está habilitado; valor técnico do arquivo.',
            Plataformas: 'Plataformas onde o anúncio pode aparecer.',
            'Posições Facebook': 'Posicionamentos selecionados dentro do Facebook.',
            'Posições Instagram': 'Posicionamentos selecionados dentro do Instagram.',
            'Posições Audience Network': 'Posicionamentos da Audience Network.',
            'Posições Messenger': 'Posicionamentos dentro do Messenger.',
            'Link / URL': 'Destino ao clicar no anúncio.',
            'Tipo de criativo': 'Tipo de mídia ou criativo do anúncio.',
            Formato: 'Formato de veiculação do criativo.',
            'Call to Action': 'Texto do botão, como Saiba mais ou Comprar agora.',
            'URL Tags': 'Parâmetros de rastreamento (UTM), se usados.',
        };
        const enumOptions = {
            Status: [
                ['ACTIVE', 'Ativo'],
                ['PAUSED', 'Pausado'],
            ],
            'Tipo de compra': [
                ['AUCTION', 'Leilão'],
                ['RESERVED', 'Reserva'],
            ],
            Objetivo: [
                ['OUTCOME_SALES', 'Vendas'],
                ['OUTCOME_LEADS', 'Leads'],
                ['OUTCOME_ENGAGEMENT', 'Engajamento'],
                ['OUTCOME_TRAFFIC', 'Tráfego'],
                ['OUTCOME_AWARENESS', 'Reconhecimento'],
                ['OUTCOME_APP_PROMOTION', 'Promoção de app'],
            ],
            'Estratégia de lance da campanha': [
                ['LOWEST_COST_WITHOUT_CAP', 'Maior volume (sem limite)'],
                ['LOWEST_COST_WITH_BID_CAP', 'Limite de lance'],
                ['COST_CAP', 'Limite de custo'],
                ['LOWEST_COST_WITH_MIN_ROAS', 'ROAS mínimo'],
            ],
            'Estratégia de lance': [
                ['LOWEST_COST_WITHOUT_CAP', 'Maior volume (sem limite)'],
                ['LOWEST_COST_WITH_BID_CAP', 'Limite de lance'],
                ['COST_CAP', 'Limite de custo'],
                ['LOWEST_COST_WITH_MIN_ROAS', 'ROAS mínimo'],
            ],
            'Evento de cobrança': [
                ['IMPRESSIONS', 'Impressões'],
                ['LINK_CLICKS', 'Cliques no link'],
            ],
            'Meta de otimização': [
                ['CONVERSIONS', 'Conversões'],
                ['LINK_CLICKS', 'Cliques no link'],
                ['LANDING_PAGE_VIEWS', 'Visualizações da página de destino'],
                ['REACH', 'Alcance'],
                ['IMPRESSIONS', 'Impressões'],
                ['LEAD_GENERATION', 'Geração de leads'],
                ['THRUPLAY', 'ThruPlay'],
                ['POST_ENGAGEMENT', 'Engajamento com publicação'],
            ],
            'Tipo de localização': [
                ['home', 'Moram nesta localização'],
                ['recent', 'Estiveram recentemente'],
                ['travel_in', 'Estão viajando nesta localização'],
            ],
            Gênero: [
                ['', 'Todos'],
                ['Men', 'Masculino'],
                ['Women', 'Feminino'],
            ],
            'Programação de orçamento': [
                ['FALSE', 'Desativada'],
                ['TRUE', 'Ativada'],
            ],
            'Advantage Audience': [
                ['', 'Não definido'],
                ['0', 'Desativado'],
                ['1', 'Ativado'],
                ['FALSE', 'Desativado'],
                ['TRUE', 'Ativado'],
            ],
            'Categoria de anúncio especial': [
                ['', 'Nenhuma'],
                ['CREDIT', 'Crédito'],
                ['EMPLOYMENT', 'Emprego'],
                ['HOUSING', 'Moradia'],
                ['ISSUES_ELECTIONS_POLITICS', 'Temas sociais, eleições ou política'],
            ],
        };
        const levelGroups = {
            campaign: {
                'Configurações principais': ['Nome da campanha', 'Status', 'Objetivo', 'Tipo de compra'],
                'Orçamento e estratégia': ['Orçamento diário', 'Estratégia de lance da campanha'],
                'Opções avançadas': ['Novo objetivo', 'Programação de orçamento', 'Categoria de anúncio especial'],
            },
            adset: {
                'Configurações principais': ['Nome do conjunto', 'Status'],
                'Orçamento e lances': ['Orçamento diário', 'Estratégia de lance', 'Bid Amount / limite de lance'],
                'Entrega e otimização': ['Evento de cobrança', 'Meta de otimização', 'Evento otimizado'],
                Público: [
                    'Países',
                    'Tipo de localização',
                    'Gênero',
                    'Idade mínima',
                    'Idade máxima',
                    'Advantage Audience',
                ],
                Posicionamentos: [
                    'Plataformas',
                    'Posições Facebook',
                    'Posições Instagram',
                    'Posições Audience Network',
                    'Posições Messenger',
                ],
            },
            ad: {
                'Identificação e criativo': [
                    'Nome do anúncio',
                    'Status',
                    'Tipo de criativo',
                    'Formato',
                    'Call to Action',
                ],
                'Destino e rastreamento': ['Link / URL', 'URL Tags'],
            },
        };
        const makeLevelPanel = (
            anchor,
            groupRows,
            fields,
            panelClass = 'be-level-panel-row',
            level = 'ad',
            entityCount = 1,
        ) => {
            const inspector = $('be-inspector-content'),
                empty = $('be-inspector-empty');
            const titleName =
                level === 'campaign'
                    ? 'Editar campanha'
                    : level === 'adset'
                      ? 'Editar conjunto de anúncios'
                      : 'Editar anúncio';
            const existingLevel = inspector.dataset.level,
                existingKey = inspector.dataset.key;
            const groupKey = groupRows.map(({ i }) => i).join(',');
            if (existingLevel === level && existingKey === groupKey) {
                inspector.innerHTML = '';
                inspector.dataset.level = '';
                inspector.dataset.key = '';
                empty.hidden = false;
                return;
            }
            inspector.innerHTML = '';
            empty.hidden = true;
            inspector.dataset.level = level;
            inspector.dataset.key = groupKey;
            const panel = document.createElement('div');
            panel.className = 'be-ad-extra-panel be-editor-layout';
            const head = document.createElement('div');
            head.className = 'be-editor-head';
            const title = document.createElement('strong');
            title.textContent = titleName;
            head.appendChild(title);
            const intro = document.createElement('span');
            intro.textContent = `As mudanças serão aplicadas a ${entityCount} ${entityCount === 1 ? 'item' : 'itens'} selecionado(s), incluindo todas as linhas relacionadas.`;
            head.appendChild(intro);
            panel.appendChild(head);
            const grouped = levelGroups[level] || {};
            Object.entries(grouped).forEach(([groupTitle, captions]) => {
                const available = fields.filter(f => captions.includes(f[0]) && f[1] !== -1);
                if (!available.length) return;
                const section = document.createElement('section');
                section.className = 'be-editor-section';
                const sectionTitle = document.createElement('h4');
                sectionTitle.textContent = groupTitle;
                section.appendChild(sectionTitle);
                const grid = document.createElement('div');
                grid.className = 'be-editor-grid';
                available.forEach(([caption, idx, type = 'text', options]) => {
                    const wrap = document.createElement('label');
                    wrap.className = 'be-extra-field';
                    const cap = document.createElement('span');
                    cap.className = 'be-field-label';
                    cap.textContent = caption;
                    wrap.appendChild(cap);
                    const help = document.createElement('small');
                    help.className = 'be-field-help';
                    help.textContent = fieldHelp[caption] || 'Campo exportado para o Meta Ads.';
                    wrap.appendChild(help);
                    let input;
                    const choices = options || enumOptions[caption];
                    if (type === 'select' || type === 'gender' || choices) {
                        input = document.createElement('select');
                        const opts =
                            choices ||
                            (type === 'gender'
                                ? enumOptions['Gênero']
                                : [
                                      ['ACTIVE', 'Ativo'],
                                      ['PAUSED', 'Pausado'],
                                  ]);
                        opts.forEach(([v, t]) => {
                            const o = document.createElement('option');
                            o.value = v;
                            o.textContent = t;
                            input.appendChild(o);
                        });
                    } else {
                        input = document.createElement('input');
                        input.type = type;
                    }
                    const vals = [...new Set(groupRows.map(({ row }) => String(row[idx] ?? '')))];
                    if (vals.length > 1) {
                        const mixed = document.createElement('option');
                        mixed.value = '';
                        mixed.textContent = 'Valores diferentes (não alterar)';
                        input.insertBefore(mixed, input.firstChild);
                    }
                    if (
                        vals.length === 1 &&
                        !Array.from(input.options || []).some(o => o.value === vals[0]) &&
                        input.tagName === 'SELECT'
                    ) {
                        const custom = document.createElement('option');
                        custom.value = vals[0];
                        custom.textContent = 'Valor atual: ' + vals[0];
                        input.insertBefore(custom, input.firstChild);
                    }
                    input.value = vals.length === 1 ? vals[0] : '';
                    if (vals.length > 1) input.dataset.mixed = 'true';
                    input.placeholder = vals.length > 1 ? 'Valores diferentes — escolha para aplicar a todos' : '';
                    input.addEventListener('change', () => {
                        if (vals.length > 1 && input.value === '') return;
                        if (groupRows.every(({ row }) => String(row[idx] ?? '') === input.value)) return;
                        groupRows.forEach(({ row }) => (row[idx] = input.value));
                        pushHistory('Editar nível: ' + caption);
                    });
                    wrap.appendChild(input);
                    grid.appendChild(wrap);
                });
                section.appendChild(grid);
                panel.appendChild(section);
            });
            const note = document.createElement('div');
            note.className = 'be-editor-note';
            note.textContent =
                'Campos com valores diferentes aparecem como “Valores diferentes”. Deixe assim para não alterar; escolha um valor apenas se quiser padronizar todos os itens deste nível.';
            panel.appendChild(note);
            const actions = document.createElement('div');
            actions.className = 'be-editor-actions';
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'be-more-btn';
            close.textContent = 'Limpar painel';
            close.addEventListener('click', () => {
                inspector.innerHTML = '';
                inspector.dataset.level = '';
                inspector.dataset.key = '';
                empty.hidden = false;
            });
            actions.appendChild(close);
            panel.appendChild(actions);
            inspector.appendChild(panel);
        };
        const addTextCell = (tr, value, cls = '', title = false) => {
            const td = document.createElement('td');
            td.className = cls;
            td.textContent = value == null ? '' : String(value);
            if (title) td.title = value == null ? '' : String(value);
            tr.appendChild(td);
            return td;
        };
        const rows = sheetData.map((row, i) => ({
            row,
            i,
            camp: idxCamp !== -1 ? String(row[idxCamp] ?? '') : '(Campanha sem nome)',
            adset: idxAdset !== -1 ? String(row[idxAdset] ?? '') : '(Conjunto sem nome)',
            ad: idxAd !== -1 ? String(row[idxAd] ?? '') : '',
            status: idxStatus !== -1 ? String(row[idxStatus] ?? '').toUpperCase() : '',
        }));
        const campaignCount = new Set(rows.map(o => o.camp)).size,
            adsetCount = new Set(rows.map(o => o.camp + '\u0000' + o.adset)).size;
        $('be-campaign-count').textContent = campaignCount;
        $('be-adset-count').textContent = adsetCount;
        $('be-ad-count').textContent = rows.length;
        document
            .querySelectorAll('#be-level-tabs .be-level-tab')
            .forEach(b => b.setAttribute('aria-selected', String(b.dataset.level === activeEditorLevel)));
        const editorTable = tbody.closest('table');
        document.querySelectorAll('.be-selection-tools').forEach(el => (el.hidden = false));
        $('be-select-all').closest('th').hidden = false;
        const filteredRows = rows.filter(o => {
            const textMatch =
                !filterText ||
                o.ad.toLowerCase().includes(filterText) ||
                o.camp.toLowerCase().includes(filterText) ||
                o.adset.toLowerCase().includes(filterText);
            return textMatch && (!statusFilter || o.status === statusFilter);
        });
        let visibleAds = 0;
        const thead = editorTable?.tHead;
        if (thead) {
            thead.hidden = false;
            const heads = thead.rows[0].cells;
            heads[0].hidden = false;
            heads[1].textContent =
                activeEditorLevel === 'campaign'
                    ? 'Campanha'
                    : activeEditorLevel === 'adset'
                      ? 'Conjunto de anúncios'
                      : 'Anúncio';
            heads[2].textContent = 'Status';
            heads[3].textContent =
                activeEditorLevel === 'campaign'
                    ? 'Conjuntos / anúncios'
                    : activeEditorLevel === 'adset'
                      ? 'Campanha'
                      : 'Destino';
            heads[4].textContent = 'Editar';
            heads[5].textContent = 'Excluir';
            document.querySelectorAll('.be-selection-tools').forEach(el => (el.hidden = false));
            $('be-select-all').closest('th').hidden = false;
        }
        const makeLevelEditButton = (label, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'be-more-btn';
            b.textContent = '✎ Editar';
            b.title = 'Editar configurações deste nível';
            b.addEventListener('click', handler);
            return b;
        };
        const makeDeleteButton = (label, indices) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'be-del-row text-slate-500 hover:text-red-400 font-bold px-1.5 py-0.5 rounded';
            b.textContent = '✕';
            b.title = 'Excluir ' + label;
            b.addEventListener('click', async () => {
                if (
                    !(await EGXDialog.confirm(`Excluir ${label} e ${indices.length} linha(s) relacionada(s)?`, {
                        danger: true,
                        okLabel: 'Excluir',
                    }))
                )
                    return;
                pushHistory('Excluir ' + label);
                indices
                    .slice()
                    .sort((a, b) => b - a)
                    .forEach(i => sheetData.splice(i, 1));
                selectedRows.clear();
                pushHistory('Excluir ' + label);
                renderTable();
                showAppToast(`${label} excluído.`, 'success');
            });
            return b;
        };
        const selectionSet =
            activeEditorLevel === 'campaign'
                ? selectedCampaigns
                : activeEditorLevel === 'adset'
                  ? selectedAdsets
                  : selectedRows;
        const addRowBase = (tr, name, status, context, action, deleteAction, selectionKey) => {
            const td = document.createElement('td');
            td.className = 'py-2 px-3 text-center';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = selectionSet.has(selectionKey);
            cb.dataset.selectionKey = selectionKey;
            cb.setAttribute(
                'aria-label',
                `Selecionar ${activeEditorLevel === 'campaign' ? 'campanha' : activeEditorLevel === 'adset' ? 'conjunto' : 'anúncio'} ${name || ''}`,
            );
            cb.addEventListener('change', () => {
                cb.checked ? selectionSet.add(selectionKey) : selectionSet.delete(selectionKey);
                tr.classList.toggle('bg-purple-950/30', cb.checked);
                updateSelectionHeader();
                updateBulkEditButton();
            });
            td.appendChild(cb);
            tr.appendChild(td);
            const nameTd = document.createElement('td');
            nameTd.className = 'py-2 px-3 font-medium';
            nameTd.textContent = name || '(Sem nome)';
            nameTd.title = name || '';
            tr.appendChild(nameTd);
            const statusTd = document.createElement('td');
            statusTd.className = 'py-2 px-3';
            const pill = document.createElement('span');
            pill.className =
                'be-status-pill ' +
                (status === 'ACTIVE'
                    ? 'be-status-active'
                    : status === 'PAUSED'
                      ? 'be-status-paused'
                      : 'be-status-other');
            pill.textContent = status || '—';
            statusTd.appendChild(pill);
            tr.appendChild(statusTd);
            const contextTd = document.createElement('td');
            contextTd.className = 'py-2 px-3 text-slate-400 text-xs';
            contextTd.textContent = context || '—';
            contextTd.title = context || '';
            tr.appendChild(contextTd);
            const editTd = document.createElement('td');
            editTd.className = 'py-2 px-3 text-center';
            editTd.appendChild(action);
            tr.appendChild(editTd);
            const deleteTd = document.createElement('td');
            deleteTd.className = 'py-2 px-3 text-center';
            deleteTd.appendChild(deleteAction);
            tr.appendChild(deleteTd);
        };
        if (activeEditorLevel === 'campaign') {
            const campMap = new Map();
            filteredRows.forEach(o => {
                if (!campMap.has(o.camp)) campMap.set(o.camp, []);
                campMap.get(o.camp).push(o);
            });
            campMap.forEach((campRows, campName) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-purple-950/20 transition-colors';
                const first = campRows[0],
                    status = idxCampStatus !== -1 ? String(first.row[idxCampStatus] ?? '').toUpperCase() : '';
                const context = `${new Set(campRows.map(x => x.adset)).size} conjunto(s) · ${campRows.length} anúncio(s)`;
                const indices = campRows.map(x => x.i);
                const edit = makeLevelEditButton('Editar campanha', () =>
                    makeLevelPanel(
                        tr,
                        campRows,
                        [
                            ['Nome da campanha', idxCamp, 'text'],
                            ['Status', idxCampStatus, 'select'],
                            ['Objetivo', idxCampObjective, 'text'],
                            ['Tipo de compra', findCol('Buying Type'), 'select'],
                            ['Orçamento diário', idxCampBudget, 'number'],
                            ['Estratégia de lance da campanha', findCol('Campaign Bid Strategy'), 'select'],
                            ['Novo objetivo', findCol('New Objective'), 'text'],
                            [
                                'Programação de orçamento',
                                findCol('Is Budget Scheduling Enabled For Campaign'),
                                'select',
                            ],
                            [
                                'Categoria de anúncio especial',
                                findCol('Special Ad Categories', 'Special Ad Category'),
                                'select',
                            ],
                        ],
                        'be-level-panel-row',
                        'campaign',
                    ),
                );
                addRowBase(tr, campName, status, context, edit, makeDeleteButton('campanha', indices), campName);
                tbody.appendChild(tr);
            });
        } else if (activeEditorLevel === 'adset') {
            const setMap = new Map();
            filteredRows.forEach(o => {
                const key = o.camp + '\u0000' + o.adset;
                if (!setMap.has(key)) setMap.set(key, []);
                setMap.get(key).push(o);
            });
            setMap.forEach((setRows, key) => {
                const [campName, adsetName] = key.split('\u0000');
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-purple-950/20 transition-colors';
                const first = setRows[0],
                    status = idxSetStatus !== -1 ? String(first.row[idxSetStatus] ?? '').toUpperCase() : '';
                const indices = setRows.map(x => x.i);
                const edit = makeLevelEditButton('Editar conjunto', () =>
                    makeLevelPanel(
                        tr,
                        setRows,
                        [
                            ['Nome do conjunto', idxAdset, 'text'],
                            ['Status', idxSetStatus, 'select'],
                            ['Orçamento diário', idxSetBudget, 'number'],
                            ['Estratégia de lance', idxBidStrategy, 'select'],
                            ['Bid Amount / limite de lance', idxBid, 'number'],
                            ['Evento de cobrança', findCol('Billing Event'), 'select'],
                            ['Meta de otimização', findCol('Optimization Goal'), 'select'],
                            ['Evento otimizado', findCol('Optimized Event'), 'text'],
                            ['Países', findCol('Countries'), 'text'],
                            ['Tipo de localização', findCol('Location Types'), 'select'],
                            ['Gênero', idxGender, 'gender'],
                            ['Idade mínima', idxAgeMin, 'number'],
                            ['Idade máxima', idxAgeMax, 'number'],
                            ['Advantage Audience', findCol('Advantage Audience'), 'select'],
                            ['Plataformas', findCol('Publisher Platforms'), 'text'],
                            ['Posições Facebook', findCol('Facebook Positions'), 'text'],
                            ['Posições Instagram', findCol('Instagram Positions'), 'text'],
                            ['Posições Audience Network', findCol('Audience Network Positions'), 'text'],
                            ['Posições Messenger', findCol('Messenger Positions'), 'text'],
                        ],
                        'be-level-panel-row',
                        'adset',
                    ),
                );
                addRowBase(tr, adsetName, status, campName, edit, makeDeleteButton('conjunto', indices), key);
                tbody.appendChild(tr);
            });
        } else {
            filteredRows.forEach(({ row, i, ad, status, camp, adset }) => {
                visibleAds++;
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-purple-950/20 transition-colors';
                tr.dataset.rowIndex = i;
                if (selectedRows.has(i)) tr.classList.add('bg-purple-950/30');
                if (rowIsChanged(i)) tr.classList.add('bg-amber-950/20');
                const linkVal = idxLink !== -1 ? String(row[idxLink] ?? '') : '';
                const edit = makeLevelEditButton('Editar anúncio', () =>
                    makeLevelPanel(
                        tr,
                        [{ row, i }],
                        [
                            ['Nome do anúncio', idxAd, 'text'],
                            ['Status', idxAdStatus, 'select'],
                            ['Link / URL', idxLink, 'text'],
                            ['Tipo de criativo', findCol('Creative Type'), 'text'],
                            ['Formato', findCol('Format Option'), 'text'],
                            ['Call to Action', findCol('Call to Action'), 'text'],
                            ['URL Tags', findCol('URL Tags'), 'text'],
                        ],
                        'be-ad-extra',
                        'ad',
                    ),
                );
                const del = makeDeleteButton('anúncio', [i]);
                addRowBase(tr, ad, status, linkVal || `${camp} / ${adset}`, edit, del, i);
                tbody.appendChild(tr);
            });
        }
        $('be-btn-select-visible').textContent = '☑ Selecionar visíveis';
        $('be-btn-select-visible').hidden = activeEditorLevel !== 'ad';
        $('be-btn-duplicate').hidden = activeEditorLevel !== 'ad';
        $('be-btn-delete-selected').hidden = activeEditorLevel !== 'ad';
        $('be-btn-compare').textContent = compareOriginal ? '🔎 Ocultar comparação' : '🔎 Comparar original';
        $('be-btn-undo').disabled = historyIndex <= 0;
        $('be-btn-redo').disabled = historyIndex >= historyStack.length - 1;
        rowCount.textContent =
            activeEditorLevel === 'campaign'
                ? `${new Set(filteredRows.map(o => o.camp)).size} campanha(s) / ${campaignCount} total${selectedCampaigns.size ? ` • ${selectedCampaigns.size} selecionado(s)` : ''}`
                : activeEditorLevel === 'adset'
                  ? `${adsetCount} conjunto(s) / ${adsetCount} total${selectedAdsets.size ? ` • ${selectedAdsets.size} selecionado(s)` : ''}`
                  : `${visibleAds} anúncio(s) visível(is) / ${sheetData.length} total${selectedRows.size ? ` • ${selectedRows.size} selecionado(s)` : ''}`;
        colCount.textContent = `${sheetHeaders.length} colunas preservadas`;
        updateSelectionHeader();
        updateHistoryButtons();
        if (lastValidation) validateWorkbook(false);
    }
    let lastValidation = null;
    function goToValidationFinding(finding) {
        const rowIndex = finding.row - 1,
            row = sheetData[rowIndex];
        if (!row) return;
        const ixCamp = getColIdx('Campaign Name'),
            ixAdset = getColIdx('Ad Set Name'),
            ixAd = getColIdx('Ad Name');
        const camp = String(row[ixCamp] ?? ''),
            adset = String(row[ixAdset] ?? ''),
            ad = String(row[ixAd] ?? '');
        activeEditorLevel = finding.level === 'Campanha' ? 'campaign' : finding.level === 'Conjunto' ? 'adset' : 'ad';
        $('be-search').value = activeEditorLevel === 'campaign' ? camp : activeEditorLevel === 'adset' ? adset : ad;
        $('be-filter-status').value = '';
        selectedRows.clear();
        selectedCampaigns.clear();
        selectedAdsets.clear();
        if (activeEditorLevel === 'campaign') selectedCampaigns.add(camp);
        else if (activeEditorLevel === 'adset') selectedAdsets.add(`${camp}\u0000${adset}`);
        else selectedRows.add(rowIndex);
        document.querySelectorAll('#be-level-tabs .be-level-tab').forEach(t => {
            t.setAttribute('aria-selected', String(t.dataset.level === activeEditorLevel));
        });
        $('be-inspector-content').innerHTML = '';
        $('be-inspector-content').dataset.level = '';
        $('be-inspector-content').dataset.key = '';
        $('be-inspector-empty').hidden = false;
        renderTable();
        $('be-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
        showAppToast('Item relacionado ao diagnóstico selecionado na lista.', 'info');
    }
    function validateWorkbook(showDetails = true) {
        if (!sheetData.length) {
            lastValidation = { errors: [], warnings: [], checked: 0 };
            $('be-validation-summary').innerHTML =
                '<span class="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300">Importe uma planilha para validar.</span>';
            $('be-validation-results').classList.add('hidden');
            return lastValidation;
        }
        const { errors, warnings, checked } = EGXValidation.validateSheet(
            sheetHeaders,
            sheetData,
            $('be-validation-model')?.value || 'general',
        );
        lastValidation = { errors, warnings, checked };
        showDetails = showDetails || !$('be-validation-results').classList.contains('hidden');
        const summary = $('be-validation-summary');
        summary.innerHTML = `<span class="rounded-lg px-2.5 py-1 ${errors.length ? 'bg-red-950/60 text-red-300 border border-red-500/30' : 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'}">${errors.length} erro(s)</span><span class="rounded-lg px-2.5 py-1 ${warnings.length ? 'bg-amber-950/50 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}">${warnings.length} aviso(s)</span><span class="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300">${checked} linha(s) analisada(s)</span><span class="rounded-lg ${errors.length ? 'bg-red-950/60 text-red-300' : 'bg-emerald-950/50 text-emerald-300'} px-2.5 py-1">${errors.length ? 'Requer revisão' : 'Sem erros críticos'}</span>`;
        const resultBox = $('be-validation-results');
        if (showDetails) {
            resultBox.classList.remove('hidden');
            const all = [
                ...errors.map(x => ({ ...x, severity: 'error' })),
                ...warnings.map(x => ({ ...x, severity: 'warning' })),
            ];
            resultBox.replaceChildren();
            if (!all.length) {
                const ok = document.createElement('div');
                ok.className = 'rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2 text-xs text-emerald-300';
                ok.textContent = 'Nenhum problema encontrado. A planilha passou na validação.';
                resultBox.appendChild(ok);
            } else
                all.slice(0, 80).forEach(x => {
                    const card = document.createElement('div');
                    card.className = `flex flex-wrap items-center gap-2 rounded-lg ${x.severity === 'error' ? 'bg-red-950/25 border-red-500/20' : 'bg-amber-950/20 border-amber-500/20'} border p-2 text-xs`;
                    const icon = document.createElement('span');
                    icon.textContent = x.severity === 'error' ? '🔴' : '🟡';
                    const text = document.createElement('div');
                    text.className = 'min-w-0 flex-1';
                    const head = document.createElement('strong');
                    head.className = 'text-slate-200';
                    head.textContent = `Linha ${x.row} · ${x.level}: `;
                    const msg = document.createElement('span');
                    msg.className = 'text-slate-300';
                    msg.textContent = x.message;
                    text.append(head, msg);
                    card.append(icon, text);
                    if (
                        !String(x.type || '').startsWith('model-') &&
                        x.type !== 'model-bid' &&
                        Number.isInteger(x.row) &&
                        x.row > 0 &&
                        x.row <= sheetData.length
                    ) {
                        const go = document.createElement('button');
                        go.type = 'button';
                        go.className = 'rounded-md border border-slate-600 px-2 py-1 text-slate-200 hover:bg-slate-700';
                        go.textContent = 'Ver item';
                        go.addEventListener('click', () => goToValidationFinding(x));
                        card.appendChild(go);
                    }
                    resultBox.appendChild(card);
                });
            if (all.length > 80) {
                const more = document.createElement('p');
                more.className = 'text-xs text-slate-500';
                more.textContent = `Exibindo 80 de ${all.length} ocorrências.`;
                resultBox.appendChild(more);
            }
        }
        return lastValidation;
    }
    $('be-btn-validate').addEventListener('click', () => {
        const v = validateWorkbook(true);
        showAppToast(
            v.errors.length
                ? 'Validação concluída: confira os erros.'
                : v.warnings.length
                  ? 'Validação concluída com avisos.'
                  : 'Planilha validada sem problemas.',
            'info',
        );
    });
    $('be-validation-model').addEventListener('change', () => {
        if (lastValidation) validateWorkbook(true);
    });

    function currentSelectionSet() {
        return activeEditorLevel === 'campaign'
            ? selectedCampaigns
            : activeEditorLevel === 'adset'
              ? selectedAdsets
              : selectedRows;
    }
    function updateBulkEditButton() {
        const btn = $('be-btn-edit-selected');
        if (!btn) return;
        const n = currentSelectionSet().size;
        btn.hidden = n === 0;
        btn.textContent = `✎ Editar ${n} selecionado(s)`;
    }
    function updateSelectionHeader() {
        const selectAll = $('be-select-all');
        if (!selectAll) return;
        const visible = [...tbody.querySelectorAll('input[type="checkbox"][data-selection-key]')];
        selectAll.checked = visible.length > 0 && visible.every(c => c.checked);
        selectAll.indeterminate = visible.some(c => c.checked) && !selectAll.checked;
        updateBulkEditButton();
    }
    document.querySelectorAll('#be-level-tabs .be-level-tab').forEach(tab =>
        tab.addEventListener('click', () => {
            activeEditorLevel = tab.dataset.level;
            $('be-inspector-content').innerHTML = '';
            $('be-inspector-content').dataset.level = '';
            $('be-inspector-content').dataset.key = '';
            $('be-inspector-empty').hidden = false;
            renderTable();
        }),
    );
    $('be-search').addEventListener('input', renderTable);
    $('be-filter-status').addEventListener('change', renderTable);
    $('be-select-all').addEventListener('change', () => {
        const set = currentSelectionSet();
        tbody.querySelectorAll('input[type="checkbox"][data-selection-key]').forEach(c => {
            const k = c.dataset.selectionKey;
            $('be-select-all').checked ? set.add(k) : set.delete(k);
        });
        renderTable();
    });
    $('be-btn-select-visible').addEventListener('click', () => {
        const set = currentSelectionSet();
        tbody
            .querySelectorAll('input[type="checkbox"][data-selection-key]')
            .forEach(c => set.add(c.dataset.selectionKey));
        renderTable();
        showAppToast('Itens visíveis selecionados.', 'info');
    });
    $('be-btn-edit-selected').addEventListener('click', () => {
        const set = currentSelectionSet();
        if (!set.size) return;
        const level = activeEditorLevel,
            idxCamp = getColIdx('Campaign Name'),
            idxAdset = getColIdx('Ad Set Name'),
            idxAd = getColIdx('Ad Name');
        const all = sheetData.map((row, i) => ({
            row,
            i,
            camp: String(row[idxCamp] ?? ''),
            adset: String(row[idxAdset] ?? ''),
            ad: String(row[idxAd] ?? ''),
        }));
        let groups = [];
        if (level === 'campaign') groups = all.filter(o => set.has(o.camp));
        else if (level === 'adset') groups = all.filter(o => set.has(o.camp + '\u0000' + o.adset));
        else groups = all.filter(o => set.has(o.i));
        const fields =
            level === 'campaign'
                ? [
                      ['Nome da campanha', idxCamp, 'text'],
                      ['Status', getColIdx('Campaign Status'), 'select'],
                      ['Objetivo', getColIdx('Campaign Objective'), 'text'],
                      ['Tipo de compra', getColIdx('Buying Type'), 'select'],
                      ['Orçamento diário', getColIdx('Campaign Daily Budget'), 'number'],
                      ['Estratégia de lance da campanha', getColIdx('Campaign Bid Strategy'), 'select'],
                      ['Novo objetivo', getColIdx('New Objective'), 'text'],
                      ['Programação de orçamento', getColIdx('Is Budget Scheduling Enabled For Campaign'), 'select'],
                      ['Categoria de anúncio especial', getColIdx('Special Ad Categories'), 'select'],
                  ]
                : level === 'adset'
                  ? [
                        ['Nome do conjunto', idxAdset, 'text'],
                        ['Status', getColIdx('Ad Set Run Status'), 'select'],
                        ['Orçamento diário', getColIdx('Ad Set Daily Budget'), 'number'],
                        [
                            'Estratégia de lance',
                            getColIdx('Ad Set Bid Strategy') !== -1
                                ? getColIdx('Ad Set Bid Strategy')
                                : getColIdx('Bid Strategy'),
                            'select',
                        ],
                        ['Bid Amount / limite de lance', getColIdx('Bid Amount'), 'number'],
                        ['Evento de cobrança', getColIdx('Billing Event'), 'select'],
                        ['Meta de otimização', getColIdx('Optimization Goal'), 'select'],
                        ['Evento otimizado', getColIdx('Optimized Event'), 'text'],
                        ['Países', getColIdx('Countries'), 'text'],
                        ['Tipo de localização', getColIdx('Location Types'), 'select'],
                        ['Gênero', getColIdx('Gender'), 'gender'],
                        ['Idade mínima', getColIdx('Age Min'), 'number'],
                        ['Idade máxima', getColIdx('Age Max'), 'number'],
                        ['Advantage Audience', getColIdx('Advantage Audience'), 'select'],
                        ['Plataformas', getColIdx('Publisher Platforms'), 'text'],
                        ['Posições Facebook', getColIdx('Facebook Positions'), 'text'],
                        ['Posições Instagram', getColIdx('Instagram Positions'), 'text'],
                        ['Posições Audience Network', getColIdx('Audience Network Positions'), 'text'],
                        ['Posições Messenger', getColIdx('Messenger Positions'), 'text'],
                    ]
                  : [
                        ['Nome do anúncio', idxAd, 'text'],
                        ['Status', getColIdx('Ad Status'), 'select'],
                        ['Link / URL', getColIdx('Link'), 'text'],
                        ['Tipo de criativo', getColIdx('Creative Type'), 'text'],
                        ['Formato', getColIdx('Format Option'), 'text'],
                        ['Call to Action', getColIdx('Call to Action'), 'text'],
                        ['URL Tags', getColIdx('URL Tags'), 'text'],
                    ];
        const filtered = fields.filter(f => f[1] !== -1);
        const representative = groups[0];
        if (!representative) return;
        makeLevelPanel(null, groups, filtered, 'be-level-panel-row', level, set.size);
    });
    $('be-btn-duplicate').addEventListener('click', () => {
        if (!selectedRows.size) return showAppToast('Selecione uma ou mais linhas para duplicar.', 'error');
        pushHistory('Duplicar linhas');
        const inds = [...selectedRows].sort((a, b) => b - a);
        inds.forEach(i => sheetData.splice(i + 1, 0, [...sheetData[i]]));
        selectedRows.clear();
        pushHistory('Duplicar linhas');
        renderTable();
        showAppToast(`${inds.length} linha(s) duplicada(s).`, 'success');
    });
    $('be-btn-delete-selected').addEventListener('click', async () => {
        if (!selectedRows.size) return showAppToast('Selecione linhas para excluir.', 'error');
        const n = selectedRows.size;
        if (
            !(await EGXDialog.confirm(`Excluir ${n} linha(s) selecionada(s)? Esta ação pode ser desfeita.`, {
                danger: true,
                okLabel: 'Excluir',
            }))
        )
            return;
        pushHistory('Excluir linhas selecionadas');
        [...selectedRows].sort((a, b) => b - a).forEach(i => sheetData.splice(i, 1));
        selectedRows.clear();
        pushHistory('Excluir linhas selecionadas');
        renderTable();
        showAppToast(`${n} linha(s) excluída(s).`, 'success');
    });
    $('be-btn-undo').addEventListener('click', undoHistory);
    $('be-btn-redo').addEventListener('click', redoHistory);
    $('be-btn-compare').addEventListener('click', () => {
        compareOriginal = !compareOriginal;
        renderTable();
        $('be-btn-compare').textContent = compareOriginal ? '🔎 Ocultar comparação' : '🔎 Comparar';
        showAppToast(compareOriginal ? 'Linhas alteradas destacadas em âmbar.' : 'Comparação desativada.', 'info');
    });
    $('be-btn-backup').addEventListener('click', () => {
        if (!sheetData.length) return showAppToast('Nenhuma planilha carregada para backup.', 'error');
        const payload = {
            createdAt: new Date().toISOString(),
            fileName: importFileName,
            sheetName: importSheetName,
            headers: sheetHeaders,
            data: sheetData,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (importFileName || 'egx_backup').replace(/\.(xlsx|xls|csv)$/i, '') + '_backup.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showAppToast('Backup JSON baixado.', 'success');
    });
    $('be-btn-restore').addEventListener('click', async () => {
        if (!originalBackup) return showAppToast('Não há backup original disponível.', 'error');
        if (
            !(await EGXDialog.confirm(
                'Restaurar a planilha exatamente como foi importada? Todas as alterações atuais serão revertidas.',
                { okLabel: 'Restaurar' },
            ))
        )
            return;
        pushHistory('Antes de restaurar original');
        restoreSnapshot(originalBackup);
        pushHistory('Restaurar original');
        showAppToast('Planilha original restaurada.', 'success');
    });

    /* ----- Surgical Fix: Bulk Application & Strip Legacy IDs / Timestamps ----- */
    $('be-btn-apply').addEventListener('click', async () => {
        if (!sheetData.length) return showAppToast('Nenhuma planilha carregada.', 'error');
        if (!selectedRows.size) return showAppToast('Selecione os anúncios que deseja editar em lote.', 'error');
        const targetRows = [...selectedRows].map(i => sheetData[i]).filter(Boolean);

        const doReplace = $('be-chk-replace').checked;
        const findText = $('be-find').value;
        const replaceText = $('be-replace').value;
        const repCamp = $('be-rep-camp').checked;
        const repAdset = $('be-rep-adset').checked;
        const repAd = $('be-rep-ad').checked;

        const doLink = $('be-chk-link').checked,
            newLink = $('be-link').value.trim();
        const doUtm = $('be-chk-utm').checked,
            newUtm = $('be-utm').value.trim();
        const doBudget = $('be-chk-budget').checked,
            newBudget = $('be-budget').value;
        const doBid = $('be-chk-bid').checked,
            newBid = $('be-bid').value;
        const budgetTarget = $('be-budget-target').value;
        const doStatus = $('be-chk-status').checked,
            newStatus = $('be-status').value;
        const doGender = $('be-chk-gender').checked,
            newGender = $('be-gender').value;
        const doAge = $('be-chk-age').checked,
            newAgeMin = $('be-age-min').value,
            newAgeMax = $('be-age-max').value;
        if (doBudget && (!Number.isFinite(Number(newBudget)) || Number(newBudget) <= 0))
            return showAppToast('Informe um orçamento válido maior que zero.', 'error');
        if (doBid && (!Number.isFinite(Number(newBid)) || Number(newBid) < 0))
            return showAppToast('Informe um Bid válido.', 'error');
        if (doLink && newLink && !/^https:\/\//i.test(newLink))
            return showAppToast('O link deve começar com https://', 'error');
        if (
            doAge &&
            (!Number.isInteger(Number(newAgeMin)) ||
                !Number.isInteger(Number(newAgeMax)) ||
                Number(newAgeMin) < 18 ||
                Number(newAgeMax) > 65 ||
                Number(newAgeMin) > Number(newAgeMax))
        )
            return showAppToast('Faixa etária inválida. Confira mínimo e máximo (18–65).', 'error');
        const enabledOps = [doReplace && findText, doLink, doUtm, doBudget, doBid, doStatus, doGender, doAge].filter(
            Boolean,
        ).length;
        if (!enabledOps) return showAppToast('Marque ao menos uma alteração para aplicar.', 'error');
        const beforeApply = JSON.stringify({ sheetHeaders, sheetData });
        const operationSummary = [
            doReplace && findText ? `Substituir “${findText}” por “${replaceText}”` : '',
            doLink ? 'Alterar link' : '',
            doUtm ? 'Alterar URL Tags' : '',
            doBudget ? `Orçamento: ${newBudget} (alvo ${$('be-budget-target').selectedOptions[0].text})` : '',
            doBid ? `Bid: ${newBid}` : '',
            doStatus ? `Status: ${newStatus}` : '',
            doGender ? `Gênero: ${newGender || 'Aberto'}` : '',
            doAge ? `Idade: ${newAgeMin}–${newAgeMax}` : '',
        ]
            .filter(Boolean)
            .join('\n');
        if (
            !(await EGXDialog.confirm(
                `Aplicar as alterações em ${targetRows.length} anúncios selecionados?\n\n${operationSummary}\n\nSerá criado um ponto de restauração.`,
            ))
        )
            return;

        const idxCamp = getColIdx('Campaign Name');
        const idxAdset = getColIdx('Ad Set Name');
        const idxAd = getColIdx('Ad Name');
        const idxCampStat = getColIdx('Campaign Status');
        const idxAdsetStat = getColIdx('Ad Set Run Status');
        const idxAdStat = getColIdx('Ad Status');
        const idxCampBud = getColIdx('Campaign Daily Budget');
        const idxAdsetBud = getColIdx('Ad Set Daily Budget');
        const idxBid = getColIdx('Bid Amount');
        const idxGender = getColIdx('Gender');
        const idxAgeMin = getColIdx('Age Min');
        const idxAgeMax = getColIdx('Age Max');
        const idxLink = getColIdx('Link');
        const idxUtm = getColIdx('URL Tags');
        if (
            doBudget &&
            ((budgetTarget === 'CAMPAIGN' && idxCampBud === -1) ||
                (budgetTarget === 'ADSET' && idxAdsetBud === -1) ||
                (budgetTarget === 'AUTO' && idxCampBud === -1 && idxAdsetBud === -1))
        )
            return showAppToast('A coluna de orçamento correspondente não foi encontrada.', 'error');
        if (doBid && idxBid === -1) return showAppToast('A coluna Bid Amount não foi encontrada.', 'error');
        if (doLink && idxLink === -1) return showAppToast('A coluna Link não foi encontrada.', 'error');
        if (doUtm && idxUtm === -1) return showAppToast('A coluna URL Tags não foi encontrada.', 'error');
        if (doGender && idxGender === -1) return showAppToast('A coluna Gender não foi encontrada.', 'error');
        if (doAge && (idxAgeMin === -1 || idxAgeMax === -1))
            return showAppToast('As colunas Age Min e Age Max não foram encontradas.', 'error');

        pushHistory('Aplicar alterações em lote');
        targetRows.forEach(row => {
            // Find & Replace
            if (doReplace && findText) {
                const re = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                if (repCamp && idxCamp !== -1 && row[idxCamp])
                    row[idxCamp] = String(row[idxCamp]).replace(re, replaceText);
                if (repAdset && idxAdset !== -1 && row[idxAdset])
                    row[idxAdset] = String(row[idxAdset]).replace(re, replaceText);
                if (repAd && idxAd !== -1 && row[idxAd]) row[idxAd] = String(row[idxAd]).replace(re, replaceText);
            }

            // Link & UTM
            if (doLink && idxLink !== -1) row[idxLink] = newLink;
            if (doUtm && idxUtm !== -1) row[idxUtm] = newUtm;

            // Budget
            if (doBudget) {
                if (budgetTarget === 'CAMPAIGN' && idxCampBud !== -1) row[idxCampBud] = newBudget;
                else if (budgetTarget === 'ADSET' && idxAdsetBud !== -1) row[idxAdsetBud] = newBudget;
                else if (budgetTarget === 'AUTO') {
                    const hasCampaignBudget = idxCampBud !== -1 && row[idxCampBud] !== '' && row[idxCampBud] != null;
                    const hasAdsetBudget = idxAdsetBud !== -1 && row[idxAdsetBud] !== '' && row[idxAdsetBud] != null;
                    // AUTO altera apenas um destino. Se ambos estiverem preenchidos, prioriza Campaign (CBO) e nunca altera os dois.
                    if (hasCampaignBudget) row[idxCampBud] = newBudget;
                    else if (hasAdsetBudget) row[idxAdsetBud] = newBudget;
                }
            }

            // Bid
            if (doBid && idxBid !== -1) row[idxBid] = newBid;

            // Status
            if (doStatus) {
                if (idxCampStat !== -1) row[idxCampStat] = newStatus;
                if (idxAdsetStat !== -1) row[idxAdsetStat] = newStatus;
                if (idxAdStat !== -1) row[idxAdStat] = newStatus;
            }

            // Gender & Age
            if (doGender && idxGender !== -1) row[idxGender] = newGender;
            if (doAge) {
                if (idxAgeMin !== -1) row[idxAgeMin] = newAgeMin;
                if (idxAgeMax !== -1) row[idxAgeMax] = newAgeMax;
            }
        });

        renderTable();
        pushHistory('Aplicar alterações em lote');
        showAppToast('Alterações aplicadas na planilha! Use Desfazer se precisar reverter.', 'success');
    });

    /* ----- Export with Surgical ID/Timestamp Strip ----- */
    $('be-btn-export').addEventListener('click', async () => {
        if (!sheetData.length) return showAppToast('Nenhuma planilha para exportar.', 'error');
        const validation = validateWorkbook(true);
        if (validation.errors.length) {
            if (
                !(await EGXDialog.confirm(`A validação encontrou ${validation.errors.length} erro(s) e ${validation.warnings.length} aviso(s).

Recomendamos corrigir os erros antes de exportar. Deseja continuar mesmo assim?`))
            )
                return;
        } else if (
            validation.warnings.length &&
            !(await EGXDialog.confirm(`A validação encontrou ${validation.warnings.length} aviso(s).

Deseja exportar mesmo assim?`))
        )
            return;

        const doClearIDs = $('be-chk-clear-ids').checked;
        const keysToRemove = [
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

        let finalHeaders = [...sheetHeaders];
        let finalData = sheetData.map(r => [...r]);

        if (doClearIDs) {
            const indicesToRemove = [];
            finalHeaders.forEach((h, i) => {
                if (keysToRemove.includes(String(h).trim().toLowerCase())) {
                    indicesToRemove.push(i);
                }
            });

            // Filter out indices in reverse to maintain structure
            indicesToRemove.sort((a, b) => b - a);
            const removedNames = indicesToRemove.map(idx => String(finalHeaders[idx]));
            if (
                indicesToRemove.length &&
                !(await EGXDialog.confirm(
                    `A exportação removerá ${indicesToRemove.length} colunas:\n${removedNames.join('\n')}\n\nDeseja continuar?`,
                ))
            )
                return;
            indicesToRemove.forEach(idx => {
                finalHeaders.splice(idx, 1);
                finalData.forEach(row => row.splice(idx, 1));
            });
        }
        if (!finalHeaders.length || !finalData.length)
            return showAppToast('A exportação não possui cabeçalhos ou dados válidos.', 'error');
        if (
            !(await EGXDialog.confirm(
                `Exportar ${finalData.length} linhas e ${finalHeaders.length} colunas para XLSX?`,
            ))
        )
            return;

        try {
            const fullJson = [finalHeaders, ...finalData];
            const ws = XLSX.utils.aoa_to_sheet(fullJson);
            let wb;
            if (importWorkbook && importSheetName && importWorkbook.SheetNames.includes(importSheetName)) {
                wb = importWorkbook;
                wb.Sheets[importSheetName] = ws;
            } else {
                wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Meta Ads Bulk Revised');
            }
            const baseName = (importFileName || 'meta_ads_bulk')
                .replace(/\.(xlsx|xls|csv)$/i, '')
                .replace(/[\\/:*?"<>|]+/g, '_');
            const outName = `${baseName}_revisado.xlsx`;
            XLSX.writeFile(wb, outName);
            const idxCamp = finalHeaders.findIndex(h => String(h).trim().toLowerCase() === 'campaign name');
            const idxAd = finalHeaders.findIndex(h => String(h).trim().toLowerCase() === 'ad name');
            window.EGXWorkspace?.recordExport({
                fileName: outName,
                data: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }),
                module: 'Editor em lote',
                campaigns:
                    idxCamp >= 0
                        ? [...new Set(finalData.map(r => String(r[idxCamp] ?? '').trim()).filter(Boolean))]
                        : [],
                ads: idxAd >= 0 ? [...new Set(finalData.map(r => String(r[idxAd] ?? '').trim()).filter(Boolean))] : [],
                rows: finalData.length,
            });
            showAppToast('Planilha editada exportada com sucesso! Abas não editadas foram mantidas.', 'success');
        } catch (err) {
            console.error('EGX export error', err);
            showAppToast('Erro ao gerar o arquivo .XLSX.', 'error');
        }
    });

    /* ----- Persistência no projeto (Projects/<projeto>/bulkEditor.json) ----- */
    function exportData() {
        if (!sheetHeaders.length) return null;
        return {
            version: 1,
            fileName: importFileName,
            sheetName: importSheetName,
            headers: sheetHeaders,
            rows: sheetData,
            original: originalBackup,
            workbook: importFileB64, // arquivo original em base64 (para manter as outras abas)
        };
    }
    function resetUi() {
        selectedRows.clear();
        selectedCampaigns.clear();
        selectedAdsets.clear();
        historyStack = [];
        historyIndex = -1;
        compareOriginal = false;
        activeEditorLevel = 'campaign';
    }
    function importData(d) {
        if (!d || !Array.isArray(d.headers) || !d.headers.length) return clear();
        suppressSave = true;
        try {
            importFileName = String(d.fileName || '');
            importSheetName = String(d.sheetName || '');
            importFileB64 = d.workbook || null;
            importWorkbook = null;
            if (importFileB64) {
                try {
                    importWorkbook = XLSX.read(importFileB64, { type: 'base64' });
                } catch (e) {
                    importWorkbook = null;
                }
            }
            sheetHeaders = d.headers.map(h => String(h ?? ''));
            sheetData = Array.isArray(d.rows) ? d.rows : [];
            originalBackup = d.original || JSON.stringify({ sheetHeaders, sheetData });
            resetUi();
            pushHistory('Restaurado do projeto');
            importPreview.classList.add('hidden');
            fileInfo.textContent = `Restaurado do projeto: ${importFileName || 'planilha'} • Aba: ${importSheetName || '—'} • ${sheetData.length} linhas`;
            renderTable();
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
            bulkRoot.classList.add('editor-loaded');
        } finally {
            suppressSave = false;
        }
    }
    function clear() {
        suppressSave = true;
        try {
            sheetData = [];
            sheetHeaders = [];
            originalBackup = null;
            importWorkbook = null;
            importFileName = '';
            importSheetName = '';
            importFileB64 = null;
            importRows = [];
            resetUi();
            updateHistoryButtons();
            tbody.replaceChildren();
            importPreview.classList.add('hidden');
            workspace.classList.add('hidden');
            workspace.classList.remove('flex');
            bulkRoot.classList.remove('editor-loaded');
            fileInfo.textContent = 'Arraste sua exportação aqui ou selecione um arquivo para começar.';
        } finally {
            suppressSave = false;
        }
    }
    // Abre no Editor uma planilha gerada pelo Criador (sem precisar baixar e reimportar).
    function openGenerated({ fileName, headers, rows, workbookB64 }) {
        importData({
            fileName,
            sheetName: 'Meta Ads Bulk Import',
            headers,
            rows,
            workbook: workbookB64 && workbookB64.length <= MAX_SAVED_FILE * 1.4 ? workbookB64 : null,
        });
        fileInfo.textContent = `Gerado pelo Criador: ${fileName} • ${rows.length} linhas`;
        notifyChange();
    }
    const api = {
        file: 'bulkEditor.json',
        exportData,
        importData,
        clear,
        openGenerated,
        summary: () => ({ rows: sheetData.length, fileName: importFileName }),
    };
    window.EGXBulkEditorBridge = api;
    window.EGXModules?.register('bulkEditor', api);
})();
