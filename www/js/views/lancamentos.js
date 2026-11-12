'use strict';
/* Lançamentos: lista com filtros, seleção em lote e formulário */
Views.lancamentos = (() => {
  const { $, $$, icon, esc } = { ...UI, esc: U.esc };
  const f = { mode: 'month', month: null, from: '', to: '', account: '', category: '', type: '', status: '', q: '' };
  const sel = new Set();
  let limit = 300;

  function setFilter(o) { Object.assign(f, { account: '', category: '', type: '', status: '', q: '' }, o); sel.clear(); limit = 300; }

  function range() {
    if (f.mode === 'all') return ['0000-01-01', '9999-12-31'];
    if (f.mode === 'range') return [f.from || '0000-01-01', f.to || '9999-12-31'];
    const ym = f.month || App.state.month; return [U.monthStart(ym), U.monthEnd(ym)];
  }
  function filtered() {
    const [from, to] = range(); const q = U.norm(f.q);
    const qMoney = U.parseMoney(f.q);
    return F.txs().filter((t) => {
      if (t.date < from || t.date > to) return false;
      if (f.account && t.account_id !== f.account && t.to_account_id !== f.account) return false;
      if (f.category && (f.category === '__none' ? t.category_id || t.type === 'transferencia' : t.category_id !== f.category)) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.status && (t.status || 'efetivada') !== f.status) return false;
      if (q) {
        const hay = U.norm([t.description, t.notes, (t.tags || []).join(' '), F.catName(t.category_id), F.accName(t.account_id)].join(' '));
        if (!hay.includes(q) && !(qMoney !== null && Math.abs(qMoney) === t.amount)) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''));
  }

  function signed(t, accId) {
    if (t.type === 'transferencia') return accId ? F.effect(t, accId) : 0;
    return t.type === 'receita' ? t.amount : -t.amount;
  }
  function row(t, { accId = null, check = true } = {}) {
    const isT = t.type === 'transferencia';
    const v = signed(t, accId);
    const cat = isT ? 'Transferência' : F.catName(t.category_id);
    const color = isT ? '#2563eb' : F.catColor(t.category_id);
    const where = isT ? `${F.accName(t.account_id)} → ${F.accName(t.to_account_id)}` : F.accName(t.account_id);
    const pend = t.status === 'pendente';
    return `<li class="tx ${pend ? 'pend' : ''}" data-id="${t.id}">
      ${check ? `<input type="checkbox" data-sel="${t.id}" ${sel.has(t.id) ? 'checked' : ''} aria-label="Selecionar">` : ''}
      <span class="ic" style="background:${esc(color)}">${isT ? icon('transfer') : UI.initials(cat)}</span>
      <span class="info"><b>${esc(t.description)}</b><small>${esc(cat)} • ${esc(where)}${t.tags && t.tags.length ? ' • #' + t.tags.map(esc).join(' #') : ''}</small></span>
      <span class="val"><span class="money ${isT && !accId ? '' : UI.moneyClass(v)}">${isT && !accId ? U.money(t.amount) : U.money(v)}</span>
      ${pend ? `<small><button class="badge warn" data-toggle="${t.id}" title="Marcar como efetivado">${t.date < U.today() ? 'atrasado' : 'pendente'}</button></small>` : ''}</span>
    </li>`;
  }
  function groupedList(list, opts = {}) {
    if (!list.length) return '<p class="empty">Nenhum lançamento encontrado.</p>';
    let h = '<ul class="txlist">'; let day = null; let dayTotal = 0; let buf = '';
    const flush = () => { if (day) h += `<li class="txday"><span>${U.fmtDate(day)} • ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][U.parseISO(day).getDay()]}</span><span class="money">${opts.accId || !opts.noTotals ? U.money(dayTotal) : ''}</span></li>` + buf; buf = ''; dayTotal = 0; };
    list.forEach((t) => { if (t.date !== day) { flush(); day = t.date; } buf += row(t, opts); dayTotal += signed(t, opts.accId); });
    flush();
    return h + '</ul>';
  }

  function render() {
    if (!f.month) f.month = App.state.month;
    const list = filtered();
    const rec = list.filter((t) => t.type === 'receita').reduce((a, t) => a + t.amount, 0);
    const desp = list.filter((t) => t.type === 'despesa').reduce((a, t) => a + t.amount, 0);
    const shown = list.slice(0, limit);
    const types = Object.entries(F.TX_TYPES).map(([k, v]) => UI.opt(k, v, f.type)).join('');
    return `
    <div class="filters">
      <div class="seg" data-mode>${[['month', 'Mês'], ['range', 'Período'], ['all', 'Tudo']].map(([k, v]) => `<button data-v="${k}" class="${f.mode === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      ${f.mode === 'month' ? monthNav(f.month) : ''}
      ${f.mode === 'range' ? `<input type="date" class="input" data-f="from" value="${esc(f.from)}" aria-label="De"><input type="date" class="input" data-f="to" value="${esc(f.to)}" aria-label="Até">` : ''}
    </div>
    <div class="filters">
      <input class="input search" data-f="q" placeholder="Buscar descrição, categoria, valor…" value="${esc(f.q)}">
      <select class="input" data-f="account">${UI.accountOptions(f.account, { all: true, archived: true })}</select>
      <select class="input" data-f="category">${UI.opt('', 'Todas as categorias', f.category)}${UI.opt('__none', 'Sem categoria', f.category)}${F.categories().map((c) => UI.opt(c.id, c.name, f.category)).join('')}</select>
      <select class="input" data-f="type">${UI.opt('', 'Todos os tipos', f.type)}${types}</select>
      <select class="input" data-f="status">${UI.opt('', 'Todos os status', f.status)}${UI.opt('efetivada', 'Efetivados', f.status)}${UI.opt('pendente', 'Pendentes', f.status)}</select>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Lançamentos</span><b>${list.length}</b></div>
      <div class="kpi"><span>Receitas</span><b class="money pos">${U.money(rec)}</b></div>
      <div class="kpi"><span>Despesas</span><b class="money neg">${U.money(desp)}</b></div>
      <div class="kpi"><span>Resultado</span><b class="money ${UI.moneyClass(rec - desp)}">${U.money(rec - desp)}</b></div>
    </div>
    ${sel.size ? `<div class="selbar row"><b>${sel.size} selecionado(s)</b><span class="spacer"></span>
      <button class="btn sm" data-bulk="done">${icon('check')}Efetivar</button><button class="btn sm" data-bulk="pend">Pendente</button>
      <button class="btn sm" data-bulk="cat">Categoria…</button><button class="btn sm" data-bulk="acc">Conta…</button><button class="btn sm danger" data-bulk="del">${icon('trash')}Excluir</button><button class="btn sm ghost" data-bulk="clear">Limpar</button></div>` : ''}
    <div class="card">
      <div class="row between" style="margin-bottom:4px">
        <label class="check small"><input type="checkbox" data-selall ${shown.length && shown.every((t) => sel.has(t.id)) ? 'checked' : ''}> Selecionar todos</label>
        <div class="row"><button class="btn sm" data-exp="pdf">${icon('pdf')}PDF</button><button class="btn sm" data-exp="xlsx">${icon('sheet')}Excel</button><button class="btn sm" data-exp="csv">CSV</button><button class="btn sm primary" data-new>${icon('plus')}Novo</button></div>
      </div>
      ${groupedList(shown, { accId: f.account || null })}
      ${list.length > limit ? `<div class="center" style="margin-top:10px"><button class="btn" data-more>Mostrar mais (${list.length - limit} restantes)</button></div>` : ''}
    </div>`;
  }

  function bindList(root, accId) {
    root.addEventListener('click', async (e) => {
      const tg = e.target.closest('[data-toggle]');
      if (tg) { e.stopPropagation(); const t = Store.get('transactions', tg.dataset.toggle); await Store.upsert('transactions', { ...t, status: 'efetivada' }); UI.toast('Marcado como efetivado', 'ok'); return; }
      if (e.target.matches('[data-sel]')) { e.stopPropagation(); return; }
      const li = e.target.closest('.tx[data-id]');
      if (li) form(Store.get('transactions', li.dataset.id), {}, accId);
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-sel]')) { e.target.checked ? sel.add(e.target.dataset.sel) : sel.delete(e.target.dataset.sel); App.render(); }
    });
  }

  function bind(root) {
    bindMonthNav(root, () => f.month, (v) => { f.month = v; App.state.month = v; });
    $$('[data-mode] button', root).forEach((b) => (b.onclick = () => { f.mode = b.dataset.v; if (f.mode === 'range' && !f.from) { f.from = U.monthStart(f.month); f.to = U.monthEnd(f.month); } App.render(); }));
    $$('[data-f]', root).forEach((el) => {
      const ev = el.dataset.f === 'q' ? 'input' : 'change';
      el.addEventListener(ev, U.debounce(() => { f[el.dataset.f] = el.value; limit = 300; App.render(); const q = $('[data-f=q]'); if (el.dataset.f === 'q' && q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, el.dataset.f === 'q' ? 300 : 0));
    });
    bindList(root, f.account || null);
    const more = $('[data-more]', root); if (more) more.onclick = () => { limit += 500; App.render(); };
    $('[data-new]', root).onclick = () => form(null, f.account ? { account_id: f.account } : {});
    const sa = $('[data-selall]', root);
    if (sa) sa.onchange = () => { const shown = filtered().slice(0, limit); if (sa.checked) shown.forEach((t) => sel.add(t.id)); else sel.clear(); App.render(); };
    $$('[data-bulk]', root).forEach((b) => (b.onclick = () => bulk(b.dataset.bulk)));
    $$('[data-exp]', root).forEach((b) => (b.onclick = () => exportList(b.dataset.exp)));
  }

  async function bulk(kind) {
    const ids = [...sel].filter((id) => Store.get('transactions', id));
    if (kind === 'clear') { sel.clear(); return App.render(); }
    if (kind === 'del') {
      if (!(await UI.confirm(`Excluir ${ids.length} lançamento(s)? Esta ação não pode ser desfeita.`, { ok: 'Excluir', danger: true }))) return;
      await Store.removeMany('transactions', ids); sel.clear(); UI.toast('Lançamentos excluídos', 'ok'); return;
    }
    if (kind === 'done' || kind === 'pend') {
      await Store.upsertMany('transactions', ids.map((id) => ({ ...Store.get('transactions', id), status: kind === 'done' ? 'efetivada' : 'pendente' })));
      sel.clear(); UI.toast('Status atualizado', 'ok'); return;
    }
    if (kind === 'cat') {
      UI.modal({
        title: 'Alterar categoria', body: `<label class="field"><span>Nova categoria (aplicada a receitas/despesas selecionadas)</span><select class="input" id="bc">${UI.categoryOptions(null, '', { none: true })}</select></label>`,
        actions: [{ label: 'Cancelar' }, { label: 'Aplicar', cls: 'primary', onClick: async (b) => {
          const c = $('#bc', b).value; const cat = c ? Store.get('categories', c) : null;
          const upd = ids.map((id) => Store.get('transactions', id)).filter((t) => t.type !== 'transferencia' && (!cat || cat.type === 'ambos' || cat.type === t.type)).map((t) => ({ ...t, category_id: c || null }));
          await Store.upsertMany('transactions', upd); sel.clear();
          UI.toast(`${upd.length} lançamento(s) atualizados` + (upd.length < ids.length ? ' (os de tipo incompatível foram ignorados)' : ''), 'ok', 4500);
        } }],
      });
    }
    if (kind === 'acc') {
      UI.modal({
        title: 'Mover para outra conta', body: `<label class="field"><span>Conta</span><select class="input" id="ba">${UI.accountOptions('')}</select></label><p class="small muted">Transferências não são alteradas.</p>`,
        actions: [{ label: 'Cancelar' }, { label: 'Mover', cls: 'primary', onClick: async (b) => {
          const a = $('#ba', b).value;
          const upd = ids.map((id) => Store.get('transactions', id)).filter((t) => t.type !== 'transferencia').map((t) => ({ ...t, account_id: a }));
          await Store.upsertMany('transactions', upd); sel.clear(); UI.toast(`${upd.length} lançamento(s) movidos`, 'ok');
        } }],
      });
    }
  }

  function exportList(fmt) {
    const list = filtered().slice().reverse();
    const [from, to] = range();
    const R = Reports.build('lancamentos', { from: '0000-01-01', to: '9999-12-31' });
    // substitui as linhas pela lista filtrada da tela
    const tbl = R.sections.find((s) => s.kind === 'table');
    const accId = f.account || null;
    tbl.rows = list.map((t) => [t.date, t.description, F.TX_TYPES[t.type], t.type === 'transferencia' ? `${F.accName(t.account_id)} → ${F.accName(t.to_account_id)}` : F.catName(t.category_id), t.type === 'transferencia' ? '' : F.accName(t.account_id), t.type === 'transferencia' ? (accId ? F.effect(t, accId) : t.amount) : signed(t), t.status === 'pendente' ? 'Pendente' : 'Efetivada']);
    const rec = list.filter((t) => t.type === 'receita').reduce((a, t) => a + t.amount, 0), desp = list.filter((t) => t.type === 'despesa').reduce((a, t) => a + t.amount, 0);
    R.sections[0].items = [{ label: 'Lançamentos', text: String(list.length) }, { label: 'Receitas', value: rec, cls: 'pos' }, { label: 'Despesas', value: desp, cls: 'neg' }, { label: 'Resultado', value: rec - desp, cls: rec - desp >= 0 ? 'pos' : 'neg' }];
    R.subtitle = [f.mode === 'all' ? 'Todo o período' : `${U.fmtDate(from)} a ${U.fmtDate(to)}`, f.account ? 'Conta: ' + F.accName(f.account) : '', f.q ? 'Busca: ' + f.q : ''].filter(Boolean).join(' • ');
    const name = 'lancamentos-' + U.fileStamp();
    const p = fmt === 'pdf' ? Reports.toPDF(R, name) : fmt === 'xlsx' ? Reports.toXLSX(R, name) : Reports.toCSV(R, name);
    Promise.resolve(p).then((r) => UI.toast(typeof r === 'string' ? 'Salvo em ' + r : 'Arquivo gerado', 'ok')).catch((e) => UI.toast(e.message, 'error'));
  }

  // ---------------- formulário ----------------
  function form(tx = null, preset = {}, ctxAccount = null) {
    const accs = F.accounts();
    if (!accs.length) { UI.toast('Cadastre uma conta primeiro.'); return Views.contas.form(); }
    const isNew = !tx;
    const lastAcc = Store.getMeta('last_account');
    const t = tx ? { ...tx } : { type: 'despesa', date: App.state.month === U.monthOf(U.today()) ? U.today() : U.monthStart(App.state.month), status: 'efetivada', account_id: ctxAccount || (Store.get('accounts', lastAcc) && !Store.get('accounts', lastAcc).archived ? lastAcc : accs[0].id), ...preset };
    if (!t.amount) t.amount = 0;
    let catTouched = !isNew && !!t.category_id;
    const learn = F.buildLearner();
    const descs = [...new Set(F.txs().map((x) => x.description))].slice(-400);
    const body = `
      <div class="seg" id="tt" style="margin-bottom:12px">${Object.entries(F.TX_TYPES).map(([k, v]) => `<button type="button" data-v="${k}" class="${t.type === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="form">
        <label class="field"><span>Valor (R$)</span><input class="input big" id="tv" inputmode="decimal" placeholder="0,00" value="${t.amount ? U.num(t.amount) : ''}" autocomplete="off"></label>
        <label class="field"><span>Data</span><input class="input" type="date" id="td" value="${t.date}" required></label>
        <label class="field full"><span>Descrição</span><input class="input" id="tds" list="tdl" value="${U.esc(t.description || '')}" placeholder="Ex.: Supermercado, Salário, Aluguel…" autocomplete="off"><datalist id="tdl">${descs.map((d) => `<option value="${U.esc(d)}">`).join('')}</datalist></label>
        <label class="field"><span id="tal">${t.type === 'transferencia' ? 'Conta de origem' : 'Conta'}</span><select class="input" id="ta">${UI.accountOptions(t.account_id, { archived: !!(tx && Store.get('accounts', t.account_id) && Store.get('accounts', t.account_id).archived) })}</select></label>
        <label class="field" id="tcw"><span>Categoria</span><select class="input" id="tc"></select></label>
        <label class="field" id="ttw"><span>Conta de destino</span><select class="input" id="tto">${UI.accountOptions(t.to_account_id || '', {})}</select></label>
        <div class="field"><span>Situação</span><label class="check" style="min-height:40px"><input type="checkbox" id="ts" ${t.status !== 'pendente' ? 'checked' : ''}> <span id="tsl"></span></label></div>
        ${isNew ? `<label class="field"><span>Repetir</span><select class="input" id="tr">${[['none', 'Não repetir'], ['parcelas', 'Parcelado (divide o valor)'], ['mensal', 'Todo mês (valor fixo)'], ['semanal', 'Toda semana'], ['quinzenal', 'A cada 15 dias'], ['anual', 'Todo ano']].map(([k, v]) => UI.opt(k, v, 'none')).join('')}</select></label>
        <label class="field" id="trcw" hidden><span id="trcl">Quantidade</span><input class="input" type="number" id="trc" min="2" max="360" value="2"></label>` : (t.group_id ? `<p class="full small muted">Este lançamento faz parte de uma série (${t.installment}/${t.installments}). As alterações valem só para ele.</p>` : '')}
        <label class="field full"><span>Observações</span><textarea class="input" id="tn" rows="2">${U.esc(t.notes || '')}</textarea></label>
        <label class="field full"><span>Etiquetas (separadas por vírgula)</span><input class="input" id="tg" value="${U.esc((t.tags || []).join(', '))}" placeholder="ex.: viagem, trabalho"></label>
      </div>
      <p class="err" id="terr"></p>`;
    const actions = [];
    if (!isNew) actions.push({ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: async () => !!(await removeTx(t)) });
    if (!isNew) actions.push({ label: 'Duplicar', onClick: () => { const c = { ...t }; delete c.id; delete c.group_id; delete c.installment; delete c.installments; delete c.fitid; setTimeout(() => form(null, { ...c, date: U.today() }), 0); } });
    actions.push({ label: 'Cancelar' });
    if (isNew) actions.push({ label: 'Salvar e novo', onClick: async (b) => { if (!(await save(b))) return false; setTimeout(() => form(null, { type: t.type, account_id: $('#ta', b).value, date: $('#td', b).value }), 0); } });
    actions.push({ label: 'Salvar', cls: 'primary', onClick: (b) => save(b) });

    UI.modal({ title: isNew ? 'Novo lançamento' : 'Editar lançamento', body, actions, onOpen: (b) => {
      const setType = (tp) => {
        t.type = tp;
        $$('#tt button', b).forEach((x) => x.classList.toggle('on', x.dataset.v === tp));
        $('#tcw', b).hidden = tp === 'transferencia'; $('#ttw', b).hidden = tp !== 'transferencia';
        $('#tal', b).textContent = tp === 'transferencia' ? 'Conta de origem' : 'Conta';
        const cur = $('#tc', b).value || t.category_id;
        $('#tc', b).innerHTML = UI.categoryOptions(tp, cur);
        if (!F.categories(tp).some((c) => c.id === cur)) $('#tc', b).value = '';
        updStatus();
        if (tp === 'transferencia') { const o = $('#tto', b); if (!o.value || o.value === $('#ta', b).value) { const other = F.accounts().find((a) => a.id !== $('#ta', b).value); if (other) o.value = other.id; } }
      };
      const updStatus = () => { $('#tsl', b).textContent = $('#ts', b).checked ? (t.type === 'receita' ? 'Recebido (efetivado)' : t.type === 'despesa' ? 'Pago (efetivado)' : 'Realizada (efetivada)') : 'Pendente (a pagar/receber)'; };
      $$('#tt button', b).forEach((x) => (x.onclick = () => setType(x.dataset.v)));
      $('#ts', b).onchange = updStatus;
      $('#tc', b).onchange = () => (catTouched = true);
      $('#tds', b).addEventListener('input', U.debounce(() => {
        if (catTouched || t.type === 'transferencia') return;
        const c = learn($('#tds', b).value, t.type); if (c) $('#tc', b).value = c;
      }, 250));
      $('#tds', b).addEventListener('change', () => { // descrição repetida: sugere o último valor usado se vazio
        if ($('#tv', b).value) return;
        const last = F.txs().filter((x) => x.description === $('#tds', b).value && x.type === t.type).sort((a, c) => c.date.localeCompare(a.date))[0];
        if (last) { $('#tv', b).value = U.num(last.amount); if (!catTouched && last.category_id) $('#tc', b).value = last.category_id; }
      });
      $('#td', b).onchange = () => { if (isNew) $('#ts', b).checked = $('#td', b).value <= U.today(); updStatus(); };
      const tr = $('#tr', b);
      if (tr) tr.onchange = () => { $('#trcw', b).hidden = tr.value === 'none'; $('#trcl', b).textContent = tr.value === 'parcelas' ? 'Número de parcelas' : 'Quantas vezes'; if (tr.value === 'parcelas' || tr.value === 'mensal') $('#trc', b).value = tr.value === 'parcelas' ? 2 : 12; };
      $('#tv', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tds', b).focus(); });
      setType(t.type);
    } });

    async function save(b) {
      const err = (m) => { $('#terr', b).textContent = m; return false; };
      const amount = U.parseMoney($('#tv', b).value);
      if (amount === null || amount === 0) { $('#tv', b).classList.add('invalid'); return err('Informe um valor válido.'); }
      const date = $('#td', b).value; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Informe a data.');
      const desc = $('#tds', b).value.trim(); if (!desc) return err('Informe uma descrição.');
      const rec = {
        ...t, type: t.type, amount: Math.abs(amount), date, description: desc, account_id: $('#ta', b).value,
        category_id: t.type === 'transferencia' ? null : ($('#tc', b).value || null), to_account_id: t.type === 'transferencia' ? $('#tto', b).value : null,
        status: $('#ts', b).checked ? 'efetivada' : 'pendente', notes: $('#tn', b).value.trim(), tags: $('#tg', b).value.split(',').map((x) => x.trim()).filter(Boolean),
      };
      // valor negativo digitado em receita/despesa: inverte o tipo
      if (amount < 0 && rec.type !== 'transferencia' && isNew) { rec.type = rec.type === 'receita' ? 'despesa' : 'receita'; rec.category_id = null; }
      if (rec.type === 'transferencia' && (!rec.to_account_id || rec.to_account_id === rec.account_id)) return err('Escolha contas de origem e destino diferentes.');
      try {
        if (isNew) {
          const rp = $('#tr', b) ? $('#tr', b).value : 'none'; const n = rp === 'none' ? 1 : parseInt($('#trc', b).value, 10);
          if (rp !== 'none' && !(n >= 2 && n <= 360)) return err('Quantidade deve estar entre 2 e 360.');
          const r = await F.createTransaction(rec, { repeat: rp, count: n });
          UI.toast(r.length > 1 ? `${r.length} lançamentos criados` : 'Lançamento salvo', 'ok');
        } else { await Store.upsert('transactions', rec); UI.toast('Lançamento atualizado', 'ok'); }
        await Store.setMeta('last_account', rec.account_id);
        return true;
      } catch (e) { return err(e.message); }
    }
  }

  async function removeTx(t) {
    if (t.group_id) {
      const group = F.txs().filter((x) => x.group_id === t.group_id);
      const v = await UI.choose('Este lançamento faz parte de uma série. O que deseja excluir?', [
        { v: 'one', label: 'Somente este' }, { v: 'next', label: 'Este e os próximos' }, { v: 'all', label: `Todos (${group.length})`, cls: 'danger' }], 'Excluir lançamento');
      if (!v) return false;
      const ids = v === 'one' ? [t.id] : v === 'next' ? group.filter((x) => x.date >= t.date).map((x) => x.id) : group.map((x) => x.id);
      await Store.removeMany('transactions', ids); UI.toast(`${ids.length} lançamento(s) excluído(s)`, 'ok'); return true;
    }
    if (!(await UI.confirm('Excluir este lançamento?', { ok: 'Excluir', danger: true }))) return false;
    await Store.remove('transactions', t.id); UI.toast('Lançamento excluído', 'ok'); return true;
  }

  return { title: 'Lançamentos', render, bind, form, row, groupedList, bindList, setFilter, signed };
})();
