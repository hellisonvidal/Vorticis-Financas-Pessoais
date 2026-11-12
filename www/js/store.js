/* Camada de dados local-first: IndexedDB (com fallback para localStorage) + cache em memória.
 * Todo registro tem: id, updated_at (ISO), deleted (exclusão lógica, necessária para sincronizar).
 * O campo _dirty marca registros alterados que ainda não foram enviados para a nuvem. */
'use strict';

const Store = (() => {
  const COLLECTIONS = ['accounts', 'categories', 'transactions', 'budgets', 'rules', 'goals', 'debts'];
  const SEED_TS = '2000-01-01T00:00:00.000Z'; // registros padrão perdem para qualquer edição real
  const DB_NAME = 'financas-pessoais';
  let idb = null;
  const mem = {}; COLLECTIONS.forEach((c) => (mem[c] = new Map()));
  const meta = new Map();
  const listeners = new Set();
  let lastTs = '';

  /** Timestamp sempre crescente (evita empates no "último que salvou vence") */
  function stamp() {
    let t = new Date().toISOString();
    if (t <= lastTs) t = new Date(Date.parse(lastTs) + 1).toISOString();
    lastTs = t; return t;
  }

  function openIDB() {
    return new Promise((resolve) => {
      if (!globalThis.indexedDB) return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('rec')) db.createObjectStore('rec', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  function idbAll(store) {
    return new Promise((res, rej) => {
      const r = idb.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    });
  }
  function idbWrite(store, puts, dels = []) {
    return new Promise((res, rej) => {
      const tx = idb.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      puts.forEach((p) => os.put(p)); dels.forEach((k) => os.delete(k));
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }

  // ----- fallback localStorage -----
  const LS = 'financas-pessoais:';
  function lsLoad() {
    try {
      COLLECTIONS.forEach((c) => {
        const arr = JSON.parse(localStorage.getItem(LS + c) || '[]');
        arr.forEach((r) => mem[c].set(r.id, r));
      });
      const m = JSON.parse(localStorage.getItem(LS + 'meta') || '{}');
      Object.entries(m).forEach(([k, v]) => meta.set(k, v));
    } catch (e) { console.warn('localStorage indisponível', e); }
  }
  function lsSave(c) {
    try {
      if (c === 'meta') localStorage.setItem(LS + 'meta', JSON.stringify(Object.fromEntries(meta)));
      else localStorage.setItem(LS + c, JSON.stringify([...mem[c].values()]));
    } catch (e) { console.error('Falha ao salvar', e); UIHook.error('Não foi possível salvar os dados neste dispositivo (armazenamento cheio ou bloqueado).'); }
  }

  const UIHook = { error: (m) => console.error(m) };

  async function persist(c, recs) {
    if (idb) {
      try { await idbWrite('rec', recs.map((r) => ({ k: c + ':' + r.id, c, data: r }))); return; }
      catch (e) { console.error(e); UIHook.error('Falha ao gravar no banco local: ' + e); }
    } else lsSave(c);
  }

  async function init() {
    idb = await openIDB();
    if (idb) {
      try {
        const rows = await idbAll('rec');
        rows.forEach((row) => { if (mem[row.c]) mem[row.c].set(row.data.id, row.data); });
        (await idbAll('meta')).forEach((m) => meta.set(m.key, m.value));
      } catch (e) { console.error(e); idb = null; lsLoad(); }
    } else lsLoad();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  const clean = (r) => { const o = { ...r }; delete o._dirty; return o; };

  function all(c, includeDeleted = false) {
    const out = [];
    for (const r of mem[c].values()) if (includeDeleted || !r.deleted) out.push(r);
    return out;
  }
  const get = (c, id) => { const r = mem[c].get(id); return r && !r.deleted ? r : null; };

  function emit(c, info) { listeners.forEach((fn) => { try { fn(c, info); } catch (e) { console.error(e); } }); }
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  /** Insere ou atualiza vários registros de uma coleção (uma só gravação) */
  async function upsertMany(c, objs, { seed = false, silent = false } = {}) {
    const recs = objs.map((o) => {
      const prev = mem[c].get(o.id) || {};
      const r = { ...prev, ...o, id: o.id || U.uuid(), updated_at: seed ? SEED_TS : stamp(), deleted: false, _dirty: !seed };
      if (!r.created_at) r.created_at = seed ? SEED_TS : r.updated_at;
      mem[c].set(r.id, r);
      return r;
    });
    await persist(c, recs);
    if (!silent) emit(c, { type: 'upsert', count: recs.length });
    return recs;
  }
  async function upsert(c, obj) { return (await upsertMany(c, [obj]))[0]; }

  async function removeMany(c, ids) {
    const recs = [];
    ids.forEach((id) => {
      const prev = mem[c].get(id); if (!prev) return;
      const r = { id, updated_at: stamp(), deleted: true, _dirty: true, created_at: prev.created_at };
      mem[c].set(id, r); recs.push(r);
    });
    await persist(c, recs);
    emit(c, { type: 'remove', count: recs.length });
  }
  const remove = (c, id) => removeMany(c, [id]);

  /** Aplica registros vindos da nuvem: o mais recente (updated_at) vence. Retorna quantos mudaram. */
  async function applyRemote(c, remotes) {
    if (!mem[c]) return 0;
    const changed = [];
    remotes.forEach((rr) => {
      const local = mem[c].get(rr.id);
      if (local && local.updated_at >= rr.updated_at) return;
      const r = rr.deleted ? { id: rr.id, updated_at: rr.updated_at, deleted: true } : { ...rr, deleted: false };
      r._dirty = false;
      mem[c].set(r.id, r); changed.push(r);
    });
    if (changed.length) { await persist(c, changed); emit(c, { type: 'remote', count: changed.length }); }
    return changed.length;
  }

  function dirty() {
    const out = [];
    COLLECTIONS.forEach((c) => mem[c].forEach((r) => { if (r._dirty) out.push({ c, r }); }));
    return out;
  }
  /** Marca como enviados (somente se não mudaram durante o envio) */
  async function markClean(items) {
    const byC = {};
    items.forEach(({ c, r }) => {
      const cur = mem[c].get(r.id);
      if (cur && cur._dirty && cur.updated_at === r.updated_at) { cur._dirty = false; (byC[c] = byC[c] || []).push(cur); }
    });
    for (const c of Object.keys(byC)) await persist(c, byC[c]);
  }
  async function markAllDirty() {
    for (const c of COLLECTIONS) {
      const recs = [...mem[c].values()]; recs.forEach((r) => (r._dirty = true));
      await persist(c, recs);
    }
  }

  // ----- meta (configurações locais do dispositivo, não sincronizadas) -----
  const getMeta = (k, def = null) => (meta.has(k) ? meta.get(k) : def);
  async function setMeta(k, v) {
    meta.set(k, v);
    if (idb) { try { await idbWrite('meta', [{ key: k, value: v }]); } catch (e) { console.error(e); } }
    else lsSave('meta');
  }

  // ----- backup -----
  function exportJSON() {
    const data = { app: 'financas-pessoais', version: 1, exported_at: new Date().toISOString(), collections: {} };
    COLLECTIONS.forEach((c) => (data.collections[c] = all(c, true).map(clean)));
    return data;
  }
  /** mode: 'merge' (mantém o mais recente) | 'replace' (apaga tudo e restaura) */
  async function importJSON(data, mode = 'merge') {
    if (!data || data.app !== 'financas-pessoais' || !data.collections) throw new Error('Arquivo de backup inválido.');
    if (mode === 'replace') {
      // exclui logicamente o que não existe no backup (para propagar à nuvem)
      for (const c of COLLECTIONS) {
        const ids = new Set((data.collections[c] || []).map((r) => r.id));
        const gone = all(c).filter((r) => !ids.has(r.id)).map((r) => r.id);
        if (gone.length) await removeMany(c, gone);
      }
    }
    let n = 0;
    for (const c of COLLECTIONS) {
      const recs = (data.collections[c] || []).filter((r) => r && r.id);
      if (mode === 'replace') {
        // grava com timestamp novo para que a restauração prevaleça na sincronização
        const live = recs.filter((r) => !r.deleted);
        if (live.length) await upsertMany(c, live.map((r) => ({ ...r })), { silent: true });
        n += live.length;
      } else {
        const changed = [];
        recs.forEach((r) => {
          const l = mem[c].get(r.id);
          if (!l || l.updated_at < r.updated_at) { const x = { ...r, _dirty: true }; mem[c].set(r.id, x); changed.push(x); }
        });
        if (changed.length) await persist(c, changed);
        n += changed.length;
      }
    }
    emit('*', { type: 'import' });
    return n;
  }

  async function wipe() {
    COLLECTIONS.forEach((c) => mem[c].clear());
    if (idb) { await new Promise((res) => { const tx = idb.transaction('rec', 'readwrite'); tx.objectStore('rec').clear(); tx.oncomplete = res; tx.onerror = res; }); }
    else COLLECTIONS.forEach((c) => lsSave(c));
    emit('*', { type: 'wipe' });
  }

  return {
    COLLECTIONS, SEED_TS, init, all, get, upsert, upsertMany, remove, removeMany, applyRemote, dirty, markClean, markAllDirty,
    getMeta, setMeta, exportJSON, importJSON, wipe, on, clean, UIHook, get usingIDB() { return !!idb; },
  };
})();
