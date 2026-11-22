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

    // Um diálogo por vez.
    const enqueue = opts => {
        const p = queue.then(() => open(opts));
        queue = p.catch(() => {});
        return p;
    };

    return {
        confirm: (message, opts = {}) => enqueue({ ...opts, message }),
        prompt: (message, value = '', opts = {}) =>
            enqueue({ title: message, okLabel: 'Salvar', ...opts, input: value ?? '' }),
        alert: (message, opts = {}) => enqueue({ okLabel: 'OK', ...opts, message, isAlert: true }),
    };
})();
