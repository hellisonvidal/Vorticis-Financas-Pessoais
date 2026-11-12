'use strict';
/* Endividamento: visão geral, dívidas, plano de quitação e consultas oficiais (Registrato, Serasa, SPC, Boa Vista, protestos) */
Views.dividas = (() => {
  const { $, $$, icon } = UI;
  const P = { strategy: 'avalanche', extra: 0, includeCards: true, showPaid: false };
  const LEVEL = {
    saudavel: ['pos', 'Saudável', 'As parcelas tomam até 30% da sua renda, faixa usada como referência por bancos e educadores financeiros.'],
    atencao: ['warn', 'Atenção', 'Entre 30% e 50% da renda vai para parcelas. Evite novas dívidas e priorize quitar as de juros mais altos.'],
    critico: ['neg', 'Crítico', 'Mais da metade da renda está comprometida. Vale renegociar (Serasa Limpa Nome, Desenrola, o próprio banco) e trocar dívidas caras por mais baratas.'],
    sem_renda: ['', 'Sem renda registrada', 'Lance suas receitas para calcular quanto da renda está comprometida.'],
  };
  const pctTxt = (v) => (v * 100).toFixed(1).replace('.', ',') + '%';
  const rateTxt = (r) => (r ? r.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% a.m.' : '—');
  const addMonthsLabel = (n) => U.fmtMonth(U.addMonthYM(U.monthOf(U.today()), n));

  function render() {
    const o = Views.dividas.data = Debts.overview({ includeCards: P.includeCards });
    const [lc, ll, lt] = LEVEL[o.level];
    const sims = ['minimo', P.strategy].map((s) => Debts.simulate(o.all, { strategy: s, extra: P.extra }));
    const [base, plan] = sims;
    const donutItems = Object.entries(o.byKind).map(([k, v], i) => ({ name: Debts.KINDS[k] || k, total: v, color: ['#e11d48', '#f97316', '#eab308', '#8b5cf6', '#2563eb', '#0891b2', '#16a34a', '#db2777', '#64748b', '#a16207', '#4f46e5', '#0f766e'][i % 12] })).sort((a, b) => b.total - a.total);
    const shown = Debts.list(true).filter((d) => P.showPaid || d.status !== 'quitada');

    return `
    <div class="row between" style="margin-bottom:16px">
      <p class="muted" style="margin:0;max-width:720px">Acompanhe tudo o que você deve, quanto da renda está comprometido e o caminho mais rápido para quitar.</p>
      <div class="row"><button class="btn" data-a="scr">${icon('importar')}Importar Registrato</button><button class="btn primary" data-a="new">${icon('plus')}Nova dívida</button></div>
    </div>
    <div class="kpis">
      <div class="kpi has-ic t-neg"><div class="kic">${icon('dividas')}</div><span>Total em dívidas</span><b class="money">${U.money(o.total)}</b><small>${o.count} ${o.count === 1 ? 'dívida' : 'dívidas'}${o.cards.length ? ', incluindo cartões' : ''}</small></div>
      <div class="kpi has-ic"><div class="kic">${icon('calendar')}</div><span>Parcelas por mês</span><b class="money">${U.money(o.monthly)}</b><small>soma das parcelas cadastradas</small></div>
      <div class="kpi has-ic t-warn"><div class="kic">${icon('alert')}</div><span>Em atraso</span><b class="money ${o.overdue ? 'neg' : ''}">${U.money(o.overdue)}</b><small>${o.lateCount ? o.lateCount + ' com atraso' : 'nenhuma atrasada'}</small></div>
      <div class="kpi has-ic"><div class="kic">${icon('juros')}</div><span>Juros médios</span><b>${o.wRate ? rateTxt(o.wRate) : '—'}</b><small>ponderado pelo saldo</small></div>
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>Comprometimento da renda</h3>
        <div class="row" style="gap:18px;flex-wrap:nowrap;align-items:center">
          <div class="ring" style="--p:${o.ratio === null ? 0 : Math.min(100, o.ratio * 100).toFixed(1)};--rc:var(--${lc || 'muted'});width:96px;height:96px;font-size:17px">${o.ratio === null ? '—' : pctTxt(o.ratio)}</div>
          <div style="min-width:0"><span class="badge ${lc}" style="font-size:12.5px">${ll}</span>
            <p class="small" style="margin:8px 0 4px">${lt}</p>
            <p class="small muted" style="margin:0">Parcelas ${U.money(o.monthly)} ÷ renda média ${U.money(o.income)} (últimos 3 meses).</p></div>
        </div>
      </div>
      <div class="card"><h3>Por tipo de dívida</h3>${donutItems.length ? Charts.donut(donutItems, { centerLabel: 'Total', size: 170 }) : '<p class="empty">Nenhuma dívida cadastrada.</p>'}</div>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="row between"><h3>Suas dívidas</h3>
        <div class="row small"><label class="check"><input type="checkbox" id="dcards" ${P.includeCards ? 'checked' : ''}> Incluir cartões de crédito</label><label class="check"><input type="checkbox" id="dpaid" ${P.showPaid ? 'checked' : ''}> Mostrar quitadas</label></div></div>
      ${shown.length || o.cards.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Dívida</th><th>Tipo</th><th>Situação</th><th class="right">Saldo devedor</th><th class="right">Parcela</th><th class="right">Juros</th><th class="right">Restam</th><th></th></tr></thead><tbody>
        ${shown.map((d) => `<tr data-d="${d.id}" style="cursor:pointer"><td><b>${U.esc(d.name)}</b><br><small class="muted">${U.esc(d.creditor || '')}${d.source && d.source !== 'manual' ? ' • ' + U.esc(Debts.SOURCES[d.source] || d.source) : ''}</small></td>
          <td class="small">${U.esc(Debts.KINDS[d.kind] || '')}</td><td>${statusBadge(d)}</td><td class="right money"><b>${U.money(d.balance)}</b>${d.overdue ? `<br><small class="neg">${U.money(d.overdue)} vencido</small>` : ''}</td>
          <td class="right money">${d.installment ? U.money(d.installment) : '—'}</td><td class="right small">${rateTxt(d.rate)}</td><td class="right small">${d.remaining ? d.remaining + 'x' : '—'}</td>
          <td class="right nowrap">${d.status !== 'quitada' ? `<button class="btn sm" data-pay="${d.id}">${icon('check')}Pagar</button>` : ''}</td></tr>`).join('')}
        ${P.includeCards ? o.cards.map((c) => `<tr data-acc="${c.account_id}" style="cursor:pointer"><td><b>${U.esc(c.name)}</b><br><small class="muted">fatura do cartão (vem de Contas e cartões)</small></td><td class="small">Cartão de crédito</td><td><span class="badge info">Automático</span></td><td class="right money"><b>${U.money(c.balance)}</b></td><td class="right">—</td><td class="right">—</td><td class="right">—</td><td></td></tr>`).join('') : ''}
      </tbody></table></div>` : `<div class="empty">Nenhuma dívida cadastrada. Use <b>Nova dívida</b> ou importe o relatório do <b>Registrato</b> do Banco Central, que lista os empréstimos e financiamentos em seu CPF.</div>`}
    </div>

    <div class="card">
      <div class="row between"><h3>Plano de quitação</h3>
        <div class="seg" id="dstrat">${[['avalanche', 'Maiores juros primeiro'], ['bolaneve', 'Menores saldos primeiro']].map(([k, v]) => `<button data-v="${k}" class="${P.strategy === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      ${o.all.length ? `
      <div class="row" style="align-items:flex-end;margin-bottom:14px">
        <label class="field" style="max-width:260px"><span>Valor extra por mês, além das parcelas (R$)</span><input class="input" id="dextra" inputmode="decimal" value="${P.extra ? U.num(P.extra) : ''}" placeholder="0,00"></label>
        <button class="btn" id="dcalc">Recalcular</button>
        <p class="small muted" style="margin:0;flex:1;min-width:220px">${P.strategy === 'avalanche' ? '<b>Avalanche:</b> o dinheiro extra vai para a dívida de juros mais altos. É o método que gasta menos com juros.' : '<b>Bola de neve:</b> quita primeiro as dívidas menores. Dá resultados visíveis mais cedo e ajuda a manter a motivação.'}</p>
      </div>
      <div class="kpis">
        <div class="kpi"><span>Pagando só as parcelas</span><b>${base.feasible ? base.months + ' meses' : 'não quita'}</b><small>${base.feasible ? 'juros: ' + U.money(base.interest) : 'as parcelas não cobrem os juros'}</small></div>
        <div class="kpi"><span>Com o plano</span><b class="${plan.feasible ? 'pos' : 'neg'}">${plan.feasible ? plan.months + ' meses' : 'não quita'}</b><small>${plan.feasible ? 'livre em ' + addMonthsLabel(plan.months) : 'aumente o valor extra'}</small></div>
        <div class="kpi"><span>Juros no plano</span><b class="money">${U.money(plan.interest)}</b><small>${base.feasible && plan.feasible && base.interest > plan.interest ? 'economia de ' + U.money(base.interest - plan.interest) : ' '}</small></div>
        <div class="kpi"><span>Pagamento mensal do plano</span><b class="money">${U.money(plan.budget)}</b><small>${o.income ? pctTxt(plan.budget / o.income) + ' da renda média' : ''}</small></div>
      </div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>#</th><th>Dívida</th><th class="right">Juros</th><th class="right">Pagamento mínimo</th><th class="right">Quitada em</th></tr></thead><tbody>
        ${plan.order.map((r, i) => `<tr><td>${i + 1}</td><td>${U.esc(r.name)}</td><td class="right small">${rateTxt(r.rate)}</td><td class="right money">${U.money(r.min)}</td><td class="right">${r.month ? `${addMonthsLabel(r.month)} <small class="muted">(${r.month} ${r.month === 1 ? 'mês' : 'meses'})</small>` : '<span class="neg">não quita</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small muted">Simulação com juros compostos mensais sobre o saldo. Sem parcela fixa cadastrada, o plano usa juros do mês + 3% do saldo como pagamento mínimo. Quando uma dívida termina, o valor dela passa para a próxima.</p>` : '<p class="empty">Cadastre suas dívidas para montar o plano.</p>'}
    </div>

    <div class="card">
      <h3>Consultar meu CPF nos órgãos oficiais (grátis)</h3>
      <div class="note" style="margin-bottom:14px">${icon('shield')}<div><b>Por que a consulta não é automática?</b> Serasa, SPC e Boa Vista só liberam consulta por sistema (API) para empresas com contrato e CNPJ, cobrando por consulta. O Registrato do Banco Central só funciona com login gov.br no site do próprio Banco Central. As consultas abaixo são gratuitas e oficiais. O relatório do Registrato pode ser <b>importado aqui</b>. As pendências do Serasa, SPC, Boa Vista e protestos você cadastra em poucos cliques, escolhendo a origem.</div></div>
      <div class="acc-grid">${Debts.OFFICIAL.map((s) => `<div class="card acc" style="--c:${s.id === 'registrato' ? '#4f46e5' : s.id === 'serasa' ? '#e11d48' : s.id === 'spc' ? '#f97316' : s.id === 'boavista' ? '#0891b2' : '#64748b'};cursor:default">
        <h4>${U.esc(s.name)}</h4><p class="small" style="margin:6px 0">${U.esc(s.what)}</p><p class="small muted" style="margin:0 0 12px">${U.esc(s.how)}</p>
        <div class="row"><a class="btn sm" href="${s.url}" target="_blank" rel="noopener">${icon('external')}Abrir site oficial</a>${s.importable ? `<button class="btn sm primary" data-a="scr">${icon('importar')}Importar PDF</button>` : `<button class="btn sm" data-new-src="${s.id}">${icon('plus')}Cadastrar pendência</button>`}</div></div>`).join('')}</div>
    </div>`;
  }

  function statusBadge(d) {
    const cls = { em_dia: 'pos', atrasada: 'neg', negociando: 'warn', quitada: '' }[d.status] || '';
    return `<span class="badge ${cls}">${Debts.STATUS[d.status] || d.status}</span>`;
  }

  function bind(root) {
    $$('[data-a="new"]', root).forEach((b) => (b.onclick = () => form()));
    $$('[data-a="scr"]', root).forEach((b) => (b.onclick = () => importSCR()));
    $$('[data-new-src]', root).forEach((b) => (b.onclick = () => form(null, { source: b.dataset.newSrc, status: 'atrasada', kind: b.dataset.newSrc === 'protesto' ? 'outro' : 'conta_atrasada' })));
    $$('[data-d]', root).forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('[data-pay]')) return; detail(Store.get('debts', tr.dataset.d)); }));
    $$('[data-acc]', root).forEach((tr) => (tr.onclick = () => App.go('conta', tr.dataset.acc)));
    $$('[data-pay]', root).forEach((b) => (b.onclick = () => payForm(Store.get('debts', b.dataset.pay))));
    const dc = $('#dcards', root); if (dc) dc.onchange = (e) => { P.includeCards = e.target.checked; App.render(); };
    const dp = $('#dpaid', root); if (dp) dp.onchange = (e) => { P.showPaid = e.target.checked; App.render(); };
    $$('#dstrat button', root).forEach((b) => (b.onclick = () => { P.strategy = b.dataset.v; App.render(); }));
    const ex = $('#dextra', root);
    if (ex) {
      const apply = () => { const v = U.parseMoney(ex.value || '0'); P.extra = v && v > 0 ? v : 0; App.render(); };
      $('#dcalc', root).onclick = apply; ex.onkeydown = (e) => { if (e.key === 'Enter') apply(); };
    }
  }

  function form(debt = null, defaults = {}) {
    const d = debt ? { ...debt } : { kind: 'credito_pessoal', status: 'em_dia', source: 'manual', balance: 0, rate: 0, installment: 0, balance_date: U.today(), ...defaults };
    const isNew = !debt;
    UI.modal({
      title: isNew ? 'Nova dívida' : 'Editar dívida',
      body: `<div class="form">
        <label class="field full"><span>Descrição</span><input class="input" id="dn" value="${U.esc(d.name || '')}" placeholder="Ex.: Empréstimo pessoal Banco X, Financiamento do carro"></label>
        <label class="field"><span>Credor / instituição</span><input class="input" id="dcr" value="${U.esc(d.creditor || '')}"></label>
        <label class="field"><span>Tipo</span><select class="input" id="dk">${Object.entries(Debts.KINDS).map(([k, v]) => UI.opt(k, v, d.kind)).join('')}</select></label>
        <label class="field"><span>Saldo devedor atual (R$)</span><input class="input" id="db" inputmode="decimal" value="${d.balance ? U.num(d.balance) : ''}" placeholder="0,00"></label>
        <label class="field"><span>Saldo em</span><input class="input" type="date" id="dbd" value="${d.balance_date || U.today()}"></label>
        <label class="field"><span>Parcela mensal (R$)</span><input class="input" id="di" inputmode="decimal" value="${d.installment ? U.num(d.installment) : ''}" placeholder="0,00"></label>
        <label class="field"><span>Parcelas restantes</span><input class="input" id="drem" inputmode="numeric" value="${d.remaining || ''}" placeholder="—"></label>
        <label class="field"><span>Juros ao mês (%)</span><input class="input" id="dr" inputmode="decimal" value="${d.rate ? String(d.rate).replace('.', ',') : ''}" placeholder="Ex.: 2,5"></label>
        <label class="field"><span>Dia de vencimento</span><input class="input" id="ddue" inputmode="numeric" value="${d.due_day || ''}" placeholder="1 a 31"></label>
        <label class="field"><span>Situação</span><select class="input" id="ds">${Object.entries(Debts.STATUS).map(([k, v]) => UI.opt(k, v, d.status)).join('')}</select></label>
        <label class="field"><span>Valor em atraso (R$)</span><input class="input" id="dov" inputmode="decimal" value="${d.overdue ? U.num(d.overdue) : ''}" placeholder="0,00"></label>
        <label class="field"><span>Origem da informação</span><select class="input" id="dsrc">${Object.entries(Debts.SOURCES).map(([k, v]) => UI.opt(k, v, d.source || 'manual')).join('')}</select></label>
        <label class="field"><span>Conta de pagamento (opcional)</span><select class="input" id="dacc">${UI.opt('', '—', d.account_id)}${UI.accountOptions(d.account_id)}</select></label>
        <label class="field full"><span>Observações</span><textarea class="input" id="dno" rows="2">${U.esc(d.notes || '')}</textarea></label>
        <p class="small muted full" style="margin:0">Dica: o Custo Efetivo Total (CET) e os juros mensais aparecem no contrato ou no aplicativo do banco. Se não souber, deixe em branco.</p>
        <p class="err full" id="derr"></p></div>`,
      actions: [
        ...(!isNew ? [{ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: async () => { if (!(await UI.confirm('Excluir esta dívida? Os pagamentos já lançados continuam nas contas.', { danger: true, ok: 'Excluir' }))) return false; await Store.remove('debts', d.id); UI.toast('Dívida excluída', 'ok'); } }] : []),
        { label: 'Cancelar' },
        { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const name = $('#dn', b).value.trim(); const bal = U.parseMoney($('#db', b).value || '0');
          const err = (m) => { $('#derr', b).textContent = m; return false; };
          if (!name) return err('Informe a descrição.');
          if (bal === null || bal < 0) return err('Saldo devedor inválido.');
          const inst = U.parseMoney($('#di', b).value || '0'); if (inst === null || inst < 0) return err('Parcela inválida.');
          const ov = U.parseMoney($('#dov', b).value || '0'); if (ov === null || ov < 0) return err('Valor em atraso inválido.');
          const rate = $('#dr', b).value.trim() ? Number($('#dr', b).value.replace(/\./g, '').replace(',', '.').replace('%', '')) : 0;
          if (!isFinite(rate) || rate < 0 || rate > 100) return err('Juros ao mês inválidos (use, por exemplo, 2,5).');
          const due = $('#ddue', b).value.trim() ? +$('#ddue', b).value : null; if (due !== null && !(due >= 1 && due <= 31)) return err('Dia de vencimento deve ser de 1 a 31.');
          const rem = $('#drem', b).value.trim() ? parseInt($('#drem', b).value, 10) : null; if (rem !== null && !(rem >= 0)) return err('Parcelas restantes inválidas.');
          let status = $('#ds', b).value; if (bal === 0) status = 'quitada';
          await Store.upsert('debts', { ...d, id: d.id || U.uuid(), name, creditor: $('#dcr', b).value.trim(), kind: $('#dk', b).value, balance: bal, balance_date: $('#dbd', b).value || U.today(), installment: inst, remaining: rem, rate, due_day: due, status, overdue: ov, source: $('#dsrc', b).value, account_id: $('#dacc', b).value || null, notes: $('#dno', b).value.trim() });
          UI.toast(isNew ? 'Dívida cadastrada' : 'Dívida atualizada', 'ok');
        } },
      ],
    });
  }

  function detail(d) {
    if (!d) return;
    const pays = Debts.payments(d.id);
    UI.modal({
      title: d.name, wide: true,
      body: `<div class="kpis">
          <div class="kpi"><span>Saldo devedor</span><b class="money">${U.money(d.balance)}</b><small>em ${U.fmtDate(d.balance_date || U.today())}</small></div>
          <div class="kpi"><span>Parcela</span><b class="money">${d.installment ? U.money(d.installment) : '—'}</b><small>${d.remaining ? d.remaining + ' restantes' : ''}${d.due_day ? ' • vence dia ' + d.due_day : ''}</small></div>
          <div class="kpi"><span>Juros</span><b>${rateTxt(d.rate)}</b><small>${d.rate ? '≈ ' + ((Math.pow(1 + d.rate / 100, 12) - 1) * 100).toFixed(1).replace('.', ',') + '% ao ano' : ''}</small></div>
          <div class="kpi"><span>Situação</span><b>${statusBadge(d)}</b><small>${d.overdue ? U.money(d.overdue) + ' vencido' : ''}</small></div></div>
        <p class="small muted">${U.esc(Debts.KINDS[d.kind] || '')}${d.creditor ? ' • ' + U.esc(d.creditor) : ''} • ${U.esc(Debts.SOURCES[d.source] || 'Cadastro manual')}${d.notes ? '<br>' + U.esc(d.notes) : ''}</p>
        <h3 style="margin-top:14px">Pagamentos registrados</h3>
        ${pays.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Data</th><th>Conta</th><th>Situação</th><th class="right">Valor</th></tr></thead><tbody>${pays.map((t) => `<tr><td>${U.fmtDate(t.date)}</td><td>${U.esc(F.accName(t.account_id))}</td><td>${t.status === 'pendente' ? '<span class="badge warn">Pendente</span>' : '<span class="badge pos">Pago</span>'}</td><td class="right money">${U.money(t.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total pago</td><td class="right money">${U.money(pays.reduce((a, t) => a + t.amount, 0))}</td></tr></tfoot></table></div>` : '<p class="empty">Nenhum pagamento registrado por aqui ainda.</p>'}`,
      actions: [
        { label: icon('edit') + 'Editar', left: true, onClick: () => { setTimeout(() => form(d), 0); } },
        { label: 'Fechar' },
        ...(d.status !== 'quitada' ? [{ label: icon('check') + 'Registrar pagamento', cls: 'primary', onClick: () => { setTimeout(() => payForm(d), 0); } }] : []),
      ],
    });
  }

  function payForm(d) {
    if (!d) return;
    const accs = F.accounts().filter((a) => a.type !== 'cartao');
    if (!accs.length) return UI.toast('Cadastre uma conta (corrente, carteira…) para registrar pagamentos.', 'error', 5000);
    const sug = d.installment || d.balance;
    UI.modal({
      title: 'Pagamento — ' + d.name,
      body: `<div class="form">
        <label class="field full"><span>Valor pago (R$)</span><input class="input big" id="pv" inputmode="decimal" value="${U.num(Math.min(sug, d.balance || sug))}"></label>
        <label class="field"><span>Data</span><input class="input" type="date" id="pd" value="${U.today()}"></label>
        <label class="field"><span>Pago pela conta</span><select class="input" id="pa">${accs.map((a) => UI.opt(a.id, a.name, d.account_id || accs[0].id)).join('')}</select></label>
        <label class="field"><span>Quanto abateu do saldo devedor (R$)</span><input class="input" id="pp" inputmode="decimal" placeholder="igual ao valor pago"></label>
        <label class="field"><span>Situação do lançamento</span><select class="input" id="ps">${UI.opt('efetivada', 'Pago', 'efetivada')}${UI.opt('pendente', 'Agendado (pendente)', '')}</select></label>
        <p class="small muted full" style="margin:0">Parte da parcela costuma ser juros. Se o banco informar quanto foi amortizado, preencha o valor que abateu. O pagamento entra como despesa na categoria "Empréstimos e dívidas".</p>
        <p class="err full" id="perr"></p></div>`,
      actions: [{ label: 'Cancelar' }, { label: 'Registrar', cls: 'primary', onClick: async (b) => {
        const v = U.parseMoney($('#pv', b).value); if (!v || v <= 0) { $('#perr', b).textContent = 'Valor inválido.'; return false; }
        const pr = $('#pp', b).value.trim() ? U.parseMoney($('#pp', b).value) : v; if (pr === null || pr < 0) { $('#perr', b).textContent = 'Valor abatido inválido.'; return false; }
        const r = await Debts.pay(d, { amount: v, principal: pr, date: $('#pd', b).value || U.today(), account_id: $('#pa', b).value, status: $('#ps', b).value });
        UI.toast(r.status === 'quitada' ? 'Dívida quitada! 🎉' : 'Pagamento registrado', 'ok');
      } }],
    });
  }

  // ----- importação do Registrato -----
  function importSCR() {
    const m = UI.modal({
      title: 'Importar relatório do Registrato (Banco Central)', wide: true,
      body: `<div class="help"><b>Como obter o relatório (grátis):</b><ol>
          <li>Acesse <a href="https://www.bcb.gov.br/cidadaniafinanceira/registrato" target="_blank" rel="noopener">bcb.gov.br/cidadaniafinanceira/registrato</a> e entre com sua conta <b>gov.br</b> (nível prata ou ouro).</li>
          <li>Escolha <b>Empréstimos e Financiamentos (SCR)</b> e gere o relatório do mês mais recente.</li>
          <li>Salve o PDF e selecione-o abaixo. Se preferir, copie o texto do relatório e cole no campo.</li></ol></div>
        <div class="drop" id="sdrop" style="margin-top:12px">${icon('importar')}<br><b>Clique para escolher o PDF</b> ou arraste o arquivo aqui<input type="file" id="sfile" accept=".pdf,.txt,application/pdf,text/plain" hidden></div>
        <details style="margin-top:10px"><summary class="small">Colar o texto do relatório</summary><textarea class="input" id="stext" rows="6" style="margin-top:8px" placeholder="Cole aqui o conteúdo copiado do relatório"></textarea><button class="btn sm" id="sread" style="margin-top:6px">Ler texto colado</button></details>
        <div id="sres" style="margin-top:14px"></div>`,
      actions: [{ label: 'Cancelar' }, { label: 'Salvar dívidas selecionadas', cls: 'primary', onClick: async (b) => {
        const rows = $$('tr[data-i]', b).filter((tr) => $('input[type=checkbox]', tr).checked);
        if (!rows.length) { UI.toast('Nada selecionado para importar.', 'error'); return false; }
        const items = []; let bad = false;
        rows.forEach((tr) => {
          const it = { ...m.items[+tr.dataset.i] };
          it.creditor = $('[data-f="cr"]', tr).value.trim() || it.creditor; it.kind = $('[data-f="k"]', tr).value;
          const bal = U.parseMoney($('[data-f="b"]', tr).value); const ov = U.parseMoney($('[data-f="o"]', tr).value || '0');
          if (bal === null || ov === null || bal < 0 || ov < 0) bad = true;
          it.balance = bal; it.overdue = Math.min(ov || 0, bal || 0);
          it.key = U.norm(it.creditor) + '|' + it.kind;
          items.push(it);
        });
        if (bad) { UI.toast('Há valores inválidos na tabela.', 'error'); return false; }
        const n = await Debts.saveSCR(items, m.refDate);
        UI.toast(`${n} ${n === 1 ? 'dívida importada/atualizada' : 'dívidas importadas/atualizadas'} do Registrato`, 'ok', 4500);
      } }],
    });
    const b = m.body;
    const show = (lines) => {
      const r = Debts.parseSCR(lines); m.items = r.items; m.refDate = r.refDate;
      const res = $('#sres', b);
      if (!r.items.length) { res.innerHTML = `<div class="note warn">${icon('alert')}<div>Não encontrei empréstimos ou financiamentos neste arquivo. Confira se é o relatório <b>Empréstimos e Financiamentos (SCR)</b>. Se for um PDF escaneado (imagem), cadastre as dívidas manualmente.</div></div>`; return; }
      const prev = Store.all('debts').filter((d) => d.source === 'registrato');
      res.innerHTML = `<p class="small">${r.items.length} ${r.items.length === 1 ? 'item encontrado' : 'itens encontrados'}${r.refDate ? ' • data-base ' + U.fmtMonth(r.refDate) : ''}. <b>Revise</b> instituição, tipo e valores antes de salvar: a leitura do PDF é automática e pode errar. Itens que já existem (mesma instituição e tipo) são <b>atualizados</b>, não duplicados.</p>
        <div class="tablewrap"><table class="tbl"><thead><tr><th></th><th>Instituição</th><th>Tipo</th><th class="right">Saldo devedor (R$)</th><th class="right">Vencido (R$)</th><th></th></tr></thead><tbody>
        ${r.items.map((it, i) => `<tr data-i="${i}"><td><input type="checkbox" checked></td><td><input class="input" data-f="cr" value="${U.esc(it.creditor)}"><small class="muted">${U.esc(it.modalidade)}</small></td>
          <td><select class="input" data-f="k">${Object.entries(Debts.KINDS).map(([k, v]) => UI.opt(k, v, it.kind)).join('')}</select></td>
          <td class="right"><input class="input right" data-f="b" value="${U.num(it.balance)}" style="max-width:140px"></td><td class="right"><input class="input right" data-f="o" value="${U.num(it.overdue)}" style="max-width:130px"></td>
          <td>${prev.some((d) => d.src_key === it.key) ? '<span class="badge info">atualiza</span>' : '<span class="badge pos">nova</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    };
    const readFile = async (f) => {
      const res = $('#sres', b); res.innerHTML = '<p class="muted">Lendo arquivo…</p>';
      try {
        const lines = /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? await Importers.pdfLines(f) : (await U.readText(f)).split(/\r?\n/);
        show(lines);
      } catch (e) {
        console.error(e);
        res.innerHTML = `<p class="neg">Não foi possível ler o arquivo: ${U.esc(/password/i.test(e.name + e.message) ? 'o PDF tem senha.' : e.message)}</p>`;
      }
    };
    const drop = $('#sdrop', b), inp = $('#sfile', b);
    drop.onclick = () => inp.click();
    inp.onchange = () => inp.files[0] && readFile(inp.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readFile(f); };
    $('#sread', b).onclick = () => show($('#stext', b).value.split(/\r?\n/));
  }

  return { title: 'Endividamento', render, bind, form, importSCR };
})();
