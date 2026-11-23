'use strict';
/* ===================================================================
   Workspace: perfil local, projetos, painel, salvamento automático,
   backups e histórico de exportações.

   Estrutura gravada (pasta vinculada ou IndexedDB, via EGXStorage):
     Projects/<pasta>/project.json        dados do projeto
     Projects/<pasta>/data.json           módulos pequenos (Criador, Extrator, Tarefas)
     Projects/<pasta>/bulkEditor.json     planilha aberta no Editor em lote
     Projects/<pasta>/History/activity.json
     Projects/<pasta>/Exports/index.json  histórico das planilhas exportadas
     Projects/<pasta>/Exports/*.xlsx      cópia das planilhas (só com pasta)
     Backups/<pasta>/<data-hora>.json     backups automáticos e manuais
   =================================================================== */
(function initLocalWorkspace() {
    const S = window.EGXStorage,
        M = window.EGXModules;
    const CFG_KEY = 'egx_local_workspace_v1';
    const ACTIVITY_LIMIT = 200,
        EXPORTS_LIMIT = 500,
        BACKUP_KEEP = 20,
        BACKUP_EVERY_MS = 60 * 60 * 1000;
    const cfgDefault = {
        profileName: 'Meu perfil',
        workspaceName: 'EGX Workspace',
        projects: [],
        activeProjectId: null,
    };
    let cfg = (() => {
        try {
            return { ...cfgDefault, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
        } catch (e) {
            return { ...cfgDefault };
        }
    })();
    let savedHandle = null,
        loadedProjectId = null;
    let activity = [],
        exportsIndex = [],
        usageCache = null;
    const dirty = new Set();
    const body = document.body;

    const saveCfg = () => {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
        } catch (e) {
            showAppToast('Não foi possível salvar as configurações locais.', 'error');
        }
    };
    // Guarda o "handle" da pasta escolhida (o navegador lembra a pasta entre sessões).
    const kv = (mode, fn) =>
        new Promise((resolve, reject) => {
            const req = indexedDB.open('egx_workspace', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('handles');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const tx = req.result.transaction('handles', mode);
                const r = fn(tx.objectStore('handles'));
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
            };
        });
    const escapeHtml = v =>
        String(v ?? '').replace(
            /[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
    const uid = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const fmtDateTime = iso =>
        new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const activeProject = () => cfg.projects.find(x => x.id === cfg.activeProjectId) || null;
    const loadedProject = () => {
        const p = activeProject();
        return p && p.id === loadedProjectId ? p : null;
    };
    const P = p => `Projects/${p.folderName}`;
    const BK = p => `Backups/${p.folderName}`;

    /* ================= Atividade ================= */
    async function loadActivity(p) {
        let list = await S.readJSON(`${P(p)}/History/activity.json`, null);
        // Versões anteriores guardavam a atividade no localStorage.
        const legacyKey = 'egx_project_activity_' + p.id;
        let legacy = null;
        try {
            legacy = JSON.parse(localStorage.getItem(legacyKey) || 'null');
        } catch (e) {
            legacy = null;
        }
        if (Array.isArray(legacy) && legacy.length) {
            const ids = new Set((list || []).map(a => a.id));
            list = [...(list || []), ...legacy.filter(a => !ids.has(a.id))].sort((a, b) =>
                String(b.at).localeCompare(String(a.at)),
            );
            await S.writeJSON(`${P(p)}/History/activity.json`, list.slice(0, ACTIVITY_LIMIT), { silent: true }).catch(
                () => {},
            );
        }
        try {
            localStorage.removeItem(legacyKey);
        } catch (e) {
            /* sem localStorage */
        }
        return Array.isArray(list) ? list.filter(a => a.action !== 'Navegação') : [];
    }
    function logActivity(action, detail = '') {
        const p = loadedProject();
        if (!p) return;
        activity.unshift({
            id: uid('act_'),
            action: String(action),
            detail: String(detail || ''),
            at: new Date().toISOString(),
        });
        activity.splice(ACTIVITY_LIMIT);
        const snapshot = activity.slice();
        S.writeLater(
            'activity:' + p.id,
            () => S.writeJSON(`${P(p)}/History/activity.json`, snapshot, { silent: true }),
            300,
        );
        renderDashboard();
    }

    /* ================= Dados dos módulos ================= */
    function buildDataFile(p) {
        const modules = {};
        M.entries().forEach(([key, api]) => {
            if (api.file) modules[key] = { file: api.file };
            else {
                try {
                    modules[key] = api.exportData?.() ?? null;
                } catch (e) {
                    modules[key] = null;
                }
            }
        });
        return { schemaVersion: 2, projectId: p.id, modules, updatedAt: new Date().toISOString() };
    }
    async function saveNow(p, keys) {
        const all = !keys;
        const entries = M.entries();
        if (all || entries.some(([k, a]) => !a.file && keys.has(k)))
            await S.writeJSON(`${P(p)}/data.json`, buildDataFile(p));
        for (const [k, a] of entries) {
            if (!a.file || !(all || keys.has(k))) continue;
            const d = a.exportData?.() ?? null;
            if (d) await S.writeJSON(`${P(p)}/${a.file}`, d);
            else await S.remove(`${P(p)}/${a.file}`);
        }
    }
    function scheduleSave(key) {
        const p = loadedProject();
        if (!p) return;
        if (key) dirty.add(key);
        else M.entries().forEach(([k]) => dirty.add(k));
        S.writeLater(
            'project:' + p.id,
            async () => {
                const keys = new Set(dirty);
                dirty.clear();
                try {
                    await saveNow(p, keys);
                } catch (e) {
                    keys.forEach(k => dirty.add(k));
                    showAppToast(
                        S.hasFolder()
                            ? 'Não foi possível salvar na pasta selecionada. Verifique a permissão.'
                            : 'Não foi possível salvar os dados deste projeto.',
                        'error',
                    );
                    throw e;
                }
            },
            500,
        );
        renderDashboardSoon();
    }
    M.onChange(scheduleSave);

    async function restoreProjectData(project) {
        loadedProjectId = null; // nada é salvo enquanto o projeto está sendo carregado
        let recovered = false;
        if (S.hasFolder()) {
            try {
                const prefix = S._local.prefix + P(project) + '/';
                for (const k of await S._local.keys())
                    if (String(k).startsWith(prefix))
                        recovered = (await S.reconcile(String(k).slice(S._local.prefix.length))) || recovered;
            } catch (e) {
                /* recuperação é best-effort */
            }
        }
        let data = null;
        try {
            data = await S.readJSON(`${P(project)}/data.json`, null);
        } catch (e) {
            showAppToast('Não foi possível ler data.json do projeto.', 'error');
        }
        let modules = data?.modules ?? null;
        const hasContent = m => !!m && Object.values(m).some(v => v && !(typeof v === 'object' && 'file' in v));

        // Versões anteriores: dados no localStorage (egx_project_data_<id>).
        const legacyKey = 'egx_project_data_' + project.id;
        let legacy = null,
            migrated = false;
        try {
            legacy = JSON.parse(localStorage.getItem(legacyKey) || 'null');
        } catch (e) {
            legacy = null;
        }
        if (legacy) {
            const legacyModules =
                legacy.campaignCreator !== undefined || legacy.extractor !== undefined
                    ? legacy
                    : { campaignCreator: legacy };
            if (!hasContent(modules) || (legacy.__savedAt && legacy.__savedAt > (data?.updatedAt || ''))) {
                modules = { ...(modules || {}), ...legacyModules };
                delete modules.__savedAt;
                recovered = true;
            }
            migrated = true;
        }

        for (const [key, api] of M.entries()) {
            let d = null;
            if (api.file) d = await S.readJSON(`${P(project)}/${api.file}`, null);
            else d = modules?.[key] ?? null;
            try {
                if (d) api.importData?.(d);
                else api.clear?.();
            } catch (e) {
                console.error('EGX: falha ao restaurar módulo', key, e);
                showAppToast(`Não foi possível restaurar os dados de “${key}”.`, 'error');
            }
        }
        window.EGXExtractorProjectBridge?.setProjectName?.(project.name);
        activity = await loadActivity(project);
        exportsIndex = (await S.readJSON(`${P(project)}/Exports/index.json`, [])) || [];
        usageCache = null;
        loadedProjectId = project.id;
        if (migrated) {
            try {
                await saveNow(project, null);
                localStorage.removeItem(legacyKey);
            } catch (e) {
                /* mantém a cópia antiga até conseguir salvar */
            }
        }
        if (recovered) showAppToast('Recuperamos alterações feitas enquanto a pasta estava sem autorização.', 'info');
        window.dispatchEvent(new CustomEvent('egx:project-loaded', { detail: { project } }));
        renderDashboard();
    }

    async function ensureProjectStructure(project) {
        if (!S.hasFolder()) return;
        for (const folder of ['History', 'Exports', 'Reports']) await S.ensureDir(`${P(project)}/${folder}`);
        await S.writeJSON(
            `${P(project)}/project.json`,
            {
                schemaVersion: 1,
                id: project.id,
                name: project.name,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
                profile: cfg.profileName,
            },
            { silent: true },
        );
        if ((await S.read(`${P(project)}/data.json`)) == null)
            await S.writeJSON(
                `${P(project)}/data.json`,
                { schemaVersion: 2, projectId: project.id, modules: {}, updatedAt: project.updatedAt },
                { silent: true },
            );
    }

    // Projetos que existem na pasta mas não estão na lista deste navegador (ex.: outro PC).
    async function discoverProjects() {
        if (!S.hasFolder()) return 0;
        let added = 0;
        try {
            const dirs = (await S.list('Projects')).filter(x => x.kind === 'directory');
            for (const d of dirs) {
                if (cfg.projects.some(p => p.folderName.toLowerCase() === d.name.toLowerCase())) continue;
                const pj = await S.readJSON(`Projects/${d.name}/project.json`, null);
                if (!pj?.id || !pj.name || cfg.projects.some(p => p.id === pj.id)) continue;
                const now = new Date().toISOString();
                cfg.projects.push({
                    id: pj.id,
                    name: pj.name,
                    folderName: d.name,
                    createdAt: pj.createdAt || now,
                    updatedAt: pj.updatedAt || pj.createdAt || now,
                });
                added++;
            }
        } catch (e) {
            /* pasta sem Projects/ */
        }
        if (added) {
            saveCfg();
            showAppToast(`${added} projeto(s) encontrado(s) na pasta e adicionado(s) à lista.`, 'success');
        }
        return added;
    }

    /* ================= Backups ================= */
    const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const stampTime = name => {
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(name);
        return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : 0;
    };
    async function listBackups(p) {
        return (await S.list(BK(p)))
            .filter(x => x.kind === 'file' && x.name.endsWith('.json'))
            .map(x => x.name)
            .sort()
            .reverse();
    }
    async function createBackup(p, reason) {
        await S.flush();
        const data = await S.readJSON(`${P(p)}/data.json`, null);
        if (!data) return null;
        const bulk = await S.readJSON(`${P(p)}/bulkEditor.json`, null);
        if (bulk) delete bulk.workbook; // arquivo original fica fora do backup (tamanho)
        const name = `${stamp()}.json`;
        await S.writeJSON(
            `${BK(p)}/${name}`,
            {
                schemaVersion: 1,
                projectId: p.id,
                projectName: p.name,
                reason,
                createdAt: new Date().toISOString(),
                data,
                bulkEditor: bulk,
            },
            { silent: true },
        );
        const all = await listBackups(p);
        for (const old of all.slice(BACKUP_KEEP)) await S.remove(`${BK(p)}/${old}`);
        return name;
    }
    async function autoBackup(p) {
        try {
            const last = (await listBackups(p))[0];
            if (!last || Date.now() - stampTime(last) > BACKUP_EVERY_MS)
                await createBackup(p, 'Automático (abertura do projeto)');
        } catch (e) {
            /* backup automático nunca deve impedir o uso */
        }
        renderBackups();
    }
    async function restoreBackup(name) {
        const p = loadedProject();
        if (!p) return;
        const b = await S.readJSON(`${BK(p)}/${name}`, null);
        if (!b?.data) return showAppToast('Backup inválido ou ilegível.', 'error');
        const ok = await EGXDialog.confirm(
            `Restaurar o backup de ${fmtDateTime(b.createdAt)}?\n\nO estado atual será guardado antes em um novo backup, então dá para voltar atrás.`,
            { title: 'Restaurar backup', okLabel: 'Restaurar' },
        );
        if (!ok) return;
        try {
            await createBackup(p, 'Antes de restaurar backup');
            await S.writeJSON(`${P(p)}/data.json`, { ...b.data, updatedAt: new Date().toISOString() });
            if (b.bulkEditor) await S.writeJSON(`${P(p)}/bulkEditor.json`, b.bulkEditor);
            else await S.remove(`${P(p)}/bulkEditor.json`);
            await restoreProjectData(p);
            logActivity('Backup restaurado', fmtDateTime(b.createdAt));
            renderBackups();
            showAppToast('Backup restaurado.', 'success');
        } catch (e) {
            showAppToast('Não foi possível restaurar o backup.', 'error');
        }
    }

    /* ================= Exportações ================= */
    async function recordExport({ fileName, data, module, campaigns = [], ads = [], rows = 0 }) {
        const p = loadedProject();
        if (!p) return;
        let savedAs = null;
        if (S.hasFolder() && data) {
            try {
                const base = String(fileName)
                    .replace(/\.xlsx$/i, '')
                    .replace(/[\\/:*?"<>|]+/g, '_');
                const used = new Set(exportsIndex.map(e => e.savedAs).filter(Boolean));
                let candidate = `${base}.xlsx`,
                    n = 2;
                while (used.has(candidate)) candidate = `${base}_${n++}.xlsx`;
                await S.write(`${P(p)}/Exports/${candidate}`, new Blob([data]), { silent: true });
                savedAs = candidate;
            } catch (e) {
                showAppToast('Planilha baixada, mas não foi possível guardar a cópia em Exports/.', 'error');
            }
        }
        exportsIndex.unshift({
            id: uid('exp_'),
            fileName,
            savedAs,
            at: new Date().toISOString(),
            module,
            campaigns,
            ads,
            rows,
        });
        exportsIndex.splice(EXPORTS_LIMIT);
        usageCache = null;
        try {
            await S.writeJSON(`${P(p)}/Exports/index.json`, exportsIndex, { silent: true });
        } catch (e) {
            /* índice é auxiliar */
        }
        logActivity('Planilha exportada', `${fileName} · ${rows} linha(s) · ${module}`);
    }
    async function downloadExport(id) {
        const p = loadedProject();
        const e = exportsIndex.find(x => x.id === id);
        if (!p || !e?.savedAs) return;
        const f = await S.readFile(`${P(p)}/Exports/${e.savedAs}`);
        if (!f) return showAppToast('Arquivo não encontrado em Exports/ (autorize a pasta do Workspace).', 'error');
        dl(f, e.fileName);
    }
    // Lê a cópia de uma exportação (para reabrir no Editor). Retorna File ou null.
    async function readExportFile(id) {
        const p = loadedProject();
        const e = exportsIndex.find(x => x.id === id);
        if (!p || !e?.savedAs) return null;
        return S.readFile(`${P(p)}/Exports/${e.savedAs}`);
    }
    // Mapa CÓDIGO → usos anteriores (para avisar sobre criativo repetido no Criador).
    function creativeUsage() {
        if (usageCache) return usageCache;
        usageCache = new Map();
        exportsIndex.forEach(e =>
            (e.ads || []).forEach(name => {
                const code = codeOf(name);
                if (!usageCache.has(code)) usageCache.set(code, []);
                usageCache.get(code).push({ campaign: e.campaigns?.[0] || e.fileName, at: e.at });
            }),
        );
        return usageCache;
    }

    /* ================= Painel ================= */
    let dashTimer = null;
    const renderDashboardSoon = () => {
        clearTimeout(dashTimer);
        dashTimer = setTimeout(renderDashboard, 400);
    };
    function setText(id, v) {
        const el = $(id);
        if (el) el.textContent = v;
    }
    function renderDashboard() {
        const p = activeProject();
        const creator = window.EGXCreatorProjectBridge?.exportData?.() || {};
        const extractor = window.EGXExtractorProjectBridge?.exportData?.() || {};
        const tasks = window.EGXTasksBridge?.summary?.() || { todayPending: 0, todayDone: 0, urgent: 0 };
        const bulk = window.EGXBulkEditorBridge?.summary?.() || { rows: 0 };
        const cCount = Array.isArray(creator.ads) ? creator.ads.filter(a => a.name).length : 0;
        const eCount = String(extractor.output || '').trim()
            ? String(extractor.output).trim().split(/\r?\n/).filter(Boolean).length
            : 0;
        const list = p && p.id === loadedProjectId ? activity : [];

        setText('egx-dash-title', p ? p.name : 'Visão geral do EGX');
        setText(
            'egx-dash-subtitle',
            p
                ? 'Acompanhe o trabalho, os arquivos e as atividades deste projeto.'
                : 'Você está usando o EGX sem projeto vinculado. Crie ou abra um projeto para organizar seus dados.',
        );
        setText('egx-dash-tasks-count', tasks.todayPending.toLocaleString('pt-BR'));
        setText(
            'egx-dash-tasks-detail',
            `pendente(s) · ${tasks.todayDone} feita(s)${tasks.urgent ? ` · ${tasks.urgent} urgente(s)` : ''}`,
        );
        setText('egx-dash-creator-count', cCount.toLocaleString('pt-BR'));
        setText('egx-dash-creator-detail', creator.mode === 'image' ? 'Modo imagem' : 'Modo catálogo');
        setText('egx-dash-extractor-count', eCount.toLocaleString('pt-BR'));
        setText('egx-dash-bulk-count', bulk.rows.toLocaleString('pt-BR'));
        setText('egx-dash-bulk-detail', bulk.rows ? bulk.fileName || 'Planilha aberta' : 'Nenhuma planilha aberta');
        const expList = p && p.id === loadedProjectId ? exportsIndex : [];
        setText('egx-dash-exports-count', expList.length.toLocaleString('pt-BR'));
        setText('egx-dash-exports-detail', expList[0] ? `Última em ${fmtDateTime(expList[0].at)}` : 'Nenhuma ainda');
        setText('egx-dash-last-activity', list[0]?.action || 'Nenhuma');
        setText('egx-dash-last-activity-date', list[0]?.at ? `(${fmtDateTime(list[0].at)})` : '');
        setText('egx-dash-storage', S.hasFolder() ? 'Workspace vinculado' : 'Armazenamento local');
        setText(
            'egx-dash-storage-detail',
            S.hasFolder() ? `${cfg.workspaceName} · arquivos sincronizados` : 'dados neste navegador',
        );
        setText(
            'egx-dash-project-info',
            p
                ? `${p.name} · Criado em ${new Date(p.createdAt).toLocaleDateString('pt-BR')}`
                : 'Nenhum projeto ativo — os dados não serão vinculados a projeto.',
        );
        setText('egx-dash-project-created', p ? `Pasta: ${p.folderName}` : 'Sem pasta');

        const actBox = $('egx-dash-activity-list');
        actBox.innerHTML = list.length
            ? list
                  .slice(0, 8)
                  .map(
                      a =>
                          `<div class="egx-dash-activity-item py-3 flex gap-3"><span class="text-purple-300">●</span><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-200">${escapeHtml(a.action)}</p><p class="text-xs text-slate-400 mt-1 truncate">${escapeHtml(a.detail)}</p></div><time class="text-[10px] text-slate-500 whitespace-nowrap">${fmtDateTime(a.at)}</time></div>`,
                  )
                  .join('')
            : '<div class="py-5 text-sm text-slate-500">Nenhuma atividade registrada ainda.</div>';

        const expBox = $('egx-dash-exports-list');
        expBox.replaceChildren();
        if (!expList.length)
            expBox.innerHTML = '<div class="py-5 text-sm text-slate-500">Nenhuma exportação registrada ainda.</div>';
        expList.slice(0, 8).forEach(e => {
            const row = document.createElement('div');
            row.className = 'egx-dash-row';
            row.innerHTML = `<span class="text-lg">📄</span><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-200 truncate"></p><p class="meta"></p></div>`;
            row.querySelector('p').textContent = e.campaigns?.[0] || e.fileName;
            row.querySelector('.meta').textContent =
                `${fmtDateTime(e.at)} · ${e.rows} linha(s) · ${(e.ads || []).length} anúncio(s) · ${e.module}`;
            if (e.savedAs) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'egx-mini-btn';
                b.textContent = '⬇ Baixar';
                b.title = `Exports/${e.savedAs}`;
                b.addEventListener('click', () => downloadExport(e.id));
                row.appendChild(b);
            }
            expBox.appendChild(row);
        });

        const st = $('egx-dash-status-grid');
        if (st) st.innerHTML = '';
    }
    async function renderBackups() {
        const box = $('egx-dash-backups-list');
        if (!box) return;
        const p = loadedProject();
        box.replaceChildren();
        const names = p ? await listBackups(p).catch(() => []) : [];
        if (!names.length) {
            box.innerHTML = `<div class="py-5 text-sm text-slate-500">${p ? 'Nenhum backup ainda.' : 'Abra um projeto para ver os backups.'}</div>`;
            return;
        }
        names.slice(0, 6).forEach(name => {
            const row = document.createElement('div');
            row.className = 'egx-dash-row';
            row.innerHTML = `<span class="text-lg">🛟</span><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-200"></p><p class="meta"></p></div>`;
            const t = stampTime(name);
            row.querySelector('p').textContent = t ? fmtDateTime(new Date(t).toISOString()) : name;
            row.querySelector('.meta').textContent = `${BK(p)}/${name}`;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'egx-mini-btn';
            b.textContent = '↺ Restaurar';
            b.addEventListener('click', () => restoreBackup(name));
            row.appendChild(b);
            box.appendChild(row);
        });
        if (names.length > 6) {
            const more = document.createElement('p');
            more.className = 'text-xs text-slate-500 pt-2';
            more.textContent = `+ ${names.length - 6} backup(s) mais antigo(s).`;
            box.appendChild(more);
        }
    }

    /* ---------- Busca no projeto ---------- */
    function runSearch(q) {
        const box = $('egx-dash-search-results');
        q = String(q || '')
            .trim()
            .toLowerCase();
        box.replaceChildren();
        box.classList.toggle('hidden', !q);
        if (!q) return;
        const results = [];
        cfg.projects
            .filter(p => p.name.toLowerCase().includes(q))
            .forEach(p => results.push({ icon: '📁', title: p.name, meta: 'Projeto', go: () => openProject(p.id) }));
        (window.EGXTasksBridge?.search?.(q) || []).slice(0, 10).forEach(({ day, task }) =>
            results.push({
                icon: task.done ? '✅' : '📝',
                title: task.text,
                meta: `Tarefa · ${day.split('-').reverse().join('/')}`,
                go: () => {
                    $('nav-tab-tasks').click();
                    window.EGXTasksBridge?.goTo?.(day);
                },
            }),
        );
        exportsIndex
            .filter(
                e =>
                    String(e.fileName).toLowerCase().includes(q) ||
                    (e.campaigns || []).some(c => c.toLowerCase().includes(q)) ||
                    (e.ads || []).some(a => a.toLowerCase().includes(q)),
            )
            .slice(0, 10)
            .forEach(e => {
                const ad = (e.ads || []).find(a => a.toLowerCase().includes(q));
                results.push({
                    icon: '📄',
                    title: e.campaigns?.[0] || e.fileName,
                    meta: `Exportação · ${fmtDateTime(e.at)}${ad ? ` · contém ${ad}` : ''}`,
                    go: e.savedAs ? () => downloadExport(e.id) : null,
                });
            });
        activity
            .filter(a => `${a.action} ${a.detail}`.toLowerCase().includes(q))
            .slice(0, 6)
            .forEach(a => results.push({ icon: '•', title: a.action, meta: `${a.detail} · ${fmtDateTime(a.at)}` }));
        if (!results.length) {
            box.innerHTML = '<p class="text-sm text-slate-500 py-2">Nada encontrado.</p>';
            return;
        }
        results.slice(0, 25).forEach(r => {
            const row = document.createElement(r.go ? 'button' : 'div');
            if (r.go) {
                row.type = 'button';
                row.addEventListener('click', r.go);
            }
            row.className = 'egx-dash-row text-left w-full' + (r.go ? ' hover:bg-slate-800/40 rounded-lg px-1' : '');
            row.innerHTML = `<span class="text-base w-6 text-center">${escapeHtml(r.icon)}</span><div class="min-w-0 flex-1"><p class="text-sm text-slate-200 truncate"></p><p class="meta truncate"></p></div>`;
            row.querySelector('p').textContent = r.title;
            row.querySelector('.meta').textContent = r.meta;
            box.appendChild(row);
        });
    }

    /* ---------- Indicador de salvamento ---------- */
    const saveEl = $('egx-save-status');
    let saveFade = null;
    function setSaveStatus(state, text) {
        if (!saveEl) return;
        saveEl.classList.toggle('hidden', !loadedProjectId && state !== 'error');
        saveEl.dataset.state = state;
        saveEl.textContent = text;
    }
    S.on((type, d) => {
        if (type === 'pending') setSaveStatus('pending', 'Salvando…');
        else if (type === 'saved') {
            const hm = d.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            setSaveStatus('saved', `Salvo ${d.target === 'folder' ? 'na pasta' : 'no navegador'} às ${hm}`);
            clearTimeout(saveFade);
        } else if (type === 'error') setSaveStatus('error', 'Erro ao salvar — verifique a pasta');
    });

    /* ================= Central de projetos ================= */
    function render() {
        const hasFolder = S.hasFolder();
        $('egx-profile-label').textContent = cfg.profileName || 'Meu perfil';
        $('egx-workspace-label').textContent = cfg.workspaceName || 'EGX Workspace';
        const needsAuth = !hasFolder && !!savedHandle;
        if (savedHandle) $('egx-workspace-label').textContent = savedHandle.name;
        $('egx-workspace-status').textContent = hasFolder
            ? 'Pasta vinculada e autorizada'
            : needsAuth
              ? 'Pasta lembrada — autorize o acesso nesta sessão (1 clique)'
              : 'Nenhuma pasta vinculada — armazenamento local';
        $('egx-workspace-status').style.color = needsAuth ? '#fbbf24' : '';
        $('egx-workspace-select').textContent = hasFolder
            ? 'Pasta autorizada ✓'
            : needsAuth
              ? '🔓 Autorizar pasta “' + savedHandle.name + '”'
              : 'Selecionar pasta do Workspace';
        $('egx-workspace-change').classList.toggle('hidden', !savedHandle);
        $('egx-project-count').textContent = `${cfg.projects.length} projeto${cfg.projects.length === 1 ? '' : 's'}`;
        $('egx-project-empty').classList.toggle('hidden', cfg.projects.length > 0);
        const list = $('egx-project-list');
        list.innerHTML = '';
        cfg.projects
            .slice()
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
            .forEach(p => {
                const card = document.createElement('div');
                card.className = 'egx-project-card egx-launcher-card p-4';
                const isActive = p.id === cfg.activeProjectId;
                card.innerHTML = `<div class="flex items-start justify-between gap-2"><span class="text-2xl">📁</span><span class="text-[10px] rounded-full ${isActive ? 'bg-purple-900/60 text-purple-200' : 'bg-slate-800 text-slate-400'} px-2 py-1">${isActive ? 'Projeto ativo' : 'Projeto local'}</span></div><h3 class="font-bold text-white mt-3 truncate">${escapeHtml(p.name)}</h3><p class="text-xs text-slate-400 mt-1">Última abertura: ${p.updatedAt ? new Date(p.updatedAt).toLocaleString('pt-BR') : 'Nunca'}</p><div class="flex gap-2 mt-3"><button type="button" data-open class="egx-launcher-btn primary flex-1">${isActive ? 'Continuar projeto' : 'Abrir projeto'} →</button><button type="button" data-rename class="egx-launcher-btn" title="Renomear">✎</button><button type="button" data-delete class="egx-launcher-btn" title="Excluir">🗑</button></div>`;
                card.querySelector('[data-open]').addEventListener('click', () => openProject(p.id));
                card.querySelector('[data-rename]').addEventListener('click', () => renameProject(p.id));
                card.querySelector('[data-delete]').addEventListener('click', () => deleteProject(p.id));
                list.appendChild(card);
            });
    }
    async function loadHandle() {
        try {
            savedHandle = (await kv('readonly', s => s.get('workspaceDirectory'))) || null;
            S.setRoot(null);
            if (savedHandle && (await savedHandle.queryPermission({ mode: 'readwrite' })) === 'granted')
                S.setRoot(savedHandle);
        } catch (e) {
            S.setRoot(null);
        }
        await discoverProjects();
        render();
        renderDashboard();
    }
    async function ensureAccess(silent) {
        if (S.hasFolder() || !savedHandle) return S.hasFolder();
        try {
            if ((await savedHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
                S.setRoot(savedHandle);
                cfg.workspaceName = savedHandle.name;
                saveCfg();
                await discoverProjects();
                render();
                if (!silent) showAppToast('Pasta “' + savedHandle.name + '” autorizada.', 'success');
                return true;
            }
        } catch (e) {
            /* usuário negou ou navegador sem suporte */
        }
        if (!silent) showAppToast('Acesso à pasta não autorizado. Os dados continuam salvos no navegador.', 'info');
        render();
        return false;
    }
    function workspaceButton() {
        if (S.hasFolder()) return showAppToast('A pasta “' + S.getRoot().name + '” já está autorizada.', 'info');
        if (savedHandle)
            return ensureAccess(false).then(ok => {
                const p = activeProject();
                if (ok && p && !body.classList.contains('egx-launcher-active')) restoreProjectData(p);
            });
        return chooseWorkspace();
    }
    async function chooseWorkspace() {
        if (!window.showDirectoryPicker) {
            showAppToast(
                'Seu navegador não suporta seleção de pasta (use Chrome ou Edge). Os dados ficam no navegador.',
                'info',
            );
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                showAppToast('Permissão de pasta não concedida.', 'error');
                return;
            }
            await S.flush();
            S.setRoot(handle);
            savedHandle = handle;
            cfg.workspaceName = handle.name;
            await kv('readwrite', s => s.put(handle, 'workspaceDirectory'));
            for (const folder of ['Projects', 'Backups', 'Settings', 'Templates']) await S.ensureDir(folder);
            await discoverProjects();
            for (const p of cfg.projects) await ensureProjectStructure(p);
            saveCfg();
            render();
            showAppToast('Workspace vinculado e estrutura criada.', 'success');
        } catch (e) {
            if (e.name !== 'AbortError') showAppToast('Não foi possível configurar a pasta.', 'error');
        }
    }
    async function openProject(id) {
        const p = cfg.projects.find(x => x.id === id);
        if (!p) return;
        if (!S.hasFolder() && savedHandle) await ensureAccess(true);
        await S.flush();
        cfg.activeProjectId = id;
        p.updatedAt = new Date().toISOString();
        saveCfg();
        try {
            await ensureProjectStructure(p);
        } catch (e) {
            showAppToast('Projeto aberto, mas não foi possível sincronizar sua pasta.', 'error');
        }
        await restoreProjectData(p);
        $('egx-active-project-pill').textContent = 'Projeto: ' + p.name;
        $('egx-active-project-pill').classList.remove('hidden');
        body.classList.remove('egx-launcher-active');
        window.EGXActivateTab?.('nav-tab-dashboard');
        logActivity('Projeto aberto', p.name);
        setSaveStatus('saved', S.hasFolder() ? 'Pasta sincronizada' : 'Salvando no navegador');
        render();
        autoBackup(p);
        showAppToast(`Projeto “${p.name}” aberto.`, 'success');
    }
    async function enterWithoutProject() {
        await S.flush();
        cfg.activeProjectId = null;
        loadedProjectId = null;
        activity = [];
        exportsIndex = [];
        usageCache = null;
        saveCfg();
        M.entries().forEach(([, api]) => (api.detach || api.clear)?.());
        $('egx-active-project-pill').classList.add('hidden');
        setSaveStatus('idle', '');
        window.EGXExtractorProjectBridge?.setProjectName?.('Sem projeto ativo');
        body.classList.remove('egx-launcher-active');
        window.EGXActivateTab?.('nav-tab-dashboard');
        renderDashboard();
        renderBackups();
    }
    async function createProject() {
        const input = $('egx-project-name'),
            name = input.value.trim();
        if (!name) {
            input.focus();
            showAppToast('Informe um nome para o projeto.', 'error');
            return;
        }
        if (!S.hasFolder() && savedHandle) await ensureAccess(true);
        if (cfg.projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            showAppToast('Já existe um projeto com esse nome.', 'error');
            return;
        }
        const slug =
            name
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'Projeto';
        let folderName = slug,
            suffix = 2;
        while (cfg.projects.some(x => x.folderName.toLowerCase() === folderName.toLowerCase()))
            folderName = slug + '_' + suffix++;
        const now = new Date().toISOString();
        const p = { id: uid('proj_'), name, folderName, createdAt: now, updatedAt: now };
        cfg.projects.push(p);
        saveCfg();
        input.value = '';
        render();
        try {
            await ensureProjectStructure(p);
        } catch (e) {
            showAppToast('Projeto criado, mas não foi possível criar sua pasta/arquivos.', 'error');
        }
        await openProject(p.id);
    }
    async function renameProject(id) {
        const p = cfg.projects.find(x => x.id === id);
        if (!p) return;
        const value = await EGXDialog.prompt('Novo nome do projeto', p.name, {
            message: 'A pasta no disco continua com o nome original.',
        });
        if (value === null) return;
        const name = value.trim();
        if (!name) return showAppToast('O nome não pode ficar vazio.', 'error');
        if (cfg.projects.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase()))
            return showAppToast('Já existe outro projeto com esse nome.', 'error');
        const oldName = p.name;
        p.name = name;
        p.updatedAt = new Date().toISOString();
        saveCfg();
        render();
        if (cfg.activeProjectId === id) {
            logActivity('Projeto renomeado', oldName + ' → ' + name);
            $('egx-active-project-pill').textContent = 'Projeto: ' + p.name;
            renderDashboard();
        }
        ensureProjectStructure(p)
            .then(() => showAppToast('Projeto renomeado.', 'success'))
            .catch(() => showAppToast('Nome atualizado, mas houve falha ao gravar os arquivos.', 'error'));
    }
    async function deleteProject(id) {
        const p = cfg.projects.find(x => x.id === id);
        if (!p) return;
        const ok = await EGXDialog.confirm(
            `Remove o projeto da lista e apaga a pasta Projects/${p.folderName} com todos os arquivos.\n\nOs backups em Backups/${p.folderName} são mantidos.`,
            { title: `Excluir o projeto “${p.name}”?`, okLabel: 'Excluir projeto', danger: true },
        );
        if (!ok) return;
        await S.flush();
        try {
            await S.remove(P(p), { recursive: true });
        } catch (e) {
            const listOnly = await EGXDialog.confirm(
                'Não foi possível apagar a pasta do projeto. Remover o projeto apenas da lista?',
                { okLabel: 'Remover da lista' },
            );
            if (!listOnly) return;
        }
        const wasActive = cfg.activeProjectId === id;
        cfg.projects = cfg.projects.filter(x => x.id !== id);
        try {
            localStorage.removeItem('egx_project_data_' + id);
            localStorage.removeItem('egx_project_activity_' + id);
        } catch (e) {
            /* sem localStorage */
        }
        if (wasActive) {
            cfg.activeProjectId = null;
            loadedProjectId = null;
            activity = [];
            exportsIndex = [];
            M.entries().forEach(([, api]) => (api.detach || api.clear)?.());
            window.EGXExtractorProjectBridge?.setProjectName?.('Sem projeto ativo');
            body.classList.add('egx-launcher-active');
        }
        saveCfg();
        render();
        $('egx-active-project-pill').classList.toggle('hidden', !cfg.activeProjectId);
        renderDashboard();
        showAppToast('Projeto removido.', 'success');
    }
    async function editProfile() {
        const value = await EGXDialog.prompt('Nome do perfil local', cfg.profileName || 'Meu perfil');
        if (value === null) return;
        const name = value.trim();
        if (!name) return showAppToast('O nome do perfil não pode ficar vazio.', 'error');
        cfg.profileName = name;
        saveCfg();
        render();
        const p = activeProject();
        if (p) ensureProjectStructure(p).catch(() => {});
        showAppToast('Perfil local atualizado.', 'success');
    }
    async function saveAll() {
        const p = loadedProject();
        if (!p) return showAppToast('Abra um projeto para salvar.', 'info');
        scheduleSave(null);
        await S.flush();
        showAppToast(`Projeto “${p.name}” salvo.`, 'success');
    }

    /* ================= Pontes públicas ================= */
    window.EGXWorkspace = {
        recordExport,
        readExportFile,
        creativeUsage,
        exportsIndex: () => exportsIndex.slice(),
        activeProject: () => loadedProject(),
        save: saveAll,
        log: logActivity,
    };
    // Compatibilidade com o código dos módulos.
    window.EGXWorkspaceProjectBridge = {
        saveCreator: () => scheduleSave('campaignCreator'),
        saveExtractor: () => scheduleSave('extractor'),
        saveProjectData: () => scheduleSave(null),
        getActiveProject: () => activeProject(),
        logActivity,
    };
    window.EGXDashboardBridge = { log: logActivity, refresh: renderDashboard };

    /* ================= Eventos ================= */
    $('egx-dash-refresh').addEventListener('click', () => {
        renderDashboard();
        renderBackups();
    });
    $('egx-dash-open-launcher').addEventListener('click', () => $('egx-return-launcher').click());
    $('egx-dash-clear-activity').addEventListener('click', async () => {
        const p = loadedProject();
        if (!p) return;
        if (!(await EGXDialog.confirm('Limpar o histórico de atividades deste projeto?', { okLabel: 'Limpar' })))
            return;
        activity = [];
        await S.writeJSON(`${P(p)}/History/activity.json`, [], { silent: true }).catch(() => {});
        renderDashboard();
        showAppToast('Histórico de atividades limpo.', 'success');
    });
    $('egx-dash-backup-now').addEventListener('click', async () => {
        const p = loadedProject();
        if (!p) return showAppToast('Abra um projeto para criar um backup.', 'info');
        try {
            const name = await createBackup(p, 'Manual');
            if (!name) return showAppToast('Ainda não há dados salvos para copiar.', 'info');
            logActivity('Backup criado', 'Manual');
            renderBackups();
            showAppToast('Backup criado.', 'success');
        } catch (e) {
            showAppToast('Não foi possível criar o backup.', 'error');
        }
    });
    const searchInp = $('egx-dash-search');
    let searchTimer = null;
    searchInp.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(searchInp.value), 150);
    });
    searchInp.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            searchInp.value = '';
            runSearch('');
        }
    });

    // Salvamento automático: digitação no Criador e no Extrator.
    const onEdit = e => {
        if (e.target.closest?.('#module-meta-ads, #meta-text-modal')) scheduleSave('campaignCreator');
        if (e.target.closest?.('#module-extractor')) scheduleSave('extractor');
    };
    document.addEventListener('input', onEdit);
    document.addEventListener('change', onEdit);

    // Registra só ações relevantes (não cada clique ou troca de aba).
    [
        ['meta-btn-process', 'Lista processada', 'Criador de campanhas'],
        ['ext-btn-run', 'Lista extraída', 'Organizar criativos'],
        ['ext-prefix-detect', 'Prefixos detectados', 'Organizar criativos'],
        ['meta-btn-clear-raw', 'Entrada limpa', 'Criador de campanhas'],
        ['ext-btn-clear', 'Extrator limpo', 'Organizar criativos'],
    ].forEach(([id, action, detail]) => {
        const el = $(id);
        if (el) el.addEventListener('click', () => setTimeout(() => logActivity(action, detail), 150));
    });
    $('egx-project-create').addEventListener('click', createProject);
    $('egx-project-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') createProject();
    });
    $('egx-workspace-select').addEventListener('click', workspaceButton);
    $('egx-workspace-change').addEventListener('click', chooseWorkspace);
    $('egx-profile-edit').addEventListener('click', editProfile);
    $('egx-launch-settings').addEventListener('click', chooseWorkspace);
    $('egx-launch-enter').addEventListener('click', enterWithoutProject);
    $('egx-return-launcher').addEventListener('click', async () => {
        await S.flush();
        body.classList.add('egx-launcher-active');
        render();
    });
    window.addEventListener('egx:project-loaded', renderBackups);
    // Garante que nada fique pendente ao trocar de aba do navegador ou fechar.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') S.flush();
    });
    window.addEventListener('beforeunload', e => {
        if (S.hasPending()) {
            S.flush();
            e.preventDefault();
            e.returnValue = '';
        }
    });

    body.classList.add('egx-launcher-active');
    loadHandle();
})();
