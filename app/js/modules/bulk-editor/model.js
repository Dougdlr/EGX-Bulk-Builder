'use strict';
/* ===================================================================
   EGXSheetModel — modelo de dados do Editor de planilhas
   -------------------------------------------------------------------
   Uma planilha de importação do Meta tem 1 linha por anúncio. Campanha
   e conjunto são "agrupamentos" de linhas pelo nome. Este modelo expõe
   a hierarquia Campanha → Conjunto → Anúncio e operações por nível
   (renomear, duplicar, mover, excluir, status, orçamento...), sem
   tocar na interface.

   Chaves de nó:
     campanha  'c:' + nome da campanha
     conjunto  's:' + nome da campanha + '\u0001' + nome do conjunto
     anúncio   'a:' + chave estável da linha
   =================================================================== */
window.EGXSheetModel = (() => {
    const norm = s =>
        String(s ?? '')
            .trim()
            .toLowerCase();
    const clean = s => String(s ?? '').trim();
    const SEP = '\u0001';
    let seq = 0;
    const newKey = () => 'r' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

    /* ---------- Colunas conhecidas ---------- */
    const C = {
        campName: ['Campaign Name'],
        adsetName: ['Ad Set Name'],
        adName: ['Ad Name'],
        campId: ['Campaign ID'],
        adsetId: ['Ad Set ID'],
        adId: ['Ad ID'],
        campStatus: ['Campaign Status'],
        adsetStatus: ['Ad Set Run Status', 'Ad Set Status'],
        adStatus: ['Ad Status'],
        campBudget: ['Campaign Daily Budget'],
        campLifetime: ['Campaign Lifetime Budget'],
        adsetBudget: ['Ad Set Daily Budget'],
        adsetLifetime: ['Ad Set Lifetime Budget'],
        campBid: ['Campaign Bid Strategy'],
        adsetBid: ['Ad Set Bid Strategy'],
        bidAmount: ['Bid Amount'],
        objective: ['Campaign Objective'],
        gender: ['Gender'],
        ageMin: ['Age Min'],
        ageMax: ['Age Max'],
        countries: ['Countries'],
        title: ['Title'],
        body: ['Body'],
        cta: ['Call to Action'],
        link: ['Link'],
        urlTags: ['URL Tags'],
    };
    // Colunas que, ao duplicar, devem ser zeradas para o Meta criar itens novos.
    const TIME_COLS = [
        'campaign start time',
        'campaign stop time',
        'ad set time start',
        'ad set time stop',
        'ad start time',
        'ad stop time',
    ];
    const CAMP_EXTRA = [
        'buying type',
        'new objective',
        'buy with prime type',
        'buy with integration partner',
        'is budget scheduling enabled for campaign',
        'special ad categories',
        'special ad category country',
        'product catalog id', // catálogo da campanha (catálogo → conjunto de produtos)
    ];
    const AD_EXTRA = [
        'title',
        'body',
        'link',
        'url tags',
        'call to action',
        'creative type',
        'image hash',
        'image file name',
        'video id',
        'video file name',
        'video thumbnail url',
        'instagram account id',
        'display link',
        'link description',
        'caption',
        'format option',
        'conversion tracking pixels',
        'optimize text per person',
        'optimized ad creative',
        'additional custom tracking specs',
        'video retargeting',
        'use page as actor',
        'permalink',
        'story id',
        'instagram post id',
        'preview link',
        'link object id',
        'dynamic creative ad format',
        'deep link',
        'app destination',
    ];
    function levelOfHeader(h) {
        const n = norm(h);
        if (n.startsWith('campaign ') || CAMP_EXTRA.includes(n)) return 'campaign';
        if (n.startsWith('ad set ')) return 'adset';
        if (n.startsWith('ad ') || AD_EXTRA.includes(n)) return 'ad';
        return 'adset'; // segmentação, otimização, cobrança etc.
    }
    const levelOfKey = key => (key[0] === 'c' ? 'campaign' : key[0] === 's' ? 'adset' : 'ad');

    // Próximo nome livre para uma cópia: "#n" incrementa; senão "_COPIA", "_COPIA2"...
    function nextCopyName(name, taken) {
        const has = n => taken.has(norm(n));
        const m = /^(.*#)(\d+)(.*)$/.exec(name);
        if (m) {
            let n = parseInt(m[2], 10) + 1;
            while (has(`${m[1]}${n}${m[3]}`)) n++;
            return `${m[1]}${n}${m[3]}`;
        }
        const base = name.replace(/_COPIA\d*$/i, '');
        let cand = `${base}_COPIA`,
            i = 2;
        while (has(cand)) cand = `${base}_COPIA${i++}`;
        return cand;
    }
    const DATE_RE = /^\d{2}_\d{2}_\d{2}(?=_|$)/;
    const todayTag = () => {
        const d = new Date(),
            p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}_${p(d.getMonth() + 1)}_${String(d.getFullYear()).slice(2)}`;
    };
    const toNum = v => {
        const n = Number(String(v ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    };
    const round2 = n => Math.round(n * 100) / 100;

    /* =================================================================
       Planilha
       ================================================================= */
    class Sheet {
        constructor(headers, rows, keys) {
            this.headers = headers.map(h => String(h ?? '').trim());
            const w = this.headers.length;
            this.rows = rows.map(r => {
                const row = [...r];
                while (row.length < w) row.push('');
                return row;
            });
            this.keys = keys && keys.length === this.rows.length ? [...keys] : this.rows.map(() => newKey());
            this._index();
        }
        static fromSnapshot(s) {
            return new Sheet(s.headers, s.rows, s.keys);
        }
        snapshot() {
            return { headers: [...this.headers], rows: this.rows.map(r => [...r]), keys: [...this.keys] };
        }
        _index() {
            this._col = new Map();
            this.headers.forEach((h, i) => {
                const n = norm(h);
                if (!this._col.has(n)) this._col.set(n, i);
            });
        }
        /* ---------- Colunas ---------- */
        col(name) {
            const list = Array.isArray(name) ? name : C[name] || [name];
            for (const n of list) {
                const i = this._col.get(norm(n));
                if (i !== undefined) return i;
            }
            return -1;
        }
        has(name) {
            return this.col(name) >= 0;
        }
        ensureCol(name) {
            let i = this.col(name);
            if (i >= 0) return i;
            const label = (C[name] || [name])[0];
            this.headers.push(label);
            this.rows.forEach(r => r.push(''));
            this._index();
            return this.headers.length - 1;
        }
        get(r, name) {
            const i = this.col(name);
            return i < 0 ? '' : clean(this.rows[r][i]);
        }
        set(r, name, v) {
            const i = this.ensureCol(name);
            this.rows[r][i] = v;
        }
        rowOfKey(rowKey) {
            return this.keys.indexOf(rowKey);
        }
        colsOfLevel(level) {
            return this.headers.map((h, i) => ({ h, i })).filter(x => levelOfHeader(x.h) === level);
        }

        /* ---------- Hierarquia ---------- */
        tree() {
            const camps = new Map();
            this.rows.forEach((row, i) => {
                const cn = this.get(i, 'campName'),
                    sn = this.get(i, 'adsetName'),
                    an = this.get(i, 'adName');
                if (!camps.has(cn))
                    camps.set(cn, { key: 'c:' + cn, level: 'campaign', name: cn, rows: [], adsets: new Map() });
                const c = camps.get(cn);
                c.rows.push(i);
                if (!c.adsets.has(sn))
                    c.adsets.set(sn, {
                        key: 's:' + cn + SEP + sn,
                        level: 'adset',
                        name: sn,
                        campaign: cn,
                        rows: [],
                        ads: [],
                    });
                const s = c.adsets.get(sn);
                s.rows.push(i);
                if (an || (!sn && !cn))
                    s.ads.push({ key: 'a:' + this.keys[i], level: 'ad', name: an, campaign: cn, adset: sn, rows: [i] });
            });
            return [...camps.values()].map(c => ({ ...c, adsets: [...c.adsets.values()] }));
        }
        // Lista plana de nós de um nível, opcionalmente dentro de um escopo (campanha/conjunto).
        nodes(level, scopeKey = '') {
            const out = [];
            const tree = this.tree();
            tree.forEach(c => {
                if (scopeKey && scopeKey[0] === 'c' && c.key !== scopeKey) return;
                if (level === 'campaign') return out.push(c);
                c.adsets.forEach(s => {
                    if (scopeKey && scopeKey[0] === 's' && s.key !== scopeKey) return;
                    if (level === 'adset') return out.push(s);
                    s.ads.forEach(a => out.push(a));
                });
            });
            return out;
        }
        node(key) {
            if (!key) return null;
            const level = levelOfKey(key);
            if (level === 'ad') {
                const i = this.rowOfKey(key.slice(2));
                if (i < 0) return null;
                return {
                    key,
                    level,
                    name: this.get(i, 'adName'),
                    campaign: this.get(i, 'campName'),
                    adset: this.get(i, 'adsetName'),
                    rows: [i],
                };
            }
            return this.nodes(level).find(n => n.key === key) || null;
        }
        rowsOf(key) {
            return this.node(key)?.rows || [];
        }
        // Valor de uma coluna num nó ('' se não houver; null se as linhas divergirem).
        value(key, name) {
            const rows = this.rowsOf(key);
            if (!rows.length) return '';
            const vals = new Set(rows.map(r => this.get(r, name)));
            return vals.size === 1 ? [...vals][0] : null;
        }
        statusCol(level) {
            return level === 'campaign' ? 'campStatus' : level === 'adset' ? 'adsetStatus' : 'adStatus';
        }
        nameCol(level) {
            return level === 'campaign' ? 'campName' : level === 'adset' ? 'adsetName' : 'adName';
        }
        budgetCol(level) {
            return level === 'campaign' ? 'campBudget' : 'adsetBudget';
        }
        isCBO(campKey) {
            const rows = this.rowsOf(campKey);
            return rows.some(r => toNum(this.get(r, 'campBudget')) > 0 || toNum(this.get(r, 'campLifetime')) > 0);
        }
        /* ---------- Tipo de orçamento: CBO, ABO ou BID ----------
           CBO = orçamento na campanha, lance "maior volume"
           BID = orçamento na campanha + estratégia "Bid cap" e limite de lance nos conjuntos
           ABO = orçamento nos conjuntos (campanha sem orçamento e sem estratégia) */
        budgetType(campKey) {
            if (!this.isCBO(campKey)) return 'ABO';
            return /bid\s*cap/i.test(String(this.value(campKey, 'campBid') || '')) ? 'BID' : 'CBO';
        }
        // Tipo escrito no nome (…_CBO#1_…, …_ABO#2_…, …_BID#1_…)
        nameType(campKey) {
            const m = /(?:^|_)(CBO|ABO|BID)(?=#|_|$)/i.exec(this.node(campKey)?.name || '');
            return m ? m[1].toUpperCase() : '';
        }
        campaignOf(key) {
            const n = this.node(key);
            if (!n) return '';
            return n.level === 'campaign' ? n.key : 'c:' + n.campaign;
        }
        // Nível onde o orçamento deve ficar para este item ('campaign' | 'adset')
        budgetLevel(key) {
            return this.budgetType(this.campaignOf(key)) === 'ABO' ? 'adset' : 'campaign';
        }
        // Problemas de estrutura que a Meta recusa na importação (ex.: "tipos de orçamentos mistos")
        budgetIssues(campKey) {
            const camp = this.node(campKey);
            if (!camp) return [];
            const rows = camp.rows;
            const any = (name, test) => this.has(name) && rows.some(r => test(this.get(r, name)));
            const pos = v => toNum(v) > 0;
            const filled = v => String(v ?? '').trim() !== '';
            const campBudget = any('campBudget', pos) || any('campLifetime', pos);
            const adsetBudget = any('adsetBudget', pos) || any('adsetLifetime', pos);
            const campBid = any('campBid', filled);
            const adsetBid = any('adsetBid', filled);
            const type = this.budgetType(campKey);
            const issues = [];
            if (campBudget && adsetBudget)
                issues.push({ sev: 'error', code: 'both', text: 'Orçamento na campanha e nos conjuntos ao mesmo tempo (orçamento misto).' });
            if (any('campBudget', pos) && any('campLifetime', pos))
                issues.push({
                    sev: 'error',
                    code: 'dailylife',
                    text: 'Orçamento diário (Daily Budget) e total (Lifetime Budget) preenchidos juntos na campanha. A Meta aceita só um dos dois.',
                });
            if (any('adsetBudget', pos) && any('adsetLifetime', pos))
                issues.push({
                    sev: 'error',
                    code: 'dailylife',
                    text: 'Orçamento diário e total preenchidos juntos nos conjuntos. A Meta aceita só um dos dois.',
                });
            const maxDaily = Math.max(0, ...rows.map(r => toNum(this.get(r, type === 'ABO' ? 'adsetBudget' : 'campBudget')) || 0));
            if (maxDaily > 10000)
                issues.push({
                    sev: 'warn',
                    code: 'high',
                    text: `Orçamento diário alto: ${maxDaily.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia. Confira se não sobrou zero a mais.`,
                });
            if (!campBudget && campBid)
                issues.push({
                    sev: 'error',
                    code: 'campbid',
                    text: 'Estratégia de lance na campanha sem orçamento de campanha. Em ABO a estratégia fica só nos conjuntos — a Meta recusa como “tipos de orçamentos mistos”.',
                });
            if (campBudget && adsetBid)
                issues.push({ sev: 'error', code: 'adsetbid', text: 'Orçamento na campanha, mas estratégia de lance preenchida nos conjuntos.' });
            if (!campBudget && !adsetBudget)
                issues.push({ sev: 'error', code: 'none', text: 'Nenhum orçamento definido (nem na campanha, nem nos conjuntos).' });
            if (type === 'BID' && rows.some(r => !pos(this.get(r, 'bidAmount'))))
                issues.push({ sev: 'error', code: 'bidamount', text: 'Campanha BID sem limite de lance (Bid Amount) em algum conjunto.' });
            const adsetCap = any('adsetBid', v => /bid\s*cap|cost/i.test(v));
            if (type !== 'BID' && !adsetCap && any('bidAmount', pos))
                issues.push({
                    sev: 'warn',
                    code: 'bidextra',
                    text: 'Limite de lance (Bid Amount) preenchido, mas a estratégia não é “Limite de lance (Bid cap)”.',
                });
            const nt = this.nameType(campKey);
            if (nt && nt !== type)
                issues.push({ sev: 'warn', code: 'name', text: `O nome indica ${nt}, mas a estrutura está como ${type}.`, suggest: nt });
            return issues;
        }
        // Tipo que a campanha deveria ter (para o botão "Corrigir")
        intendedType(campKey) {
            const nt = this.nameType(campKey);
            if (nt) return nt;
            if (/bid\s*cap/i.test(String(this.value(campKey, 'campBid') || ''))) return 'BID';
            return this.budgetType(campKey);
        }
        // Converte/normaliza a campanha para CBO, ABO ou BID, limpando o que é do outro nível.
        // opts.budget: orçamento (da campanha em CBO/BID; de cada conjunto em ABO)
        // opts.bid: limite de lance para todos os conjuntos (BID)
        setBudgetType(campKey, type, opts = {}) {
            const camp = this.node(campKey);
            if (!camp) return false;
            const sets = this.nodes('adset', campKey);
            const maxOf = name => Math.max(0, ...camp.rows.map(r => toNum(this.get(r, name)) || 0));
            const setIf = (r, name, v) => this.has(name) && this.set(r, name, v);
            const campB = maxOf('campBudget');
            const sumSets = round2(sets.reduce((s, x) => s + (toNum(this.value(x.key, 'adsetBudget')) || 0), 0));
            if (type === 'ABO') {
                const each = opts.budget > 0 ? round2(opts.budget) : sets.length ? round2(campB / sets.length) : 0;
                sets.forEach(s => {
                    const own = toNum(this.value(s.key, 'adsetBudget')) || 0;
                    const v = opts.budget > 0 ? each : own > 0 ? own : each;
                    s.rows.forEach(r => {
                        this.set(r, 'adsetBudget', v || '');
                        this.set(r, 'adsetBid', 'Highest volume or value');
                        setIf(r, 'bidAmount', '');
                    });
                });
                camp.rows.forEach(r => {
                    setIf(r, 'campBudget', '');
                    setIf(r, 'campLifetime', '');
                    setIf(r, 'campBid', '');
                });
                return { type, each };
            }
            const total = opts.budget > 0 ? round2(opts.budget) : campB > 0 ? campB : sumSets;
            camp.rows.forEach(r => {
                this.set(r, 'campBudget', total || '');
                setIf(r, 'campLifetime', ''); // orçamento diário; nunca diário + total juntos
                this.set(r, 'campBid', type === 'BID' ? 'Bid cap' : 'Highest volume or value');
                setIf(r, 'adsetBudget', '');
                setIf(r, 'adsetLifetime', '');
                setIf(r, 'adsetBid', '');
                if (type === 'BID') {
                    if (opts.bid > 0) this.set(r, 'bidAmount', round2(opts.bid));
                } else setIf(r, 'bidAmount', '');
            });
            return { type, total };
        }
        // Limite de lance nos conjuntos: mode 'set' (valor) ou 'pct' (+/-%)
        setBidAmount(keys, mode, value) {
            let changed = 0,
                skipped = 0;
            keys.forEach(k => {
                const n = this.node(k);
                if (!n) return;
                const targets = n.level === 'campaign' ? this.nodes('adset', k) : n.level === 'adset' ? [n] : [];
                targets.forEach(s => {
                    const cur = toNum(this.value(s.key, 'bidAmount'));
                    let next = round2(value);
                    if (mode === 'pct') {
                        if (!(cur > 0)) return skipped++;
                        next = round2(cur * (1 + value / 100));
                    }
                    if (!(next > 0)) return skipped++;
                    this.setField(s.key, 'bidAmount', next);
                    changed++;
                });
            });
            return { changed, skipped };
        }
        siblingsNames(level, ctx) {
            // Nomes já usados no mesmo "lugar" (para evitar duplicidade).
            const taken = new Set();
            this.rows.forEach((_, i) => {
                if (level === 'campaign') taken.add(norm(this.get(i, 'campName')));
                else if (level === 'adset') {
                    if (this.get(i, 'campName') === ctx.campaign) taken.add(norm(this.get(i, 'adsetName')));
                } else if (this.get(i, 'campName') === ctx.campaign && this.get(i, 'adsetName') === ctx.adset)
                    taken.add(norm(this.get(i, 'adName')));
            });
            return taken;
        }
        keyAfterRename(node, newName) {
            if (node.level === 'campaign') return 'c:' + newName;
            if (node.level === 'adset') return 's:' + node.campaign + SEP + newName;
            return node.key;
        }

        /* ---------- Renomear ---------- */
        rename(key, newName) {
            newName = clean(newName);
            const node = this.node(key);
            if (!node) throw new Error('Item não encontrado.');
            if (!newName) throw new Error('O nome não pode ficar vazio.');
            if (newName === node.name) return key;
            const taken = this.siblingsNames(node.level, node);
            taken.delete(norm(node.name));
            if (taken.has(norm(newName))) throw new Error(`Já existe “${newName}” neste nível.`);
            const col = this.nameCol(node.level);
            node.rows.forEach(r => this.set(r, col, newName));
            return this.keyAfterRename(node, newName);
        }
        // fn(nomeAtual, índice, nó) → novo nome. Valida conflitos antes de aplicar.
        bulkRename(keys, fn) {
            const nodes = keys.map(k => this.node(k)).filter(Boolean);
            if (!nodes.length) return { changed: 0, keys: [] };
            const plan = nodes.map((n, i) => ({ n, to: clean(fn(n.name, i, n)) }));
            const groups = new Map();
            plan.forEach(p => {
                if (!p.to) throw new Error(`O nome de “${p.n.name}” ficaria vazio.`);
                const g =
                    p.n.level === 'campaign'
                        ? ''
                        : p.n.level === 'adset'
                          ? p.n.campaign
                          : p.n.campaign + SEP + p.n.adset;
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g).push(p);
            });
            groups.forEach(list => {
                const ctx = list[0].n;
                const taken = this.siblingsNames(ctx.level, ctx);
                list.forEach(p => taken.delete(norm(p.n.name)));
                const seen = new Set();
                list.forEach(p => {
                    const t = norm(p.to);
                    if (taken.has(t) || seen.has(t)) throw new Error(`O nome “${p.to}” ficaria repetido.`);
                    seen.add(t);
                });
            });
            let changed = 0;
            const newKeys = plan.map(p => {
                if (p.to === p.n.name) return p.n.key;
                p.n.rows.forEach(r => this.set(r, this.nameCol(p.n.level), p.to));
                changed++;
                return this.keyAfterRename(p.n, p.to);
            });
            return { changed, keys: newKeys };
        }

        /* ---------- Duplicar ---------- */
        _clearIds(row, level) {
            const clear = name => {
                const i = this.col(name);
                if (i >= 0) row[i] = '';
            };
            if (level === 'campaign') clear('campId');
            if (level === 'campaign' || level === 'adset') clear('adsetId');
            clear('adId');
            TIME_COLS.forEach(t => {
                const i = this.col(t);
                if (
                    i >= 0 &&
                    (level === 'campaign' || !t.startsWith('campaign')) &&
                    (level !== 'ad' || t.startsWith('ad '))
                )
                    row[i] = '';
            });
        }
        _copyLevelCols(row, fromRow, levels) {
            this.headers.forEach((h, i) => {
                if (levels.includes(levelOfHeader(h))) row[i] = fromRow[i];
            });
        }
        _setPaused(row, fromLevel) {
            const order = ['campaign', 'adset', 'ad'];
            order.slice(order.indexOf(fromLevel)).forEach(l => {
                const i = this.col(this.statusCol(l));
                if (i >= 0) row[i] = 'PAUSED';
            });
        }
        _insertAfter(index, newRows) {
            this.rows.splice(index + 1, 0, ...newRows.map(x => x.row));
            this.keys.splice(index + 1, 0, ...newRows.map(x => x.key));
        }
        /**
         * Duplica um nó.
         *  campanha: copia tudo dentro dela.
         *  conjunto: opts.targets = chaves de campanhas (padrão: a mesma).
         *  anúncio:  opts.targets = chaves de conjuntos (padrão: o mesmo).
         * opts.copies (1..50), opts.paused. Retorna as chaves criadas.
         */
        duplicate(key, opts = {}) {
            const node = this.node(key);
            if (!node) throw new Error('Item não encontrado.');
            const copies = Math.max(1, Math.min(50, parseInt(opts.copies, 10) || 1));
            const created = [];
            const targets = opts.targets?.length ? opts.targets : [null];
            for (const target of targets) {
                let lastRowKey = null; // cópias saem em ordem, uma depois da outra
                const anchorAfter = fallback => {
                    const i = lastRowKey ? this.rowOfKey(lastRowKey) : -1;
                    return i >= 0 ? i : fallback;
                };
                for (let c = 0; c < copies; c++) {
                    const src = this.node(key); // índices mudam a cada inserção
                    if (node.level === 'campaign') {
                        const taken = this.siblingsNames('campaign', src);
                        const name = opts.name && copies === 1 ? opts.name : nextCopyName(src.name, taken);
                        const add = src.rows.map(r => {
                            const row = [...this.rows[r]];
                            this._clearIds(row, 'campaign');
                            row[this.ensureCol('campName')] = name;
                            if (opts.paused) this._setPaused(row, 'campaign');
                            return { row, key: newKey() };
                        });
                        this._insertAfter(anchorAfter(Math.max(...src.rows)), add);
                        lastRowKey = add[add.length - 1].key;
                        created.push('c:' + name);
                    } else if (node.level === 'adset') {
                        const tCamp = target ? this.node(target) : this.node('c:' + src.campaign);
                        if (!tCamp) throw new Error('Campanha de destino não encontrada.');
                        const taken = this.siblingsNames('adset', { campaign: tCamp.name });
                        const name =
                            opts.name && copies === 1 && targets.length === 1
                                ? opts.name
                                : nextCopyName(src.name, taken);
                        const campRow = this.rows[tCamp.rows[0]];
                        const add = src.rows.map(r => {
                            const row = [...this.rows[r]];
                            this._copyLevelCols(row, campRow, ['campaign']);
                            this._clearIds(row, 'adset');
                            row[this.ensureCol('adsetName')] = name;
                            if (opts.paused) this._setPaused(row, 'adset');
                            return { row, key: newKey() };
                        });
                        const anchor = target ? Math.max(...this.node(target).rows) : Math.max(...src.rows);
                        this._insertAfter(target ? anchor : anchorAfter(anchor), add);
                        lastRowKey = add[add.length - 1].key;
                        created.push('s:' + tCamp.name + SEP + name);
                    } else {
                        const tSet = target ? this.node(target) : this.node('s:' + src.campaign + SEP + src.adset);
                        if (!tSet) throw new Error('Conjunto de destino não encontrado.');
                        const taken = this.siblingsNames('ad', { campaign: tSet.campaign, adset: tSet.name });
                        const name = taken.has(norm(src.name)) ? nextCopyName(src.name, taken) : src.name;
                        const row = [...this.rows[src.rows[0]]];
                        this._copyLevelCols(row, this.rows[tSet.rows[0]], ['campaign', 'adset']);
                        this._clearIds(row, 'ad');
                        row[this.ensureCol('adName')] = name;
                        if (opts.paused) this._setPaused(row, 'ad');
                        const k = newKey();
                        this._insertAfter(Math.max(...tSet.rows), [{ row, key: k }]);
                        created.push('a:' + k);
                    }
                }
            }
            return created;
        }

        /* ---------- Excluir ---------- */
        remove(keys) {
            const idx = new Set();
            keys.forEach(k => this.rowsOf(k).forEach(r => idx.add(r)));
            [...idx]
                .sort((a, b) => b - a)
                .forEach(i => {
                    this.rows.splice(i, 1);
                    this.keys.splice(i, 1);
                });
            return idx.size;
        }

        /* ---------- Mover ---------- */
        // anúncio → conjunto, ou conjunto → campanha. Itens movidos viram novos (IDs limpos).
        move(key, targetKey) {
            const node = this.node(key),
                target = this.node(targetKey);
            if (!node || !target) throw new Error('Item ou destino não encontrado.');
            if (node.level === 'ad' && target.level !== 'adset')
                throw new Error('Anúncios só podem ir para um conjunto.');
            if (node.level === 'adset' && target.level !== 'campaign')
                throw new Error('Conjuntos só podem ir para uma campanha.');
            if (node.level === 'campaign') throw new Error('Campanhas não podem ser movidas.');
            const fromRow = [...this.rows[target.rows[0]]];
            const levels = node.level === 'ad' ? ['campaign', 'adset'] : ['campaign'];
            let newName = node.name;
            const ctx =
                node.level === 'ad' ? { campaign: target.campaign, adset: target.name } : { campaign: target.name };
            const taken = this.siblingsNames(node.level, ctx);
            if (taken.has(norm(newName))) newName = nextCopyName(newName, taken);
            const moved = node.rows.map(r => ({ row: [...this.rows[r]], key: this.keys[r] }));
            moved.forEach(m => {
                this._copyLevelCols(m.row, fromRow, levels);
                this._clearIds(m.row, node.level);
                m.row[this.ensureCol(this.nameCol(node.level))] = newName;
            });
            this.remove([key]);
            const anchor = Math.max(...this.node(targetKey).rows);
            this._insertAfter(anchor, moved);
            return node.level === 'ad' ? key : 's:' + target.name + SEP + newName;
        }

        /* ---------- Campos ---------- */
        setField(key, name, value) {
            const rows = this.rowsOf(key);
            rows.forEach(r => this.set(r, name, value));
            // Meta: só um tipo de orçamento por nível — diário OU total. Preencher um limpa o outro.
            if (toNum(value) > 0) {
                const i = this.col(name);
                const pairs = [
                    ['campBudget', 'campLifetime'],
                    ['adsetBudget', 'adsetLifetime'],
                ];
                pairs.forEach(([daily, life]) => {
                    const other = i === this.col(daily) ? life : i === this.col(life) ? daily : null;
                    if (other && this.has(other)) rows.forEach(r => this.set(r, other, ''));
                });
            }
            return rows.length;
        }
        setFields(keys, fields) {
            let n = 0;
            keys.forEach(k =>
                Object.entries(fields).forEach(([name, v]) => {
                    if (v === undefined) return;
                    n += this.setField(k, name, v) ? 1 : 0;
                }),
            );
            return n;
        }
        // Ativa/pausa; com cascade, aplica também aos níveis abaixo.
        setStatus(keys, status, cascade = true) {
            const order = ['campaign', 'adset', 'ad'];
            keys.forEach(k => {
                const node = this.node(k);
                if (!node) return;
                const levels = cascade ? order.slice(order.indexOf(node.level)) : [node.level];
                node.rows.forEach(r => levels.forEach(l => this.set(r, this.statusCol(l), status)));
            });
        }

        /* ---------- Orçamento ---------- */
        // mode: 'pct' (+/-%), 'set' (valor), 'split' (divide total entre os itens)
        budget(keys, mode, value) {
            const nodes = keys.map(k => this.node(k)).filter(Boolean);
            if (!nodes.length) return { changed: 0, skipped: 0 };
            const col = this.budgetCol(nodes[0].level);
            let changed = 0,
                skipped = 0;
            const each = mode === 'split' ? round2(value / nodes.length) : null;
            nodes.forEach(n => {
                // CBO/BID: orçamento só na campanha; ABO: só nos conjuntos
                if (this.budgetLevel(n.key) !== n.level) return skipped++;
                const cur = toNum(this.value(n.key, col));
                let next;
                if (mode === 'pct') {
                    if (!(cur > 0)) return skipped++;
                    next = round2(cur * (1 + value / 100));
                } else next = mode === 'split' ? each : round2(value);
                if (!(next >= 0)) return skipped++;
                this.setField(n.key, col, next);
                changed++;
            });
            return { changed, skipped };
        }
        // ABO → CBO: soma os orçamentos dos conjuntos na campanha.
        toCBO(campKey) {
            const camp = this.node(campKey);
            if (!camp) return false;
            const sets = this.nodes('adset', campKey);
            const total = round2(sets.reduce((s, x) => s + (toNum(this.value(x.key, 'adsetBudget')) || 0), 0));
            const strategy = sets.map(x => this.value(x.key, 'adsetBid')).find(Boolean) || 'Highest volume or value';
            camp.rows.forEach(r => {
                this.set(r, 'campBudget', total || '');
                this.set(r, 'campBid', strategy);
                if (this.has('adsetBudget')) this.set(r, 'adsetBudget', '');
                if (this.has('adsetBid')) this.set(r, 'adsetBid', '');
            });
            return { total, adsets: sets.length };
        }
        // CBO → ABO: divide o orçamento da campanha igualmente entre os conjuntos.
        toABO(campKey) {
            const camp = this.node(campKey);
            if (!camp) return false;
            const sets = this.nodes('adset', campKey);
            const total = toNum(this.value(campKey, 'campBudget')) || 0;
            const each = sets.length ? round2(total / sets.length) : 0;
            const strategy = this.value(campKey, 'campBid') || 'Highest volume or value';
            sets.forEach(s =>
                s.rows.forEach(r => {
                    this.set(r, 'adsetBudget', each || '');
                    this.set(r, 'adsetBid', strategy);
                }),
            );
            camp.rows.forEach(r => {
                this.set(r, 'campBudget', '');
                if (this.has('campBid')) this.set(r, 'campBid', '');
            });
            return { each, adsets: sets.length };
        }

        /* ---------- Dividir conjunto por gênero ---------- */
        // O conjunto original vira Masculino (_M, mantém IDs) e uma cópia nova vira Feminino (_F).
        splitByGender(adsetKey) {
            const node = this.node(adsetKey);
            if (!node) return null;
            const g = this.value(adsetKey, 'gender');
            if (g) return null; // já tem gênero definido
            const taken = this.siblingsNames('adset', node);
            taken.delete(norm(node.name));
            const mName = taken.has(norm(node.name + '_M')) ? nextCopyName(node.name + '_M', taken) : node.name + '_M';
            taken.add(norm(mName));
            const fName = taken.has(norm(node.name + '_F')) ? nextCopyName(node.name + '_F', taken) : node.name + '_F';
            const add = node.rows.map(r => {
                const row = [...this.rows[r]];
                this._clearIds(row, 'adset');
                row[this.ensureCol('adsetName')] = fName;
                row[this.ensureCol('gender')] = 'Women';
                return { row, key: newKey() };
            });
            node.rows.forEach(r => {
                this.set(r, 'adsetName', mName);
                this.set(r, 'gender', 'Men');
            });
            this._insertAfter(Math.max(...node.rows), add);
            return ['s:' + node.campaign + SEP + mName, 's:' + node.campaign + SEP + fName];
        }

        /* ---------- Adicionar anúncios a um conjunto ---------- */
        addAds(adsetKey, names) {
            const set = this.node(adsetKey);
            if (!set) throw new Error('Conjunto não encontrado.');
            const taken = this.siblingsNames('ad', { campaign: set.campaign, adset: set.name });
            const tplIndex = set.rows.find(r => this.get(r, 'adName')) ?? set.rows[0];
            const created = [];
            let emptyRow = set.rows.length === 1 && !this.get(set.rows[0], 'adName') ? set.rows[0] : -1;
            const add = [];
            names.forEach(n => {
                n = clean(n);
                if (!n || taken.has(norm(n))) return;
                taken.add(norm(n));
                if (emptyRow >= 0) {
                    this.set(emptyRow, 'adName', n);
                    created.push('a:' + this.keys[emptyRow]);
                    emptyRow = -1;
                    return;
                }
                const row = [...this.rows[tplIndex]];
                this._clearIds(row, 'ad');
                row[this.ensureCol('adName')] = n;
                const k = newKey();
                add.push({ row, key: k });
                created.push('a:' + k);
            });
            if (add.length) this._insertAfter(Math.max(...this.node(adsetKey).rows), add);
            return created;
        }

        /* ---------- Templates de estrutura ---------- */
        extract(campKey) {
            const node = this.node(campKey);
            if (!node) return null;
            return { headers: [...this.headers], rows: node.rows.map(r => [...this.rows[r]]), campaign: node.name };
        }
        insertTemplate(tpl, campaignName) {
            const map = tpl.headers.map(h => this.ensureCol(h));
            const taken = this.siblingsNames('campaign', {});
            let name = clean(campaignName) || tpl.campaign || 'NOVA_CAMPANHA';
            if (taken.has(norm(name))) name = nextCopyName(name, taken);
            const add = tpl.rows.map(src => {
                const row = this.headers.map(() => '');
                map.forEach((ci, j) => (row[ci] = src[j] ?? ''));
                this._clearIds(row, 'campaign');
                row[this.ensureCol('campName')] = name;
                return { row, key: newKey() };
            });
            this._insertAfter(this.rows.length - 1, add);
            return 'c:' + name;
        }

        /* ---------- Comparação com o original ---------- */
        diff(original) {
            const res = { added: [], removed: [], changed: [], changedKeys: new Set() };
            if (!original) return res;
            const oIdx = new Map();
            original.headers.forEach((h, i) => oIdx.set(norm(h), i));
            const oRows = new Map(original.keys.map((k, i) => [k, original.rows[i]]));
            const cur = new Set(this.keys);
            this.keys.forEach((k, i) => {
                const row = this.rows[i];
                const o = oRows.get(k);
                if (!o) {
                    res.added.push(k);
                    res.changedKeys.add(k);
                    return;
                }
                const cols = [];
                this.headers.forEach((h, ci) => {
                    const oi = oIdx.get(norm(h));
                    const before = oi === undefined ? '' : clean(o[oi]);
                    const after = clean(row[ci]);
                    if (before !== after) cols.push({ h, from: before, to: after });
                });
                if (cols.length) {
                    res.changed.push({ key: k, cols });
                    res.changedKeys.add(k);
                }
            });
            original.keys.forEach((k, i) => {
                if (cur.has(k)) return;
                const o = original.rows[i];
                const g = n => {
                    const oi = oIdx.get(norm(n));
                    return oi === undefined ? '' : clean(o[oi]);
                };
                res.removed.push({ key: k, campaign: g('Campaign Name'), adset: g('Ad Set Name'), ad: g('Ad Name') });
            });
            return res;
        }
    }

    return { Sheet, levelOfHeader, levelOfKey, nextCopyName, todayTag, DATE_RE, toNum, norm, C };
})();
