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
            if (idxCampBudget >= 0 && idxAdsetBudget >= 0 && clean(row[idxCampBudget]) && clean(row[idxAdsetBudget]))
                warnings.push({
                    row: i + 1,
                    level: 'Orçamento',
                    message:
                        'Orçamento preenchido na campanha e no conjunto. Confira se a estrutura CBO/ABO está intencional.',
                    type: 'budget',
                });
        });
        adNameGroups.forEach((rows, k) => {
            if (rows.length > 1)
                errors.push({
                    row: rows[0],
                    level: 'Anúncio duplicado',
                    message: `Mesmo nome repetido dentro do mesmo conjunto (linhas ${rows.join(', ')}).`,
                    type: 'duplicate',
                });
        });
        // Modelo de referência: valida somente configurações, nunca nomes ou valores de orçamento específicos.
        modelKey = modelKey || 'general';
        const rule = (window.EGX_VALIDATION_MODELS || {})[modelKey];
        // Campanha de imagem gerada pelo Criador: sem plataformas/formato definidos (posicionamento automático).
        const fmtIx = col('Format Option'),
            platIx = col('Publisher Platforms');
        const isImage =
            fmtIx >= 0 &&
            rows.every(r => ['', 'single_image'].includes(clean(r[fmtIx]))) &&
            (platIx < 0 || rows.every(r => !clean(r[platIx])));
        if (rule) {
            const modelCols = {
                objective: 'Campaign Objective',
                buying: 'Buying Type',
                campaignBudget: 'Campaign Daily Budget',
                campaignLifetime: 'Campaign Lifetime Budget',
                campaignStrategy: 'Campaign Bid Strategy',
                adsetBudget: 'Ad Set Daily Budget',
                adsetLifetime: 'Ad Set Lifetime Budget',
                event: 'Optimized Event',
                optimization: 'Optimization Goal',
                billing: 'Billing Event',
                bidAmount: 'Bid Amount',
                adsetStrategy: 'Ad Set Bid Strategy',
                gender: 'Gender',
                countries: 'Countries',
                placements: 'Publisher Platforms',
                cta: 'Call to Action',
                creative: 'Creative Type',
                format: 'Format Option',
                advantage: 'Advantage Audience',
            };
            const columnValues = key => {
                const ix = col(modelCols[key]);
                return ix < 0 ? [] : [...new Set(rows.map(r => clean(r[ix])).filter(Boolean))];
            };
            const checkValue = (key, expected, level, desc) => {
                const vals = columnValues(key);
                if (!vals.length) {
                    warnings.push({
                        row: 1,
                        level: desc,
                        message: `Campo “${modelCols[key]}” não encontrado ou vazio; não foi possível validar.`,
                        type: 'model-missing-column',
                    });
                    return;
                }
                const wrong = vals.filter(v => !expected.includes(v));
                if (wrong.length)
                    warnings.push({
                        row: 1,
                        level: desc,
                        message: `Valor fora do modelo ${rule.label}: ${wrong.join(', ')}. Esperado: ${expected.join(' / ')}.`,
                        type: 'model-mismatch',
                    });
            };
            const checkBudget = (key, mode, desc) => {
                const ix = col(modelCols[key]);
                if (ix < 0) {
                    warnings.push({
                        row: 1,
                        level: desc,
                        message: `Coluna “${modelCols[key]}” não encontrada; orçamento não validado.`,
                        type: 'model-missing-column',
                    });
                    return;
                }
                const populated = rows.some(r => {
                    const v = clean(r[ix]);
                    if (!v) return false;
                    const n = Number(v.replace(',', '.'));
                    return Number.isFinite(n) ? n > 0 : v.toLowerCase() !== 'false';
                });
                if (mode === 'required' && !populated)
                    errors.push({
                        row: 1,
                        level: desc,
                        message: `Modelo ${rule.label}: orçamento esperado neste nível, mas não foi encontrado.`,
                        type: 'model-budget',
                    });
                if (mode === 'forbidden' && populated)
                    warnings.push({
                        row: 1,
                        level: desc,
                        message: `Modelo ${rule.label}: orçamento encontrado neste nível. Confirme se a estrutura CBO/ABO está correta.`,
                        type: 'model-budget',
                    });
            };
            checkValue('objective', ['Outcome Sales'], 'Campanha', 'Objetivo');
            checkValue('buying', ['AUCTION'], 'Campanha', 'Tipo de compra');
            checkValue('event', ['PURCHASE'], 'Conjunto', 'Evento de conversão');
            checkValue('optimization', ['OFFSITE_CONVERSIONS'], 'Conjunto', 'Otimização');
            checkValue('billing', ['IMPRESSIONS'], 'Conjunto', 'Cobrança');
            checkValue('gender', rule.gender, 'Público', 'Gênero');
            checkValue('countries', ['BR'], 'Público', 'Localização');
            if (!isImage) checkValue('placements', ['facebook, instagram'], 'Posicionamentos', 'Plataformas');
            checkValue('advantage', ['0'], 'Público', 'Advantage Audience');
            checkValue('creative', ['Link Page Post Ad'], 'Anúncio', 'Tipo de criativo');
            if (!isImage) checkValue('format', ['single_video'], 'Anúncio', 'Formato');
            checkValue('cta', isImage ? ['SEE_DETAILS', 'LEARN_MORE'] : ['LEARN_MORE'], 'Anúncio', 'CTA');
            checkBudget('campaignBudget', rule.campaignBudget, 'Campanha');
            checkBudget('campaignLifetime', rule.campaignBudget === 'forbidden' ? 'forbidden' : 'optional', 'Campanha');
            checkBudget('adsetBudget', rule.adsetBudget, 'Conjunto');
            checkBudget('adsetLifetime', rule.adsetBudget === 'required' ? 'optional' : 'forbidden', 'Conjunto');
            if (rule.campaignStrategy.length)
                checkValue('campaignStrategy', rule.campaignStrategy, 'Campanha', 'Estratégia de lance');
            if (rule.adsetStrategy.length)
                checkValue('adsetStrategy', rule.adsetStrategy, 'Conjunto', 'Estratégia de lance');
            if (rule.bidAmount === 'required' && !columnValues('bidAmount').length)
                errors.push({
                    row: 1,
                    level: 'Conjunto',
                    message: 'Modelo ESC BID: o campo Bid Amount é obrigatório para a estratégia Bid Cap.',
                    type: 'model-bid',
                });
            if (rule.bidAmount === 'optional' && columnValues('bidAmount').length)
                warnings.push({
                    row: 1,
                    level: 'Conjunto',
                    message: `Modelo ${rule.label}: Bid Amount preenchido. Confirme se o limite de lance é intencional.`,
                    type: 'model-bid',
                });
            const attributionIx = col('Attribution Spec');
            if (attributionIx >= 0) {
                const vals = [...new Set(rows.map(r => clean(r[attributionIx])).filter(Boolean))];
                const expected =
                    rule.attribution ||
                    '[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1},{"event_type":"ENGAGED_VIDEO_VIEW","window_days":1}]';
                if (vals.some(v => v !== expected))
                    warnings.push({
                        row: 1,
                        level: 'Atribuição',
                        message: `Configuração de atribuição diferente da referência ${rule.label}.`,
                        type: 'model-mismatch',
                    });
            } else
                warnings.push({
                    row: 1,
                    level: 'Atribuição',
                    message: 'Coluna Attribution Spec não encontrada; não foi possível validar.',
                    type: 'model-missing-column',
                });
        }
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
