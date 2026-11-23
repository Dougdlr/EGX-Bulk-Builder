'use strict';
/* ===================================================================
   EGXValidation — validação de planilhas de importação do Meta Ads
   Usada pelo Editor em lote e pelo Criador (antes de exportar).
   validateSheet(headers, rows, modelKey) → { errors, warnings, checked }
   Os modelos de referência ficam em js/config/validation-models.js.
   =================================================================== */
window.EGXValidation = (() => {
    function validateSheet(headers, rows, modelKey) {
        const col = name => headers.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase());
        const idxCamp = col('Campaign Name'),
            idxAdset = col('Ad Set Name'),
            idxAd = col('Ad Name');
        const idxCampStatus = col('Campaign Status'),
            idxAdsetStatus = col('Ad Set Run Status'),
            idxAdStatus = col('Ad Status');
        const idxCampBudget = col('Campaign Daily Budget'),
            idxAdsetBudget = col('Ad Set Daily Budget');
        const errors = [],
            warnings = [],
            checked = rows.length;
        const clean = v => String(v ?? '').trim();
        const groupKey = (c, a) => `${clean(c).toLowerCase()}\u0000${clean(a).toLowerCase()}`;
        const adNameGroups = new Map();
        rows.forEach((row, i) => {
            const camp = idxCamp >= 0 ? clean(row[idxCamp]) : '',
                adset = idxAdset >= 0 ? clean(row[idxAdset]) : '',
                ad = idxAd >= 0 ? clean(row[idxAd]) : '';
            if (!camp)
                errors.push({ row: i + 1, level: 'Campanha', message: 'Nome da campanha vazio.', type: 'missing' });
            if (!adset)
                errors.push({ row: i + 1, level: 'Conjunto', message: 'Nome do conjunto vazio.', type: 'missing' });
            if (!ad) errors.push({ row: i + 1, level: 'Anúncio', message: 'Nome do anúncio vazio.', type: 'missing' });
            if (ad) {
                const k = groupKey(camp, adset) + '\u0000' + ad.toLowerCase();
                if (!adNameGroups.has(k)) adNameGroups.set(k, []);
                adNameGroups.get(k).push(i + 1);
            }
            // Field-level checks that are independent of any reference model.
            const statusChecks = [
                [idxCampStatus, clean(row[idxCampStatus]).toUpperCase(), 'Campanha'],
                [idxAdsetStatus, clean(row[idxAdsetStatus]).toUpperCase(), 'Conjunto'],
                [idxAdStatus, clean(row[idxAdStatus]).toUpperCase(), 'Anúncio'],
            ];
            statusChecks.forEach(([ix, val, level]) => {
                if (ix >= 0 && val && !['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].includes(val))
                    warnings.push({
                        row: i + 1,
                        level,
                        message: `Status “${val}” não reconhecido neste campo.`,
                        type: 'status-invalid',
                    });
            });
            const linkIx = col('Link'),
                creativeIx = col('Creative Type');
            if (
                linkIx >= 0 &&
                creativeIx >= 0 &&
                clean(row[creativeIx]).toLowerCase().includes('link') &&
                !clean(row[linkIx])
            )
                warnings.push({
                    row: i + 1,
                    level: 'Anúncio',
                    message: 'Anúncio do tipo link sem URL de destino.',
                    type: 'missing-link',
                });
            [
                [idxCampBudget, 'Orçamento de campanha'],
                [idxAdsetBudget, 'Orçamento de conjunto'],
            ].forEach(([ix, label]) => {
                if (ix >= 0 && clean(row[ix])) {
                    const n = Number(clean(row[ix]).replace(',', '.'));
                    if (!Number.isFinite(n) || n < 0)
                        warnings.push({
                            row: i + 1,
                            level: 'Orçamento',
                            message: `${label} com valor inválido: “${clean(row[ix])}”.`,
                            type: 'budget-invalid',
                        });
                }
            });
            if (idxCampStatus >= 0 && idxAdsetStatus >= 0 && idxAdStatus >= 0) {
                const cs = clean(row[idxCampStatus]).toUpperCase(),
                    as = clean(row[idxAdsetStatus]).toUpperCase(),
                    ads = clean(row[idxAdStatus]).toUpperCase();
                if (
                    cs &&
                    as &&
                    ads &&
                    ((cs === 'PAUSED' && (as === 'ACTIVE' || ads === 'ACTIVE')) ||
                        (as === 'PAUSED' && ads === 'ACTIVE'))
                )
                    warnings.push({
                        row: i + 1,
                        level: 'Status',
                        message: 'Status em níveis diferentes: campanha/conjunto/anúncio.',
                        type: 'status',
                    });
            }
        });
        // Estrutura de orçamento por campanha — a Meta recusa "tipos de orçamentos mistos".
        // CBO/BID: orçamento e estratégia só na campanha. ABO: orçamento e estratégia só nos conjuntos.
        {
            const iCL = col('Campaign Lifetime Budget'),
                iAL = col('Ad Set Lifetime Budget'),
                iCB = col('Campaign Bid Strategy'),
                iAB = col('Ad Set Bid Strategy'),
                iBA = col('Bid Amount');
            const num = v => Number(clean(v).replace(',', '.')) || 0;
            const pos = v => num(v) > 0,
                filled = v => clean(v) !== '';
            const byCamp = new Map();
            rows.forEach((row, i) => {
                const c = idxCamp >= 0 ? clean(row[idxCamp]) : '';
                if (!byCamp.has(c)) byCamp.set(c, []);
                byCamp.get(c).push({ row, i });
            });
            byCamp.forEach((list, name) => {
                const has = (ix, f) => ix >= 0 && list.some(x => f(x.row[ix]));
                const campBudget = has(idxCampBudget, pos) || has(iCL, pos);
                const adsetBudget = has(idxAdsetBudget, pos) || has(iAL, pos);
                const push = msg =>
                    errors.push({
                        row: list[0].i + 1,
                        level: 'Campanha',
                        message: `${msg} — ${name || 'campanha sem nome'}`,
                        type: 'budget-structure',
                    });
                if (has(idxCampBudget, pos) && has(iCL, pos))
                    push('Só um tipo de orçamento por campanha: diário (Campaign Daily Budget) OU total (Campaign Lifetime Budget) — os dois estão preenchidos');
                if (has(idxAdsetBudget, pos) && has(iAL, pos))
                    push('Só um tipo de orçamento por conjunto: diário (Ad Set Daily Budget) OU total (Ad Set Lifetime Budget) — os dois estão preenchidos');
                if (campBudget && adsetBudget)
                    push('Orçamento misto: valor na campanha e nos conjuntos. Use um nível só (CBO/BID = campanha, ABO = conjuntos)');
                if (!campBudget && has(iCB, filled))
                    push('Orçamento misto: estratégia de lance na campanha (Campaign Bid Strategy) sem orçamento de campanha. Em ABO deixe esse campo vazio');
                if (campBudget && has(iAB, filled))
                    push('Orçamento na campanha, mas estratégia de lance do conjunto (Ad Set Bid Strategy) preenchida');
                if (campBudget && has(iCB, v => /bid\s*cap/i.test(v)) && iBA >= 0 && list.some(x => !pos(x.row[iBA])))
                    push('Limite de lance (Bid cap) sem valor de limite de lance (Bid Amount) em algum conjunto');
            });
        }
        adNameGroups.forEach((rows, k) => {
            if (rows.length > 1)
                errors.push({
                    row: rows[0],
                    level: 'Anúncio duplicado',
                    message: `Mesmo nome repetido dentro do mesmo conjunto (linhas ${rows.join(', ')}).`,
                    type: 'duplicate',
                });
        });
        // (V15) Sem modelos de referência: as regras de estrutura de orçamento/lance acima valem para toda campanha.
        // Gênero, atribuição, posicionamentos, CTA etc. são escolhas de cada campanha, não erros.
        // Identical adset names under the same campaign with different budget/targeting values can signal accidental split inconsistencies.
        const adsetGroups = new Map();
        rows.forEach((row, i) => {
            const c = idxCamp >= 0 ? clean(row[idxCamp]) : '',
                a = idxAdset >= 0 ? clean(row[idxAdset]) : '';
            if (!c || !a) return;
            const k = groupKey(c, a);
            if (!adsetGroups.has(k)) adsetGroups.set(k, []);
            adsetGroups.get(k).push({ row, i: i + 1 });
        });
        adsetGroups.forEach(items => {
            const uniqueBudget = new Set(
                items.map(x => (idxAdsetBudget >= 0 ? clean(x.row[idxAdsetBudget]) : '')).filter(Boolean),
            );
            const uniqueStatus = new Set(
                items.map(x => (idxAdsetStatus >= 0 ? clean(x.row[idxAdsetStatus]).toUpperCase() : '')).filter(Boolean),
            );
            if (uniqueBudget.size > 1)
                warnings.push({
                    row: items[0].i,
                    level: 'Conjunto',
                    message: 'O mesmo conjunto aparece com valores de orçamento diferentes.',
                    type: 'inconsistent',
                });
            if (uniqueStatus.size > 1)
                warnings.push({
                    row: items[0].i,
                    level: 'Conjunto',
                    message: 'O mesmo conjunto aparece com status diferentes.',
                    type: 'inconsistent',
                });
            [
                ['Gender', 'gênero'],
                ['Age Min', 'idade mínima'],
                ['Age Max', 'idade máxima'],
                ['Countries', 'países'],
                ['Publisher Platforms', 'plataformas'],
                ['Facebook Positions', 'posições Facebook'],
                ['Instagram Positions', 'posições Instagram'],
            ].forEach(([column, label]) => {
                const ix = col(column);
                if (ix < 0) return;
                const vals = new Set(items.map(x => clean(x.row[ix])).filter(Boolean));
                if (vals.size > 1)
                    warnings.push({
                        row: items[0].i,
                        level: 'Conjunto',
                        message: `O mesmo conjunto apresenta valores diferentes para ${label}.`,
                        type: 'targeting-inconsistent',
                    });
            });
        });
        return { errors, warnings, checked };
    }

    // Sugere o modelo pelo nome da campanha (ex.: ..._TADS_..._ABO#2_...).
    function guessModel(campaignName, strategy) {
        const n = String(campaignName || '').toUpperCase();
        const s = String(strategy || '').toUpperCase();
        if (/(^|_)TADS(_|$)/.test(n) && s === 'ABO') return 'tads-abo';
        if (/(^|_)ESC(_|$)/.test(n) && s === 'BID') return 'esc-bid';
        if (/(^|_)ESC(_|$)/.test(n) && s === 'CBO') return 'esc-cbo';
        return 'general';
    }

    return { validateSheet, guessModel };
})();
