'use strict';
/* ===================================================================
   EGXDialog — modais próprios no lugar de confirm()/prompt()/alert()
   Uso:
     if (!(await EGXDialog.confirm('Excluir?', { danger: true }))) return;
     const nome = await EGXDialog.prompt('Novo nome:', 'Atual');   // null se cancelar
   =================================================================== */
window.EGXDialog = (() => {
    let queue = Promise.resolve();

    function open({ title, message, input, okLabel, cancelLabel, danger, details, isAlert }) {
        return new Promise(resolve => {
            const prevFocus = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = 'egx-dialog-overlay';
            overlay.setAttribute('role', 'presentation');

            const box = document.createElement('div');
            box.className = 'egx-dialog';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');

            const h = document.createElement('h2');
            h.className = 'egx-dialog-title';
            h.textContent = title || (input != null ? 'Informe um valor' : 'Confirmar');
            box.appendChild(h);

            if (message) {
                const p = document.createElement('p');
                p.className = 'egx-dialog-msg';
                p.textContent = message;
                box.appendChild(p);
            }
            if (details && details.length) {
                const ul = document.createElement('ul');
                ul.className = 'egx-dialog-list';
                details.forEach(d => {
                    const li = document.createElement('li');
                    li.textContent = d;
                    ul.appendChild(li);
                });
                box.appendChild(ul);
            }

            let field = null;
            if (input != null) {
                field = document.createElement('input');
                field.type = 'text';
                field.className = 'egx-dialog-input';
                field.value = String(input);
                box.appendChild(field);
            }

            const actions = document.createElement('div');
            actions.className = 'egx-dialog-actions';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'egx-launcher-btn';
            cancel.textContent = cancelLabel || 'Cancelar';
            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'egx-launcher-btn primary' + (danger ? ' egx-dialog-danger' : '');
            ok.textContent = okLabel || 'Confirmar';
            if (isAlert) actions.append(ok);
            else actions.append(cancel, ok);
            box.appendChild(actions);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const close = value => {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                try {
                    prevFocus?.focus?.();
                } catch (e) {
                    /* elemento pode ter saído da página */
                }
                resolve(value);
            };
            const accept = () => close(field ? field.value : true);
            const reject = () => close(field ? null : false);
            const onKey = e => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    reject();
                } else if (e.key === 'Enter' && (field ? document.activeElement === field : true)) {
                    e.preventDefault();
                    accept();
                }
            };
            document.addEventListener('keydown', onKey, true);
            ok.addEventListener('click', accept);
            cancel.addEventListener('click', reject);
            overlay.addEventListener('mousedown', e => {
                if (e.target === overlay) reject();
            });
            requestAnimationFrame(() => {
                if (field) {
                    field.focus();
                    field.select();
                } else (danger ? cancel : ok).focus();
            });
        });
    }

    /**
     * Formulário em diálogo. Retorna { id: valor } ou null se cancelar.
     * fields: [{ id, label, type: text|number|textarea|select|checkbox|radio|checks|info,
     *            value, options: [{value,label}] | [valor], hint, placeholder, min, max, step, show(values) }]
     * validate(values) → mensagem de erro (string) ou vazio.
     */
    function openForm({ title, message, fields = [], okLabel, cancelLabel, danger, validate, wide }) {
        return new Promise(resolve => {
            const prevFocus = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = 'egx-dialog-overlay';
            const box = document.createElement('form');
            box.className = 'egx-dialog egx-form' + (wide ? ' egx-dialog-wide' : '');
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.noValidate = true;
            const h = document.createElement('h2');
            h.className = 'egx-dialog-title';
            h.textContent = title || 'Configurar';
            box.appendChild(h);
            if (message) {
                const p = document.createElement('p');
                p.className = 'egx-dialog-msg';
                p.textContent = message;
                box.appendChild(p);
            }
            const opt = o => (typeof o === 'object' ? o : { value: o, label: String(o) });
            const inputs = {};
            const rows = [];
            fields.forEach(f => {
                const row = document.createElement('div');
                row.className = 'egx-form-row' + (f.type === 'checkbox' ? ' is-check' : '');
                rows.push({ f, row });
                if (f.type === 'info') {
                    const p = document.createElement('div');
                    p.className = 'egx-form-info';
                    p.textContent = f.value ?? f.label ?? '';
                    row.appendChild(p);
                    box.appendChild(row);
                    return;
                }
                const lab = document.createElement('label');
                lab.className = 'egx-form-label';
                const fid = 'egxf-' + f.id + '-' + Math.random().toString(36).slice(2, 6);
                lab.htmlFor = fid;
                lab.textContent = f.label || '';
                let el;
                if (f.type === 'textarea') {
                    el = document.createElement('textarea');
                    el.rows = f.rows || 4;
                    el.value = f.value ?? '';
                } else if (f.type === 'select') {
                    el = document.createElement('select');
                    (f.options || []).map(opt).forEach(o => el.appendChild(new Option(o.label, o.value)));
                    el.value = f.value ?? '';
                } else if (f.type === 'checkbox') {
                    el = document.createElement('input');
                    el.type = 'checkbox';
                    el.checked = !!f.value;
                } else if (f.type === 'radio' || f.type === 'checks') {
                    el = document.createElement('div');
                    el.className = 'egx-form-choices';
                    const multi = f.type === 'checks';
                    const sel = new Set(multi ? f.value || [] : [f.value]);
                    (f.options || []).map(opt).forEach(o => {
                        const l = document.createElement('label');
                        l.className = 'egx-form-choice';
                        const i = document.createElement('input');
                        i.type = multi ? 'checkbox' : 'radio';
                        i.name = fid;
                        i.value = o.value;
                        i.checked = sel.has(o.value);
                        const t = document.createElement('span');
                        t.textContent = o.label;
                        l.append(i, t);
                        if (o.hint) {
                            const small = document.createElement('small');
                            small.textContent = o.hint;
                            l.appendChild(small);
                        }
                        el.appendChild(l);
                    });
                } else {
                    el = document.createElement('input');
                    el.type = f.type === 'number' ? 'number' : 'text';
                    if (f.min != null) el.min = f.min;
                    if (f.max != null) el.max = f.max;
                    if (f.step != null) el.step = f.step;
                    el.value = f.value ?? '';
                }
                if (f.placeholder) el.placeholder = f.placeholder;
                el.id = fid;
                if (!['radio', 'checks', 'checkbox'].includes(f.type)) el.classList.add('egx-dialog-input');
                inputs[f.id] = { f, el };
                if (f.type === 'checkbox') row.append(el, lab);
                else row.append(lab, el);
                if (f.hint) {
                    const hint = document.createElement('small');
                    hint.className = 'egx-form-hint';
                    hint.textContent = f.hint;
                    row.appendChild(hint);
                }
                box.appendChild(row);
            });
            const err = document.createElement('p');
            err.className = 'egx-form-error';
            err.hidden = true;
            box.appendChild(err);

            const values = () => {
                const out = {};
                Object.entries(inputs).forEach(([id, { f, el }]) => {
                    if (f.type === 'checkbox') out[id] = el.checked;
                    else if (f.type === 'radio') out[id] = el.querySelector('input:checked')?.value ?? '';
                    else if (f.type === 'checks') out[id] = [...el.querySelectorAll('input:checked')].map(i => i.value);
                    else if (f.type === 'number') out[id] = el.value === '' ? '' : Number(el.value);
                    else out[id] = el.value;
                });
                return out;
            };
            const refresh = () => {
                const v = values();
                rows.forEach(({ f, row }) => {
                    row.hidden = typeof f.show === 'function' ? !f.show(v) : false;
                });
            };
            box.addEventListener('input', refresh);
            box.addEventListener('change', refresh);
            refresh();

            const actions = document.createElement('div');
            actions.className = 'egx-dialog-actions';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'egx-launcher-btn';
            cancel.textContent = cancelLabel || 'Cancelar';
            const ok = document.createElement('button');
            ok.type = 'submit';
            ok.className = 'egx-launcher-btn primary' + (danger ? ' egx-dialog-danger' : '');
            ok.textContent = okLabel || 'Aplicar';
            actions.append(cancel, ok);
            box.appendChild(actions);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const close = v => {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                try {
                    prevFocus?.focus?.();
                } catch (e) {
                    /* elemento saiu da página */
                }
                resolve(v);
            };
            const onKey = e => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    close(null);
                }
            };
            document.addEventListener('keydown', onKey, true);
            box.addEventListener('submit', e => {
                e.preventDefault();
                const v = values();
                // Campos ocultos não contam.
                rows.forEach(({ f, row }) => {
                    if (row.hidden && f.id in v) delete v[f.id];
                });
                const msg = validate?.(v);
                if (msg) {
                    err.textContent = msg;
                    err.hidden = false;
                    return;
                }
                close(v);
            });
            cancel.addEventListener('click', () => close(null));
            overlay.addEventListener('mousedown', e => {
                if (e.target === overlay) close(null);
            });
            requestAnimationFrame(() => {
                const first = box.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select');
                (first || ok).focus();
                if (first?.select) first.select();
            });
        });
    }

    // Um diálogo por vez.
    const enqueue = (opts, fn = open) => {
        const p = queue.then(() => fn(opts));
        queue = p.catch(() => {});
        return p;
    };

    return {
        form: opts => enqueue(opts, openForm),
        confirm: (message, opts = {}) => enqueue({ ...opts, message }),
        prompt: (message, value = '', opts = {}) =>
            enqueue({ title: message, okLabel: 'Salvar', ...opts, input: value ?? '' }),
        alert: (message, opts = {}) => enqueue({ okLabel: 'OK', ...opts, message, isAlert: true }),
    };
})();
