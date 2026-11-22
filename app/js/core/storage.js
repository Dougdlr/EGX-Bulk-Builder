'use strict';
/* ===================================================================
   EGXStorage — camada única de persistência
   -------------------------------------------------------------------
   Todos os módulos gravam/leem por aqui, usando caminhos relativos ao
   Workspace (ex.: "Projects/Linflora/data.json").

   • Com pasta vinculada e autorizada → arquivos reais na pasta.
   • Sem pasta (ou sem autorização)   → IndexedDB deste navegador
     (sem o limite de ~5 MB do localStorage).

   Para migrar para um servidor no futuro, basta trocar as funções
   internas (writeAt/readAt/...) por chamadas à API — os módulos não
   precisam mudar.
   =================================================================== */
window.EGXStorage = (() => {
    let root = null; // FileSystemDirectoryHandle autorizado
    const listeners = new Set();

    /* ---------- IndexedDB (modo navegador) ---------- */
    const DB_NAME = 'egx_storage',
        STORE = 'files';
    let dbPromise = null;
    function db() {
        if (!dbPromise)
            dbPromise = new Promise((ok, no) => {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(STORE);
                req.onsuccess = () => ok(req.result);
                req.onerror = () => no(req.error);
            });
        return dbPromise;
    }
    async function idb(mode, fn) {
        const d = await db();
        return new Promise((ok, no) => {
            const tx = d.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => ok(req ? req.result : undefined);
            tx.onerror = () => no(tx.error);
            tx.onabort = () => no(tx.error);
        });
    }
    const idbGet = key => idb('readonly', s => s.get(key));
    const idbPut = (key, value) => idb('readwrite', s => s.put(value, key));
    const idbDel = key => idb('readwrite', s => s.delete(key));
    const idbKeys = () => idb('readonly', s => s.getAllKeys());
    const LOCAL = 'ws:'; // prefixo das chaves que espelham caminhos do Workspace

    /* ---------- Pasta (File System Access API) ---------- */
    const split = path => String(path).split('/').filter(Boolean);
    async function dirAt(parts, create) {
        let d = root;
        for (const p of parts) d = await d.getDirectoryHandle(p, { create });
        return d;
    }
    const notFound = e => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
    async function writeAt(path, content) {
        const parts = split(path);
        const name = parts.pop();
        const dir = await dirAt(parts, true);
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(content);
        await w.close();
    }
    async function fileAt(path) {
        const parts = split(path);
        const name = parts.pop();
        try {
            const dir = await dirAt(parts, false);
            return await (await dir.getFileHandle(name)).getFile();
        } catch (e) {
            if (notFound(e)) return null;
            throw e;
        }
    }
    async function removeAt(path, recursive) {
        const parts = split(path);
        const name = parts.pop();
        try {
            const dir = await dirAt(parts, false);
            await dir.removeEntry(name, { recursive: !!recursive });
        } catch (e) {
            if (!notFound(e)) throw e;
        }
    }
    async function listAt(path) {
        try {
            const dir = await dirAt(split(path), false);
            const out = [];
            for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind });
            return out;
        } catch (e) {
            if (notFound(e)) return [];
            throw e;
        }
    }

    function emit(type, detail) {
        listeners.forEach(fn => {
            try {
                fn(type, detail);
            } catch (e) {
                /* listener com erro não deve quebrar a gravação */
            }
        });
    }

    /* ---------- API pública ---------- */
    async function write(path, content, opts = {}) {
        try {
            if (root) await writeAt(path, content);
            else if (typeof content === 'string')
                await idbPut(LOCAL + path, { content, savedAt: new Date().toISOString() });
            else if (!opts.folderOnly) await idbPut(LOCAL + path, { blob: content, savedAt: new Date().toISOString() });
            if (!opts.silent) emit('saved', { path, target: root ? 'folder' : 'browser', at: new Date() });
            return true;
        } catch (e) {
            emit('error', { path, error: e });
            throw e;
        }
    }
    async function read(path) {
        if (root) {
            const f = await fileAt(path);
            return f ? f.text() : null;
        }
        const v = await idbGet(LOCAL + path);
        return v && typeof v.content === 'string' ? v.content : null;
    }
    // Arquivo binário (só existe com pasta vinculada). Retorna File ou null.
    async function readFile(path) {
        return root ? fileAt(path) : null;
    }
    // Garante que a pasta exista (só com pasta vinculada).
    async function ensureDir(path) {
        if (root) await dirAt(split(path), true);
    }
    async function writeJSON(path, obj, opts) {
        return write(path, JSON.stringify(obj, null, 2), opts);
    }
    async function readJSON(path, fallback = null) {
        try {
            const txt = await read(path);
            return txt == null ? fallback : JSON.parse(txt);
        } catch (e) {
            return fallback;
        }
    }
    async function remove(path, opts = {}) {
        if (root) await removeAt(path, opts.recursive);
        const keys = await idbKeys();
        const prefix = LOCAL + path;
        await Promise.all(
            keys.filter(k => k === prefix || (opts.recursive && String(k).startsWith(prefix + '/'))).map(idbDel),
        );
    }
    async function list(path) {
        if (root) return listAt(path);
        const prefix = LOCAL + split(path).join('/') + '/';
        const names = new Map();
        (await idbKeys())
            .filter(k => String(k).startsWith(prefix))
            .forEach(k => {
                const rest = String(k).slice(prefix.length).split('/');
                names.set(rest[0], rest.length > 1 ? 'directory' : 'file');
            });
        return [...names].map(([name, kind]) => ({ name, kind }));
    }

    /**
     * Quando a pasta volta a ser autorizada: se existir uma cópia no navegador
     * mais nova que o arquivo da pasta (gravada enquanto estava sem acesso),
     * envia a cópia para a pasta. Retorna true se recuperou algo.
     */
    async function reconcile(path) {
        if (!root) return false;
        const local = await idbGet(LOCAL + path);
        if (!local || typeof local.content !== 'string') return false;
        const file = await fileAt(path);
        const fileTime = file ? new Date(file.lastModified).toISOString() : '';
        let recovered = false;
        if (!file || local.savedAt > fileTime) {
            await writeAt(path, local.content);
            recovered = true;
        }
        await idbDel(LOCAL + path);
        return recovered;
    }

    /* ---------- Gravação adiada (evita gravar a cada tecla) ---------- */
    const pending = new Map();
    function writeLater(key, job, delay = 600) {
        clearTimeout(pending.get(key)?.timer);
        const entry = { job };
        entry.timer = setTimeout(() => {
            pending.delete(key);
            job().catch(() => {});
        }, delay);
        pending.set(key, entry);
        emit('pending', { key });
    }
    async function flush() {
        const jobs = [...pending.values()];
        pending.clear();
        for (const e of jobs) {
            clearTimeout(e.timer);
            try {
                await e.job();
            } catch (err) {
                /* erro já emitido em write() */
            }
        }
    }

    return {
        setRoot: handle => {
            root = handle || null;
            emit('root', { folder: !!root, name: root?.name || '' });
        },
        getRoot: () => root,
        hasFolder: () => !!root,
        write,
        read,
        readFile,
        ensureDir,
        writeJSON,
        readJSON,
        remove,
        list,
        reconcile,
        writeLater,
        flush,
        hasPending: () => pending.size > 0,
        on: fn => (listeners.add(fn), () => listeners.delete(fn)),
        // Acesso de baixo nível ao IndexedDB, usado na migração de dados antigos.
        _local: { get: idbGet, del: idbDel, keys: idbKeys, prefix: LOCAL },
    };
})();

/* ===================================================================
   EGXModules — registro dos módulos que guardam dados no projeto
   -------------------------------------------------------------------
   Cada módulo registra { exportData, importData, clear } e, opcional,
   { file } quando os dados são grandes e devem ir para um arquivo
   próprio (ex.: bulkEditor.json). Ao mudar algo, o módulo chama
   EGXModules.changed('chave') e o workspace salva automaticamente.
   =================================================================== */
window.EGXModules = (() => {
    const map = new Map();
    const listeners = new Set();
    return {
        register(key, api) {
            map.set(key, Object.assign({ file: null }, api));
        },
        get: key => map.get(key),
        entries: () => [...map.entries()],
        exportAll() {
            const out = {};
            map.forEach((api, key) => {
                try {
                    out[key] = api.exportData?.() ?? null;
                } catch (e) {
                    out[key] = null;
                }
            });
            return out;
        },
        changed(key) {
            listeners.forEach(fn => fn(key));
        },
        onChange: fn => listeners.add(fn),
    };
})();
