'use strict';
/* Painel: visão geral do mês, dashboards de acompanhamento e a lista de lançamentos */
function spark(nw) {
  if (nw.length < 2) return '';
  const vals = nw.map((p) => p.value); const max = Math.max(...vals), min = Math.min(...vals), rng = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 300).toFixed(1)},${(52 - (v - min) / rng * 44).toFixed(1)}`);
  const d = 'M' + pts.join(' L');
  const delta = vals[vals.length - 1] - vals[0];
  return `<div class="spark"><small>Patrimônio em 12 meses: ${delta >= 0 ? '+' : ''}${U.money(delta)}</small><svg viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L300,56 L0,56 Z" fill="rgba(255,255,255,.16)"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></div>`;
}
Views.painel = {
  title: 'Painel',
  render() {
    const ym = App.state.month;
    const accs = F.accounts();
    if (!accs.length) {
      return `<div class="card" style="max-width:640px;margin:24px auto;text-align:center;padding:32px">
        <img src="icons/icon-192.png" width="80" height="80" alt="" style="border-radius:20px;box-shadow:0 14px 30px -10px rgba(79,70,229,.6)">
        <h2 style="margin:14px 0 6px">Bem-vindo(a) ao Vorticis Finanças Pessoais</h2>
        <p class="muted">Comece cadastrando suas contas bancárias, carteira e cartões de crédito. Depois lance receitas e despesas ou importe extratos do seu banco (OFX, CSV, Excel ou PDF).</p>
        <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" data-a="newacc">${UI.icon('plus')}Criar primeira conta</button><button class="btn" data-a="sample">Ver com dados de exemplo</button></div>
        <p class="small muted" style="margin-top:18px">Seus dados ficam guardados neste aparelho. Para usar no computador e no celular ao mesmo tempo, ative a sincronização em <a href="#/config">Configurações</a>.</p></div>`;
    }
    const tot = F.totals({ until: U.monthEnd(ym) });
    const s = F.summary(U.monthStart(ym), U.monthEnd(ym));
    const pend = F.txs().filter((t) => t.status === 'pendente' && U.monthOf(t.date) === ym && F.counted(t));
    const pendRec = pend.filter((t) => t.type === 'receita').reduce((a, t) => a + F.val(t), 0);
    const pendDesp = pend.filter((t) => t.type === 'despesa').reduce((a, t) => a + F.val(t), 0);
    const ms = F.monthly(U.addMonthYM(ym, -5), ym);
    const nw = F.netWorthSeries(U.addMonthYM(ym, -11), ym);
    const up = F.upcoming(15).slice(0, 8);
    const hoje = U.today();
    const budgets = F.budgetStatus(ym).slice(0, 6);
    const despCats = s.cats.filter((c) => c.type === 'despesa');
    const recCats = s.cats.filter((c) => c.type === 'receita');
    const debt = Debts.overview();
    // ---- indicadores de 12 meses ----
    const m12 = F.monthly(U.addMonthYM(ym, -11), ym);
    const fechados = m12.slice(0, -1).filter((m) => m.receitas || m.despesas);
    const avg = (k) => (fechados.length ? Math.round(fechados.reduce((a, m) => a + m[k], 0) / fechados.length) : 0);
    const mRec = avg('receitas'), mDesp = avg('despesas'), mRes = avg('resultado');
    const ini = U.monthStart(ym), fim = U.monthEnd(ym);
    const diasMes = +fim.slice(8, 10);
    const diasPassados = hoje < ini ? 0 : hoje > fim ? diasMes : +hoje.slice(8, 10);
    const despDia = diasPassados ? Math.round(s.despesas / diasPassados) : 0;
    const projecao = diasPassados && diasPassados < diasMes ? Math.round(s.despesas / diasPassados * diasMes) : s.despesas;
    // ---- fluxo de caixa diário do mês (acumulado) ----
    const doMes = F.txs().filter((t) => t.date >= ini && t.date <= fim && F.counted(t));
    const porDia = {}; doMes.forEach((t) => { porDia[t.date] = (porDia[t.date] || 0) + (t.type === 'receita' ? 1 : -1) * F.val(t); });
    let acc = 0; const fluxo = [];
    for (let d = 1; d <= diasMes; d++) { const k = ym + '-' + U.pad(d); acc += porDia[k] || 0; fluxo.push({ label: String(d), value: acc }); }
    // ---- maiores despesas e variação por categoria ----
    const maiores = doMes.filter((t) => t.type === 'despesa' && !t.estorno).sort((a, b) => b.amount - a.amount).slice(0, 6);
    const prev = U.addMonthYM(ym, -1); const sp = F.summary(U.monthStart(prev), U.monthEnd(prev));
    const prevMap = {}; sp.cats.filter((c) => c.type === 'despesa').forEach((c) => (prevMap[c.id] = c.total));
    const variacao = despCats.map((c) => ({ ...c, antes: prevMap[c.id] || 0, dif: c.total - (prevMap[c.id] || 0) }))
      .concat(sp.cats.filter((c) => c.type === 'despesa' && !despCats.some((x) => x.id === c.id)).map((c) => ({ ...c, total: 0, antes: c.total, dif: -c.total })))
      .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 6);
    const pos = getComputedStyle(document.documentElement).getPropertyValue('--pos').trim() || '#16a34a';
    const neg = getComputedStyle(document.documentElement).getPropertyValue('--neg').trim() || '#dc2626';
    const pct = (a, b) => (b ? Math.round((a - b) / b * 100) : null);
    const vs = (a, b, inverso) => { const p = pct(a, b); if (p === null) return 'sem histórico'; const bom = inverso ? p <= 0 : p >= 0; return `<span class="${bom ? 'pos' : 'neg'}">${p > 0 ? '+' : ''}${p}%</span> vs média de 12 meses`; };

    return `
    <div class="row between" style="margin-bottom:16px">${monthNav(ym)}<span class="small muted">Hoje: ${U.fmtDate(hoje)}</span></div>
    <div class="hero-row">
      <div class="hero">
        <span class="lbl">Saldo atual em todas as contas</span>
        <span class="big money">${U.money(tot.atual)}</span>
        <div class="pills">
          <div class="pill"><small>Previsto em ${U.fmtDate(U.monthEnd(ym))}</small><b class="money">${U.money(tot.previsto)}</b></div>
          <div class="pill"><small>Resultado do mês</small><b class="money">${s.resultado >= 0 ? '+' : ''}${U.money(s.resultado)}</b></div>
          ${tot.invest ? `<div class="pill"><small>Investimentos</small><b class="money">${U.money(tot.invest)}</b></div>` : ''}
        </div>
        ${spark(nw)}
      </div>
      <div class="kpis">
        <div class="kpi has-ic t-pos"><div class="kic">${UI.icon('up')}</div><span>Receitas do mês</span><b class="money pos">${U.money(s.receitas)}</b><small>${pendRec ? U.money(pendRec) + ' a receber' : 'nada pendente'}</small></div>
        <div class="kpi has-ic t-neg"><div class="kic">${UI.icon('down')}</div><span>Despesas do mês</span><b class="money neg">${U.money(s.despesas)}</b><small>${pendDesp ? U.money(pendDesp) + ' a pagar' : 'nada pendente'}</small></div>
        <div class="kpi has-ic"><div class="kic">${UI.icon('trend')}</div><span>Taxa de poupança</span><b class="${s.resultado >= 0 ? 'pos' : 'neg'}">${s.receitas ? (s.resultado / s.receitas * 100).toFixed(1).replace('.', ',') + '%' : '—'}</b><small>do que entrou no mês</small></div>
        ${debt.count ? `<a class="kpi has-ic t-warn" href="#/dividas" style="color:inherit;text-decoration:none"><div class="kic">${UI.icon('dividas')}</div><span>Dívidas</span><b class="money">${U.money(debt.total)}</b><small>${debt.ratio !== null ? (debt.ratio * 100).toFixed(0) + '% da renda em parcelas' : debt.count + ' cadastradas'}</small></a>`
          : `<div class="kpi has-ic"><div class="kic">${UI.icon('card')}</div><span>Cartões de crédito</span><b class="money ${UI.moneyClass(tot.cartoes)}">${U.money(tot.cartoes)}</b><small>saldo das faturas</small></div>`}
      </div>
    </div>
    <h2 class="dsec">${UI.icon('relatorios')} Acompanhamento</h2>
    <div class="kpis">
      <div class="kpi has-ic t-pos"><div class="kic">${UI.icon('up')}</div><span>Média de receitas</span><b class="money">${U.money(mRec)}</b><small>${fechados.length ? 'por mês, últimos ' + fechados.length + ' meses' : 'sem meses anteriores'}</small></div>
      <div class="kpi has-ic t-neg"><div class="kic">${UI.icon('down')}</div><span>Média de despesas</span><b class="money">${U.money(mDesp)}</b><small>este mês: ${vs(s.despesas, mDesp, true)}</small></div>
      <div class="kpi has-ic"><div class="kic">${UI.icon('trend')}</div><span>Sobra média por mês</span><b class="money ${UI.moneyClass(mRes)}">${U.money(mRes)}</b><small>receitas − despesas</small></div>
      <div class="kpi has-ic t-warn"><div class="kic">${UI.icon('calendar')}</div><span>Gasto médio por dia</span><b class="money">${U.money(despDia)}</b><small>${diasPassados && diasPassados < diasMes ? 'ritmo leva a ' + U.money(projecao) + ' no mês' : diasPassados ? 'mês encerrado' : 'mês ainda não começou'}</small></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>Fluxo de caixa de ${U.fmtMonth(ym)}</h3><p class="small muted" style="margin:-4px 0 6px">Resultado acumulado dia a dia (receitas − despesas, incluindo pendentes)</p>${Charts.line(fluxo, { color: acc >= 0 ? pos : neg })}</div>
      <div class="card"><h3>Receitas × despesas (12 meses)</h3>${Charts.bars(m12.map((m) => U.fmtMonthShort(m.ym)), [{ name: 'Receitas', color: pos, values: m12.map((m) => m.receitas) }, { name: 'Despesas', color: neg, values: m12.map((m) => m.despesas) }])}</div>
      <div class="card"><div class="row between"><h3>Despesas por categoria</h3><a href="#/despesas" class="small">ver despesas</a></div>${Charts.donut(despCats, { centerLabel: 'Despesas' })}</div>
      <div class="card"><div class="row between"><h3>Receitas por categoria</h3><a href="#/receitas" class="small">ver receitas</a></div>${Charts.donut(recCats, { centerLabel: 'Receitas' })}</div>
      <div class="card"><h3>Sobra de cada mês (12 meses)</h3>${Charts.bars(m12.map((m) => U.fmtMonthShort(m.ym)), [{ name: 'Receitas − despesas', color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5', values: m12.map((m) => m.resultado) }])}</div>
      <div class="card"><h3>Evolução do patrimônio (12 meses)</h3>${Charts.line(nw.map((p) => ({ label: U.fmtMonthShort(p.ym), value: p.value })))}</div>
      <div class="card"><h3>Maiores despesas do mês</h3>
        ${maiores.length ? `<ul class="mini">${maiores.map((t) => `<li style="cursor:pointer" data-tx="${t.id}"><i class="av" style="background:${U.esc(F.catColor(t.category_id))}">${UI.initials(F.catName(t.category_id))}</i><span><b style="font-weight:600">${U.esc(t.description)}</b><br><small class="muted">${U.fmtDate(t.date)} • ${U.esc(F.catName(t.category_id))}</small></span><b class="money neg">${U.money(t.amount)}</b></li>`).join('')}</ul>` : '<p class="empty">Nenhuma despesa neste mês.</p>'}
      </div>
      <div class="card"><h3>O que mudou em relação a ${U.fmtMonth(prev).toLowerCase()}</h3>
        ${variacao.length ? `<ul class="mini">${variacao.map((c) => `<li><i class="av" style="background:${U.esc(c.color)}">${UI.initials(c.name)}</i><span><b style="font-weight:600">${U.esc(c.name)}</b><br><small class="muted">${U.money(c.antes)} → ${U.money(c.total)}</small></span><b class="money ${c.dif > 0 ? 'neg' : c.dif < 0 ? 'pos' : ''}">${c.dif > 0 ? '+' : ''}${U.money(c.dif)}</b></li>`).join('')}</ul>` : '<p class="empty">Sem despesas para comparar.</p>'}
      </div>
      <div class="card"><div class="row between"><h3>Contas</h3><a href="#/contas" class="small">ver todas</a></div>
        <ul class="mini">${accs.map((a) => { const b = F.balance(a.id); return `<li style="cursor:pointer" data-acc="${a.id}"><i class="av" style="background:${U.esc(a.color || '#4f46e5')}">${a.type === 'cartao' ? UI.icon('card') : UI.initials(a.name)}</i><span><b style="font-weight:600">${U.esc(a.name)}</b><br><small class="muted">${F.ACCOUNT_TYPES[a.type] || ''}</small></span><b class="money ${UI.moneyClass(b)}">${U.money(b)}</b></li>`; }).join('')}</ul>
      </div>
      <div class="card"><div class="row between"><h3>Contas a pagar e receber</h3><a href="#ptx" class="small" data-a="pendentes">ver pendentes</a></div>
        ${up.length ? `<ul class="mini">${up.map((t) => `<li><span><b>${U.esc(t.description)}</b><br><small class="muted">${U.fmtDate(t.date)} • ${U.esc(t.type === 'transferencia' ? 'Transferência' : F.catName(t.category_id))}</small></span>${t.date < hoje ? '<span class="badge neg" style="flex:none">atrasado</span>' : ''}<b class="money ${t.type === 'receita' ? 'pos' : t.type === 'despesa' ? 'neg' : ''}">${U.money(t.amount)}</b><button class="btn sm" data-pay="${t.id}" title="Marcar como pago/recebido">${UI.icon('check')}</button></li>`).join('')}</ul>` : '<p class="empty">Nenhuma conta pendente nos próximos 15 dias.</p>'}
      </div>
      <div class="card"><div class="row between"><h3>Orçamentos do mês</h3><a href="#/orcamentos" class="small">gerenciar</a></div>
        ${budgets.length ? budgets.map((b) => { const p = b.amount ? b.spent / b.amount : 0; return `<div style="margin:10px 0"><div class="row between small"><span><i class="dot" style="background:${b.color}"></i> ${U.esc(b.name)}</span><span class="money">${U.money(b.spent)} / ${U.money(b.amount)}</span></div><div class="bar ${p > 1 ? 'over' : p > 0.85 ? 'near' : ''}" style="margin-top:5px"><i style="width:${Math.min(100, p * 100).toFixed(1)}%"></i></div></div>`; }).join('') : '<p class="empty">Defina limites de gastos por categoria em <a href="#/orcamentos">Orçamentos</a>.</p>'}
      </div>
    </div>
    <h2 class="dsec" id="ptxh">${UI.icon('lancamentos')} Lançamentos</h2>
    <div id="ptx">${Views.lancamentos.list.render()}</div>
    </div>`;
  },
  bind(root) {
    bindMonthNav(root, () => App.state.month, (v) => (App.state.month = v));
    root.querySelectorAll('[data-acc]').forEach((li) => (li.onclick = () => App.go('conta', li.dataset.acc)));
    root.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
      const t = Store.get('transactions', b.dataset.pay);
      await Store.upsert('transactions', { ...t, status: 'efetivada' });
      UI.toast('Marcado como efetivado', 'ok');
    }));
    root.querySelectorAll('[data-tx]').forEach((li) => (li.onclick = () => Views.lancamentos.form(Store.get('transactions', li.dataset.tx))));
    const ptx = root.querySelector('#ptx'); if (ptx) Views.lancamentos.list.bind(ptx);
    const pa = root.querySelector('[data-a="pendentes"]');
    if (pa) pa.onclick = (e) => { e.preventDefault(); Views.lancamentos.setFilter({ mode: 'all', status: 'pendente' }); App.render(); setTimeout(() => { const h = document.getElementById('ptxh'); if (h) h.scrollIntoView({ behavior: 'smooth' }); }, 50); };
    const na = root.querySelector('[data-a="newacc"]'); if (na) na.onclick = () => Views.contas.form();
    const sa = root.querySelector('[data-a="sample"]');
    if (sa) sa.onclick = async () => { await Sample.load(); UI.toast('Dados de exemplo carregados. Você pode apagá-los em Configurações.', 'ok', 5000); };
  },
};
