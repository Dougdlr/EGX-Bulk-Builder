'use strict';
/* ===================================================================
   MÓDULO 1: GERENCIADOR META ADS
   =================================================================== */
(function metaModule() {
    const F = {};
    [
        'camp-name',
        'strategy',
        'budget',
        'bid-amount',
        'age-min',
        'age-max',
        'img-adset-name',
        'img-adset-gender',
        'link',
        'url-tags',
        'page-id',
        'ig-id',
        'pixel-id',
        'beneficiary',
        'attribution',
        'suffix',
    ].forEach(k => (F[k] = $('meta-' + k)));
    const NB = {
        date: $('nb-date'),
        bm: $('nb-bm'),
        ca: $('nb-ca'),
        tag: $('nb-tag'),
        prod: $('nb-prod'),
        country: $('nb-country'),
        suffix: $('nb-suffix'),
        num: $('nb-num'),
    };
    NB.date.value = todayTag();

    const el = {
        root: $('module-meta-ads'),
        btnCat: $('meta-btn-mode-catalog'),
        btnImg: $('meta-btn-mode-image'),
        badge: $('meta-sidebar-mode-badge'),
        bannerCat: $('meta-info-banner-catalog'),
        bannerImg: $('meta-info-banner-image'),
        bidWrap: $('meta-bid-wrapper'),
        nameWrap: $('meta-img-adset-name-wrapper'),
        genderWrap: $('meta-img-gender-wrapper'),
        genderPill: $('meta-img-gender-pill'),
        step1: $('meta-step-1'),
        step2: $('meta-step-2'),
        pill1: $('meta-step-pill-1'),
        pill2: $('meta-step-pill-2'),
        raw: $('meta-raw-textarea'),
        tbody: $('meta-table-body'),
        note: $('meta-img-gender-note'),
        cnt: {
            total: $('meta-count-total'),
            masc: $('meta-count-masc'),
            fem: $('meta-count-fem'),
            ambos: $('meta-count-ambos'),
        },
        chkPill: $('chk-status-pill'),
        chkText: $('chk-summary-text'),
    };
    const state = {
        mode: 'catalog',
        ads: [],
        nextId: 1,
        filter: '',
        creatorPrefixes: [],
        creatorFilterEnabled: true,
        selected: new Set(),
    };
    let snap = null,
        timer = null;
    const undoStack = [];
    const makeAd = (name = '', gender = 'Ambos', conflict = false, productSet = '', extra = {}) => ({
        id: state.nextId++,
        name,
        gender,
        conflict,
        productSet: digitsOnly(productSet),
        body: String(extra.body || ''),
        title: String(extra.title || ''),
        cta: String(extra.cta || ''),
    });
    const keyOf = a => (state.mode === 'image' ? a.name : a.name + '|' + a.gender);
    const filterEls = {
        enabled: $('egx-filter-enabled'),
        input: $('egx-filter-prefix-input'),
        add: $('egx-filter-add'),
        detect: $('egx-filter-detect'),
        chips: $('egx-filter-chip-list'),
        empty: $('egx-filter-empty'),
        feedback: $('egx-filter-feedback'),
    };
    const escapeRx = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function normalizePrefixes(list) {
        return [
            ...new Set(
                (list || [])
                    .map(x => String(x).trim().toUpperCase().replace(/\s+/g, ''))
                    .filter(x => /^[A-Z][A-Z0-9_-]*$/.test(x)),
            ),
        ];
    }
    function codeRegex(prefixes = state.creatorPrefixes) {
        if (!prefixes.length) return null;
        return new RegExp(
            '(?:' +
                prefixes
                    .map(escapeRx)
                    .sort((a, b) => b.length - a.length)
                    .join('|') +
                ')[ \\t]*\\d{1,9}(?!\\d)' +
                VAR_SRC,
            'gi',
        );
    }
    function prefixFromCode(code) {
        const m = code.match(/^([A-Z][A-Z0-9_-]*?)\s*\d+/i);
        return m ? m[1].toUpperCase() : '';
    }
    function detectPrefixes(text) {
        const codes = text.match(/[A-Z][A-Z0-9_-]*?\s*\d{1,9}(?!\d)(?:[\s\-_]*V\s*\d+)?/gi) || [];
        const counts = {};
        codes.forEach(c => {
            const pr = prefixFromCode(c);
            if (pr && pr.length >= 2 && pr.length <= 16) counts[pr] = (counts[pr] || 0) + 1;
        });
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    }
    function showFilterFeedback(message, kind = 'info') {
        filterEls.feedback.textContent = message;
        filterEls.feedback.className =
            'text-xs rounded-lg px-3 py-2 border ' +
            (kind === 'warning'
                ? 'border-amber-500/30 bg-amber-950/20 text-amber-200'
                : kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
                  : 'border-slate-600/40 bg-slate-900/50 text-slate-300');
    }
    function renderPrefixChips() {
        filterEls.chips.innerHTML = '';
        state.creatorPrefixes.forEach(prefix => {
            const chip = document.createElement('span');
            chip.className =
                'inline-flex items-center gap-1 rounded-full px-2 py-1 bg-cyan-950/50 border border-cyan-500/25 text-[11px] text-cyan-200';
            chip.textContent = prefix;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Remover ' + prefix;
            remove.className = 'ml-1 text-cyan-100 hover:text-white';
            remove.addEventListener('click', () => {
                state.creatorPrefixes = state.creatorPrefixes.filter(x => x !== prefix);
                renderPrefixChips();
                save();
                refreshFilterPreview();
            });
            chip.appendChild(remove);
            filterEls.chips.appendChild(chip);
        });
        filterEls.empty.classList.toggle('hidden', state.creatorPrefixes.length > 0);
    }
    function splitRawByDetectedCodes(text, prefixes = state.creatorPrefixes) {
        const rx = codeRegex(prefixes);
        if (!rx) return [];
        const matches = [...text.matchAll(new RegExp(rx.source, rx.flags))];
        // Linhas que começam com QUALQUER código (até de prefixo ignorado) encerram o bloco anterior.
        // Assim "MSPBRAD14 - FEMININO" não mistura o gênero no LFRAD744 da linha de cima.
        // Linhas de continuação (ex.: "FEMININO", "p:1234…") continuam no bloco.
        const lineStarts = [];
        const anyCodeLine = /^[ \t]*[A-Z][A-Z0-9_-]*?[ \t]*\d{1,9}(?!\d)/i;
        let pos = 0;
        text.split('\n').forEach(line => {
            if (anyCodeLine.test(line)) lineStarts.push(pos);
            pos += line.length + 1;
        });
        return matches.map((m, i) => {
            const lineEnd = text.indexOf('\n', m.index);
            const nextLine = lineStarts.find(s => s > m.index && (lineEnd < 0 || s > lineEnd));
            const end = Math.min(matches[i + 1]?.index ?? text.length, nextLine ?? text.length);
            return { code: m[0], block: text.slice(m.index, end).trim(), index: m.index };
        });
    }
    function refreshFilterPreview() {
        const raw = el.raw.value;
        if (!raw.trim()) {
            filterEls.feedback.classList.add('hidden');
            return;
        }
        filterEls.feedback.classList.remove('hidden');
        if (!state.creatorPrefixes.length) {
            showFilterFeedback('Adicione o prefixo dos anúncios (ex.: MSPBRAD) para processar a lista.', 'warning');
            return;
        }
        const matched = splitRawByDetectedCodes(raw).length;
        if (matched)
            showFilterFeedback(
                `${matched} anúncio(s) com os prefixos ${state.creatorPrefixes.join(', ')} serão processados.`,
                'success',
            );
        else
            showFilterFeedback(
                `Nenhum código da lista começa com ${state.creatorPrefixes.join(', ')}. Confira o prefixo digitado.`,
                'warning',
            );
    }
    filterEls.add.addEventListener('click', () => {
        const parts = normalizePrefixes(filterEls.input.value.split(/[;,\n]+/));
        state.creatorPrefixes = normalizePrefixes([...state.creatorPrefixes, ...parts]);
        filterEls.input.value = '';
        renderPrefixChips();
        refreshFilterPreview();
        save();
    });
    filterEls.input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            filterEls.add.click();
        }
    });
    renderPrefixChips();

    for (let a = 18; a <= 65; a++) {
        const l = a === 65 ? '65+' : String(a);
        F['age-min'].add(new Option(l, a, false, a === 18));
        F['age-max'].add(new Option(l, a, false, a === 65));
    }

    /* ----- Persistência ----- */
    const getSettings = () => ({
        ...Object.fromEntries(Object.entries(F).map(([k, e]) => [k, e.value])),
        nb: Object.fromEntries(Object.entries(NB).map(([k, e]) => [k, e.value])),
    });
    function applySettings(o) {
        Object.keys(F).forEach(k => {
            if (o[k] != null) F[k].value = o[k];
        });
        if (o.nb)
            Object.keys(NB).forEach(k => {
                if (o.nb[k] != null && k !== 'date') NB[k].value = o.nb[k];
            });
        syncUI();
    }
    function save() {
        clearTimeout(timer);
        // Persist configuration only. Creator inputs/list belong to the current work session
        // and should never repopulate automatically when EGX is reopened.
        timer = setTimeout(() => {
            lsSet(STORE, { settings: getSettings() });
            window.EGXWorkspaceProjectBridge?.saveCreator?.();
        }, 250);
    }

    function updateChecklist(c, dupCount) {
        if (!el.chkText || !el.chkPill) return;
        const img = state.mode === 'image';
        const camp = F['camp-name'].value.trim();
        const strat = F.strategy.value;
        const bud = parseFloat(F.budget.value);
        const bid = parseFloat(F['bid-amount'].value);
        const link = F.link.value.trim();
        const ageMin = F['age-min'].value,
            ageMax = F['age-max'].value === '65' ? '65+' : F['age-max'].value;

        // Cada pendência sabe para onde levar o usuário (campo da barra lateral ou linha da tabela)
        const issues = [];
        const need = (text, go) => issues.push({ text, go });
        if (!camp) need('Nome da campanha', 'meta-camp-name');
        if (isNaN(bud) || bud <= 0) need('Orçamento', 'meta-budget');
        if (strat === 'BID' && (isNaN(bid) || bid <= 0)) need('Limite de lance (Bid)', 'meta-bid-amount');
        if (!link) need('Link de destino', 'meta-link');
        if (dupCount > 0) {
            need(`${dupCount} duplicado(s)`, 'row:dup');
            need('🧹 Remover repetidos', 'fix:dedup');
        }
        if (c.t === 0) need('Nenhum anúncio', 'meta-btn-add-row');
        if (!digitsOnly(F['page-id'].value)) need('ID da Página', 'meta-page-id');
        if (!digitsOnly(F['pixel-id'].value)) need('ID do Pixel', 'meta-pixel-id');
        if (!digitsOnly(F['ig-id'].value)) need('ID do Instagram', 'meta-ig-id');
        if (!digitsOnly(F.beneficiary.value)) need('Beneficiário/pagador', 'meta-beneficiary');
        // Catálogo e Product Set ID não vão na planilha: são escolhidos no editor da Meta.

        if (issues.length) {
            el.chkPill.className = 'mc-chk-pill is-pending';
            el.chkPill.textContent = `⚠️ ${issues.length} pendência${issues.length > 1 ? 's' : ''} — clique para resolver`;
        } else {
            el.chkPill.className = 'mc-chk-pill is-ready';
            el.chkPill.textContent = '✅ Pronto para exportar';
        }
        renderTree(camp, strat, bud, img);
        const box = $('meta-chk-issues');
        if (box) {
            box.replaceChildren(
                ...issues.map(i => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'mc-issue';
                    b.dataset.go = i.go;
                    b.textContent = i.text;
                    return b;
                }),
            );
            box.hidden = !issues.length;
        }

        const budTxt = !isNaN(bud) && bud > 0 ? `R$ ${bud.toFixed(2).replace('.', ',')}/dia` : 'Orçamento pendente';
        const bidTxt =
            strat === 'BID' && !isNaN(bid) && bid > 0 ? ` (Bid: R$ ${bid.toFixed(2).replace('.', ',')})` : '';
        const structTxt = img
            ? `1 Conjunto único '${F['img-adset-name'].value.trim() || 'IMGs'}' (${F['img-adset-gender'].value}) • Advantage+ • ${c.t} Anúncio(s)`
            : `${c.t} Conjunto(s) individuais (${c.m} Masc, ${c.f} Fem, ${c.a} Ambos) • Manual Feed/Story/Reels`;
        const withTxt = state.ads.filter(a => a.name && (a.body || a.title || a.cta)).length;
        el.chkText.textContent = `1 Campanha ${strat} [${budTxt}${bidTxt}] • ${structTxt} • Idade ${ageMin}–${ageMax}${withTxt ? ` • ${withTxt} com textos personalizados` : ''}`;
    }

    // Prévia de como a campanha vai ficar no Meta: campanha → conjuntos → anúncios
    function renderTree(camp, strat, bud, img) {
        const box = $('meta-tree-body');
        if (!box) return;
        const ads = state.ads.filter(a => a.name);
        const G = { Masculino: '♂', Feminino: '♀', Ambos: '⚥' };
        const node = (cls, text, meta) => {
            const d = document.createElement('div');
            d.className = 'mt-node ' + cls;
            const t = document.createElement('span');
            t.className = 'mt-name';
            t.textContent = text;
            d.appendChild(t);
            if (meta) {
                const m = document.createElement('small');
                m.textContent = meta;
                d.appendChild(m);
            }
            return d;
        };
        const budTxt = bud > 0 ? `R$ ${bud.toFixed(2).replace('.', ',')}/dia` : 'sem orçamento';
        const where = strat === 'ABO' ? `${budTxt} em cada conjunto` : `${budTxt} na campanha${strat === 'BID' ? ' · limite de lance' : ''}`;
        const parts = [node('mt-camp', camp || '(campanha sem nome)', `${strat} · ${where}`)];
        const MAX = 12;
        if (img) {
            const adsetName = F['img-adset-name'].value.trim() || 'IMGs';
            parts.push(node('mt-set', adsetName, `${G[F['img-adset-gender'].value] || ''} ${F['img-adset-gender'].value} · ${ads.length} anúncio(s) · Advantage+`));
            ads.slice(0, MAX).forEach(a => parts.push(node('mt-ad', a.name)));
        } else {
            ads.slice(0, MAX).forEach(a => {
                parts.push(node('mt-set', a.name, `${G[a.gender] || ''} ${a.gender} · 1 anúncio`));
                parts.push(node('mt-ad', a.name));
            });
        }
        if (ads.length > MAX) parts.push(node('mt-more', `+ ${ads.length - MAX} ${img ? 'anúncio(s)' : 'conjunto(s)'}…`));
        box.replaceChildren(...parts);
        const sum = $('meta-tree-sum');
        if (sum) sum.textContent = img ? `1 campanha · 1 conjunto · ${ads.length} anúncio(s)` : `1 campanha · ${ads.length} conjunto(s) · ${ads.length} anúncio(s)`;
    }

    function syncUI() {
        el.bidWrap.classList.toggle('hidden', F.strategy.value !== 'BID');
        const g = F['img-adset-gender'].value;
        paintGender(F['img-adset-gender'], g);
        paintGender(el.genderPill, g);
        el.genderPill.textContent = g === 'Ambos' ? 'Ambos (Aberto)' : g;
        const s = el.bannerImg.querySelector('strong');
        if (s) s.textContent = `'${F['img-adset-name'].value.trim() || 'IMGs'}'`;
        refresh();
    }

    function setMode(m) {
        state.mode = m;
        const img = m === 'image';
        el.btnCat.classList.toggle('on-indigo', !img);
        el.btnImg.classList.toggle('on-purple', img);
        el.badge.textContent = img ? 'Imagem' : 'Catálogo';
        el.badge.classList.toggle('on-indigo', !img);
        el.badge.classList.toggle('on-purple', img);
        el.bannerCat.classList.toggle('hidden', img);
        el.bannerImg.classList.toggle('hidden', !img);
        el.nameWrap.classList.toggle('hidden', !img);
        el.genderWrap.classList.toggle('hidden', !img);
        el.note.classList.toggle('hidden', !img);
        el.root.classList.toggle('img-mode', img);
        ['masc', 'fem', 'ambos'].forEach(k => el.cnt[k].classList.toggle('hidden', img));
        render();
        save();
    }

    function showStep(n) {
        const two = n === 2;
        el.step1.classList.toggle('hidden', two);
        el.step1.classList.toggle('flex', !two);
        el.step2.classList.toggle('hidden', !two);
        el.step2.classList.toggle('flex', two);
        el.pill1.classList.toggle('on', !two);
        el.pill2.classList.toggle('on', two);
    }

    /* ----- Tabela ----- */
    function dupInfo() {
        const byName = {},
            byKey = {};
        state.ads.forEach(a => {
            if (!a.name) return;
            (byName[a.name] = byName[a.name] || []).push(a);
            (byKey[keyOf(a)] = byKey[keyOf(a)] || []).push(a);
        });
        return { byName, byKey };
    }

    function refresh() {
        const { byName, byKey } = dupInfo(),
            c = { t: 0, m: 0, f: 0, a: 0 };
        const byId = new Map(state.ads.map(a => [String(a.id), a]));
        state.ads.forEach(a => {
            if (!a.name) return;
            c.t++;
            if (a.gender === 'Masculino') c.m++;
            else if (a.gender === 'Feminino') c.f++;
            else c.a++;
        });
        el.cnt.total.textContent = `Total: ${c.t}`;
        el.cnt.masc.textContent = `Masculino: ${c.m}`;
        el.cnt.fem.textContent = `Feminino: ${c.f}`;
        el.cnt.ambos.textContent = `Ambos: ${c.a}`;
        const dupCount = Object.keys(byKey).filter(k => byKey[k].length > 1).length;
        updateChecklist(c, dupCount);

        [...el.tbody.rows].forEach((tr, i) => {
            const a = byId.get(tr.dataset.id);
            if (!a) return;
            tr.querySelector('.idx').textContent = i + 1;
            let lvl = '',
                msg = '';
            if (!a.name) {
                lvl = 'bad';
                msg = 'Nome vazio';
            } else if (byKey[keyOf(a)].length > 1) {
                lvl = 'bad';
                msg = 'Anúncio duplicado';
            } else if (byName[a.name].length > 1) {
                lvl = 'warn';
                msg = 'Mesmo nome com outro gênero';
            } else if (a.conflict && state.mode !== 'image') {
                lvl = 'warn';
                msg = 'O texto citava masculino e feminino: confira';
            }
            const inp = tr.querySelector('.nm');
            inp.classList.toggle('bad', lvl === 'bad');
            inp.classList.toggle('warn', lvl === 'warn');
            const fl = tr.querySelector('.flag');
            fl.textContent = msg ? '⚠' : '';
            fl.title = msg;
            tr.hidden = !!state.filter && !a.name.includes(state.filter);
        });
        syncSelection();
    }

    function rowEl(a, i) {
        const tr = document.createElement('tr');
        tr.dataset.id = a.id;
        tr.className = 'hover:bg-egx-card/40 transition-colors animate-row-slide';
        tr.style.animationDelay = Math.min(i * 0.025, 0.4) + 's';
        tr.innerHTML = `
            <td class="egx-sel-cell"><input type="checkbox" class="sel" aria-label="Selecionar anúncio"></td>
            <td class="idx py-3 px-4 text-center text-xs font-mono text-slate-400"></td>
            <td class="py-3 px-4"><div class="flex items-center gap-2">
                <input type="text" class="nm w-full bg-egx-bg border border-egx-border rounded-xl text-xs sm:text-sm px-3.5 py-2 text-indigo-300 font-mono font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all" placeholder="Ex: LFRAD744-V1" aria-label="Nome do anúncio">
                <button type="button" class="cp text-slate-400 hover:text-indigo-300 px-2 py-1.5 rounded-lg hover:bg-slate-800/80 transition-colors text-xs" title="Copiar nome" aria-label="Copiar nome">📋</button>
                <span class="flag text-sm cursor-help" aria-hidden="true"></span><span class="used"></span></div></td>
            <td class="col-gender py-3 px-4"><select class="gd w-full border rounded-xl text-xs sm:text-sm px-3 py-2 font-semibold outline-none cursor-pointer transition-colors" aria-label="Gênero">${GEN.map(g => `<option class="bg-slate-900 text-white" value="${g}">${g}</option>`).join('')}</select></td>
            <td class="py-3 px-4"><button type="button" class="txt egx-txt-cell" title="Editar textos deste anúncio"></button></td>
            <td class="py-3 px-4 text-center"><button type="button" class="del text-slate-400 hover:text-red-400 px-2.5 py-1.5 rounded-xl hover:bg-red-500/10 transition-colors" title="Remover anúncio" aria-label="Remover anúncio">✕</button></td>`;
        const nm = tr.querySelector('.nm'),
            gd = tr.querySelector('.gd');
        nm.value = a.name || '';
        paintUsed(tr.querySelector('.used'), a.name);
        nm.addEventListener('change', () => paintUsed(tr.querySelector('.used'), a.name));
        gd.value = a.gender;
        paintGender(gd, a.gender);
        const sel = tr.querySelector('.sel');
        sel.checked = state.selected.has(a.id);
        tr.classList.toggle('egx-row-sel', sel.checked);
        sel.addEventListener('change', () => {
            sel.checked ? state.selected.add(a.id) : state.selected.delete(a.id);
            tr.classList.toggle('egx-row-sel', sel.checked);
            syncSelection();
        });
        const txt = tr.querySelector('.txt');
        paintTexts(txt, a);
        txt.addEventListener('click', () => openTextEditor([a.id]));

        nm.addEventListener('input', () => {
            const p = nm.selectionStart,
                before = nm.value.slice(0, p).replace(/\s+/g, '').length,
                s = nm.value.replace(/\s+/g, '');
            if (s !== nm.value) {
                nm.value = s;
                nm.setSelectionRange(before, before);
            }
            a.name = s;
            refresh();
            save();
        });
        let nmBefore = null,
            nmStart = '';
        nm.addEventListener('focus', () => {
            nmBefore = JSON.stringify(state.ads);
            nmStart = a.name;
        });
        nm.addEventListener('blur', () => {
            a.name = normName(nm.value);
            nm.value = a.name;
            if (nmBefore && a.name !== nmStart) {
                undoStack.push(nmBefore);
                if (undoStack.length > 30) undoStack.shift();
                syncUndo();
            }
            nmBefore = null;
            refresh();
            save();
        });
        nm.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const idx = state.ads.indexOf(a);
            state.ads.splice(idx + 1, 0, makeAd());
            render();
            save();
            const rows = el.tbody.rows;
            if (rows[idx + 1]) rows[idx + 1].querySelector('.nm').focus();
        });
        tr.querySelector('.cp').addEventListener('click', async () => {
            if (!nm.value) return;
            const ok = await copyText(nm.value, nm);
            showAppToast(ok ? `Copiado: ${nm.value}` : 'Não foi possível copiar.', ok ? 'info' : 'error');
        });
        gd.addEventListener('change', () => {
            a.gender = gd.value;
            a.conflict = false;
            paintGender(gd, a.gender);
            refresh();
            save();
        });
        tr.querySelector('.del').addEventListener('click', () => {
            remember();
            state.ads = state.ads.filter(x => x !== a);
            state.selected.delete(a.id);
            render();
            save();
            showAppToast('Anúncio removido.', 'info', { label: 'Desfazer', fn: undo });
        });
        return tr;
    }

    function render() {
        el.tbody.replaceChildren(...state.ads.map(rowEl));
        refresh();
    }

    /* ----- Textos do anúncio (Texto principal, Título, Chamada para ação) ----- */
    const CTA_OPTIONS = [
        ['', 'Padrão do modo'],
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
    const ctaName = v => (CTA_OPTIONS.find(o => o[0] === v) || [v, v])[1];
    function paintTexts(btn, a) {
        btn.replaceChildren();
        const parts = [];
        if (a.body) parts.push(['Texto', a.body]);
        if (a.title) parts.push(['Título', a.title]);
        if (a.cta) parts.push(['CTA', ctaName(a.cta)]);
        if (!parts.length) {
            const s = document.createElement('span');
            s.className = 'egx-txt-empty';
            s.textContent = 'Padrão · editar';
            btn.appendChild(s);
            btn.title = 'Sem textos personalizados. Clique para editar.';
            return;
        }
        parts.forEach(([k, v]) => {
            const s = document.createElement('span');
            s.className = 'egx-txt-chip';
            s.textContent = k === 'CTA' ? v : k + ' ✓';
            btn.appendChild(s);
        });
        btn.title = parts.map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    function visibleAds() {
        return state.ads.filter(a => !state.filter || a.name.includes(state.filter));
    }
    function syncSelection() {
        const ids = new Set(state.ads.map(a => a.id));
        [...state.selected].forEach(id => {
            if (!ids.has(id)) state.selected.delete(id);
        });
        const vis = visibleAds(),
            n = state.selected.size;
        const all = $('meta-select-all');
        const selVis = vis.filter(a => state.selected.has(a.id)).length;
        all.checked = vis.length > 0 && selVis === vis.length;
        all.indeterminate = selVis > 0 && selVis < vis.length;
        const b = $('meta-edit-texts');
        b.disabled = n === 0;
        b.textContent = n ? `✏️ Editar textos (${n})` : '✏️ Editar textos';
        $('meta-suffix-apply').textContent = n ? `Aplicar sufixo (${n})` : 'Aplicar sufixo';
    }
    $('meta-select-all').addEventListener('change', e => {
        visibleAds().forEach(a => (e.target.checked ? state.selected.add(a.id) : state.selected.delete(a.id)));
        [...el.tbody.rows].forEach(tr => {
            const on = state.selected.has(Number(tr.dataset.id));
            tr.querySelector('.sel').checked = on;
            tr.classList.toggle('egx-row-sel', on);
        });
        syncSelection();
    });
    $('meta-edit-texts').addEventListener('click', () => openTextEditor([...state.selected]));

    /* ----- Sufixo no nome dos anúncios ----- */
    const sufTargets = () => {
        const named = state.ads.filter(a => a.name);
        return state.selected.size ? named.filter(a => state.selected.has(a.id)) : named;
    };
    const sufValue = () => F.suffix.value.replace(/\s+/g, '');
    F.suffix.addEventListener('input', () => {
        const v = F.suffix.value.replace(/\s+/g, '');
        if (v !== F.suffix.value) F.suffix.value = v;
        save();
    });
    F.suffix.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('meta-suffix-apply').click();
        }
    });
    $('meta-suffix-apply').addEventListener('click', () => {
        const suf = sufValue();
        if (!suf) {
            F.suffix.focus();
            return showAppToast('Digite o sufixo que quer adicionar (ex.: _IMG).', 'error');
        }
        const list = sufTargets();
        if (!list.length) return showAppToast('Não há anúncios para aplicar o sufixo.', 'error');
        const todo = list.filter(a => !a.name.toUpperCase().endsWith(suf.toUpperCase()));
        if (!todo.length) return showAppToast(`Todos já terminam com ${suf}.`, 'info');
        remember();
        todo.forEach(a => {
            a.name = a.name + suf;
        });
        render();
        save();
        const skip = list.length - todo.length,
            scope = state.selected.size ? ' selecionado(s)' : '';
        showAppToast(
            `Sufixo ${suf} aplicado em ${todo.length} anúncio(s)${scope}${skip ? ` • ${skip} já tinha(m)` : ''}.`,
            'success',
            { label: 'Desfazer', fn: undo },
        );
    });
    $('meta-suffix-remove').addEventListener('click', () => {
        const suf = sufValue();
        if (!suf) {
            F.suffix.focus();
            return showAppToast('Digite o sufixo que quer remover.', 'error');
        }
        const todo = sufTargets().filter(
            a => a.name.toUpperCase().endsWith(suf.toUpperCase()) && a.name.length > suf.length,
        );
        if (!todo.length) return showAppToast(`Nenhum anúncio termina com ${suf}.`, 'info');
        remember();
        todo.forEach(a => {
            a.name = a.name.slice(0, -suf.length);
        });
        render();
        save();
        showAppToast(`Sufixo ${suf} removido de ${todo.length} anúncio(s).`, 'success', {
            label: 'Desfazer',
            fn: undo,
        });
    });
    $('meta-undo').addEventListener('click', () => {
        if (!undoStack.length) return;
        undo();
        showAppToast('Alteração desfeita.', 'info');
    });

    const TM = {
        modal: $('meta-text-modal'),
        sub: $('meta-text-sub'),
        body: $('meta-text-body'),
        title: $('meta-text-title-input'),
        cta: $('meta-text-cta'),
        useBody: $('meta-text-use-body'),
        useTitle: $('meta-text-use-title'),
        useCta: $('meta-text-use-cta'),
        apply: $('meta-text-apply'),
        bodyCount: $('meta-text-body-count'),
        titleCount: $('meta-text-title-count'),
        preset: $('meta-text-preset'),
        presetName: $('meta-text-preset-name'),
    };
    TM.cta.replaceChildren(...CTA_OPTIONS.map(([v, l]) => new Option(v ? `${l} (${v})` : l, v)));
    const TEXT_PRESETS = 'egx_text_presets_v1';
    let tmTargets = [],
        tmReturn = null;
    const countTxt = () => {
        TM.bodyCount.textContent = `${TM.body.value.length}/125`;
        TM.bodyCount.classList.toggle('over', TM.body.value.length > 125);
        TM.titleCount.textContent = `${TM.title.value.length}/40`;
        TM.titleCount.classList.toggle('over', TM.title.value.length > 40);
    };
    function fillTextPresets() {
        const all = lsGet(TEXT_PRESETS, {});
        TM.preset.replaceChildren(
            new Option('— Escolher modelo —', ''),
            ...Object.keys(all)
                .sort()
                .map(k => new Option(k, k)),
        );
    }
    function openTextEditor(ids) {
        const set = new Set(ids);
        tmTargets = state.ads.filter(a => set.has(a.id) && a.name);
        if (!tmTargets.length) return showAppToast('Selecione ao menos um anúncio com nome.', 'error');
        const common = k => {
            const v = [...new Set(tmTargets.map(a => a[k] || ''))];
            return v.length === 1 ? v[0] : null;
        };
        const cb = common('body'),
            ct = common('title'),
            cc = common('cta');
        TM.body.value = cb ?? '';
        TM.body.placeholder =
            cb === null
                ? '(textos diferentes entre os anúncios selecionados)'
                : 'Texto que aparece acima do vídeo ou da imagem';
        TM.title.value = ct ?? '';
        TM.title.placeholder = ct === null ? '(títulos diferentes)' : 'Título exibido abaixo da mídia';
        TM.cta.value = cc ?? '';
        TM.useBody.checked = TM.useTitle.checked = TM.useCta.checked = false;
        TM.preset.value = '';
        TM.presetName.value = '';
        fillTextPresets();
        countTxt();
        const n = tmTargets.length;
        TM.sub.textContent = n === 1 ? tmTargets[0].name : `${n} anúncios selecionados`;
        TM.apply.textContent = n === 1 ? 'Aplicar ao anúncio' : `Aplicar a ${n} anúncios`;
        tmReturn = document.activeElement;
        TM.modal.classList.remove('hidden');
        document.body.classList.add('egx-modal-open');
        window.EGXCascade?.(TM.modal.querySelector('.egx-tm-panel').children);
        TM.body.focus();
    }
    function closeTextEditor() {
        TM.modal.classList.add('hidden');
        document.body.classList.remove('egx-modal-open');
        tmReturn?.focus?.();
    }
    TM.body.addEventListener('input', () => {
        TM.useBody.checked = true;
        countTxt();
    });
    TM.title.addEventListener('input', () => {
        TM.useTitle.checked = true;
        countTxt();
    });
    TM.cta.addEventListener('change', () => {
        TM.useCta.checked = true;
    });
    TM.preset.addEventListener('change', () => {
        const p = lsGet(TEXT_PRESETS, {})[TM.preset.value];
        if (!p) return;
        TM.body.value = p.body || '';
        TM.title.value = p.title || '';
        TM.cta.value = p.cta || '';
        TM.useBody.checked = !!p.body;
        TM.useTitle.checked = !!p.title;
        TM.useCta.checked = !!p.cta;
        TM.presetName.value = TM.preset.value;
        countTxt();
    });
    $('meta-text-preset-save').addEventListener('click', () => {
        const name = TM.presetName.value.trim();
        if (!name) {
            TM.presetName.focus();
            return showAppToast('Dê um nome ao modelo de texto.', 'error');
        }
        if (!TM.body.value.trim() && !TM.title.value.trim() && !TM.cta.value)
            return showAppToast('Preencha ao menos um campo para salvar o modelo.', 'error');
        const all = lsGet(TEXT_PRESETS, {});
        all[name] = { body: TM.body.value.trim(), title: TM.title.value.trim(), cta: TM.cta.value };
        lsSet(TEXT_PRESETS, all);
        fillTextPresets();
        TM.preset.value = name;
        showAppToast(`Modelo “${name}” salvo.`, 'success');
    });
    $('meta-text-preset-del').addEventListener('click', async () => {
        const name = TM.preset.value;
        if (!name) return showAppToast('Escolha um modelo para excluir.', 'error');
        if (!(await EGXDialog.confirm(`Excluir o modelo de texto “${name}”?`, { danger: true, okLabel: 'Excluir' })))
            return;
        const all = lsGet(TEXT_PRESETS, {});
        delete all[name];
        lsSet(TEXT_PRESETS, all);
        fillTextPresets();
        showAppToast('Modelo excluído.', 'info');
    });
    TM.apply.addEventListener('click', () => {
        if (!TM.useBody.checked && !TM.useTitle.checked && !TM.useCta.checked)
            return showAppToast('Marque ao menos um campo para aplicar.', 'error');
        remember();
        tmTargets.forEach(t => {
            const a = state.ads.find(x => x.id === t.id);
            if (!a) return;
            if (TM.useBody.checked) a.body = TM.body.value.trim();
            if (TM.useTitle.checked) a.title = TM.title.value.trim();
            if (TM.useCta.checked) a.cta = TM.cta.value;
        });
        const n = tmTargets.length;
        closeTextEditor();
        render();
        save();
        showAppToast(`Textos aplicados em ${n} ${n === 1 ? 'anúncio' : 'anúncios'}.`, 'success', {
            label: 'Desfazer',
            fn: undo,
        });
    });
    $('meta-text-clear').addEventListener('click', () => {
        remember();
        tmTargets.forEach(t => {
            const a = state.ads.find(x => x.id === t.id);
            if (a) {
                a.body = '';
                a.title = '';
                a.cta = '';
            }
        });
        const n = tmTargets.length;
        closeTextEditor();
        render();
        save();
        showAppToast(`Textos removidos de ${n} ${n === 1 ? 'anúncio' : 'anúncios'}.`, 'info', {
            label: 'Desfazer',
            fn: undo,
        });
    });
    $('meta-text-close').addEventListener('click', closeTextEditor);
    $('meta-text-cancel').addEventListener('click', closeTextEditor);
    TM.modal.addEventListener('click', e => {
        if (e.target === TM.modal) closeTextEditor();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !TM.modal.classList.contains('hidden')) closeTextEditor();
    });

    const legacyImg = (d, ads) => {
        if (d?.mode === 'image' && !d?.nameSuffixInName)
            ads.forEach(a => {
                if (a.name && !/_IMG$/i.test(a.name)) a.name += '_IMG';
            });
        return ads;
    };
    function remember() {
        undoStack.push(JSON.stringify(state.ads));
        if (undoStack.length > 30) undoStack.shift();
        syncUndo();
    }
    function syncUndo() {
        const b = $('meta-undo');
        if (b) {
            b.disabled = !undoStack.length;
            b.title = undoStack.length
                ? `Desfazer a última alteração (${undoStack.length} disponível)`
                : 'Nada para desfazer';
        }
    }
    function undo() {
        if (!undoStack.length) return;
        state.ads = JSON.parse(undoStack.pop());
        syncUndo();
        const ids = new Set(state.ads.map(a => a.id));
        [...state.selected].forEach(id => {
            if (!ids.has(id)) state.selected.delete(id);
        });
        render();
        save();
    }

    /* ----- Eventos da barra lateral, construtor de nome e modo ----- */
    el.btnCat.addEventListener('click', () => setMode('catalog'));
    el.btnImg.addEventListener('click', () => setMode('image'));
    // Configurações ficam na barra da campanha (topo) e na coluna Oferta (direita)
    [document.querySelector('#module-meta-ads .mc-hero'), $('meta-sidebar')]
        .filter(Boolean)
        .forEach(box =>
            ['input', 'change'].forEach(ev =>
                box.addEventListener(ev, () => {
                    syncUI();
                    save();
                }),
            ),
        );
    document
        .querySelectorAll('#meta-camp-name,#meta-budget,#meta-link,#meta-age-min,#meta-bid-amount')
        .forEach(e => e.addEventListener('input', () => e.classList.remove('bad')));

    $('meta-date-prefix').addEventListener('click', () => {
        const pre = todayTag() + '_';
        NB.date.value = todayTag();
        F['camp-name'].value = pre + F['camp-name'].value.trim().replace(/^\d{2}_\d{2}_\d{2}_/, '');
        syncUI();
        save();
    });

    // Campaign Name Builder Events
    $('nb-num-dec').addEventListener('click', () => {
        NB.num.value = Math.max(1, (parseInt(NB.num.value, 10) || 1) - 1);
        save();
    });
    $('nb-num-inc').addEventListener('click', () => {
        NB.num.value = (parseInt(NB.num.value, 10) || 1) + 1;
        save();
    });
    $('nb-apply').addEventListener('click', () => {
        const clean = v => v.trim().replace(/\s+/g, '').toUpperCase();
        const modeTag = state.mode === 'image' ? 'IMG' : 'CAT';
        const stratTag = `${F.strategy.value}#${Math.max(1, parseInt(NB.num.value, 10) || 1)}`;
        const parts = [
            clean(NB.date.value) || todayTag(),
            clean(NB.bm.value),
            clean(NB.ca.value),
            clean(NB.tag.value),
            modeTag,
            stratTag,
            clean(NB.prod.value),
            clean(NB.country.value),
            clean(NB.suffix.value),
        ].filter(Boolean);
        F['camp-name'].value = parts.join('_');
        F['camp-name'].classList.remove('bad');
        syncUI();
        save();
        showAppToast('Nome da campanha montado!', 'success');
    });

    /* ----- Presets (sem o nome da campanha) ----- */
    // Presets do projeto (salvos no projeto) + presets gerais (deste navegador).
    // Com projeto aberto, um preset novo é salvo no projeto; sem projeto, vai para os gerais.
    const presetSel = $('meta-preset-sel'),
        presetName = $('meta-preset-name');
    let projectPresets = {},
        projectPresetsActive = false;
    const globalPresets = () => lsGet(PRESETS, {});
    const getPresets = () => ({ ...globalPresets(), ...projectPresets });
    function fillPresets(sel) {
        const g = globalPresets();
        presetSel.length = 1;
        [...presetSel.querySelectorAll('optgroup')].forEach(x => x.remove());
        const group = (label, obj) => {
            const names = Object.keys(obj).sort();
            if (!names.length) return;
            const og = document.createElement('optgroup');
            og.label = label;
            names.forEach(n => og.appendChild(new Option(n, n)));
            presetSel.appendChild(og);
        };
        group('Deste projeto', projectPresets);
        group(
            'Gerais',
            Object.fromEntries(Object.entries(g).filter(([n]) => !(n in projectPresets))),
        );
        presetSel.value = sel && getPresets()[sel] ? sel : '';
    }
    $('meta-preset-save').addEventListener('click', () => {
        const n = presetName.value.trim();
        if (!n) return showAppToast('Dê um nome ao preset.', 'error');
        const s = getSettings();
        delete s['camp-name'];
        s.prefixes = [...state.creatorPrefixes]; // preset por oferta: prefixos dos anúncios junto
        if (projectPresetsActive) {
            projectPresets[n] = s;
            window.EGXModules?.changed('campaignCreator');
        } else {
            const p = globalPresets();
            p[n] = s;
            lsSet(PRESETS, p);
        }
        fillPresets(n);
        presetName.value = '';
        showAppToast(`Preset "${n}" salvo ${projectPresetsActive ? 'neste projeto' : 'nos presets gerais'}.`, 'success');
    });
    function applyPreset(n) {
        const s = getPresets()[n];
        if (!s) return;
        const keepName = F['camp-name'].value;
        applySettings(s);
        if (keepName) F['camp-name'].value = keepName; // o preset nunca apaga o nome digitado
        if (Array.isArray(s.prefixes) && s.prefixes.length) {
            state.creatorPrefixes = normalizePrefixes(s.prefixes);
            renderPrefixChips();
            refreshFilterPreview();
        }
        presetSel.value = n;
        save();
        suggestPreset();
        showAppToast(`Preset "${n}" aplicado${s.prefixes?.length ? ` (prefixos: ${s.prefixes.join(', ')})` : ''}.`, 'success');
    }
    presetSel.addEventListener('change', () => applyPreset(presetSel.value));

    // Sugere o preset cujo nome (ou produto salvo nele) aparece no nome da campanha / produto
    const presetHint = $('mc-preset-hint');
    function suggestPreset() {
        if (!presetHint) return;
        const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        const tokens = new Set([...norm(F['camp-name'].value).split(' '), ...norm(NB.prod?.value).split(' ')].filter(t => t.length >= 3));
        const all = getPresets();
        const hit = Object.keys(all).find(n => {
            if (n === presetSel.value) return false;
            const prod = norm(all[n]?.nb?.prod);
            return norm(n).split(' ').some(t => t.length >= 3 && tokens.has(t)) || (prod && tokens.has(prod));
        });
        presetHint.hidden = !hit;
        if (!hit) return;
        presetHint.replaceChildren();
        const t = document.createElement('span');
        t.textContent = `💡 O preset “${hit}” combina com esta campanha.`;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Aplicar';
        b.addEventListener('click', () => applyPreset(hit));
        presetHint.append(t, b);
    }
    let hintTimer = 0;
    [F['camp-name'], NB.prod].forEach(inp =>
        inp?.addEventListener('input', () => {
            clearTimeout(hintTimer);
            hintTimer = setTimeout(suggestPreset, 250);
        }),
    );
    setTimeout(suggestPreset, 400);
    $('nb-apply')?.addEventListener('click', () => setTimeout(suggestPreset, 50));
    $('meta-preset-del').addEventListener('click', () => {
        const n = presetSel.value;
        if (!n) return showAppToast('Selecione um preset para excluir.', 'error');
        if (n in projectPresets) {
            delete projectPresets[n];
            window.EGXModules?.changed('campaignCreator');
        } else {
            const p = globalPresets();
            delete p[n];
            lsSet(PRESETS, p);
        }
        fillPresets();
        showAppToast(`Preset "${n}" excluído.`, 'info');
    });

    /* ----- Entrada bruta e processamento ----- */
    $('meta-btn-clear-raw').addEventListener('click', () => {
        el.raw.value = '';
        el.raw.focus();
        save();
    });
    el.raw.addEventListener('input', () => {
        save();
        refreshFilterPreview();
    });
    el.raw.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'Enter') $('meta-btn-process').click();
    });
    $('meta-btn-back').addEventListener('click', () => showStep(1));

    // Lê a lista colada → anúncios (mesma regra usada no resumo ao vivo e no Processar)
    function parseRaw(raw, prefixes) {
        const parsed = [];
        splitRawByDetectedCodes(raw, prefixes).forEach(({ code, block }) => {
            if (!/^[A-Z][A-Z0-9_-]*?\s*\d/i.test(code)) return;
            const name = codeFromMatch(code);
            const fem = /\bfeminino\b|\bfem\b/i.test(block),
                masc = /\bmasculino\b|\bmasc\b/i.test(block);
            const ps =
                (block.match(/\bp:\s*(\d{6,})/i) || block.match(/(?<![A-Za-z0-9:])(\d{13,20})(?!\d)/) || [])[1] || '';
            parsed.push(
                makeAd(name, fem && !masc ? 'Feminino' : masc && !fem ? 'Masculino' : 'Ambos', fem && masc, ps),
            );
        });
        return parsed;
    }

    /* ----- Resumo ao vivo da lista colada (Passo 1) ----- */
    const live = $('meta-live');
    const processLabel = $('meta-btn-process')?.querySelector('span');
    let liveTimer = 0;
    function renderLive() {
        if (!live) return;
        const raw = el.raw.value;
        const lines = raw.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) {
            live.hidden = true;
            if (processLabel) processLabel.textContent = '⚡ Processar lista';
            return;
        }
        live.hidden = false;
        const pre = state.creatorPrefixes;
        if (!pre.length) {
            // Sem prefixo: sugere os encontrados na lista, com 1 clique
            const found = detectPrefixes(raw).slice(0, 4);
            live.innerHTML = `<span class="ml-ico">🏷️</span><span class="ml-text">${
                found.length ? 'Prefixos encontrados na lista:' : 'Nenhum código reconhecido ainda.'
            }</span>${found.map(p => `<button type="button" class="ml-chip ml-use" data-prefix="${p}">Usar ${p}</button>`).join('')}${
                found.length > 1 ? `<button type="button" class="ml-chip ml-use" data-prefix="${found.join(',')}">Usar todos</button>` : ''
            }`;
            if (processLabel) processLabel.textContent = '⚡ Processar lista';
            return;
        }
        const ads = parseRaw(raw, pre);
        const g = { Masculino: 0, Feminino: 0, Ambos: 0 };
        ads.forEach(a => (g[a.gender] = (g[a.gender] || 0) + 1));
        const names = ads.map(a => a.name);
        const dups = names.length - new Set(names).size;
        const conflict = ads.filter(a => a.conflict).length;
        const used = window.EGXWorkspace?.creativeUsage?.();
        const usedN = used ? ads.filter(a => used.get(codeOf(a.name))?.length).length : 0;
        const others = detectPrefixes(raw).filter(p => !pre.includes(p));
        const img = state.mode === 'image';
        live.innerHTML = `<span class="ml-count"><b>${ads.length}</b> anúncio${ads.length === 1 ? '' : 's'}</span>${
            img
                ? ''
                : `<span class="ml-chip g-m">♂ ${g.Masculino}</span><span class="ml-chip g-f">♀ ${g.Feminino}</span><span class="ml-chip g-a">⚥ ${g.Ambos}</span>`
        }${dups ? `<span class="ml-chip ml-warn" title="O mesmo código aparece mais de uma vez">⚠ ${dups} repetido${dups > 1 ? 's' : ''}</span>` : ''}${
            conflict ? `<span class="ml-chip ml-warn" title="Linha com masculino e feminino ao mesmo tempo — vira Ambos">⚠ ${conflict} gênero duplo</span>` : ''
        }${usedN ? `<span class="ml-chip ml-info" title="Criativos que já saíram em exportações deste projeto">↺ ${usedN} já usado${usedN > 1 ? 's' : ''}</span>` : ''}${
            others.length
                ? `<span class="ml-chip ml-muted" title="Códigos com outro prefixo foram ignorados">ignorados: ${others.slice(0, 3).join(', ')}</span><button type="button" class="ml-chip ml-use" data-prefix="${[...pre, ...others].join(',')}">+ incluir</button>`
                : ''
        }`;
        if (processLabel)
            processLabel.textContent = ads.length ? `⚡ Processar ${ads.length} anúncio${ads.length === 1 ? '' : 's'}` : '⚡ Processar lista';
    }
    const scheduleLive = () => {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(renderLive, 120);
    };
    el.raw.addEventListener('input', scheduleLive);
    live?.addEventListener('click', e => {
        const b = e.target.closest('[data-prefix]');
        if (!b) return;
        filterEls.input.value = b.dataset.prefix;
        filterEls.add.click();
        scheduleLive();
    });
    // Prefixos mudam por chips/botões: atualiza o resumo
    new MutationObserver(scheduleLive).observe(filterEls.chips, { childList: true });
    new MutationObserver(scheduleLive).observe(el.badge, { attributes: true, attributeFilter: ['class'] });
    setTimeout(renderLive, 300);

    // Pendências clicáveis: levam ao campo (abre a seção da barra lateral) ou à primeira linha com problema
    $('meta-chk-issues')?.addEventListener('click', e => {
        const go = e.target.closest('[data-go]')?.dataset.go;
        if (!go) return;
        if (go === 'fix:dedup') return removeDuplicates();
        if (go === 'row:pset' || go === 'row:dup') {
            const rows = [...(el.tbody?.querySelectorAll('tr[data-id]') || [])];
            const names = state.ads.map(a => a.name);
            const tr = rows.find(r => {
                const ad = state.ads.find(a => String(a.id) === r.dataset.id);
                if (!ad) return false;
                return go === 'row:pset' ? ad.name && !ad.productSet : names.filter(n => n === ad.name).length > 1;
            });
            if (!tr) return;
            tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
            const inp = tr.querySelector(go === 'row:pset' ? 'input.ps' : 'input.nm');
            inp?.focus();
            window.EGXFlash?.(tr);
            return;
        }
        const target = $(go);
        if (!target) return;
        const sec = target.closest('details.mc-sec');
        if (sec) sec.open = true;
        target.closest('details:not(.mc-sec)')?.setAttribute('open', '');
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
        window.EGXFlash?.(target);
    });
    // Mantém a primeira ocorrência de cada nome (os textos personalizados da primeira ficam)
    function removeDuplicates() {
        const seen = new Set();
        const keep = state.ads.filter(a => {
            if (!a.name) return true;
            const k = a.name.trim().toUpperCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        const removed = state.ads.length - keep.length;
        if (!removed) return showAppToast('Não há anúncios repetidos.', 'info');
        remember();
        state.ads = keep;
        state.selected.clear();
        render();
        save();
        showAppToast(`${removed} anúncio(s) repetido(s) removido(s).`, 'success', { label: 'Desfazer', fn: undo });
    }
    $('chk-status-pill')?.addEventListener('click', () => $('meta-chk-issues')?.querySelector('[data-go]')?.click());

    $('meta-btn-process').addEventListener('click', () => {
        if (!el.raw.value.trim()) return showAppToast('Cole sua lista de anúncios antes de processar.', 'error');
        if (filterEls.input.value.trim()) filterEls.add.click();
        if (!state.creatorPrefixes.length) {
            refreshFilterPreview();
            filterEls.input.focus();
            return showAppToast('Adicione o prefixo dos anúncios antes de processar (ex.: MSPBRAD).', 'error');
        }
        const prefixesToUse = state.creatorPrefixes;
        const parsed = parseRaw(el.raw.value, prefixesToUse);
        if (!parsed.length) {
            refreshFilterPreview();
            return showAppToast(
                `Nenhum código da lista começa com ${prefixesToUse.join(', ')}. Confira o prefixo.`,
                'error',
            );
        }
        const had = state.ads.length;
        remember();
        const prev = new Map(state.ads.filter(a => a.name).map(a => [codeOf(a.name), a]));
        parsed.forEach(a => {
            const o = prev.get(codeOf(a.name));
            if (!o) return;
            a.name = o.name;
            a.body = o.body || '';
            a.title = o.title || '';
            a.cta = o.cta || '';
            if (!a.productSet) a.productSet = o.productSet || '';
        });
        state.selected.clear();
        state.ads = parsed;
        render();
        showStep(2);
        save();
        showFilterFeedback(
            `${parsed.length} anúncio(s) processados com os prefixos ${prefixesToUse.join(', ')}.`,
            'success',
        );
        showAppToast(
            `${parsed.length} ${parsed.length === 1 ? 'anúncio processado' : 'anúncios processados'}! Confira na tabela.`,
            'success',
            had ? { label: 'Desfazer', fn: undo } : undefined,
        );
    });

    /* ----- Ferramentas da tabela ----- */
    $('meta-btn-add-row').addEventListener('click', () => {
        state.ads.push(makeAd());
        render();
        save();
        const rows = el.tbody.rows;
        rows[rows.length - 1].querySelector('.nm').focus();
    });
    $('meta-filter').addEventListener('input', e => {
        state.filter = e.target.value.toUpperCase().replace(/\s+/g, '');
        refresh();
    });
    $('meta-bulk-apply').addEventListener('click', () => {
        if (!state.ads.length) return;
        remember();
        const g = $('meta-bulk-gender').value;
        state.ads.forEach(a => {
            a.gender = g;
            a.conflict = false;
        });
        render();
        save();
        showAppToast(`Todos definidos como ${g}.`, 'success', { label: 'Desfazer', fn: undo });
    });
    $('meta-sort').addEventListener('click', () => {
        remember();
        state.ads.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
        render();
        save();
        showAppToast('Lista ordenada.', 'success', { label: 'Desfazer', fn: undo });
    });
    $('meta-backup').addEventListener('click', () => {
        const data = { version: 3, nameSuffixInName: true, mode: state.mode, settings: getSettings(), ads: state.ads };
        dl(
            new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
            `egx_backup_${new Date().toISOString().slice(0, 10)}.json`,
        );
    });
    $('meta-restore').addEventListener('click', () => $('meta-restore-file').click());
    $('meta-restore-file').addEventListener('change', async e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
            const d = JSON.parse(await f.text());
            if (!Array.isArray(d.ads)) throw new Error('formato');
            remember();
            state.selected.clear();
            state.ads = legacyImg(
                d,
                d.ads.map(a =>
                    makeAd(
                        String(a.name || ''),
                        GEN.includes(a.gender) ? a.gender : 'Ambos',
                        !!a.conflict,
                        a.productSet || '',
                        a,
                    ),
                ),
            );
            if (d.settings) applySettings(d.settings);
            setMode(d.mode === 'image' ? 'image' : 'catalog');
            showStep(state.ads.length ? 2 : 1);
            showAppToast('Backup restaurado.', 'success', { label: 'Desfazer', fn: undo });
        } catch (err) {
            showAppToast('Arquivo de backup inválido.', 'error');
        }
    });

    /* ----- Exportação ----- */
    function buildRows(ads) {
        const img = state.mode === 'image';
        const P = img ? META.image : META.catalog;
        const strat = F.strategy.value;
        const isCBO = strat === 'CBO' || strat === 'BID';
        const isBID = strat === 'BID';
        const budgetVal = parseFloat(F.budget.value) || 0;
        const bidVal = parseFloat(F['bid-amount'].value) || 0;
        const campName = F['camp-name'].value.trim() || 'CAMPANHA_EGX';
        const linkUrl = F.link.value.trim();
        const urlTags = F['url-tags'].value.trim();
        const ageMin = F['age-min'].value;
        const ageMax = F['age-max'].value;
        const pageId = metaId('o:', F['page-id'].value);
        const igId = metaId('x:', F['ig-id'].value);
        const pixelId = metaId('tp:', F['pixel-id'].value);
        const beneficiary = digitsOnly(F.beneficiary.value);
        // Catálogo e Product Set ID ficam de fora: preenchidos, a Meta trava a "Fonte dos anúncios"
        // (mídia do catálogo) no anúncio. Sem eles, você escolhe catálogo e conjunto de produtos no editor da Meta.
        const attribution = META.attribution[F.attribution.value] || META.attribution.click7_view1;
        const bidLabel = isBID ? META.bidLabel.cap : META.bidLabel.volume;

        const row = (adsetName, gender, adName, productSet, ad = {}) => ({
            'Campaign Name': campName,
            'Campaign Status': 'ACTIVE',
            'Campaign Objective': META.objective,
            'Buying Type': 'AUCTION',
            'Campaign Daily Budget': isCBO ? budgetVal : '',
            'Campaign Lifetime Budget': '',
            'Campaign Bid Strategy': isCBO ? bidLabel : '',
            'New Objective': 'Yes',
            'Buy With Prime Type': 'NONE',
            'Is Budget Scheduling Enabled For Campaign': 'No',
            'Campaign High Demand Periods': '[]',
            'Buy With Integration Partner': 'NONE',
            'Ad Set Run Status': 'ACTIVE',
            'Ad Set Name': adsetName,
            'Ad Set Daily Budget': !isCBO ? budgetVal : '',
            'Destination Type': META.destinationType,
            'Ad Set Lifetime Budget': 0,
            'Use Accelerated Delivery': 'No',
            'Is Budget Scheduling Enabled For Ad Set': 'No',
            'Ad Set High Demand Periods': '[]',
            'Link Object ID': pageId,
            'Optimized Conversion Tracking Pixels': pixelId,
            'Optimized Event': META.event,
            Link: linkUrl,
            Countries: META.country,
            'Location Types': META.locationTypes,
            Gender: toMeta(gender),
            'Age Min': ageMin,
            'Age Max': ageMax,
            'Advantage Audience': META.advAudience,
            'Targeting Relaxation': META.targetingRelaxation,
            'Publisher Platforms': P.platforms,
            'Facebook Positions': P.fb,
            'Instagram Positions': P.ig,
            'Audience Network Positions': '',
            'Messenger Positions': '',
            'Device Platforms': P.platforms ? META.devicePlatforms : '',
            'Optimization Goal': META.goal,
            'Attribution Spec': attribution,
            'Billing Event': META.billing,
            'Ad Set Bid Strategy': !isCBO ? META.bidLabel.volume : '',
            'Bid Amount': isBID ? bidVal : '',
            'Regional Regulated Categories': META.country === 'BR' ? META.regulatedCategories : '',
            'Beneficiary (selected locations)': beneficiary,
            'Payer (selected locations)': beneficiary,
            'Ad Status': 'ACTIVE',
            'Ad Name': adName,
            Title: ad.title || '',
            Body: ad.body || '',
            'Optimize text per person': 'No',
            'Conversion Tracking Pixels': pixelId,
            'Optimized Ad Creative': 'No',
            'Creative Type': META.creativeType,
            'URL Tags': urlTags,
            'Instagram Account ID': igId,
            'Call to Action': ad.cta || P.cta,
            'Additional Custom Tracking Specs': '[]',
            'Video Retargeting': 'No',
            'Format Option': P.format,
            'Use Page as Actor': 'No',
        });

        const rows = [];
        if (img) {
            const adsetName = F['img-adset-name'].value.trim() || 'IMGs';
            const adsetGender = F['img-adset-gender'].value;
            ads.forEach(ad => {
                if (ad.name) rows.push(row(adsetName, adsetGender, ad.name, '', ad));
            });
        } else {
            ads.forEach(ad => {
                if (ad.name) rows.push(row(ad.name, ad.gender, ad.name, ad.productSet || '', ad));
            });
        }
        return rows;
    }

    // Valida as linhas geradas com o mesmo validador do Editor em lote, antes de baixar.
    async function confirmValidation(rows) {
        const model = EGXValidation.guessModel(F['camp-name'].value, F.strategy.value);
        const matrix = rows.map(r => HEADERS.map(h => r[h] ?? ''));
        let errors, warnings;
        try {
            ({ errors, warnings } = EGXValidation.validateSheet(HEADERS, matrix, model));
        } catch (e) {
            console.error('EGX: falha na validação', e);
            showAppToast('Não foi possível validar a planilha; exportando sem validação.', 'info');
            return true;
        }
        if (!errors.length && !warnings.length) return true;
        const modelLabel = window.EGX_VALIDATION_MODELS?.[model]?.label;
        const details = [...errors.map(x => '🔴 ' + x.message), ...warnings.map(x => '🟡 ' + x.message)];
        return EGXDialog.confirm(
            `${errors.length} erro(s) e ${warnings.length} aviso(s) encontrados${modelLabel ? ` (modelo ${modelLabel}, detectado pelo nome da campanha)` : ''}.`,
            {
                title: errors.length ? 'Revise antes de exportar' : 'Avisos da validação',
                details: [...new Set(details)].slice(0, 12),
                okLabel: 'Exportar mesmo assim',
                cancelLabel: 'Voltar e corrigir',
                danger: !!errors.length,
            },
        );
    }

    $('meta-btn-export').addEventListener('click', async () => {
        let err = false;
        if (!F['camp-name'].value.trim()) {
            F['camp-name'].classList.add('bad');
            err = true;
        }
        if (!F.link.value.trim()) {
            F.link.classList.add('bad');
            err = true;
        }
        if (F.strategy.value === 'BID' && (!F['bid-amount'].value || parseFloat(F['bid-amount'].value) <= 0)) {
            F['bid-amount'].classList.add('bad');
            err = true;
        }
        if (err) return showAppToast('Preencha os campos obrigatórios destacados em vermelho.', 'error');

        const validAds = state.ads.filter(a => a.name.trim());
        if (!validAds.length) return showAppToast('Adicione ao menos um anúncio com nome válido.', 'error');

        let rows;
        try {
            rows = buildRows(validAds);
        } catch (e) {
            return showAppToast('Erro ao montar a planilha. Verifique os dados.', 'error');
        }
        if (!(await confirmValidation(rows))) return;

        try {
            const wb = makeWorkbook(rows);
            const campName = F['camp-name'].value.trim();
            const fileName = `${campName}_bulk.xlsx`;
            XLSX.writeFile(wb, fileName);
            $('meta-step-pill-3')?.classList.add('done');
            const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            window.EGXWorkspace?.recordExport({
                fileName,
                data,
                module: 'Criador de campanhas',
                campaigns: [campName],
                ads: validAds.map(a => a.name),
                rows: rows.length,
            });
            paintUsedAll();
            showAppToast(`Planilha ${fileName} exportada com sucesso!`, 'success', {
                label: 'Abrir no Editor',
                fn: () => openInEditor(fileName, rows, wb),
            });
        } catch (e) {
            showAppToast('Erro ao exportar planilha. Verifique os dados.', 'error');
        }
    });

    function makeWorkbook(rows) {
        const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Meta Ads Bulk Import');
        return wb;
    }

    // Revisar no Editor antes de baixar: monta a mesma planilha da exportação e abre no Editor.
    // Campos em branco não bloqueiam (dá para completar no Editor); só avisa o que falta.
    $('meta-btn-to-editor')?.addEventListener('click', async () => {
        const validAds = state.ads.filter(a => a.name.trim());
        if (!validAds.length) return showAppToast('Adicione ao menos um anúncio com nome válido.', 'error');
        let rows;
        try {
            rows = buildRows(validAds);
        } catch (e) {
            return showAppToast('Erro ao montar a planilha. Verifique os dados.', 'error');
        }
        const campName = F['camp-name'].value.trim() || 'CAMPANHA_EGX';
        const fileName = `${campName}_bulk.xlsx`;
        const ok = await openInEditor(fileName, rows, makeWorkbook(rows));
        if (ok === false) return;
        $('meta-step-pill-3')?.classList.add('done');
        window.EGXWorkspace?.log?.('Planilha enviada ao Editor', `${campName} · ${rows.length} linha(s)`);
        const missing = [
            !F['camp-name'].value.trim() && 'nome da campanha',
            !F.link.value.trim() && 'link de destino',
            !digitsOnly(F['page-id'].value) && 'ID da Página',
            !digitsOnly(F['pixel-id'].value) && 'ID do Pixel',
        ].filter(Boolean);
        showAppToast(
            missing.length
                ? `Planilha aberta no Editor. Ainda falta: ${missing.join(', ')} — dá para completar lá antes de exportar.`
                : `Planilha aberta no Editor (${rows.length} linha(s)). Revise e exporte por lá quando estiver pronta.`,
            missing.length ? 'info' : 'success',
        );
    });

    /* ----- Variações: a mesma lista em várias campanhas (CBO / ABO / BID) numa planilha só ----- */
    // Troca o tipo no nome mantendo o número: ..._CBO#1_... → ..._ABO#1_...
    function nameForType(name, type) {
        const rx = /(^|_)(CBO|ABO|BID)(?=#|_|$)/i;
        return rx.test(name) ? name.replace(rx, `$1${type}`) : `${name}_${type}`;
    }
    $('meta-btn-variants')?.addEventListener('click', async () => {
        const validAds = state.ads.filter(a => a.name.trim());
        if (!validAds.length) return showAppToast('Adicione ao menos um anúncio com nome válido.', 'error');
        const cur = F.strategy.value;
        const base = F['camp-name'].value.trim() || 'CAMPANHA_EGX';
        const others = ['CBO', 'ABO', 'BID'].filter(t => t !== cur);
        const v = await EGXDialog.form({
            title: 'Gerar variações da campanha',
            okLabel: 'Gerar',
            wide: true,
            message: `Mesmos ${validAds.length} anúncios e configurações, em outras estruturas. Atual: ${cur} — ${base}`,
            fields: [
                { id: 'types', type: 'checks', label: 'Gerar também como', value: others.slice(0, 1), options: others.map(t => ({ value: t, label: `${t} → ${nameForType(base, t)}` })) },
                { id: 'include', type: 'checkbox', label: `Incluir a campanha atual (${cur}) na mesma planilha`, value: true },
                { id: 'budget', type: 'number', step: 'any', label: 'Orçamento diário das variações (CBO/BID: da campanha · ABO: de cada conjunto)', value: F.budget.value },
                { id: 'bid', type: 'number', step: 'any', label: 'Limite de lance (Bid Amount) da variação BID', value: F['bid-amount'].value, show: x => (x.types || []).includes('BID') },
                {
                    id: 'dest',
                    type: 'radio',
                    label: 'Depois',
                    value: 'editor',
                    options: [
                        { value: 'editor', label: 'Abrir no Editor para revisar (recomendado)' },
                        { value: 'download', label: 'Baixar a planilha .xlsx' },
                    ],
                },
            ],
            validate: x =>
                !(x.types || []).length
                    ? 'Escolha pelo menos uma estrutura.'
                    : !(Number(x.budget) > 0)
                      ? 'Informe o orçamento.'
                      : (x.types || []).includes('BID') && !(Number(x.bid) > 0)
                        ? 'Informe o limite de lance da variação BID.'
                        : '',
        });
        if (!v) return;
        // Gera cada variação trocando temporariamente os campos da barra lateral
        const saved = { strategy: F.strategy.value, budget: F.budget.value, bid: F['bid-amount'].value, name: F['camp-name'].value };
        let rows = [];
        try {
            if (v.include) rows = rows.concat(buildRows(validAds));
            v.types.forEach(t => {
                F.strategy.value = t;
                F.budget.value = v.budget;
                F['bid-amount'].value = t === 'BID' ? v.bid : saved.bid;
                F['camp-name'].value = nameForType(base, t);
                rows = rows.concat(buildRows(validAds));
            });
        } catch (e) {
            showAppToast('Erro ao montar as variações.', 'error');
            return;
        } finally {
            F.strategy.value = saved.strategy;
            F.budget.value = saved.budget;
            F['bid-amount'].value = saved.bid;
            F['camp-name'].value = saved.name;
        }
        const n = (v.include ? 1 : 0) + v.types.length;
        const fileName = `${base}_variacoes.xlsx`;
        const wb = makeWorkbook(rows);
        if (v.dest === 'editor') {
            if ((await openInEditor(fileName, rows, wb)) === false) return;
            showAppToast(`${n} campanha(s) abertas no Editor (${rows.length} linhas).`, 'success');
        } else {
            XLSX.writeFile(wb, fileName);
            window.EGXWorkspace?.recordExport({
                fileName,
                data: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }),
                module: 'Criador de campanhas',
                campaigns: [...new Set(rows.map(r => r['Campaign Name']))],
                ads: validAds.map(a => a.name),
                rows: rows.length,
            });
            showAppToast(`Planilha ${fileName} com ${n} campanha(s) exportada.`, 'success');
        }
        $('meta-step-pill-3')?.classList.add('done');
    });

    async function openInEditor(fileName, rows, wb) {
        const be = window.EGXBulkEditorBridge;
        if (!be) return false;
        if (be.summary().rows) {
            const ok = await EGXDialog.confirm(
                `O Editor em lote já tem uma planilha aberta (${be.summary().fileName || 'sem nome'}). Substituir pela planilha gerada?`,
                { okLabel: 'Substituir' },
            );
            if (!ok) return false;
        }
        be.openGenerated({
            fileName,
            headers: HEADERS.slice(),
            rows: rows.map(r => HEADERS.map(h => r[h] ?? '')),
            workbookB64: XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }),
        });
        $('nav-tab-bulk-editor').click();
    }

    /* ----- Criativo já usado em exportações anteriores deste projeto ----- */
    function paintUsed(el, name) {
        if (!el) return;
        const uses = name ? window.EGXWorkspace?.creativeUsage?.().get(codeOf(name)) : null;
        el.replaceChildren();
        if (!uses?.length) return;
        const b = document.createElement('span');
        b.className = 'egx-used-badge';
        b.textContent = uses.length > 1 ? `já usado ${uses.length}×` : 'já usado';
        b.title = uses
            .slice(0, 5)
            .map(u => `${u.campaign} — ${new Date(u.at).toLocaleDateString('pt-BR')}`)
            .join('\n');
        el.appendChild(b);
    }
    function paintUsedAll() {
        el.tbody?.querySelectorAll('tr[data-id]').forEach(tr => {
            const ad = state.ads.find(a => String(a.id) === tr.dataset.id);
            paintUsed(tr.querySelector('.used'), ad?.name);
        });
    }
    window.addEventListener('egx:project-loaded', paintUsedAll);

    /* ----- Próximo número livre do nome da campanha (#n) ----- */
    $('nb-num-auto')?.addEventListener('click', () => {
        const clean = v => v.trim().replace(/\s+/g, '').toUpperCase();
        const date = clean(NB.date.value) || todayTag();
        const parts = [clean(NB.bm.value), clean(NB.ca.value), clean(NB.tag.value)].filter(Boolean);
        const strat = F.strategy.value;
        const re = new RegExp(`(?:^|_)${strat}#(\\d+)(?:_|$)`, 'i');
        let max = 0;
        (window.EGXWorkspace?.exportsIndex?.() || []).forEach(e =>
            (e.campaigns || []).forEach(c => {
                const C = String(c).toUpperCase();
                const tokens = C.split('_');
                // Mesma data e mesmos BM/CA/tag (quando preenchidos) → mesma "família" de campanha.
                if (!C.startsWith(date + '_') || !parts.every(t => tokens.includes(t))) return;
                const m = re.exec(C);
                if (m) max = Math.max(max, parseInt(m[1], 10));
            }),
        );
        NB.num.value = max + 1;
        save();
        showAppToast(
            max
                ? `Último ${strat} exportado hoje com esse início: #${max}. Próximo: #${max + 1}.`
                : `Nenhuma campanha ${strat} exportada com esse início. Começando em #1.`,
            'info',
        );
    });

    /* ----- Inicialização ----- */
    fillPresets();
    // Creator starts empty on every EGX launch. Keep only reusable settings;
    // discard any previously persisted ad list/raw input from older versions.
    const saved = lsGet(STORE, null) || lsGet(LEGACY_STORE, null);
    if (saved && saved.settings) applySettings(saved.settings);
    try {
        localStorage.removeItem(LEGACY_STORE);
    } catch (e) {
        /* storage unavailable */
    }
    lsSet(STORE, { settings: getSettings() });
    state.ads = [];
    state.nextId = 1;
    el.raw.value = '';
    showStep(1);
    setMode('catalog');
    // Expose a narrow bridge so the workspace can save/restore Creator data per project.
    window.EGXCreatorProjectBridge = {
        exportData: () => ({
            version: 2,
            nameSuffixInName: true,
            mode: state.mode,
            settings: getSettings(),
            ads: state.ads.map(a => ({
                name: a.name,
                gender: a.gender,
                conflict: !!a.conflict,
                productSet: a.productSet || '',
                body: a.body || '',
                title: a.title || '',
                cta: a.cta || '',
            })),
            raw: el.raw.value,
            creatorPrefixes: state.creatorPrefixes,
            creatorFilterEnabled: state.creatorFilterEnabled,
            presets: projectPresets,
        }),
        importData: data => {
            projectPresetsActive = true;
            projectPresets = data?.presets && typeof data.presets === 'object' ? { ...data.presets } : {};
            fillPresets();
            state.selected.clear();
            state.ads = Array.isArray(data?.ads)
                ? legacyImg(
                      data,
                      data.ads.map(a =>
                          makeAd(
                              String(a.name || ''),
                              GEN.includes(a.gender) ? a.gender : 'Ambos',
                              !!a.conflict,
                              a.productSet || '',
                              a,
                          ),
                      ),
                  )
                : [];
            state.nextId = state.ads.length + 1;
            if (data?.settings) applySettings(data.settings);
            el.raw.value = String(data?.raw || '');
            state.creatorPrefixes = normalizePrefixes(data?.creatorPrefixes || []);
            state.creatorFilterEnabled = data?.creatorFilterEnabled !== false;
            renderPrefixChips();
            refreshFilterPreview();
            setMode(data?.mode === 'image' ? 'image' : 'catalog');
            render();
            showStep(state.ads.length ? 2 : 1);
        },
        clear: () => {
            state.selected.clear();
            undoStack.length = 0;
            syncUndo();
            state.ads = [];
            state.nextId = 1;
            el.raw.value = '';
            state.creatorPrefixes = [];
            state.creatorFilterEnabled = true;
            renderPrefixChips();
            refreshFilterPreview();
            setMode('catalog');
            render();
            showStep(1);
            projectPresetsActive = true; // projeto aberto sem dados do Criador
            projectPresets = {};
            fillPresets();
        },
        // Sem projeto: presets voltam a ser só os gerais.
        detach: () => {
            window.EGXCreatorProjectBridge.clear();
            projectPresetsActive = false;
            projectPresets = {};
            fillPresets();
        },
        // Recebe uma lista do Extrator e processa direto.
        loadList: (text, prefixes = []) => {
            el.raw.value = String(text || '');
            state.creatorPrefixes = normalizePrefixes([...state.creatorPrefixes, ...prefixes]);
            renderPrefixChips();
            refreshFilterPreview();
            showStep(1);
            save();
            if (state.creatorPrefixes.length) $('meta-btn-process').click();
            else showAppToast('Lista recebida. Informe o prefixo dos anúncios e clique em Processar.', 'info');
        },
    };
    window.EGXModules?.register('campaignCreator', window.EGXCreatorProjectBridge);
})();
