/* Sincronização entre dispositivos via Supabase (plano gratuito).
 * Usa somente fetch (API REST do Supabase), sem bibliotecas externas.
 * Tabela: fin_records (ver supabase/schema.sql). Conflitos: o registro com updated_at mais recente vence. */
'use strict';

const Sync = (() => {
  const TABLE = 'fin_records';
  let running = null;
  let timer = null;
  const state = { status: 'off', message: '', last: null };
  const subs = new Set();
  const setState = (status, message = '') => { state.status = status; state.message = message; subs.forEach((f) => f(state)); };

  function cfg() {
    const c = globalThis.APP_CONFIG || {};
    return {
      url: (Store.getMeta('sb_url') || c.supabaseUrl || '').replace(/\/+$/, ''),
      key: Store.getMeta('sb_key') || c.supabaseAnonKey || '',
    };
  }
  const session = () => Store.getMeta('sb_session');
  const configured = () => { const c = cfg(); return !!(c.url && c.key); };
  const loggedIn = () => !!(session() && session().refresh_token);

  async function req(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const { url, key } = cfg();
    const h = { apikey: key, 'Content-Type': 'application/json', ...headers };
    if (auth) { const s = await validSession(); h.Authorization = 'Bearer ' + s.access_token; }
    let res;
    try { res = await fetch(url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { const err = new Error('Sem conexão com o servidor de sincronização.'); err.offline = true; throw err; }
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* texto puro */ }
    if (!res.ok) {
      const msg = (json && (json.msg || json.message || json.error_description || json.error)) || text || res.statusText;
      const err = new Error(traduz(String(msg))); err.status = res.status; err.raw = msg; throw err;
    }
    return json;
  }
  function traduz(m) {
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Abra o link enviado para o seu e-mail.';
    if (/User already registered/i.test(m)) return 'Este e-mail já está cadastrado. Use "Entrar".';
    if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/relation .* does not exist|Could not find the table/i.test(m)) return 'Tabela não encontrada no Supabase. Execute o script supabase/schema.sql no SQL Editor.';
    if (/Invalid API key/i.test(m)) return 'Chave (anon key) do Supabase inválida.';
    return m;
  }

  async function saveSession(j) {
    const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user.id, email: j.user.email } };
    await Store.setMeta('sb_session', s);
    return s;
  }
  async function validSession() {
    let s = session();
    if (!s) throw new Error('Faça login na sincronização.');
    if (Date.now() > s.expires_at - 60000) {
      try {
        const j = await req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false });
        s = await saveSession(j);
      } catch (e) {
        if (e.status === 400 || e.status === 401) { await Store.setMeta('sb_session', null); setState('error', 'Sessão expirada. Entre novamente.'); }
        throw e;
      }
    }
    return s;
  }

  async function signUp(email, password) {
    const j = await req('/auth/v1/signup', { method: 'POST', body: { email, password }, auth: false });
    if (j && j.access_token) { await saveSession(j); return { confirmed: true }; }
    return { confirmed: false };
  }
  async function signIn(email, password) {
    const j = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
    await saveSession(j);
    // conta nova neste dispositivo: envia tudo que já existe localmente e baixa tudo da nuvem
    const prevUser = Store.getMeta('sb_user');
    if (prevUser !== j.user.id) { await Store.setMeta('sb_cursor', null); await Store.setMeta('sb_user', j.user.id); await Store.markAllDirty(); }
    start();
    return syncNow();
  }
  async function signOut() {
    stop();
    await Store.setMeta('sb_session', null);
    setState('off', 'Desconectado');
  }

  async function pull() {
    const s = session();
    // nova versão com coleções novas: baixa tudo de novo uma vez (versões antigas ignoravam o que não conheciam)
    const cols = Store.COLLECTIONS.join(',');
    if (Store.getMeta('sb_cols') !== cols) { await Store.setMeta('sb_cursor', null); await Store.setMeta('sb_cols', cols); }
    let cursor = Store.getMeta('sb_cursor');
    // pequena sobreposição para não perder gravações concorrentes; aplicar duas vezes é inofensivo
    const since = cursor ? new Date(Date.parse(cursor) - 120000).toISOString() : null;
    const PAGE = 1000; let offset = 0; let maxTs = cursor; let total = 0;
    for (;;) {
      let q = `/rest/v1/${TABLE}?select=id,collection,data,deleted,updated_at,server_updated_at&user_id=eq.${s.user.id}&order=server_updated_at.asc,id.asc&limit=${PAGE}&offset=${offset}`;
      if (since) q += `&server_updated_at=gt.${encodeURIComponent(since)}`;
      const rows = await req(q);
      const byC = {};
      rows.forEach((row) => {
        const rec = row.deleted ? { id: row.id, deleted: true, updated_at: row.updated_at } : { ...(row.data || {}), id: row.id, updated_at: row.updated_at, deleted: false };
        rec.updated_at = new Date(rec.updated_at).toISOString(); // normaliza formato do Postgres
        (byC[row.collection] = byC[row.collection] || []).push(rec);
        if (!maxTs || row.server_updated_at > maxTs) maxTs = row.server_updated_at;
      });
      for (const c of Object.keys(byC)) total += await Store.applyRemote(c, byC[c]);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    if (maxTs) await Store.setMeta('sb_cursor', new Date(maxTs).toISOString());
    return total;
  }

  async function push() {
    const s = session();
    const items = Store.dirty();
    const BATCH = 500;
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const body = chunk.map(({ c, r }) => ({
        id: r.id, user_id: s.user.id, collection: c, deleted: !!r.deleted, updated_at: r.updated_at,
        data: r.deleted ? {} : Store.clean(r),
      }));
      await req(`/rest/v1/${TABLE}?on_conflict=user_id,id`, { method: 'POST', body, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      await Store.markClean(chunk);
    }
    return items.length;
  }

  async function syncNow() {
    if (!configured() || !loggedIn()) return null;
    if (running) return running;
    running = (async () => {
      setState('syncing', 'Sincronizando…');
      try {
        const got = await pull();
        const sent = await push();
        state.last = new Date().toISOString();
        await Store.setMeta('sb_last', state.last);
        setState('ok', `Sincronizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
        return { got, sent };
      } catch (e) {
        setState(e.offline ? 'offline' : 'error', e.message);
        throw e;
      } finally { running = null; }
    })();
    return running;
  }
  const quiet = () => syncNow().catch(() => {});
  const schedule = U.debounce(quiet, 2500);

  function start() {
    stop();
    if (!configured() || !loggedIn()) { setState('off', configured() ? 'Não conectado' : 'Não configurado'); return; }
    timer = setInterval(quiet, 60000);
    quiet();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  // sincroniza ao alterar dados, ao voltar a ficar online e ao reabrir o app
  Store.on((c, info) => { if (info && info.type !== 'remote' && timer) schedule(); });
  globalThis.addEventListener && addEventListener('online', () => timer && quiet());
  globalThis.document && document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && timer) quiet(); });

  return {
    cfg, configured, loggedIn, session, signUp, signIn, signOut, syncNow, start, stop, state,
    onState: (f) => { subs.add(f); return () => subs.delete(f); },
    async setConfig(url, key) { await Store.setMeta('sb_url', url.trim()); await Store.setMeta('sb_key', key.trim()); },
  };
})();
