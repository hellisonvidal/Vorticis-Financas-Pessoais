'use strict';
/* Open Finance (Pluggy – plano gratuito Meu Pluggy): conectar, vincular contas e importar lançamentos e empréstimos */
Views.bancos = (() => {
  const { $, $$, icon } = UI;
  const cache = {}; // itemId -> { item, accounts, err, loading }
  const busy = new Set();
  const STATUS = { UPDATED: ['pos', 'Atualizado'], UPDATING: ['info', 'Atualizando…'], OUTDATED: ['warn', 'Desatualizado'], LOGIN_ERROR: ['neg', 'Precisa reconectar'], WAITING_USER_INPUT: ['warn', 'Aguardando você'], WAITING_USER_ACTION: ['warn', 'Aguardando você'], MERGING: ['info', 'Processando'] };
  const dt = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };

  function render() {
    const c = OpenFinance.cfg(); const items = OpenFinance.items();
    const web = !U.isNative() && !globalThis.desktop;
    return `
    <div class="note" style="margin-bottom:18px">${icon('shield')}<div><b>Duas formas de trazer os extratos:</b>
      <b>1) Open Finance</b> (esta tela): os lançamentos vêm direto do banco, pela Pluggy, no plano gratuito para uso pessoal (Meu Pluggy).
      <b>2) Arquivo OFX/CSV/Excel/PDF</b>, em <a href="#/importar">Importar extrato</a>, que funciona sem cadastro em nenhum serviço.
      Nos dois casos você revisa antes de salvar, e o que já existe não é duplicado.</div></div>
    ${web ? `<div class="note warn" style="margin-bottom:18px">${icon('alert')}<div>No navegador, a conexão pode ser bloqueada por segurança (CORS). Para o Open Finance, prefira o aplicativo do <b>Windows</b> ou do <b>Android</b>.</div></div>` : ''}
    <div class="grid g2">
      <div class="card">
        <h3>1. Credenciais da Pluggy</h3>
        <div class="form">
          <label class="field full"><span>Client ID</span><input class="input" id="pcid" value="${U.esc(c.clientId)}" autocomplete="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>
          <label class="field full"><span>Client Secret</span><input class="input" id="pcs" type="password" value="${U.esc(c.clientSecret)}" autocomplete="off" spellcheck="false"></label>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="psave">${icon('check')}Salvar e testar</button>${OpenFinance.configured() ? `<span class="badge pos">Configurado</span><span class="spacer"></span><button class="btn sm danger" id="pclear">Desconectar</button>` : ''}</div>
        <p class="small muted" style="margin-bottom:0">As credenciais ficam guardadas <b>somente neste aparelho</b> e não são enviadas para a nuvem de sincronização. Configure em cada aparelho que for usar o Open Finance.</p>
      </div>
      <div class="card help">
        <h3>Como configurar (uma vez)</h3>
        <ol>
          <li>Crie sua conta grátis no <a href="https://meu.pluggy.ai" target="_blank" rel="noopener">Meu Pluggy</a> e conecte seus bancos. A autorização é feita no app do próprio banco (Open Finance oficial).</li>
          <li>No <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener">painel da Pluggy</a>, com a mesma conta, crie uma aplicação e copie o <b>Client ID</b> e o <b>Client Secret</b>.</li>
          <li>Copie o <b>ID de cada conexão</b> (chamado de "item") que aparece no Meu Pluggy e adicione abaixo. No plano grátis o app não consegue listar as conexões sozinho.</li>
          <li>Vincule cada conta do banco a uma conta do app (ou crie uma nova) e clique em <b>Importar lançamentos</b>.</li>
        </ol>
        <p class="small muted" style="margin:0">A Pluggy atualiza os dados do banco periodicamente. O consentimento do Open Finance tem validade e precisa ser renovado no Meu Pluggy quando vencer.</p>
      </div>
    </div>
    ${OpenFinance.configured() ? `
    <div class="card" style="margin-top:18px">
      <div class="row between"><h3>2. Conexões (bancos)</h3>
        <div class="row"><input class="input" id="pitem" placeholder="ID da conexão (item)" style="width:320px;max-width:100%" spellcheck="false"><button class="btn primary" id="padd">${icon('plus')}Adicionar</button></div></div>
      ${items.length ? items.map(itemCard).join('') : '<p class="empty">Nenhuma conexão adicionada. Cole acima o ID da conexão mostrado no Meu Pluggy.</p>'}
    </div>` : ''}`;
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
          <button class="btn sm" data-load="${it.id}">${icon('sync')}${c.accounts ? 'Recarregar' : 'Carregar contas'}</button>
          <button class="btn sm" data-refresh="${it.id}" title="Pedir ao banco dados novos">Atualizar no banco</button>
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
    $('#psave', root).onclick = async () => {
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
    $$('[data-refresh]', root).forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { const it = await OpenFinance.refreshItem(b.dataset.refresh); if (it) await OpenFinance.saveItemInfo(it); UI.toast('Atualização pedida ao banco. Em alguns minutos clique em "Recarregar".', 'ok', 6000); if (it) { cache[b.dataset.refresh] = { ...(cache[b.dataset.refresh] || {}), item: it }; } App.render(); }
      catch (e) { b.disabled = false; UI.toast(e.message, 'error', 8000); }
    }));
    $$('[data-loans]', root).forEach((b) => (b.onclick = () => loans(b.dataset.loans)));
    $$('[data-del]', root).forEach((b) => (b.onclick = async () => { if (await UI.confirm('Remover esta conexão do app? (No Meu Pluggy ela continua ativa.)', { danger: true, ok: 'Remover' })) { await OpenFinance.removeItem(b.dataset.del); delete cache[b.dataset.del]; App.render(); } }));
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

  return { title: 'Open Finance', render, bind, live: false };
})();
