/* Open Finance via Pluggy (plano gratuito "Meu Pluggy"): lê contas, lançamentos e empréstimos dos SEUS bancos.
 * As credenciais ficam só neste aparelho (não vão para a nuvem de sincronização).
 * No Windows (Electron) e no Android (Capacitor) as chamadas saem pelo lado nativo, sem depender de CORS. */
'use strict';

const OpenFinance = (() => {
  const DEFAULT_BASE = 'https://api.pluggy.ai';
  const base = () => (Store.getMeta('pluggy_base') || DEFAULT_BASE).replace(/\/+$/, '');
  const cfg = () => ({ clientId: Store.getMeta('pluggy_client_id') || '', clientSecret: Store.getMeta('pluggy_client_secret') || '' });
  const directConfigured = () => { const c = cfg(); return !!(c.clientId && c.clientSecret); };
  /** 'nuvem' = pela função do Supabase (login do app, sem chaves no aparelho); 'direto' = chaves da Pluggy neste aparelho */
  const mode = () => (Store.getMeta('pluggy_mode') === 'direto' ? 'direto' : 'nuvem');
  const cloud = () => mode() === 'nuvem';
  const configured = () => (cloud() ? Sync.loggedIn() : directConfigured());
  let cloudItems = [];
  const items = () => (cloud() ? cloudItems : Store.getMeta('pluggy_items', []));
  async function call(action, body) {
    try { return await Sync.fn('pluggy', { action, ...(body || {}) }); }
    catch (e) {
      if (e.offline) throw new Error('Sem conexão com o servidor. Verifique a internet.');
      if (e.status === 404 && /function|not found/i.test(String(e.raw || e.message))) throw new Error('A função "pluggy" ainda não foi publicada no seu Supabase. Veja a seção Open Finance do LEIA-ME.');
      throw e;
    }
  }
  const links = () => Store.getMeta('pluggy_links', {});
  let apiKey = null, apiKeyExp = 0;

  async function setConfig(clientId, clientSecret) {
    await Store.setMeta('pluggy_client_id', clientId.trim()); await Store.setMeta('pluggy_client_secret', clientSecret.trim());
    apiKey = null;
  }
  async function clearAll() {
    for (const k of ['pluggy_client_id', 'pluggy_client_secret', 'pluggy_items', 'pluggy_links', 'pluggy_since']) await Store.setMeta(k, null);
    apiKey = null;
  }

  /** Requisição HTTP pelo melhor caminho disponível: Electron (processo principal) → Capacitor (nativo) → fetch */
  async function http(method, url, headers, body) {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json', ...headers };
    const data = body === undefined ? undefined : JSON.stringify(body);
    let status, text;
    try {
      if (globalThis.desktop && desktop.http) {
        const r = await desktop.http({ method, url, headers: h, body: data });
        status = r.status; text = r.body;
      } else if (U.isNative() && Capacitor.Plugins.CapacitorHttp) {
        const r = await Capacitor.Plugins.CapacitorHttp.request({ method, url, headers: h, data: body, responseType: 'text' });
        status = r.status; text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      } else {
        const r = await fetch(url, { method, headers: h, body: data });
        status = r.status; text = await r.text();
      }
    } catch (e) {
      const err = new Error(U.isNative() || globalThis.desktop ? 'Sem conexão com a Pluggy. Verifique a internet.' : 'Não foi possível falar com a Pluggy pelo navegador (bloqueio de segurança do navegador ou sem internet). Use o aplicativo do Windows ou do Android.');
      err.network = true; throw err;
    }
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (status < 200 || status >= 300) {
      const msg = (json && (json.message || json.error)) || text || '';
      const err = new Error(translate(status, msg)); err.status = status; err.raw = msg; throw err;
    }
    return json;
  }
  function translate(status, msg) {
    if (status === 401 || status === 403) {
      if (/LIST_ITEMS/i.test(msg)) return 'Listar conexões automaticamente não está disponível no plano gratuito. Informe o ID da conexão (item).';
      return 'Client ID ou Client Secret inválidos (ou sem permissão para este recurso).';
    }
    if (status === 404) return 'Não encontrado na Pluggy. Confira o ID da conexão (item).';
    if (status === 429) return 'Muitas requisições à Pluggy. Aguarde alguns minutos e tente de novo.';
    if (status >= 500) return 'A Pluggy está com instabilidade no momento. Tente mais tarde.';
    return 'Erro da Pluggy (' + status + ')' + (msg ? ': ' + String(msg).slice(0, 200) : '');
  }

  async function key() {
    if (apiKey && Date.now() < apiKeyExp) return apiKey;
    const c = cfg(); if (!c.clientId || !c.clientSecret) throw new Error('Informe o Client ID e o Client Secret da Pluggy.');
    const r = await http('POST', base() + '/auth', {}, { clientId: c.clientId, clientSecret: c.clientSecret, nonExpiring: false });
    if (!r || !r.apiKey) throw new Error('A Pluggy não devolveu a chave de acesso.');
    apiKey = r.apiKey; apiKeyExp = Date.now() + 100 * 60000; // chave vale 2 h; renova antes
    return apiKey;
  }
  async function get(path, params) {
    const qs = params ? '?' + Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
    try { return await http('GET', base() + path + qs, { 'X-API-KEY': await key() }); }
    catch (e) { if (e.status === 401 && apiKey) { apiKey = null; return http('GET', base() + path + qs, { 'X-API-KEY': await key() }); } throw e; }
  }
  const safeId = (id) => { if (!/^[A-Za-z0-9-]{8,64}$/.test(String(id || ''))) throw new Error('ID inválido: ' + id); return id; };

  const test = async () => { if (cloud()) return call('status'); apiKey = null; await key(); return true; };
  const fetchItem = (id) => (cloud() ? call('item', { id: safeId(id) }) : get('/items/' + safeId(id)));
  async function fetchAccounts(itemId) { const r = cloud() ? await call('accounts', { itemId: safeId(itemId) }) : await get('/accounts', { itemId: safeId(itemId) }); return (r && r.results) || []; }
  async function fetchLoans(itemId) { const r = cloud() ? await call('loans', { itemId: safeId(itemId) }) : await get('/loans', { itemId: safeId(itemId) }); return (r && r.results) || []; }
  async function refreshItem(id) {
    if (cloud()) return call('refresh', { id: safeId(id) });
    try { return await http('PATCH', base() + '/items/' + safeId(id), { 'X-API-KEY': await key() }, {}); }
    catch (e) { if (e.status >= 400 && e.status < 500 && e.status !== 429) throw new Error('A Pluggy não permitiu atualizar esta conexão pelo app. Atualize em meu.pluggy.ai (ela também atualiza sozinha periodicamente).'); throw e; }
  }

  /** Todos os lançamentos de uma conta desde 'from' (cursor da API v2) */
  async function fetchTransactions(accountId, from) {
    const out = []; let after = null;
    for (let i = 0; i < 200; i++) {
      const r = cloud() ? await call('transactions', { accountId: safeId(accountId), dateFrom: from, after }) : await get('/v2/transactions', { accountId: safeId(accountId), dateFrom: from, after });
      out.push(...((r && r.results) || []));
      const next = r && r.next; if (!next) break;
      const q = String(next).includes('?') ? String(next).split('?')[1] : String(next);
      after = new URLSearchParams(q).get('after'); if (!after) break;
    }
    return out;
  }

  // ---------- conversões ----------
  const cents = (v) => Math.round(Math.abs(Number(v) || 0) * 100);
  /** Data do lançamento: data pura (meia-noite UTC) é usada como está; com horário, converte para o fuso do aparelho */
  function txDate(d) {
    const s = String(d || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(s)) return s.slice(0, 10);
    const dt = new Date(s); if (isNaN(dt)) return null;
    return `${dt.getFullYear()}-${U.pad(dt.getMonth() + 1)}-${U.pad(dt.getDate())}`;
  }
  /** Lançamento da Pluggy → linha da tela de revisão da importação */
  function toRow(t) {
    const date = txDate(t.date); if (!date) return null;
    let desc = String(t.description || t.descriptionRaw || 'Lançamento').replace(/\s+/g, ' ').trim();
    const m = t.creditCardMetadata;
    if (m && m.totalInstallments > 1 && m.installmentNumber && !/\d+\s*\/\s*\d+/.test(desc)) desc += ` (${m.installmentNumber}/${m.totalInstallments})`;
    const v = cents(t.amount); if (!v) return null;
    return { date, description: desc, amount: t.type === 'CREDIT' ? v : -v, fitid: 'pluggy:' + t.id };
  }
  function rowsFrom(txs) {
    const pending = txs.filter((t) => t.status === 'PENDING').length;
    const rows = txs.filter((t) => t.status !== 'PENDING').map(toRow).filter(Boolean);
    return { rows, pending };
  }
  const accType = (a) => (a.type === 'CREDIT' ? 'cartao' : a.subtype === 'SAVINGS_ACCOUNT' ? 'poupanca' : 'corrente');
  function accLabel(a) { return [a.marketingName || a.name, a.number ? '•••' + String(a.number).slice(-4) : ''].filter(Boolean).join(' '); }
  /** Cria uma conta local equivalente à conta do banco */
  async function createLocalAccount(a, item) {
    const t = accType(a); const day = (d) => { const x = txDate(d); return x ? +x.slice(8, 10) : null; };
    const rec = { id: U.uuid(), name: accLabel(a), type: t, bank: (item && item.connector && item.connector.name) || '', initial_balance: 0, color: UI.COLORS[F.accounts(true).length % UI.COLORS.length], include_total: true };
    if (t === 'cartao' && a.creditData) {
      if (a.creditData.creditLimit) rec.credit_limit = cents(a.creditData.creditLimit);
      if (a.creditData.balanceCloseDate) rec.closing_day = day(a.creditData.balanceCloseDate);
      if (a.creditData.balanceDueDate) rec.due_day = day(a.creditData.balanceDueDate);
    }
    return Store.upsert('accounts', rec);
  }
  async function link(pluggyAccId, localId) { const l = { ...links() }; if (localId) l[pluggyAccId] = localId; else delete l[pluggyAccId]; await Store.setMeta('pluggy_links', l); }
  // ---------- modo nuvem: conexões guardadas no servidor (aparecem em todos os aparelhos) ----------
  async function loadCloudItems() { const r = await call('items'); cloudItems = (r && r.results) || []; return cloudItems; }
  async function registerItem(id) { const it = await call('register', { itemId: safeId(id) }); await loadCloudItems(); return it; }
  /** Abre a tela de login do banco (Pluggy Connect) dentro do app. updateItem = reconectar uma conexão existente */
  async function connect({ updateItem, onEvent } = {}) {
    if (typeof PluggyConnect === 'undefined') throw new Error('Componente da Pluggy não carregou.');
    const { accessToken } = await call('connect-token', updateItem ? { itemId: updateItem } : {});
    if (!accessToken) throw new Error('O servidor não devolveu o código de conexão.');
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    return new Promise((resolve, reject) => {
      let done = false;
      const pc = new PluggyConnect({
        connectToken: accessToken, language: 'pt', theme: dark ? 'dark' : 'light', countries: ['BR'], forceOauthInBrowser: true, allowFullscreen: true,
        ...(updateItem ? { updateItem } : {}),
        onSuccess: async ({ item }) => { done = true; try { const r = await registerItem(item.id); resolve({ item: { ...item, ...r } }); } catch (e) { reject(e); } },
        onError: (e) => { if (!done) { done = true; reject(new Error((e && e.message) || 'Não foi possível conectar o banco.')); } },
        onClose: () => { if (!done) { done = true; resolve(null); } },
        onEvent: (ev) => { try { onEvent && onEvent(ev); } catch (e) { /* ignora */ } },
      });
      pc.init().catch((e) => { if (!done) { done = true; reject(e); } });
    });
  }

  async function addItem(id) {
    id = String(id || '').trim(); safeId(id);
    if (cloud()) { if (items().some((i) => i.id === id)) throw new Error('Esta conexão já foi adicionada.'); const r = await registerItem(id); return { ...r, connector: { name: r.name } }; }
    if (items().some((i) => i.id === id)) throw new Error('Esta conexão já foi adicionada.');
    const it = await fetchItem(id);
    const rec = { id, name: (it.connector && it.connector.name) || 'Banco', status: it.status, lastUpdatedAt: it.lastUpdatedAt || null };
    await Store.setMeta('pluggy_items', [...items(), rec]);
    return it;
  }
  async function saveItemInfo(it) { if (cloud()) { cloudItems = cloudItems.map((i) => (i.id === it.id ? { ...i, status: it.status, lastUpdatedAt: it.lastUpdatedAt || null } : i)); return; } await Store.setMeta('pluggy_items', items().map((i) => (i.id === it.id ? { ...i, name: (it.connector && it.connector.name) || i.name, status: it.status, lastUpdatedAt: it.lastUpdatedAt || null } : i))); }
  async function removeItem(id, { deleteAtPluggy = false } = {}) {
    if (cloud()) { await call('unregister', { itemId: safeId(id), deleteAtPluggy }); await loadCloudItems(); return; }
    await Store.setMeta('pluggy_items', items().filter((i) => i.id !== id));
  }

  // ---------- empréstimos → Endividamento ----------
  function loanToDebt(l, bank) {
    const pay = l.payments || {}; const inst = l.installments || {};
    const bal = pay.contractOutstandingBalance != null ? cents(pay.contractOutstandingBalance) : null;
    let rate = 0; const ir = (l.interestRates || []).find((r) => r && (r.preFixedRate || r.postFixedRate));
    if (ir) { const r = Number(ir.preFixedRate || ir.postFixedRate) || 0; rate = ir.taxPeriodicity === 'MONTHLY' ? r * 100 : (Math.pow(1 + r, 1 / 12) - 1) * 100; rate = Math.round(rate * 100) / 100; }
    const kind = l.kind === 'FINANCING' ? (/imob|habit/i.test(l.productName + ' ' + (l.type || '')) ? 'financiamento_imovel' : /veic|auto/i.test(l.productName + ' ' + (l.type || '')) ? 'financiamento_veiculo' : 'credito_pessoal')
      : l.kind === 'UNARRANGED_ACCOUNT_OVERDRAFT' ? 'cheque_especial' : /consig/i.test(l.productName + ' ' + (l.type || '')) ? 'consignado' : 'credito_pessoal';
    const remaining = inst.dueInstallments != null ? inst.dueInstallments : (inst.typeContractRemaining === 'MONTH' ? inst.contractRemainingNumber : null);
    const due = l.dueDate ? txDate(l.dueDate) : null;
    return { key: 'pluggy:' + l.id, name: l.productName || 'Empréstimo', creditor: bank, kind, balance: bal, rate, remaining: remaining || null,
      installment: bal && remaining ? Math.round(bal / remaining) : 0, late: (inst.pastDueInstallments || 0) > 0, contract: l.contractNumber || '', due };
  }
  async function saveLoans(list) {
    const existing = Store.all('debts');
    const recs = list.map((d) => {
      const old = existing.find((x) => x.src_key === d.key);
      return { ...(old || { id: U.uuid(), color: '#be123c' }), name: d.name, creditor: d.creditor, kind: d.kind, balance: d.balance || 0, rate: d.rate || (old && old.rate) || 0,
        remaining: d.remaining, installment: d.installmentEdited ?? (old && old.installment) ?? d.installment, status: d.balance === 0 ? 'quitada' : d.late ? 'atrasada' : (old && old.status === 'negociando' ? 'negociando' : 'em_dia'),
        overdue: old && old.overdue ? old.overdue : 0, source: 'openfinance', src_key: d.key, balance_date: U.today(), notes: d.contract ? 'Contrato ' + d.contract : (old && old.notes) || '' };
    });
    if (recs.length) await Store.upsertMany('debts', recs);
    return recs.length;
  }

  return { mode, cloud, directConfigured, loadCloudItems, connect, configured, cfg, setConfig, clearAll, items, links, link, addItem, removeItem, saveItemInfo, test, fetchItem, fetchAccounts, fetchTransactions, fetchLoans,
    refreshItem, rowsFrom, toRow, txDate, accType, accLabel, createLocalAccount, loanToDebt, saveLoans, cents, base };
})();
