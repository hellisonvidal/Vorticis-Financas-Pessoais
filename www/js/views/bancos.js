'use strict';
/* Open Finance (Pluggy – plano gratuito Meu Pluggy): conectar, vincular contas e importar lançamentos e empréstimos */
Views.bancos = (() => {
  const { $, $$, icon } = UI;
  const cache = {}; // itemId -> { item, accounts, err, loading }
  const busy = new Set();
  const STATUS = { UPDATED: ['pos', 'Atualizado'], UPDATING: ['info', 'Atualizando…'], OUTDATED: ['warn', 'Desatualizado'], LOGIN_ERROR: ['neg', 'Precisa reconectar'], WAITING_USER_INPUT: ['warn', 'Aguardando você'], WAITING_USER_ACTION: ['warn', 'Aguardando você'], MERGING: ['info', 'Processando'] };
  const dt = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };

  // estado do servidor (modo nuvem)
  const srv = { checked: false, loading: false, ok: false, configured: false, canLink: false, err: '' };
  async function checkServer() {
    if (srv.loading) return; srv.loading = true;
    try {
      const r = await OpenFinance.test(); Object.assign(srv, { ok: true, configured: !!r.configured, canLink: !!r.canLinkExisting, err: '' });
      if (r.configured) await OpenFinance.loadCloudItems();
    } catch (e) { Object.assign(srv, { ok: false, err: e.message }); }
    srv.checked = true; srv.loading = false; App.render();
  }

  let syncing = '';
  async function runSync(itemId) {
    if (syncing) return;
    syncing = 'Sincronizando…'; App.render();
    try {
      const prog = { onProgress: (n) => { syncing = 'Sincronizando ' + n + '…'; App.render(); } };
      let r;
      if (itemId) { const it = OpenFinance.items().find((x) => x.id === itemId) || {}; r = await OpenFinance.syncAll(itemId, { connector: { name: it.name } }, prog); }
      else { r = await OpenFinance.syncEverything(prog); if (r.erros.length) UI.toast(r.erros.join(' | '), 'error', 9000); }
      UI.toast('Sincronizado: ' + OpenFinance.resumo(r), 'ok', 7000);
      Object.keys(cache).forEach((k) => delete cache[k]);
    } catch (e) { UI.toast(e.message, 'error', 8000); }
    finally { syncing = ''; App.render(); }
  }

  function render() {
    const cloud = OpenFinance.cloud();
    const web = !U.isNative() && !globalThis.desktop;
    const items = OpenFinance.items();
    const intro = `<div class="note" style="margin-bottom:18px">${icon('shield')}<div><b>Duas formas de trazer os extratos:</b>
      <b>1) Open Finance</b> (esta tela): conecte o banco uma vez e os lançamentos vêm direto, pela Pluggy (empresa autorizada pelo Banco Central).
      <b>2) Arquivo OFX/CSV/Excel/PDF</b>, em <a href="#/importar">Importar extrato</a>, que funciona sem cadastro em nenhum serviço.
      Nos dois casos você revisa antes de salvar, e o que já existe não é duplicado.</div></div>`;
    const adv = `<details style="margin-top:18px"${cloud ? '' : ' open'}><summary class="small muted" style="cursor:pointer">Modo avançado: usar minhas próprias chaves da Pluggy neste aparelho</summary>
      <div class="card" style="margin-top:10px">
        <label class="check"><input type="checkbox" id="pmode" ${cloud ? '' : 'checked'}> Usar chaves da Pluggy guardadas neste aparelho (em vez do servidor)</label>
        ${cloud ? '' : `<div class="form" style="margin-top:12px">
          <label class="field full"><span>Client ID</span><input class="input" id="pcid" value="${U.esc(OpenFinance.cfg().clientId)}" autocomplete="off" spellcheck="false"></label>
          <label class="field full"><span>Client Secret</span><input class="input" id="pcs" type="password" value="${U.esc(OpenFinance.cfg().clientSecret)}" autocomplete="off" spellcheck="false"></label></div>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="psave">${icon('check')}Salvar e testar</button>${OpenFinance.directConfigured() ? '<span class="badge pos">Configurado</span><span class="spacer"></span><button class="btn sm danger" id="pclear">Apagar chaves</button>' : ''}</div>
          <p class="small muted">Neste modo as conexões são adicionadas pelo ID (Meu Pluggy) e ficam só neste aparelho.</p>`}
      </div></details>`;

    if (cloud) {
      let top;
      if (!Sync.configured() || !Sync.loggedIn()) {
        top = `<div class="card" style="text-align:center;padding:28px">${icon('bancos')}<h3 style="margin:10px 0 6px">Entre no app para usar o Open Finance</h3>
          <p class="muted small" style="max-width:520px;margin:0 auto 14px">O Open Finance usa o mesmo login da sincronização. As chaves da Pluggy ficam guardadas no seu servidor (Supabase), nunca no aparelho.</p>
          <a class="btn primary" href="#/config">Ir para Configurações → Sincronização</a></div>`;
      } else if (!srv.checked) {
        if (!srv.loading) setTimeout(checkServer, 0);
        top = '<div class="card"><p class="muted">Verificando o servidor…</p></div>';
      } else if (srv.ok && !srv.configured) {
        top = `<div class="card">
          <h3>${icon('shield')} Cadastre as chaves da Pluggy (só uma vez)</h3>
          <p class="small">As chaves ficam guardadas <b>no seu servidor</b> e não ficam no aparelho. Depois disso, em qualquer aparelho, basta tocar em <b>Conectar banco</b>.</p>
          <div class="help small"><b>Onde encontrar:</b><ol>
            <li>Entre em <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener">dashboard.pluggy.ai</a> (é o painel de desenvolvedor, diferente do meu.pluggy.ai). Use "Sign up" se ainda não tiver conta.</li>
            <li>No menu <b>Applications</b>, abra (ou crie) a sua aplicação. Na lista de conectores dela, inclua o <b>MeuPluggy</b>.</li>
            <li>Na página da aplicação, crie uma <b>Development Application</b>. Ela mostra o <b>Client ID</b> e o <b>Client Secret</b>.</li>
            <li>Cole os dois abaixo e clique em <b>Salvar no servidor</b>. O servidor confere as chaves com a Pluggy antes de salvar.</li></ol></div>
          <div class="form" style="margin-top:12px">
            <label class="field full"><span>Client ID</span><input class="input" id="skid" autocomplete="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>
            <label class="field full"><span>Client Secret</span><input class="input" id="sksec" type="password" autocomplete="off" spellcheck="false"></label>
          </div>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="sksave">${icon('check')}Salvar no servidor</button><button class="btn ghost" id="precheck">${icon('sync')}Verificar de novo</button></div>
        </div>`;
      } else if (!srv.ok) {
        const semFuncao = /não foi publicada/i.test(srv.err);
        top = `<div class="card"><h3>${icon('alert')} Não foi possível usar o servidor do Open Finance</h3>
          <p class="small neg">${U.esc(srv.err)}</p>
          ${semFuncao ? `<div class="help small">A função "pluggy" precisa estar publicada no seu Supabase. Veja a seção Open Finance do LEIA-ME.</div>` : ''}
          <button class="btn" id="precheck">${icon('sync')}Verificar de novo</button></div>`;
      } else {
        top = `<div class="card">
          <div class="row between"><div><h3 style="margin:0">Seus bancos</h3><span class="small muted">Conectado como ${U.esc((Sync.session() || {}).user ? Sync.session().user.email : '')} • as conexões aparecem em todos os seus aparelhos</span></div>
            <div class="row">${items.length ? `<button class="btn" id="psyncall" ${syncing ? 'disabled' : ''}>${icon('sync')}${syncing ? 'Sincronizando…' : 'Sincronizar tudo'}</button>` : ''}<button class="btn primary" id="pconnect">${icon('plus')}Conectar banco</button></div></div>
          ${syncing ? `<p class="small muted">${U.esc(syncing)}</p>` : ''}
          ${U.isNative() ? `<div class="note warn" style="margin:12px 0">${icon('alert')}<div><b>No celular, a autorização do banco pode não voltar para o app.</b> Se a tela da Pluggy mostrar erro, faça a conexão pelo <b>app do Windows</b> (as conexões aparecem aqui automaticamente) ou vincule pelo ID logo abaixo.</div></div>` : ''}
          ${items.length ? items.map(itemCard).join('') : `<div class="empty">Nenhum banco conectado ainda.<br>Toque em <b>Conectar banco</b>, escolha <b>MeuPluggy</b> (ou o seu banco) e autorize.</div>`}
          <label class="check small" style="margin-top:12px"><input type="checkbox" id="pauto" ${Store.getMeta('pluggy_autosync', true) !== false ? 'checked' : ''}> Sincronizar automaticamente ao abrir o app (no máximo a cada 6 horas)</label>
          ${srv.canLink ? `<details style="margin-top:10px"${U.isNative() ? ' open' : ''}><summary class="small muted" style="cursor:pointer">Já conectei um banco no Meu Pluggy: vincular pelo ID</summary>
            <p class="small muted" style="margin:8px 0 0">Em dashboard.pluggy.ai, conecte o MeuPluggy pela aplicação <b>Demo</b> e copie o ID da conexão criada.</p>
            <div class="row" style="margin-top:8px"><input class="input" id="pitem" placeholder="ID da conexão (item)" style="width:320px;max-width:100%" spellcheck="false"><button class="btn" id="padd">${icon('plus')}Vincular</button></div></details>` : ''}
        </div>`;
      }
      return intro + (web ? `<div class="note warn" style="margin-bottom:18px">${icon('alert')}<div>Na versão de navegador a tela do banco pode ser bloqueada. Prefira o aplicativo do <b>Windows</b> ou do <b>Android</b>.</div></div>` : '') + top + adv;
    }

    // modo avançado (chaves no aparelho)
    return intro + `${OpenFinance.directConfigured() ? `
    <div class="card">
      <div class="row between"><h3>Conexões (bancos)</h3>
        <div class="row"><input class="input" id="pitem" placeholder="ID da conexão (item)" style="width:320px;max-width:100%" spellcheck="false"><button class="btn primary" id="padd">${icon('plus')}Adicionar</button></div></div>
      ${items.length ? items.map(itemCard).join('') : '<p class="empty">Nenhuma conexão adicionada. Cole acima o ID da conexão mostrado no Meu Pluggy.</p>'}
    </div>` : ''}` + adv;
  }

  function itemCard(it) {
    const c = cache[it.id] || {};
    const st = STATUS[(c.item && c.item.status) || it.status] || ['', (c.item && c.item.status) || it.status || '—'];
    const accs = c.accounts || [];
    const links = OpenFinance.links();
    return `<div class="card" style="box-shadow:none;background:var(--soft)">
      <div class="row between">
        <div><h4 style="margin:0;font-size:16px">${U.esc((c.item && c.item.connector && c.item.connector.name) || it.name)}</h4>
          <span class="small muted">Conexão ${U.esc(it.id.slice(0, 8))}… • atualizado em ${dt((c.item && c.item.lastUpdatedAt) || it.lastUpdatedAt)}${c.item && c.item.consentExpiresAt ? ' • consentimento até ' + dt(c.item.consentExpiresAt).slice(0, 10) : ''}</span></div>
        <div class="row"><span class="badge ${st[0]}">${st[1]}</span>
          <button class="btn sm primary" data-syncitem="${it.id}" ${syncing ? 'disabled' : ''}>${icon('sync')}Sincronizar</button>
          <button class="btn sm" data-load="${it.id}">${icon('sync')}${c.accounts ? 'Recarregar' : 'Carregar contas'}</button>
          <button class="btn sm" data-refresh="${it.id}" title="Pedir ao banco dados novos">Atualizar no banco</button>
          ${OpenFinance.cloud() ? `<button class="btn sm" data-reconnect="${it.id}" title="Renovar a autorização no banco">Reconectar</button>` : ''}
          <button class="btn sm" data-loans="${it.id}">${icon('dividas')}Empréstimos</button>
          <button class="btn sm ghost danger" data-del="${it.id}" title="Remover conexão">${icon('trash')}</button></div>
      </div>
      ${c.loading ? '<p class="muted">Carregando…</p>' : ''}
      ${c.err ? `<p class="neg small">${U.esc(c.err)}</p>` : ''}
      ${c.item && c.item.status === 'LOGIN_ERROR' ? '<p class="small warn">O banco pediu nova autorização. Reconecte este banco no Meu Pluggy.</p>' : ''}
      ${accs.length ? `<div class="tablewrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Conta no banco</th><th>Tipo</th><th class="right">Saldo no banco</th><th>Conta no app</th><th>Desde</th><th></th></tr></thead><tbody>
        ${accs.map((a) => { const loc = links[a.id] && Store.get('accounts', links[a.id]) ? links[a.id] : ''; const since = (Store.getMeta('pluggy_since', {})[a.id]) || U.addDays(U.today(), -90);
          return `<tr><td><b>${U.esc(OpenFinance.accLabel(a))}</b>${a.owner ? `<br><small class="muted">${U.esc(a.owner)}</small>` : ''}</td>
          <td class="small">${a.type === 'CREDIT' ? 'Cartão de crédito' : a.subtype === 'SAVINGS_ACCOUNT' ? 'Poupança' : 'Conta corrente'}</td>
          <td class="right money">${U.money(Math.round((a.balance || 0) * 100) * (a.type === 'CREDIT' ? -1 : 1))}</td>
          <td style="min-width:200px"><select class="input" data-link="${a.id}">${UI.opt('', '— escolher —', loc)}${UI.opt('__new', '+ Criar conta nova', '')}${UI.accountOptions(loc)}</select></td>
          <td><input class="input" type="date" data-since="${a.id}" value="${since}" style="width:150px"></td>
          <td class="right"><button class="btn sm primary" data-imp="${it.id}|${a.id}" ${loc && !busy.has(a.id) ? '' : 'disabled'}>${busy.has(a.id) ? 'Buscando…' : icon('importar') + 'Importar lançamentos'}</button></td></tr>`; }).join('')}
      </tbody></table></div>` : (c.accounts ? '<p class="empty">Nenhuma conta nesta conexão.</p>' : '')}
    </div>`;
  }

  async function load(id) {
    cache[id] = { ...(cache[id] || {}), loading: true, err: null }; App.render();
    try {
      const item = await OpenFinance.fetchItem(id); await OpenFinance.saveItemInfo(item);
      const accounts = await OpenFinance.fetchAccounts(id);
      cache[id] = { item, accounts };
    } catch (e) { cache[id] = { ...(cache[id] || {}), loading: false, err: e.message }; }
    App.render();
  }

  async function importAcc(itemId, accId) {
    const c = cache[itemId]; const a = c.accounts.find((x) => x.id === accId);
    const localId = OpenFinance.links()[accId]; const local = Store.get('accounts', localId);
    if (!local) return UI.toast('Escolha a conta do app.', 'error');
    const sinceEl = document.querySelector(`[data-since="${accId}"]`); const since = (sinceEl && sinceEl.value) || U.addDays(U.today(), -90);
    busy.add(accId); App.render();
    try {
      const txs = await OpenFinance.fetchTransactions(accId, since);
      const { rows, pending } = OpenFinance.rowsFrom(txs);
      const sinceMap = { ...Store.getMeta('pluggy_since', {}) }; sinceMap[accId] = U.addDays(U.today(), -10); await Store.setMeta('pluggy_since', sinceMap);
      busy.delete(accId);
      if (!rows.length) { App.render(); return UI.toast(`Nenhum lançamento desde ${U.fmtDate(since)}${pending ? ` (${pending} ainda pendente(s) no banco)` : ''}.`, '', 5000); }
      if ((a.type === 'CREDIT') !== (local.type === 'cartao')) UI.toast('Atenção: o tipo da conta do banco é diferente do tipo da conta do app.', 'error', 6000);
      const info = a.type !== 'CREDIT' && typeof a.balance === 'number' ? { balance: Math.round(a.balance * 100), balanceDate: U.today() } : null;
      Views.importar.loadRows(local.id, rows, {
        fileName: `Open Finance • ${(c.item && c.item.connector && c.item.connector.name) || ''} • ${OpenFinance.accLabel(a)}`.trim(), info,
        note: `Lançamentos desde ${U.fmtDate(since)} trazidos pelo Open Finance. ${pending ? pending + ' lançamento(s) ainda pendente(s) no banco ficaram de fora e virão quando forem confirmados. ' : ''}Os que já existem no app aparecem desmarcados.`,
      });
    } catch (e) { busy.delete(accId); App.render(); UI.toast(e.message, 'error', 7000); }
  }

  async function loans(itemId) {
    const it = OpenFinance.items().find((x) => x.id === itemId);
    let list;
    try { UI.toast('Buscando empréstimos e financiamentos…'); list = await OpenFinance.fetchLoans(itemId); }
    catch (e) { return UI.toast(e.message, 'error', 7000); }
    const bank = (cache[itemId] && cache[itemId].item && cache[itemId].item.connector && cache[itemId].item.connector.name) || (it && it.name) || '';
    const ds = list.map((l) => OpenFinance.loanToDebt(l, bank));
    if (!ds.length) return UI.toast('O banco não informou empréstimos ou financiamentos nesta conexão.', '', 5000);
    const existing = Store.all('debts');
    UI.modal({
      title: 'Empréstimos encontrados — ' + bank, wide: true,
      body: `<p class="small">Confira e ajuste antes de salvar. Os itens vão para <b>Endividamento</b>. Importar de novo atualiza o mesmo contrato, sem duplicar.</p>
        <div class="tablewrap"><table class="tbl"><thead><tr><th></th><th>Contrato</th><th>Tipo</th><th class="right">Saldo devedor (R$)</th><th class="right">Parcela (R$)</th><th class="right">Restam</th><th class="right">Juros a.m.</th><th></th></tr></thead><tbody>
        ${ds.map((d, i) => `<tr data-i="${i}"><td><input type="checkbox" ${d.balance === null ? '' : 'checked'}></td><td><b>${U.esc(d.name)}</b>${d.contract ? `<br><small class="muted">${U.esc(d.contract)}</small>` : ''}${d.late ? ' <span class="badge neg">parcela vencida</span>' : ''}</td>
          <td><select class="input" data-f="k">${Object.entries(Debts.KINDS).map(([k, v]) => UI.opt(k, v, d.kind)).join('')}</select></td>
          <td class="right"><input class="input right" data-f="b" value="${d.balance === null ? '' : U.num(d.balance)}" placeholder="informe" style="max-width:130px"></td>
          <td class="right"><input class="input right" data-f="p" value="${d.installment ? U.num(d.installment) : ''}" placeholder="0,00" style="max-width:120px"></td>
          <td class="right">${d.remaining ?? '—'}</td><td class="right">${d.rate ? d.rate.toLocaleString('pt-BR') + '%' : '—'}</td>
          <td>${existing.some((x) => x.src_key === d.key) ? '<span class="badge info">atualiza</span>' : '<span class="badge pos">nova</span>'}</td></tr>`).join('')}
        </tbody></table></div><p class="small muted">A parcela é estimada (saldo ÷ parcelas restantes) quando o banco não informa o valor. Ajuste se necessário.</p>`,
      actions: [{ label: 'Cancelar' }, { label: 'Salvar em Endividamento', cls: 'primary', onClick: async (b) => {
        const out = [];
        for (const tr of $$('tr[data-i]', b)) {
          if (!$('input[type=checkbox]', tr).checked) continue;
          const d = { ...ds[+tr.dataset.i] };
          const bal = U.parseMoney($('[data-f="b"]', tr).value); const p = U.parseMoney($('[data-f="p"]', tr).value || '0');
          if (bal === null || bal < 0 || p === null || p < 0) { UI.toast('Valor inválido em "' + d.name + '".', 'error'); return false; }
          d.balance = bal; d.installmentEdited = p; d.kind = $('[data-f="k"]', tr).value; out.push(d);
        }
        if (!out.length) { UI.toast('Nada selecionado.', 'error'); return false; }
        const n = await OpenFinance.saveLoans(out);
        UI.toast(`${n} empréstimo(s) salvos em Endividamento`, 'ok', 4500);
      } }],
    });
  }

  function bind(root) {
    const pm = $('#pmode', root); if (pm) pm.onchange = async () => { await Store.setMeta('pluggy_mode', pm.checked ? 'direto' : 'nuvem'); Object.keys(cache).forEach((k) => delete cache[k]); srv.checked = false; App.render(); };
    const rc = $('#precheck', root); if (rc) rc.onclick = () => { srv.checked = false; App.render(); };
    const sk = $('#sksave', root);
    if (sk) sk.onclick = async () => {
      const id = $('#skid', root).value.trim(), sec = $('#sksec', root).value.trim();
      if (!id || !sec) return UI.toast('Preencha o Client ID e o Client Secret.', 'error');
      sk.disabled = true;
      try { await OpenFinance.setServerKeys(id, sec); UI.toast('Chaves conferidas e salvas no servidor ✔', 'ok', 5000); srv.checked = false; }
      catch (e) { UI.toast(e.message, 'error', 8000); }
      finally { sk.disabled = false; App.render(); }
    };
    const pc = $('#pconnect', root);
    if (pc) pc.onclick = async () => {
      pc.disabled = true;
      try {
        const r = await OpenFinance.connect();
        if (r && r.item) { UI.toast(`Banco conectado: ${(r.item.connector && r.item.connector.name) || r.item.name || ''}. Importando lançamentos…`, 'ok', 5000); pc.disabled = false; await runSync(r.item.id); await load(r.item.id); }
      } catch (e) { UI.toast(e.message, 'error', 8000); }
      finally { pc.disabled = false; App.render(); }
    };
    $$('[data-reconnect]', root).forEach((b) => (b.onclick = async () => {
      try { const r = await OpenFinance.connect({ updateItem: b.dataset.reconnect }); if (r) { UI.toast('Conexão renovada', 'ok'); await load(b.dataset.reconnect); } }
      catch (e) { UI.toast(e.message, 'error', 8000); }
    }));
    const ps = $('#psave', root);
    if (ps) ps.onclick = async () => {
      const id = $('#pcid', root).value.trim(), sec = $('#pcs', root).value.trim();
      if (!id || !sec) return UI.toast('Preencha o Client ID e o Client Secret.', 'error');
      await OpenFinance.setConfig(id, sec);
      try { await OpenFinance.test(); UI.toast('Conectado à Pluggy ✔', 'ok'); } catch (e) { UI.toast(e.message, 'error', 7000); }
      App.render();
    };
    const cl = $('#pclear', root); if (cl) cl.onclick = async () => { if (await UI.confirm('Remover as credenciais e as conexões deste aparelho? Os lançamentos já importados continuam no app.', { danger: true, ok: 'Desconectar' })) { await OpenFinance.clearAll(); Object.keys(cache).forEach((k) => delete cache[k]); App.render(); } };
    const add = $('#padd', root);
    if (add) {
      const go = async () => {
        const v = $('#pitem', root).value.trim(); if (!v) return UI.toast('Cole o ID da conexão.', 'error');
        add.disabled = true;
        try { const it = await OpenFinance.addItem(v); UI.toast(`Conexão adicionada: ${(it.connector && it.connector.name) || 'banco'}`, 'ok'); await load(it.id); }
        catch (e) { UI.toast(e.message, 'error', 7000); add.disabled = false; }
      };
      add.onclick = go; $('#pitem', root).onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
    $$('[data-load]', root).forEach((b) => (b.onclick = () => load(b.dataset.load)));
    $$('[data-syncitem]', root).forEach((b) => (b.onclick = () => runSync(b.dataset.syncitem)));
    const sa = $('#psyncall', root); if (sa) sa.onclick = () => runSync(null);
    const pa = $('#pauto', root); if (pa) pa.onchange = () => Store.setMeta('pluggy_autosync', pa.checked);
    $$('[data-refresh]', root).forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { const it = await OpenFinance.refreshItem(b.dataset.refresh); if (it) await OpenFinance.saveItemInfo(it); UI.toast('Atualização pedida ao banco. Em alguns minutos clique em "Recarregar".', 'ok', 6000); if (it) { cache[b.dataset.refresh] = { ...(cache[b.dataset.refresh] || {}), item: it }; } App.render(); }
      catch (e) { b.disabled = false; UI.toast(e.message, 'error', 8000); }
    }));
    $$('[data-loans]', root).forEach((b) => (b.onclick = () => loans(b.dataset.loans)));
    $$('[data-del]', root).forEach((b) => (b.onclick = async () => {
      if (OpenFinance.cloud()) {
        const v = await UI.choose('Remover esta conexão? Os lançamentos já importados continuam no app.', [{ v: 'app', label: 'Só do app' }, { v: 'tudo', label: 'Do app e da Pluggy (revoga o acesso)', cls: 'danger' }], 'Remover conexão');
        if (!v) return;
        try { await OpenFinance.removeItem(b.dataset.del, { deleteAtPluggy: v === 'tudo' }); delete cache[b.dataset.del]; UI.toast('Conexão removida', 'ok'); } catch (e) { UI.toast(e.message, 'error', 6000); }
        return App.render();
      }
      if (await UI.confirm('Remover esta conexão do app? (No Meu Pluggy ela continua ativa.)', { danger: true, ok: 'Remover' })) { await OpenFinance.removeItem(b.dataset.del); delete cache[b.dataset.del]; App.render(); }
    }));
    $$('[data-link]', root).forEach((s) => (s.onchange = async () => {
      const accId = s.dataset.link;
      if (s.value === '__new') {
        const itemId = Object.keys(cache).find((k) => (cache[k].accounts || []).some((a) => a.id === accId));
        const a = cache[itemId].accounts.find((x) => x.id === accId);
        const rec = await OpenFinance.createLocalAccount(a, cache[itemId].item);
        await OpenFinance.link(accId, rec.id); UI.toast(`Conta "${rec.name}" criada e vinculada`, 'ok');
      } else await OpenFinance.link(accId, s.value || null);
      App.render();
    }));
    $$('[data-since]', root).forEach((i) => (i.onchange = async () => { if (!/^\d{4}-\d{2}-\d{2}$/.test(i.value)) return; const m = { ...Store.getMeta('pluggy_since', {}) }; m[i.dataset.since] = i.value; await Store.setMeta('pluggy_since', m); }));
    $$('[data-imp]', root).forEach((b) => (b.onclick = () => { const [itemId, accId] = b.dataset.imp.split('|'); importAcc(itemId, accId); }));
    // carrega as contas automaticamente na primeira visita
    OpenFinance.items().forEach((it) => { if (!cache[it.id] && OpenFinance.configured()) { cache[it.id] = { loading: true }; setTimeout(() => load(it.id), 0); } });
  }

  return { title: 'Open Finance', render, bind, live: false, runSync };
})();
