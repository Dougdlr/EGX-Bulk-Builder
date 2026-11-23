'use strict';
/* ===== EGX Bulk Builder v4 — Fase 1: segurança e integridade ===== */
const $ = id => document.getElementById(id);
const STORE = 'egx_bulk_v3',
    LEGACY_STORE = 'egx_bulk_v2',
    PRESETS = 'egx_bulk_presets_v2';
const GEN = ['Ambos', 'Masculino', 'Feminino'];
const GCLS = { Ambos: 'g-a', Masculino: 'g-m', Feminino: 'g-f' };
const AD_RE = /^([A-Z][A-Z0-9_-]*?)\s*(\d+)(?:[\s\-_]*(V)\s*(\d+))?$/i;

const META = {
    objective: 'Outcome Sales',
    country: 'BR',
    locationTypes: 'frequently_in, home, recent',
    billing: 'IMPRESSIONS',
    goal: 'OFFSITE_CONVERSIONS',
    event: 'PURCHASE',
    advAudience: 0,
    destinationType: 'WEBSITE',
    devicePlatforms: 'mobile, desktop',
    creativeType: 'Link Page Post Ad',
    targetingRelaxation: 'custom_audience: Off, lookalike: Off',
    regulatedCategories: 'BRAZIL_REGULATION,VOLUNTARY_VERIFICATION',
    bidLabel: { volume: 'Highest volume or value', cap: 'Bid cap' },
    attribution: {
        click7_view1: '[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]',
        click7_view1_engaged1:
            '[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1},{"event_type":"ENGAGED_VIDEO_VIEW","window_days":1}]',
    },
    catalog: {
        platforms: 'facebook, instagram',
        fb: 'feed, story, facebook_reels',
        ig: 'stream, story, reels',
        format: 'single_video',
        cta: 'LEARN_MORE',
    },
    image: { platforms: '', fb: '', ig: '', format: '', cta: 'SEE_DETAILS' },
};
const HEADERS = [
    'Campaign Name',
    'Campaign Status',
    'Campaign Objective',
    'Buying Type',
    'Campaign Daily Budget',
    'Campaign Lifetime Budget',
    'Campaign Bid Strategy',
    'New Objective',
    'Buy With Prime Type',
    'Is Budget Scheduling Enabled For Campaign',
    'Campaign High Demand Periods',
    'Buy With Integration Partner',
    'Ad Set Run Status',
    'Ad Set Name',
    'Ad Set Daily Budget',
    'Destination Type',
    'Ad Set Lifetime Budget',
    'Use Accelerated Delivery',
    'Is Budget Scheduling Enabled For Ad Set',
    'Ad Set High Demand Periods',
    'Link Object ID',
    'Optimized Conversion Tracking Pixels',
    'Optimized Event',
    'Link',
    'Countries',
    'Location Types',
    'Gender',
    'Age Min',
    'Age Max',
    'Advantage Audience',
    'Targeting Relaxation',
    'Publisher Platforms',
    'Facebook Positions',
    'Instagram Positions',
    'Audience Network Positions',
    'Messenger Positions',
    'Device Platforms',
    'Optimization Goal',
    'Attribution Spec',
    'Billing Event',
    'Ad Set Bid Strategy',
    'Bid Amount',
    'Regional Regulated Categories',
    'Beneficiary (selected locations)',
    'Payer (selected locations)',
    'Ad Status',
    'Ad Name',
    'Title',
    'Body',
    'Optimize text per person',
    'Conversion Tracking Pixels',
    'Optimized Ad Creative',
    'Creative Type',
    'URL Tags',
    'Instagram Account ID',
    'Call to Action',
    'Additional Custom Tracking Specs',
    'Video Retargeting',
    'Format Option',
    'Use Page as Actor',
];

/* ---------- Helpers ---------- */
const lsGet = (k, d) => {
    try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
    } catch (e) {
        return d;
    }
};
const lsSet = (k, v) => {
    try {
        localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
        /* storage indisponível */
    }
};
const paintGender = (el, v) => {
    el.classList.remove('g-a', 'g-m', 'g-f');
    el.classList.add(GCLS[v] || 'g-a');
};
const canonical = (m, upper = true) =>
    (upper ? m[1].toUpperCase() : m[1]) + m[2] + (m[3] ? '-' + (upper ? 'V' : m[3]) + m[4] : '');
const baseName = v => v.replace(/\s+/g, '').toUpperCase().replace(/_IMG$/, '');
const canon = v => {
    const s = baseName(v),
        m = AD_RE.exec(s);
    return m && m.index === 0 && m[0].length === s.length ? canonical(m) : s;
};
// Normaliza só o código do início (PREFIXO123-V1) e mantém o resto do nome (ex.: sufixo) como foi digitado
// Variações do código: uma ou mais partes LETRA+NÚMERO depois do número (ex.: - C1 - V2), com ou sem espaço, hífen, travessão ou _
const VAR_SRC = '(?:[ \\t]*[-_\\u2013\\u2014]?[ \\t]*[A-Z][ \\t]*\\d{1,4}(?!\\d))*';
const stripUrls = t => String(t || '').replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ');
// "lfrad836 - c1 - v1" -> "LFRAD836-C1-V1" (upper=false mantém a caixa do prefixo)
const codeFromMatch = (raw, upper = true) => {
    const s = String(raw || '')
        .replace(/\s+/g, '')
        .replace(/[\u2013\u2014]/g, '-');
    const m = /^([A-Z][A-Z0-9_-]*?)(\d{1,9})((?:[-_]*[A-Z]\d{1,4})*)$/i.exec(s);
    if (!m) return upper ? s.toUpperCase() : s;
    return (
        (upper ? m[1].toUpperCase() : m[1]) +
        m[2] +
        (m[3].match(/[A-Z]\d+/gi) || []).map(x => '-' + x.toUpperCase()).join('')
    );
};
const LEAD_CODE = /^([A-Z][A-Z0-9_-]*?)(\d{1,9})((?:[-_]?[A-Z]\d{1,4}(?!\d))*)(?=$|[^0-9])/i;
const normName = v => {
    const s = String(v || '')
        .replace(/\s+/g, '')
        .replace(/[\u2013\u2014]/g, '-');
    const m = LEAD_CODE.exec(s);
    return m ? codeFromMatch(m[0]) + s.slice(m[0].length) : s.toUpperCase();
};
const codeOf = v => {
    const s = String(v || '')
        .replace(/\s+/g, '')
        .replace(/[\u2013\u2014]/g, '-');
    const m = LEAD_CODE.exec(s);
    return m ? codeFromMatch(m[0]) : s.toUpperCase();
};
const metaId = (prefix, v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d ? prefix + d : '';
};
const digitsOnly = v => String(v || '').replace(/\D/g, '');
const toMeta = g => (g === 'Masculino' ? 'Men' : g === 'Feminino' ? 'Women' : '');
const todayTag = () => {
    const d = new Date(),
        p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}_${p(d.getMonth() + 1)}_${String(d.getFullYear()).slice(2)}`;
};

function dl(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text, fallbackEl) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        /* tenta fallback */
    }
    try {
        if (!fallbackEl) return false;
        fallbackEl.select();
        const ok = document.execCommand('copy');
        window.getSelection().removeAllRanges();
        return ok;
    } catch (e) {
        return false;
    }
}

function showAppToast(message, variant = 'info', action) {
    const box = $('global-toast-container');
    if (!box) return;
    const pal = {
        success: 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100',
        error: 'bg-red-950/95 border-red-500/60 text-red-100',
        info: 'bg-slate-900/95 border-indigo-500/60 text-slate-100',
    };
    const ico = { success: '✅', error: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `${pal[variant] || pal.info} border px-4 py-3 rounded-xl shadow-2xl text-xs sm:text-sm font-medium transition-all duration-300 transform translate-x-full opacity-0 flex items-center gap-2.5 backdrop-blur-md pointer-events-auto`;
    const i = document.createElement('span');
    i.className = 'text-base shrink-0';
    i.textContent = ico[variant] || ico.info;
    const m = document.createElement('span');
    m.className = 'flex-1';
    m.textContent = message;
    t.append(i, m);
    const close = () => {
        t.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => t.remove(), 300);
    };
    if (action) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'underline font-bold shrink-0';
        b.textContent = action.label;
        b.onclick = () => {
            action.fn();
            close();
        };
        t.append(b);
    }
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.remove('translate-x-full', 'opacity-0'));
    setTimeout(close, action ? 6500 : 3400);
}
