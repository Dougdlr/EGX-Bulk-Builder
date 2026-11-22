'use strict';
/* ===================================================================
   MÓDULO 2: EXTRATOR E ORGANIZADOR DE NOMES
   =================================================================== */
(function extractorModule() {
    const rawInp = $('ext-raw-input'),
        cleanOut = $('ext-clean-output');
    const optSort = $('ext-opt-sort'),
        optDedup = $('ext-opt-dedup'),
        optUpper = $('ext-opt-upper');
    const badge = $('ext-count-badge'),
        prefixInput = $('ext-prefix-input'),
        chips = $('ext-prefix-chips'),
        empty = $('ext-prefix-empty'),
        feedback = $('ext-prefix-feedback'),
        projectLabel = $('ext-project-label');
    let prefixes = [];
    const normalize = list => [
        ...new Set(
            (list || [])
                .map(x => String(x).trim().toUpperCase().replace(/\s+/g, ''))
                .filter(x => /^[A-Z][A-Z0-9_-]*$/.test(x)),
        ),
    ];
    const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function detect(text) {
        const found = stripUrls(text).match(/\b[A-Z][A-Z0-9_-]*?[ \t]*\d{1,9}(?!\d)/gi) || [];
        const counts = {};
        found.forEach(code => {
            const m = code.match(/^([A-Z][A-Z0-9_-]*?)\s*\d+/i);
            const pre = m?.[1]?.toUpperCase();
            if (pre && pre.length >= 2 && pre.length <= 16) counts[pre] = (counts[pre] || 0) + 1;
        });
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    }
    function pattern() {
        const use = prefixes.length ? prefixes : detect(rawInp.value);
        if (!use.length) return null;
        return new RegExp(
            '(?:' +
                use
                    .slice()
                    .sort((a, b) => b.length - a.length)
                    .map(escRx)
                    .join('|') +
                ')[ \\t]*\\d{1,9}(?!\\d)' +
                VAR_SRC,
            'gi',
        );
    }
    function renderChips() {
        chips.innerHTML = '';
        prefixes.forEach(pre => {
            const c = document.createElement('span');
            c.className =
                'inline-flex items-center gap-1 rounded-full px-2 py-1 bg-cyan-950/50 border border-cyan-500/25 text-[11px] text-cyan-200';
            c.textContent = pre;
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = '×';
            b.title = 'Remover ' + pre;
            b.className = 'ml-1 text-cyan-100 hover:text-white';
            b.addEventListener('click', () => {
                prefixes = prefixes.filter(x => x !== pre);
                renderChips();
                preview();
                saveProject();
            });
            c.appendChild(b);
            chips.appendChild(c);
        });
        empty.classList.toggle('hidden', prefixes.length > 0);
    }
    function preview() {
        if (!rawInp.value.trim()) {
            feedback.classList.add('hidden');
            return;
        }
        feedback.classList.remove('hidden');
        const detected = detect(rawInp.value);
        const rx = pattern();
        const count = rx ? [...stripUrls(rawInp.value).matchAll(new RegExp(rx.source, rx.flags))].length : 0;
        feedback.textContent = prefixes.length
            ? count
                ? `${count} código(s) encontrados com ${prefixes.join(', ')}.`
                : `Nenhum código corresponde aos prefixos atuais. Detectados na entrada: ${detected.join(', ') || 'nenhum'}.`
            : `Detecção automática: ${detected.join(', ') || 'nenhum prefixo claro'}. ${count} código(s) reconhecidos.`;
        feedback.className =
            'text-xs rounded-lg px-3 py-2 border ' +
            (count
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200');
    }
    function runExtraction() {
        const text = rawInp.value;
        if (!text.trim()) {
            cleanOut.value = '';
            badge.textContent = '0 anúncios extraídos';
            preview();
            saveProject();
            return;
        }
        const rx = pattern();
        let clean = rx
            ? [...stripUrls(text).matchAll(new RegExp(rx.source, rx.flags))].map(m =>
                  codeFromMatch(m[0], optUpper.checked),
              )
            : [];
        if (optDedup.checked) clean = Array.from(new Set(clean));
        if (optSort.checked)
            clean.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        cleanOut.value = clean.join('\n');
        badge.textContent = `${clean.length} ${clean.length === 1 ? 'anúncio extraído' : 'anúncios extraídos'}`;
        preview();
        saveProject();
    }
    function exportData() {
        return {
            version: 1,
            raw: rawInp.value,
            output: cleanOut.value,
            prefixes,
            sort: optSort.checked,
            dedup: optDedup.checked,
            upper: optUpper.checked,
        };
    }
    function importData(d) {
        rawInp.value = String(d?.raw || '');
        cleanOut.value = String(d?.output || '');
        prefixes = normalize(d?.prefixes || []);
        optSort.checked = d?.sort !== false;
        optDedup.checked = d?.dedup !== false;
        optUpper.checked = d?.upper !== false;
        badge.textContent = `${cleanOut.value.trim() ? cleanOut.value.trim().split(/\n/).length : 0} anúncios extraídos`;
        renderChips();
        preview();
    }
    function clear() {
        rawInp.value = '';
        cleanOut.value = '';
        prefixes = [];
        badge.textContent = '0 anúncios extraídos';
        renderChips();
        preview();
    }
    function saveProject() {
        window.EGXWorkspaceProjectBridge?.saveExtractor?.(exportData());
    }
    $('ext-prefix-apply').addEventListener('click', () => {
        prefixes = normalize([...prefixes, ...prefixInput.value.split(/[;,\n]+/)]);
        prefixInput.value = '';
        renderChips();
        preview();
        saveProject();
    });
    prefixInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('ext-prefix-apply').click();
        }
    });
    $('ext-prefix-detect').addEventListener('click', () => {
        const found = detect(rawInp.value);
        if (!found.length) {
            feedback.classList.remove('hidden');
            feedback.textContent =
                'Não encontramos prefixos/códigos na entrada. Cole a lista ou digite os prefixos manualmente.';
            return;
        }
        prefixes = found;
        renderChips();
        preview();
        saveProject();
        showAppToast('Prefixos detectados: ' + found.join(', '), 'success');
    });
    $('ext-btn-run').addEventListener('click', () => {
        runExtraction();
        showAppToast('Nomes extraídos e organizados!', 'success');
    });
    $('ext-btn-clear').addEventListener('click', () => {
        clear();
        saveProject();
        rawInp.focus();
    });
    $('ext-btn-copy').addEventListener('click', async () => {
        if (!cleanOut.value.trim()) return showAppToast('Nenhum texto para copiar.', 'error');
        const ok = await copyText(cleanOut.value, cleanOut);
        showAppToast(ok ? 'Lista copiada para a área de transferência!' : 'Falha ao copiar.', ok ? 'success' : 'error');
    });
    rawInp.addEventListener('input', preview);
    [optSort, optDedup, optUpper].forEach(el => el.addEventListener('change', saveProject));
    window.EGXExtractorProjectBridge = {
        exportData,
        importData,
        clear,
        setProjectName: name => {
            projectLabel.textContent = name || 'Sem projeto ativo';
        },
    };
    $('ext-btn-to-creator')?.addEventListener('click', () => {
        if (!cleanOut.value.trim()) return showAppToast('Extraia a lista antes de enviar para o Criador.', 'error');
        const pre = prefixes.length ? prefixes : detect(rawInp.value);
        $('nav-tab-meta').click();
        window.EGXCreatorProjectBridge?.loadList(cleanOut.value, pre);
        window.EGXWorkspace?.log('Lista enviada ao Criador', `${cleanOut.value.trim().split(/\n/).length} criativo(s)`);
    });
    window.EGXModules?.register('extractor', window.EGXExtractorProjectBridge);
    renderChips();
})();
