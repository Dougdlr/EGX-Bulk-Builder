'use strict';
/* ---------- Tarefas do dia ----------
   Com projeto aberto: as tarefas pertencem ao projeto e são salvas em
   Projects/<projeto>/data.json (chave "tasks").
   Sem projeto: usa a lista geral deste navegador (egx_tasks_v1), como antes. */
(function tasksModule() {
    const KEY = 'egx_tasks_v1'; // lista geral (sem projeto) — também é a lista das versões antigas
    const LEGACY_DONE = 'egx_tasks_legacy_imported';
    const root = $('module-tasks');
    if (!root) return;
    const emptyDb = () => ({ days: {} });
    const loadGeneral = () => {
        const d = lsGet(KEY, emptyDb());
        return d && typeof d.days === 'object' ? d : emptyDb();
    };
    let db = loadGeneral();
    let projectMode = false;
    const pad = n => String(n).padStart(2, '0');
    const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dateOf = k => {
        const [y, m, d] = k.split('-').map(Number);
        return new Date(y, m - 1, d);
    };
    const addDays = (k, n) => {
        const d = dateOf(k);
        d.setDate(d.getDate() + n);
        return keyOf(d);
    };
    const todayKey = () => keyOf(new Date());
    const nowHM = () => {
        const d = new Date();
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const short = k => {
        const d = dateOf(k);
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    };
    const CATS = ['Campanha', 'Criativos', 'Planilha', 'Outro'];
    let view = todayKey(),
        editing = null;
    const list = k => (db.days[k] = db.days[k] || []);
    const persist = () => {
        Object.keys(db.days).forEach(k => {
            if (!db.days[k].length) delete db.days[k];
        });
        if (projectMode) window.EGXModules?.changed('tasks');
        else lsSet(KEY, db);
    };
    const countTasks = d => Object.values(d?.days || {}).reduce((n, arr) => n + (arr?.length || 0), 0);

    // Tarefas criadas antes da versão por projeto: oferece importar para o projeto atual.
    function renderLegacy() {
        const box = $('td-legacy');
        if (!box) return;
        box.replaceChildren();
        box.classList.add('hidden');
        if (!projectMode || lsGet(LEGACY_DONE, false)) return;
        const legacy = loadGeneral();
        const n = countTasks(legacy);
        if (!n) return;
        const msg = document.createElement('span');
        msg.textContent = `Há ${n} tarefa(s) da lista geral (versão anterior, sem projeto).`;
        const imp = document.createElement('button');
        imp.type = 'button';
        imp.className = 'egx-td-btn';
        imp.textContent = 'Importar para este projeto';
        imp.addEventListener('click', () => {
            const before = snap();
            Object.entries(legacy.days).forEach(([k, arr]) => {
                const have = new Set(list(k).map(t => t.id));
                arr.forEach(t => {
                    if (!have.has(t.id)) list(k).push(t);
                });
            });
            lsSet(LEGACY_DONE, true);
            persist();
            render();
            showAppToast(`${n} tarefa(s) importada(s) para este projeto.`, 'success', {
                label: 'Desfazer',
                fn: () => {
                    lsSet(LEGACY_DONE, false);
                    restore(before);
                },
            });
        });
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'egx-td-btn';
        dismiss.textContent = 'Dispensar';
        dismiss.addEventListener('click', () => {
            lsSet(LEGACY_DONE, true);
            renderLegacy();
        });
        box.append(msg, imp, dismiss);
        box.classList.remove('hidden');
    }
    function renderScope() {
        const el = $('td-scope');
        if (!el) return;
        const p = window.EGXWorkspaceProjectBridge?.getActiveProject?.();
        el.textContent = projectMode && p ? `Projeto: ${p.name}` : 'Lista geral (sem projeto)';
    }
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const snap = () => JSON.stringify(db);
    const restore = j => {
        db = JSON.parse(j);
        persist();
        render();
    };

    function label(k) {
        const t = todayKey(),
            d = dateOf(k);
        const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
        const pre = k === t ? 'Hoje · ' : k === addDays(t, -1) ? 'Ontem · ' : k === addDays(t, 1) ? 'Amanhã · ' : '';
        return pre + txt;
    }

    function rowEl(task) {
        const r = document.createElement('div');
        r.className = 'egx-td-row' + (task.done ? ' is-done' : '') + (task.urgent && !task.done ? ' is-urgent' : '');
        if (editing === task.id) return editRow(r, task);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!task.done;
        cb.setAttribute('aria-label', 'Concluir tarefa');
        cb.addEventListener('change', () => {
            task.done = cb.checked ? nowHM() : null;
            persist();
            render();
            if (cb.checked) window.EGXDashboardBridge?.log?.('Tarefas', 'Concluiu: ' + task.text);
        });
        const tx = document.createElement('span');
        tx.className = 'egx-td-txt';
        tx.textContent = task.text;
        tx.title = 'Clique duas vezes para editar';
        tx.addEventListener('dblclick', () => startEdit(task));
        r.append(cb, tx);
        if (task.from) {
            const f = document.createElement('span');
            f.className = 'egx-td-tag from';
            f.textContent = 'veio de ' + short(task.from);
            r.append(f);
        }
        if (task.urgent && !task.done) {
            const u = document.createElement('span');
            u.className = 'egx-td-tag urg';
            u.textContent = 'Urgente';
            r.append(u);
        }
        const c = document.createElement('span');
        c.className = 'egx-td-tag cat';
        c.textContent = task.cat;
        r.append(c);
        if (task.done) {
            const h = document.createElement('span');
            h.className = 'egx-td-time';
            h.textContent = task.done;
            r.append(h);
        }
        const ed = document.createElement('button');
        ed.type = 'button';
        ed.className = 'egx-td-ico';
        ed.textContent = '✎';
        ed.setAttribute('aria-label', 'Editar tarefa');
        ed.title = 'Editar';
        ed.addEventListener('click', () => startEdit(task));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'egx-td-ico';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Excluir tarefa');
        del.title = 'Excluir';
        del.addEventListener('click', () => {
            const before = snap();
            db.days[view] = list(view).filter(x => x !== task);
            persist();
            render();
            showAppToast('Tarefa excluída.', 'info', { label: 'Desfazer', fn: () => restore(before) });
        });
        r.append(ed, del);
        return r;
    }

    function editRow(r, task) {
        r.classList.remove('is-urgent');
        const box = document.createElement('div');
        box.className = 'egx-td-edit';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'fld';
        inp.value = task.text;
        inp.setAttribute('aria-label', 'Texto da tarefa');
        const sel = document.createElement('select');
        sel.className = 'fld';
        sel.setAttribute('aria-label', 'Categoria');
        CATS.forEach(cn => sel.append(new Option(cn, cn)));
        sel.value = task.cat;
        const ul = document.createElement('label');
        ul.className = 'egx-td-urg';
        const uc = document.createElement('input');
        uc.type = 'checkbox';
        uc.checked = !!task.urgent;
        ul.append(uc, ' Urgente');
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'egx-td-save';
        ok.textContent = 'Salvar';
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'egx-td-btn';
        no.textContent = 'Cancelar';
        const save = () => {
            const v = inp.value.trim();
            if (!v) {
                inp.focus();
                return showAppToast('A tarefa não pode ficar vazia.', 'error');
            }
            const before = snap();
            task.text = v;
            task.cat = sel.value;
            task.urgent = uc.checked;
            editing = null;
            persist();
            render();
            showAppToast('Tarefa atualizada.', 'success', { label: 'Desfazer', fn: () => restore(before) });
        };
        const cancel = () => {
            editing = null;
            render();
        };
        ok.addEventListener('click', save);
        no.addEventListener('click', cancel);
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            }
            if (e.key === 'Escape') cancel();
        });
        box.append(inp, sel, ul, ok, no);
        r.append(box);
        requestAnimationFrame(() => {
            inp.focus();
            inp.select();
        });
        return r;
    }
    function startEdit(task) {
        editing = task.id;
        render();
    }

    function renderCarry() {
        const box = $('td-carry');
        box.replaceChildren();
        box.classList.add('hidden');
        if (view !== todayKey()) return;
        const prev = Object.keys(db.days)
            .filter(k => k < view && db.days[k].some(t => !t.done))
            .sort()
            .pop();
        if (!prev) return;
        const n = db.days[prev].filter(t => !t.done).length;
        const msg = document.createElement('span');
        msg.textContent = `Você tem ${n} tarefa(s) pendente(s) de ${label(prev)
            .replace(/^(Ontem|Hoje|Amanhã) · /, '')
            .replace(/\.$/, '')}.`;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'egx-td-btn';
        b.textContent = 'Trazer para hoje';
        b.addEventListener('click', () => movePending(prev, view));
        box.append(msg, b);
        box.classList.remove('hidden');
    }

    function movePending(from, to) {
        const pend = list(from).filter(t => !t.done);
        if (!pend.length) return showAppToast('Não há pendências nesse dia.', 'info');
        const before = snap();
        db.days[from] = list(from).filter(t => t.done);
        pend.forEach(t => list(to).push({ ...t, id: uid(), from: t.from || from }));
        persist();
        render();
        showAppToast(`${pend.length} pendente(s) levadas para ${short(to)}.`, 'success', {
            label: 'Desfazer',
            fn: () => restore(before),
        });
    }

    function renderWeek() {
        const box = $('td-week');
        box.replaceChildren();
        const t = todayKey();
        for (let i = 6; i >= 0; i--) {
            const k = addDays(t, -i),
                items = db.days[k] || [],
                done = items.filter(x => x.done).length,
                tot = items.length;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'egx-td-day' + (k === view ? ' on' : '');
            const d = dateOf(k);
            const w = document.createElement('b');
            w.textContent =
                (i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')) +
                ' ' +
                short(k);
            const sm = document.createElement('small');
            sm.textContent = tot ? `${done}/${tot} feitas` : 'Sem tarefas';
            const bar = document.createElement('div');
            bar.className = 'egx-td-mini';
            const fill = document.createElement('i');
            fill.style.width = (tot ? Math.round((done / tot) * 100) : 0) + '%';
            bar.append(fill);
            b.append(w, sm, bar);
            b.addEventListener('click', () => go(k));
            box.append(b);
        }
    }

    function render() {
        const items = list(view);
        $('td-date').textContent = label(view);
        const todo = items.filter(t => !t.done).sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
        const done = items.filter(t => t.done).sort((a, b) => String(a.done).localeCompare(String(b.done)));
        const T = $('td-todo'),
            D = $('td-done');
        T.replaceChildren(...todo.map(rowEl));
        D.replaceChildren(...done.map(rowEl));
        if (!todo.length)
            T.innerHTML = `<p class="egx-td-empty">${items.length ? 'Tudo feito nesse dia.' : 'Nenhuma tarefa ainda. Adicione a primeira acima.'}</p>`;
        if (!done.length)
            D.innerHTML = '<p class="egx-td-empty">As tarefas concluídas aparecem aqui, com o horário.</p>';
        $('td-n-todo').textContent = todo.length;
        $('td-n-done').textContent = done.length;
        const n = items.length,
            k = done.length,
            pct = n ? Math.round((k / n) * 100) : 0;
        $('td-bar').style.width = pct + '%';
        $('td-pct').textContent = n ? `${k} de ${n} feitas · ${pct}%` : 'Sem tarefas nesse dia';
        $('td-roll').textContent = `Levar pendentes para ${short(addDays(view, 1))} →`;
        renderCarry();
        renderWeek();
        renderLegacy();
        renderScope();
        if (!db.days[view]?.length) delete db.days[view];
    }
    function go(k) {
        view = k;
        editing = null;
        render();
        window.EGXCascade?.(root.querySelectorAll('.egx-td-row'));
    }

    $('td-add').addEventListener('click', () => {
        const inp = $('td-text'),
            v = inp.value.trim();
        if (!v) {
            inp.focus();
            return showAppToast('Escreva a tarefa antes de adicionar.', 'error');
        }
        list(view).push({
            id: uid(),
            text: v,
            cat: $('td-cat').value,
            urgent: $('td-urg').checked,
            done: null,
            created: Date.now(),
        });
        inp.value = '';
        $('td-urg').checked = false;
        persist();
        render();
        inp.focus();
    });
    $('td-text').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('td-add').click();
        }
    });
    $('td-prev').addEventListener('click', () => go(addDays(view, -1)));
    $('td-next').addEventListener('click', () => go(addDays(view, 1)));
    $('td-today').addEventListener('click', () => go(todayKey()));
    $('td-roll').addEventListener('click', () => movePending(view, addDays(view, 1)));
    // Ao abrir a aba, volta para hoje (o dia pode ter virado com o app aberto)
    $('nav-tab-tasks').addEventListener('click', () => {
        if (view !== todayKey() && !editing) {
            view = todayKey();
            render();
        }
    });
    const api = {
        // Dados do projeto atual (null quando está na lista geral).
        exportData: () => (projectMode ? JSON.parse(snap()) : null),
        importData: d => {
            projectMode = true;
            db = d && typeof d.days === 'object' ? JSON.parse(JSON.stringify(d)) : emptyDb();
            view = todayKey();
            editing = null;
            render();
        },
        // Projeto aberto sem tarefas salvas.
        clear: () => api.importData(null),
        // Sem projeto: volta para a lista geral do navegador.
        detach: () => {
            projectMode = false;
            db = loadGeneral();
            view = todayKey();
            editing = null;
            render();
        },
        summary: () => {
            const items = db.days[todayKey()] || [];
            return {
                todayPending: items.filter(t => !t.done).length,
                todayDone: items.filter(t => t.done).length,
                urgent: items.filter(t => !t.done && t.urgent).length,
            };
        },
        search: q => {
            const out = [];
            Object.entries(db.days).forEach(([k, arr]) =>
                arr.forEach(t => {
                    if (t.text.toLowerCase().includes(q)) out.push({ day: k, task: t });
                }),
            );
            return out.sort((a, b) => b.day.localeCompare(a.day));
        },
        goTo: k => go(k),
    };
    window.EGXTasksBridge = api;
    window.EGXModules?.register('tasks', api);
    render();
})();
