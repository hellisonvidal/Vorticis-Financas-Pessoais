'use strict';
/* Contas e cartões: lista, cadastro, detalhe com extrato, ajuste de saldo e faturas */
Views.contas = (() => {
  const { $, $$, icon } = UI;
  let showArchived = false;

  function render() {
    const accs = F.accounts(showArchived);
    const tot = F.totals();
    const groups = {};
    accs.forEach((a) => (groups[a.type] = groups[a.type] || []).push(a));
    return `
    <div class="kpis">
      <div class="kpi"><span>Saldo total (efetivado)</span><b class="money ${UI.moneyClass(tot.atual)}">${U.money(tot.atual)}</b></div>
      <div class="kpi"><span>Previsto no fim do mês</span><b class="money ${UI.moneyClass(tot.previsto)}">${U.money(tot.previsto)}</b></div>
      <div class="kpi"><span>Cartões de crédito</span><b class="money ${UI.moneyClass(tot.cartoes)}">${U.money(tot.cartoes)}</b></div>
      <div class="kpi"><span>Investimentos</span><b class="money">${U.money(tot.invest)}</b></div>
    </div>
    <div class="row between" style="margin-bottom:12px">
      <label class="check small"><input type="checkbox" id="sharch" ${showArchived ? 'checked' : ''}> Mostrar arquivadas</label>
      <div class="row"><button class="btn" data-transfer>${icon('transfer')}Transferir</button><button class="btn primary" data-new>${icon('plus')}Nova conta</button></div>
    </div>
    ${accs.length ? Object.keys(F.ACCOUNT_TYPES).filter((k) => groups[k]).map((k) => `<h3 class="muted" style="margin:18px 0 10px">${F.ACCOUNT_TYPES[k]}</h3><div class="acc-grid">${groups[k].map(card).join('')}</div>`).join('') : '<div class="card empty">Nenhuma conta cadastrada.</div>'}`;
  }
  function card(a) {
    const b = F.balance(a.id); const p = F.balance(a.id, { mode: 'previsto', until: U.monthEnd(U.monthOf(U.today())) });
    let extra = '';
    if (a.type === 'cartao' && a.credit_limit) {
      const used = Math.max(0, -F.balance(a.id, { mode: 'previsto', until: '9999-12-31' }));
      const pc = used / a.credit_limit;
      extra = `<div class="bar ${pc > 1 ? 'over' : pc > 0.85 ? 'near' : ''}" style="margin-top:10px"><i style="width:${Math.min(100, pc * 100).toFixed(1)}%"></i></div><div class="row between small muted" style="margin-top:4px"><span>Usado ${U.money(used)}</span><span>Disponível ${U.money(a.credit_limit - used)}</span></div>`;
    }
    return `<div class="card acc" data-acc="${a.id}" style="--c:${U.esc(a.color || '#0f766e')}">
      <div class="row between"><div><h4>${U.esc(a.name)}</h4><span class="small muted">${U.esc(a.bank || F.ACCOUNT_TYPES[a.type])}${a.archived ? ' • arquivada' : ''}${a.include_total === false ? ' • fora do total' : ''}</span></div>${a.type === 'cartao' ? icon('card') : ''}</div>
      <div class="bal money ${UI.moneyClass(b)}">${U.money(b)}</div>
      <div class="small muted">Previsto fim do mês: <span class="money">${U.money(p)}</span></div>${extra}
    </div>`;
  }
  function bind(root) {
    $('#sharch', root).onchange = (e) => { showArchived = e.target.checked; App.render(); };
    $('[data-new]', root).onclick = () => form();
    $('[data-transfer]', root).onclick = () => Views.lancamentos.form(null, { type: 'transferencia' });
    $$('[data-acc]', root).forEach((c) => (c.onclick = () => App.go('conta', c.dataset.acc)));
  }

  function form(acc = null) {
    const a = acc ? { ...acc } : { type: 'corrente', initial_balance: 0, color: UI.COLORS[F.accounts(true).length % UI.COLORS.length], include_total: true };
    const isNew = !acc;
    const hasTx = !isNew && F.txs().some((t) => t.account_id === a.id || t.to_account_id === a.id);
    UI.modal({
      title: isNew ? 'Nova conta' : 'Editar conta',
      body: `<div class="form">
        <label class="field full"><span>Nome</span><input class="input" id="an" value="${U.esc(a.name || '')}" placeholder="Ex.: Nubank, Itaú, Carteira"></label>
        <label class="field"><span>Tipo</span><select class="input" id="at">${Object.entries(F.ACCOUNT_TYPES).map(([k, v]) => UI.opt(k, v, a.type)).join('')}</select></label>
        <label class="field"><span>Banco / instituição</span><input class="input" id="ab" value="${U.esc(a.bank || '')}"></label>
        <label class="field"><span id="ail">Saldo inicial (R$)</span><input class="input" id="ai" inputmode="decimal" value="${U.num(a.initial_balance || 0)}"></label>
        <div class="field"><span>Opções</span><label class="check"><input type="checkbox" id="ainc" ${a.include_total !== false ? 'checked' : ''}> Somar no saldo total</label>${!isNew ? `<label class="check"><input type="checkbox" id="aarc" ${a.archived ? 'checked' : ''}> Arquivada (oculta)</label>` : ''}</div>
        <div class="full" id="acard">
          <div class="form">
            <label class="field"><span>Limite do cartão (R$)</span><input class="input" id="al" inputmode="decimal" value="${a.credit_limit ? U.num(a.credit_limit) : ''}"></label>
            <label class="field"><span>Dia de fechamento</span><input class="input" type="number" min="1" max="31" id="acl" value="${a.closing_day || ''}"></label>
            <label class="field"><span>Dia de vencimento</span><input class="input" type="number" min="1" max="31" id="adu" value="${a.due_day || ''}"></label>
          </div>
        </div>
        <div class="field full"><span>Cor</span>${UI.colorPicker(a.color)}</div>
        <p class="small muted full" id="ahint"></p>
      </div><p class="err" id="aerr"></p>`,
      onOpen: (b) => {
        UI.bindColorPicker(b);
        const upd = () => {
          const card = $('#at', b).value === 'cartao';
          $('#acard', b).hidden = !card;
          $('#ail', b).textContent = card ? 'Saldo inicial (fatura em aberto, use valor negativo)' : 'Saldo inicial (R$)';
          $('#ahint', b).textContent = card ? 'Cartão: compras são despesas nesta conta; o pagamento da fatura é uma transferência da conta corrente para o cartão.' : 'Saldo inicial: quanto havia na conta antes do primeiro lançamento registrado aqui. Pode corrigir depois com "Ajustar saldo".';
        };
        $('#at', b).onchange = upd; upd();
      },
      actions: [
        ...(!isNew ? [{ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: async () => removeAcc(a, hasTx) }] : []),
        { label: 'Cancelar' },
        { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const err = (m) => { $('#aerr', b).textContent = m; return false; };
          const name = $('#an', b).value.trim(); if (!name) return err('Informe o nome da conta.');
          const ib = U.parseMoney($('#ai', b).value || '0'); if (ib === null) return err('Saldo inicial inválido.');
          const type = $('#at', b).value;
          const rec = { ...a, name, type, bank: $('#ab', b).value.trim(), initial_balance: ib, include_total: $('#ainc', b).checked, color: $('[name=color]', b).value, archived: $('#aarc', b) ? $('#aarc', b).checked : false };
          if (type === 'cartao') {
            const lim = $('#al', b).value ? U.parseMoney($('#al', b).value) : 0; if (lim === null || lim < 0) return err('Limite inválido.');
            const cd = +$('#acl', b).value || null, dd = +$('#adu', b).value || null;
            if ((cd && (cd < 1 || cd > 31)) || (dd && (dd < 1 || dd > 31))) return err('Dias devem estar entre 1 e 31.');
            Object.assign(rec, { credit_limit: lim, closing_day: cd, due_day: dd });
          }
          if (isNew) rec.order = F.accounts(true).length + 1;
          const saved = await Store.upsert('accounts', rec);
          UI.toast(isNew ? 'Conta criada' : 'Conta atualizada', 'ok');
          if (isNew && App.state.route !== 'conta') setTimeout(() => App.go('conta', saved.id), 0);
        } },
      ],
    });
  }

  async function removeAcc(a, hasTx) {
    if (hasTx) {
      const n = F.txs().filter((t) => t.account_id === a.id || t.to_account_id === a.id).length;
      const v = await UI.choose(`Esta conta possui ${n} lançamento(s). Você pode arquivá-la (some das listas, mas o histórico é mantido) ou excluir a conta junto com todos os lançamentos.`, [{ v: 'arch', label: 'Arquivar', cls: 'primary' }, { v: 'del', label: 'Excluir tudo', cls: 'danger' }], 'Excluir conta');
      if (!v) return false;
      if (v === 'arch') { await Store.upsert('accounts', { ...a, archived: true }); UI.toast('Conta arquivada', 'ok'); App.go('contas'); return true; }
      if (!(await UI.confirm(`Confirma excluir "${U.esc(a.name)}" e ${n} lançamento(s)? Não há como desfazer.`, { ok: 'Excluir definitivamente', danger: true }))) return false;
      await Store.removeMany('transactions', F.txs().filter((t) => t.account_id === a.id || t.to_account_id === a.id).map((t) => t.id));
    } else if (!(await UI.confirm(`Excluir a conta "${U.esc(a.name)}"?`, { ok: 'Excluir', danger: true }))) return false;
    await Store.remove('accounts', a.id);
    Store.all('goals').filter((g) => g.account_id === a.id).forEach((g) => Store.upsert('goals', { ...g, account_id: null }));
    UI.toast('Conta excluída', 'ok'); App.go('contas'); return true;
  }

  async function adjust(a) {
    const cur = F.balance(a.id);
    const v = await UI.promptMoney('Ajustar saldo — ' + a.name, `Saldo correto hoje (atual no sistema: ${U.money(cur)})`, U.num(cur));
    if (v === null) return;
    const r = await F.adjustBalance(a.id, v);
    UI.toast(r ? `Ajuste de ${U.money(Math.abs(v - cur))} lançado` : 'O saldo já está correto', 'ok');
  }

  return { title: 'Contas e cartões', render, bind, form, adjust };
})();

/* Detalhe de uma conta */
Views.conta = (() => {
  const { $, $$, icon } = UI;
  let month = null; let tab = 'extrato';
  const title = (id) => (Store.get('accounts', id) || { name: 'Conta' }).name;

  function render(id) {
    const a = Store.get('accounts', id);
    if (!a) return '<div class="card empty">Conta não encontrada. <a href="#/contas">Voltar</a></div>';
    if (!month) month = App.state.month;
    const isCard = a.type === 'cartao';
    if (!isCard && tab === 'faturas') tab = 'extrato';
    const b = F.balance(a.id), p = F.balance(a.id, { mode: 'previsto', until: U.monthEnd(month) });
    const from = U.monthStart(month), to = U.monthEnd(month);
    const list = F.txs().filter((t) => t.account_id === a.id || t.to_account_id === a.id);
    let open = a.initial_balance || 0;
    list.forEach((t) => { if (t.date < from) open += F.effect(t, a.id); });
    const inMonth = list.filter((t) => t.date >= from && t.date <= to).sort((x, y) => x.date.localeCompare(y.date) || (x.created_at || '').localeCompare(y.created_at || ''));
    let run = open; let ent = 0, sai = 0;
    const rows = inMonth.map((t) => { const v = F.effect(t, a.id); run += v; if (v > 0) ent += v; else sai -= v; return { t, v, run }; });
    const cardInfo = isCard ? (() => {
      const used = Math.max(0, -F.balance(a.id, { mode: 'previsto', until: '9999-12-31' }));
      return `<div class="kpi"><span>Limite disponível</span><b class="money">${a.credit_limit ? U.money(a.credit_limit - used) : '—'}</b><small>${a.credit_limit ? 'de ' + U.money(a.credit_limit) : 'limite não informado'}</small></div>`;
    })() : '';
    return `
    <div class="row between" style="margin-bottom:12px">
      <a href="#/contas" class="btn ghost sm">${icon('left')}Contas</a>
      <div class="row">
        <button class="btn sm" data-a="edit">${icon('edit')}Editar</button>
        <button class="btn sm" data-a="adjust">Ajustar saldo</button>
        <button class="btn sm" data-a="import">${icon('importar')}Importar extrato</button>
        ${isCard ? `<button class="btn sm" data-a="pay">${icon('check')}Pagar fatura</button>` : ''}
        <button class="btn sm primary" data-a="new">${icon('plus')}Lançamento</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>${isCard ? 'Saldo do cartão (efetivado)' : 'Saldo atual (efetivado)'}</span><b class="money ${UI.moneyClass(b)}">${U.money(b)}</b><small>${U.esc(F.ACCOUNT_TYPES[a.type])}${a.bank ? ' • ' + U.esc(a.bank) : ''}</small></div>
      <div class="kpi"><span>Previsto em ${U.fmtDate(to)}</span><b class="money ${UI.moneyClass(p)}">${U.money(p)}</b><small>com pendentes</small></div>
      <div class="kpi"><span>Entradas no mês</span><b class="money pos">${U.money(ent)}</b></div>
      <div class="kpi"><span>Saídas no mês</span><b class="money neg">${U.money(sai)}</b></div>
      ${cardInfo}
    </div>
    ${isCard ? `<div class="seg" style="margin-bottom:12px" data-tab><button data-v="extrato" class="${tab === 'extrato' ? 'on' : ''}">Lançamentos</button><button data-v="faturas" class="${tab === 'faturas' ? 'on' : ''}">Faturas</button></div>` : ''}
    ${tab === 'faturas' ? faturas(a) : `
    <div class="card">
      <div class="row between" style="margin-bottom:8px">${monthNav(month)}<div class="row"><button class="btn sm" data-exp="pdf">${icon('pdf')}PDF</button><button class="btn sm" data-exp="xlsx">${icon('sheet')}Excel</button></div></div>
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Data</th><th>Descrição</th><th class="hide-sm">Categoria</th><th class="right">Valor</th><th class="right">Saldo</th></tr></thead>
        <tbody>
          <tr><td>${U.fmtDate(from)}</td><td class="muted">Saldo anterior</td><td class="hide-sm"></td><td></td><td class="right money ${UI.moneyClass(open)}">${U.money(open)}</td></tr>
          ${rows.map(({ t, v, run: r }) => `<tr data-id="${t.id}" style="cursor:pointer"><td class="nowrap">${U.fmtDate(t.date)}</td><td>${U.esc(t.description)} ${t.status === 'pendente' ? '<span class="badge warn">pendente</span>' : ''}</td><td class="hide-sm small muted">${U.esc(t.type === 'transferencia' ? (t.account_id === a.id ? '→ ' + F.accName(t.to_account_id) : '← ' + F.accName(t.account_id)) : F.catName(t.category_id))}</td><td class="right money ${UI.moneyClass(v)}">${U.money(v)}</td><td class="right money ${UI.moneyClass(r)}">${U.money(r)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td></td><td>Saldo final do mês</td><td class="hide-sm"></td><td class="right money">${U.money(ent - sai)}</td><td class="right money ${UI.moneyClass(run)}">${U.money(run)}</td></tr></tfoot>
      </table></div>
      ${!rows.length ? '<p class="empty">Nenhum lançamento neste mês.</p>' : ''}
      <p class="small muted">O saldo da coluna "Saldo" considera também os lançamentos pendentes.</p>
    </div>`}`;
  }

  function faturas(a) {
    const inv = F.invoices(a.id);
    if (!a.closing_day) return '<div class="card"><p class="empty">Informe o dia de fechamento e de vencimento do cartão (botão Editar) para ver as faturas.</p></div>';
    return `<div class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Fatura</th><th>Vencimento</th><th class="right">Total</th><th class="right">Pago</th><th>Situação</th><th></th></tr></thead><tbody>
      ${inv.map((i) => `<tr><td>${U.fmtMonth(i.ym)}</td><td>${i.vencimento ? U.fmtDate(i.vencimento) : '—'}</td><td class="right money">${U.money(i.total)}</td><td class="right money">${U.money(i.paid)}</td><td><span class="badge ${i.status === 'Paga' ? 'pos' : i.status === 'Fechada' ? (i.vencimento && i.vencimento < U.today() ? 'neg' : 'warn') : ''}">${i.status}</span></td><td class="right"><button class="btn sm" data-inv="${i.ym}">Ver itens</button>${(i.status === 'Fechada' || i.status === 'Aberta') && i.total > i.paid ? ` <button class="btn sm primary" data-payinv="${i.ym}">Pagar</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>${!inv.length ? '<p class="empty">Nenhuma compra registrada.</p>' : ''}
    <p class="small muted">Compras feitas após o dia ${a.closing_day} entram na fatura do mês seguinte. O pagamento é registrado como transferência de uma conta para o cartão.</p></div>`;
  }

  function payInvoice(a, ym) {
    const inv = F.invoices(a.id); const i = ym ? inv.find((x) => x.ym === ym) : inv.find((x) => x.status === 'Fechada') || inv.find((x) => x.status === 'Aberta');
    const other = F.accounts().find((x) => x.type !== 'cartao' && x.id !== a.id);
    if (!other) return UI.toast('Cadastre uma conta corrente para pagar a fatura.');
    Views.lancamentos.form(null, { type: 'transferencia', account_id: other.id, to_account_id: a.id, amount: i ? Math.max(0, i.total - i.paid) : 0, date: i && i.vencimento ? i.vencimento : U.today(), description: 'Pagamento fatura ' + (i ? U.fmtMonth(i.ym) : a.name), status: 'efetivada' });
  }

  function bind(root, id) {
    const a = Store.get('accounts', id); if (!a) return;
    bindMonthNav(root, () => month, (v) => (month = v));
    $$('[data-tab] button', root).forEach((b) => (b.onclick = () => { tab = b.dataset.v; App.render(); }));
    const act = { edit: () => Views.contas.form(a), adjust: () => Views.contas.adjust(a), import: () => { Views.importar.start(a.id); App.go('importar'); }, pay: () => payInvoice(a), new: () => Views.lancamentos.form(null, { account_id: a.id }) };
    $$('[data-a]', root).forEach((b) => (b.onclick = act[b.dataset.a]));
    $$('tr[data-id]', root).forEach((tr) => (tr.onclick = () => Views.lancamentos.form(Store.get('transactions', tr.dataset.id), {}, a.id)));
    $$('[data-payinv]', root).forEach((b) => (b.onclick = () => payInvoice(a, b.dataset.payinv)));
    $$('[data-inv]', root).forEach((b) => (b.onclick = () => {
      const i = F.invoices(a.id).find((x) => x.ym === b.dataset.inv);
      UI.modal({ title: 'Fatura de ' + U.fmtMonth(i.ym) + ' — ' + U.money(i.total), wide: true, body: Views.lancamentos.groupedList(i.itens.sort((x, y) => y.date.localeCompare(x.date)), { accId: a.id, check: false }), actions: [{ label: 'Exportar PDF', onClick: () => Reports.toPDF(Reports.build('cartao', { account: a.id, month: i.ym }), 'fatura-' + i.ym) }, { label: 'Fechar', cls: 'primary' }] });
    }));
    $$('[data-exp]', root).forEach((b) => (b.onclick = () => {
      const R = Reports.build('extrato', { account: a.id, from: U.monthStart(month), to: U.monthEnd(month) });
      const name = 'extrato-' + U.norm(a.name).replace(/\W+/g, '-') + '-' + month;
      Promise.resolve(b.dataset.exp === 'pdf' ? Reports.toPDF(R, name) : Reports.toXLSX(R, name)).then(() => UI.toast('Arquivo gerado', 'ok')).catch((e) => UI.toast(e.message, 'error'));
    }));
  }

  return { title, render, bind };
})();
