/* Relatórios: cada relatório gera uma estrutura única que é exibida na tela e exportada para PDF, Excel e CSV. */
'use strict';

const Reports = (() => {
  const TYPES = {
    resumo: { name: 'Resumo do período', needs: ['period', 'account'] },
    despesas: { name: 'Despesas por categoria', needs: ['period', 'account'] },
    receitas: { name: 'Receitas por categoria', needs: ['period', 'account'] },
    fluxo: { name: 'Fluxo de caixa mensal', needs: ['period', 'account'] },
    matriz: { name: 'Categorias × meses (comparativo)', needs: ['period', 'account'] },
    extrato: { name: 'Extrato de conta', needs: ['period', 'accountRequired'] },
    lancamentos: { name: 'Lançamentos detalhados', needs: ['period', 'account'] },
    orcamento: { name: 'Orçamento × realizado', needs: ['month'] },
    saldos: { name: 'Saldos das contas', needs: ['date'] },
    cartao: { name: 'Faturas de cartão', needs: ['cardRequired'] },
    dividas: { name: 'Endividamento e plano de quitação', needs: [] },
  };
  const M = 'money', D = 'date', P = 'pct';
  const col = (label, type, align) => ({ label, type, align: align || (type === M || type === P ? 'right' : 'left') });
  const pct = (a, b) => (b ? a / b : 0);

  function build(type, p) {
    const acc = p.account ? Store.get('accounts', p.account) : null;
    const periodo = p.from ? `${U.fmtDate(p.from)} a ${U.fmtDate(p.to)}` : '';
    const sub = [periodo, acc ? 'Conta: ' + acc.name : (TYPES[type].needs.includes('account') ? 'Todas as contas' : '')].filter(Boolean).join(' • ');
    const opts = { accountId: p.account || null, onlyDone: p.onlyDone };
    const R = { title: TYPES[type].name, subtitle: sub, sections: [], orientation: 'portrait' };

    if (type === 'resumo') {
      const s = F.summary(p.from, p.to, opts);
      R.sections.push({ kind: 'kpis', items: [{ label: 'Receitas', value: s.receitas, cls: 'pos' }, { label: 'Despesas', value: s.despesas, cls: 'neg' }, { label: 'Resultado', value: s.resultado, cls: s.resultado >= 0 ? 'pos' : 'neg' }, { label: 'Taxa de poupança', text: s.receitas ? (pct(s.resultado, s.receitas) * 100).toFixed(1).replace('.', ',') + '%' : '—' }] });
      const months = U.monthsBetween(U.monthOf(p.from), U.monthOf(p.to));
      if (months.length > 1 && months.length <= 24) {
        const ms = F.monthly(months[0], months[months.length - 1], opts);
        R.sections.push({ kind: 'chart', title: 'Receitas × despesas por mês', svg: Charts.bars(ms.map((m) => U.fmtMonthShort(m.ym)), [{ name: 'Receitas', color: '#16a34a', values: ms.map((m) => m.receitas) }, { name: 'Despesas', color: '#dc2626', values: ms.map((m) => m.despesas) }], { t: Charts.lightTheme() }) });
      }
      const desp = s.cats.filter((c) => c.type === 'despesa');
      if (desp.length) R.sections.push({ kind: 'chart', title: 'Despesas por categoria', svg: Charts.donut(desp, { t: Charts.lightTheme(), centerLabel: 'Despesas' }), small: true });
      R.sections.push(catTable('Despesas por categoria', desp, s.despesas));
      R.sections.push(catTable('Receitas por categoria', s.cats.filter((c) => c.type === 'receita'), s.receitas));
    }

    if (type === 'despesas' || type === 'receitas') {
      const tp = type === 'despesas' ? 'despesa' : 'receita';
      const s = F.summary(p.from, p.to, opts);
      const cats = s.cats.filter((c) => c.type === tp); const tot = tp === 'despesa' ? s.despesas : s.receitas;
      const counts = {}; F.txs().forEach((t) => { if (t.type === tp && t.date >= p.from && t.date <= p.to && (!p.account || t.account_id === p.account) && (!p.onlyDone || F.isDone(t))) counts[t.category_id || ''] = (counts[t.category_id || ''] || 0) + 1; });
      R.sections.push({ kind: 'kpis', items: [{ label: 'Total', value: tot, cls: tp === 'despesa' ? 'neg' : 'pos' }, { label: 'Categorias', text: String(cats.length) }, { label: 'Média mensal', value: Math.round(tot / Math.max(1, U.monthsBetween(U.monthOf(p.from), U.monthOf(p.to)).length)) }] });
      if (cats.length) R.sections.push({ kind: 'chart', svg: Charts.donut(cats, { t: Charts.lightTheme(), centerLabel: 'Total' }), small: true });
      R.sections.push({ kind: 'table', title: 'Detalhamento', columns: [col('Categoria'), col('Lançamentos', 'int', 'right'), col('Total', M), col('% do total', P)], rows: cats.map((c) => [c.name, counts[c.id] || 0, c.total, pct(c.total, tot)]), foot: ['Total', Object.values(counts).reduce((a, b) => a + b, 0), tot, cats.length ? 1 : 0] });
    }

    if (type === 'fluxo') {
      const ms = F.monthly(U.monthOf(p.from), U.monthOf(p.to), opts);
      let acum = 0; const rows = ms.map((m) => { acum += m.resultado; return [U.fmtMonth(m.ym), m.receitas, m.despesas, m.resultado, acum]; });
      const tr = ms.reduce((a, m) => a + m.receitas, 0), td = ms.reduce((a, m) => a + m.despesas, 0);
      if (ms.length <= 36) R.sections.push({ kind: 'chart', title: 'Receitas × despesas', svg: Charts.bars(ms.map((m) => U.fmtMonthShort(m.ym)), [{ name: 'Receitas', color: '#16a34a', values: ms.map((m) => m.receitas) }, { name: 'Despesas', color: '#dc2626', values: ms.map((m) => m.despesas) }], { t: Charts.lightTheme() }) });
      R.sections.push({ kind: 'table', title: 'Fluxo mensal', columns: [col('Mês'), col('Receitas', M), col('Despesas', M), col('Resultado', M), col('Acumulado', M)], rows, foot: ['Total', tr, td, tr - td, tr - td] });
    }

    if (type === 'matriz') {
      const months = U.monthsBetween(U.monthOf(p.from), U.monthOf(p.to)).slice(0, 24);
      const map = {};
      months.forEach((ym, i) => {
        F.summary(U.monthStart(ym), U.monthEnd(ym), opts).cats.forEach((c) => {
          const k = c.type + '|' + c.id;
          (map[k] = map[k] || { name: c.name, type: c.type, vals: Array(months.length).fill(0) }).vals[i] = c.total;
        });
      });
      const columns = [col('Categoria'), ...months.map((m) => col(U.fmtMonthShort(m), M)), col('Total', M), col('Média', M)];
      ['despesa', 'receita'].forEach((tp) => {
        const list = Object.values(map).filter((x) => x.type === tp).sort((a, b) => b.vals.reduce((s, v) => s + v, 0) - a.vals.reduce((s, v) => s + v, 0));
        const rows = list.map((x) => { const t = x.vals.reduce((s, v) => s + v, 0); return [x.name, ...x.vals, t, Math.round(t / months.length)]; });
        const sums = months.map((_, i) => list.reduce((s, x) => s + x.vals[i], 0)); const tt = sums.reduce((a, b) => a + b, 0);
        R.sections.push({ kind: 'table', title: tp === 'despesa' ? 'Despesas' : 'Receitas', columns, rows, foot: ['Total', ...sums, tt, Math.round(tt / months.length)] });
      });
      R.orientation = months.length > 6 ? 'landscape' : 'portrait';
    }

    if (type === 'extrato') {
      if (!acc) throw new Error('Escolha uma conta para o extrato.');
      const list = F.txs().filter((t) => (t.account_id === acc.id || t.to_account_id === acc.id) && (!p.onlyDone || F.isDone(t)));
      let saldo = acc.initial_balance || 0;
      list.filter((t) => t.date < p.from).forEach((t) => (saldo += F.effect(t, acc.id)));
      const abertura = saldo;
      const rows = [];
      let ent = 0, sai = 0;
      list.filter((t) => t.date >= p.from && t.date <= p.to).sort((a, b) => a.date.localeCompare(b.date) || (a.created_at || '').localeCompare(b.created_at || '')).forEach((t) => {
        const v = F.effect(t, acc.id); saldo += v; if (v > 0) ent += v; else sai -= v;
        const cat = t.type === 'transferencia' ? (t.account_id === acc.id ? '→ ' + F.accName(t.to_account_id) : '← ' + F.accName(t.account_id)) : F.catName(t.category_id);
        rows.push([t.date, t.description, cat, v > 0 ? v : null, v < 0 ? -v : null, saldo, t.status === 'pendente' ? 'Pendente' : '']);
      });
      R.sections.push({ kind: 'kpis', items: [{ label: 'Saldo inicial', value: abertura }, { label: 'Entradas', value: ent, cls: 'pos' }, { label: 'Saídas', value: sai, cls: 'neg' }, { label: 'Saldo final', value: saldo, cls: saldo >= 0 ? 'pos' : 'neg' }] });
      R.sections.push({ kind: 'table', title: 'Movimentação', columns: [col('Data', D), col('Descrição'), col('Categoria'), col('Entrada', M), col('Saída', M), col('Saldo', M), col('Status')], rows: [[p.from, 'Saldo anterior', '', null, null, abertura, ''], ...rows], foot: ['', 'Totais', '', ent, sai, saldo, ''] });
      R.orientation = 'landscape';
    }

    if (type === 'lancamentos') {
      const list = F.txs().filter((t) => t.date >= p.from && t.date <= p.to && (!p.account || t.account_id === p.account || t.to_account_id === p.account) && (!p.onlyDone || F.isDone(t))).sort((a, b) => a.date.localeCompare(b.date));
      let rec = 0, desp = 0;
      const rows = list.map((t) => {
        if (t.type === 'receita') rec += t.amount; else if (t.type === 'despesa') desp += t.amount;
        const v = t.type === 'transferencia' ? (p.account ? F.effect(t, p.account) : t.amount) : t.type === 'receita' ? t.amount : -t.amount;
        return [t.date, t.description, F.TX_TYPES[t.type], t.type === 'transferencia' ? `${F.accName(t.account_id)} → ${F.accName(t.to_account_id)}` : F.catName(t.category_id), t.type === 'transferencia' ? '' : F.accName(t.account_id), v, t.status === 'pendente' ? 'Pendente' : 'Efetivada'];
      });
      R.sections.push({ kind: 'kpis', items: [{ label: 'Lançamentos', text: String(list.length) }, { label: 'Receitas', value: rec, cls: 'pos' }, { label: 'Despesas', value: desp, cls: 'neg' }, { label: 'Resultado', value: rec - desp, cls: rec - desp >= 0 ? 'pos' : 'neg' }] });
      R.sections.push({ kind: 'table', title: 'Lançamentos', columns: [col('Data', D), col('Descrição'), col('Tipo'), col('Categoria'), col('Conta'), col('Valor', M), col('Status')], rows });
      R.orientation = 'landscape';
    }

    if (type === 'orcamento') {
      const b = F.budgetStatus(p.month);
      R.subtitle = U.fmtMonth(p.month);
      const to = b.reduce((s, x) => s + x.amount, 0), tr = b.reduce((s, x) => s + x.spent, 0);
      R.sections.push({ kind: 'kpis', items: [{ label: 'Orçado', value: to }, { label: 'Realizado', value: tr, cls: tr > to ? 'neg' : '' }, { label: 'Disponível', value: to - tr, cls: to - tr >= 0 ? 'pos' : 'neg' }] });
      R.sections.push({ kind: 'table', title: 'Por categoria', columns: [col('Categoria'), col('Orçado', M), col('Realizado', M), col('Diferença', M), col('% usado', P)], rows: b.map((x) => [x.name, x.amount, x.spent, x.amount - x.spent, pct(x.spent, x.amount)]), foot: ['Total', to, tr, to - tr, pct(tr, to)] });
    }

    if (type === 'saldos') {
      R.subtitle = 'Posição em ' + U.fmtDate(p.date);
      const accs = F.accounts(true);
      let tot = 0, totP = 0;
      const rows = accs.map((a) => { const s = F.balance(a.id, { mode: 'data', until: p.date }); const pv = F.balance(a.id, { mode: 'previsto', until: p.date }); if (a.include_total !== false) { tot += s; totP += pv; } return [a.name, F.ACCOUNT_TYPES[a.type] || a.type, a.bank || '', s, pv, a.archived ? 'Arquivada' : '']; });
      R.sections.push({ kind: 'kpis', items: [{ label: 'Saldo efetivado', value: tot, cls: tot >= 0 ? 'pos' : 'neg' }, { label: 'Saldo com pendentes', value: totP, cls: totP >= 0 ? 'pos' : 'neg' }] });
      R.sections.push({ kind: 'table', title: 'Contas', columns: [col('Conta'), col('Tipo'), col('Banco/Instituição'), col('Saldo efetivado', M), col('Com pendentes', M), col('Situação')], rows, foot: ['Total', '', '', tot, totP, ''] });
    }

    if (type === 'cartao') {
      if (!acc || acc.type !== 'cartao') throw new Error('Escolha um cartão de crédito.');
      R.subtitle = acc.name;
      const inv = F.invoices(acc.id).slice(0, 24);
      R.sections.push({ kind: 'table', title: 'Faturas', columns: [col('Fatura'), col('Vencimento', D), col('Compras', M), col('Créditos/estornos', M), col('Total', M), col('Pago', M), col('Situação')], rows: inv.map((i) => [U.fmtMonth(i.ym), i.vencimento, i.compras, i.creditos, i.total, i.paid, i.status]) });
      const cur = inv.find((i) => i.ym === (p.month || F.invoiceMonth(acc, U.today())));
      if (cur) R.sections.push({ kind: 'table', title: 'Itens da fatura de ' + U.fmtMonth(cur.ym), columns: [col('Data', D), col('Descrição'), col('Categoria'), col('Valor', M)], rows: cur.itens.sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.description, t.type === 'transferencia' ? 'Pagamento' : F.catName(t.category_id), t.type === 'receita' || (t.type === 'transferencia' && t.to_account_id === acc.id) ? -t.amount : t.amount]), foot: ['', 'Total da fatura', '', cur.total] });
    }
    if (type === 'dividas') {
      const o = Debts.overview();
      R.subtitle = 'Posição em ' + U.fmtDate(U.today());
      R.orientation = 'landscape';
      R.sections.push({ kind: 'kpis', items: [{ label: 'Total em dívidas', value: o.total, cls: 'neg' }, { label: 'Parcelas por mês', value: o.monthly }, { label: 'Em atraso', value: o.overdue, cls: o.overdue ? 'neg' : '' },
        { label: 'Comprometimento da renda', text: o.ratio === null ? '—' : (o.ratio * 100).toFixed(1).replace('.', ',') + '%' }] });
      const rows = o.debts.map((d) => [d.name, d.creditor || '', Debts.KINDS[d.kind] || '', Debts.STATUS[d.status] || '', d.balance || 0, d.overdue || 0, d.installment || 0, d.rate ? d.rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : '', d.remaining || '', Debts.SOURCES[d.source] || ''])
        .concat(o.cards.map((c) => [c.name, c.creditor || '', 'Cartão de crédito (fatura)', 'Automático', c.balance, 0, 0, '', '', 'Contas e cartões']));
      R.sections.push({ kind: 'table', title: 'Dívidas em aberto', columns: [col('Dívida'), col('Credor'), col('Tipo'), col('Situação'), col('Saldo devedor', M), col('Vencido', M), col('Parcela', M), col('Juros a.m.', 'text', 'right'), col('Restam', 'int', 'right'), col('Origem')], rows,
        foot: ['Total', '', '', '', o.total, o.overdue, o.monthly, '', '', ''] });
      const plans = [['minimo', 'Só as parcelas'], ['avalanche', 'Maiores juros primeiro'], ['bolaneve', 'Menores saldos primeiro']].map(([k, n]) => { const r = Debts.simulate(o.all, { strategy: k, extra: 0 }); return [n, r.feasible ? r.months : 'não quita', r.feasible ? U.fmtMonth(U.addMonthYM(U.monthOf(U.today()), r.months)) : '—', r.interest, r.budget]; });
      R.sections.push({ kind: 'table', title: 'Simulação de quitação (sem valor extra)', columns: [col('Estratégia'), col('Meses', 'int', 'right'), col('Livre em'), col('Juros pagos', M), col('Pagamento mensal', M)], rows: plans });
    }
    return R;
  }

  function catTable(title, cats, tot) {
    return { kind: 'table', title, columns: [col('Categoria'), col('Total', M), col('% do total', P)], rows: cats.map((c) => [c.name, c.total, pct(c.total, tot)]), foot: ['Total', tot, cats.length ? 1 : 0] };
  }

  const fmtCell = (v, c) => {
    if (v === null || v === undefined || v === '') return '';
    if (c.type === M) return U.money(v);
    if (c.type === D) return U.fmtDate(v);
    if (c.type === P) return (v * 100).toFixed(1).replace('.', ',') + '%';
    return String(v);
  };

  // ---------- HTML ----------
  function toHTML(R) {
    let h = '';
    R.sections.forEach((s) => {
      if (s.kind === 'kpis') h += `<div class="kpis">${s.items.map((k) => `<div class="kpi"><span>${U.esc(k.label)}</span><b class="${k.cls || ''}">${k.text !== undefined ? U.esc(k.text) : U.money(k.value)}</b></div>`).join('')}</div>`;
      if (s.kind === 'chart') h += `<div class="card">${s.title ? `<h3>${U.esc(s.title)}</h3>` : ''}${s.svg}</div>`;
      if (s.kind === 'table') {
        h += `<div class="card"><h3>${U.esc(s.title)}</h3><div class="tablewrap"><table class="tbl"><thead><tr>${s.columns.map((c) => `<th class="${c.align}">${U.esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
        h += s.rows.length ? s.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${s.columns[i].align} ${s.columns[i].type === M && v < 0 ? 'neg' : ''}">${U.esc(fmtCell(v, s.columns[i]))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${s.columns.length}" class="empty">Nenhum dado no período.</td></tr>`;
        h += '</tbody>';
        if (s.foot && s.rows.length) h += `<tfoot><tr>${s.foot.map((v, i) => `<td class="${s.columns[i].align}">${U.esc(fmtCell(v, s.columns[i]))}</td>`).join('')}</tr></tfoot>`;
        h += '</table></div></div>';
      }
    });
    return h;
  }

  // ---------- PDF ----------
  // As fontes padrão do PDF só têm caracteres latinos: troca setas e remove emojis
  const ps = (v) => String(v ?? '').replace(/→/g, '»').replace(/←/g, '«').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
  async function toPDF(R0, filename) {
    const R = { ...R0, title: ps(R0.title), subtitle: ps(R0.subtitle), sections: R0.sections.map((s) => ({ ...s, title: s.title && ps(s.title), rows: s.rows && s.rows.map((r) => r.map((v) => (typeof v === 'string' ? ps(v) : v))), items: s.items && s.items.map((k) => ({ ...k, label: ps(k.label) })) })) };
    if (!globalThis.jspdf) throw new Error('Biblioteca de PDF não carregada.');
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: R.orientation, unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const owner = Store.getMeta('owner_name') || '';
    doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 22, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(R.title, 12, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text([R.subtitle, owner].filter(Boolean).join('   •   '), 12, 17);
    doc.setTextColor(30); let y = 30;
    for (const s of R.sections) {
      if (s.kind === 'kpis') {
        const n = s.items.length; const w = (W - 24 - (n - 1) * 4) / n;
        if (y + 18 > H - 14) { doc.addPage(); y = 14; }
        s.items.forEach((k, i) => {
          const x = 12 + i * (w + 4);
          doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, w, 16, 2, 2, 'FD');
          doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(k.label, x + 3, y + 5.5);
          doc.setFontSize(11.5); doc.setFont('helvetica', 'bold');
          const c = k.cls === 'pos' ? [22, 128, 61] : k.cls === 'neg' ? [185, 28, 28] : [15, 23, 42]; doc.setTextColor(...c);
          doc.text(k.text !== undefined ? k.text : U.money(k.value), x + 3, y + 12.5); doc.setFont('helvetica', 'normal');
        });
        doc.setTextColor(30); y += 22;
      }
      if (s.kind === 'chart') {
        const img = await Charts.svgToPng(s.svg, s.small ? 700 : 1200);
        if (img) {
          const w = s.small ? Math.min(70, W - 24) : W - 24; const h = w * img.ratio;
          if (y + h + 8 > H - 14) { doc.addPage(); y = 14; }
          if (s.title) { doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(s.title, 12, y + 4); doc.setFont('helvetica', 'normal'); y += 7; }
          doc.addImage(img.data, 'JPEG', 12, y, w, h);
          if (s.small) { // legenda ao lado da rosca
            const items = (s.svg.match(/<li>[\s\S]*?<\/li>/g) || []).map((li) => li.replace(/<[^>]+>/g, '|').split('|').filter((x) => x.trim()));
            doc.setFontSize(8.5); let ly = y + 6;
            items.forEach((it) => { if (ly < y + h) { doc.text(`${it[0]}`, 12 + w + 6, ly); doc.text(`${it[1]}  (${it[2]})`, W - 12, ly, { align: 'right' }); ly += 5; } });
          }
          y += h + 6;
        }
      }
      if (s.kind === 'table') {
        if (y > H - 30) { doc.addPage(); y = 14; }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(s.title, 12, y + 2); doc.setFont('helvetica', 'normal');
        doc.autoTable({
          startY: y + 4, margin: { left: 12, right: 12, bottom: 14 },
          head: [s.columns.map((c) => c.label)],
          body: s.rows.length ? s.rows.map((r) => r.map((v, i) => fmtCell(v, s.columns[i]))) : [[{ content: 'Nenhum dado no período.', colSpan: s.columns.length }]],
          foot: s.foot && s.rows.length ? [s.foot.map((v, i) => fmtCell(v, s.columns[i]))] : undefined,
          styles: { fontSize: s.columns.length > 10 ? 6.5 : 8.5, cellPadding: 1.6, overflow: 'linebreak' },
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, { halign: c.align }])),
          didParseCell: (d) => { if (d.section !== 'head') d.cell.styles.halign = s.columns[d.column.index] ? s.columns[d.column.index].align : 'left'; if (d.section === 'body' && s.columns[d.column.index] && s.columns[d.column.index].type === M && String(d.cell.raw).includes('-')) d.cell.styles.textColor = [185, 28, 28]; },
          showFoot: 'lastPage',
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    const pages = doc.getNumberOfPages();
    const gen = 'Gerado em ' + new Date().toLocaleString('pt-BR') + ' • Finanças Pessoais';
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(gen, 12, H - 6); doc.text(`Página ${i} de ${pages}`, W - 12, H - 6, { align: 'right' }); }
    const out = doc.output('blob');
    return U.saveFile(filename + '.pdf', out, 'application/pdf');
  }

  // ---------- Excel ----------
  function sheetFromTable(s, R) {
    const aoa = [[R.title + ' — ' + s.title], [R.subtitle], [], s.columns.map((c) => c.label)];
    const conv = (v, c) => (v === null || v === undefined || v === '') ? null : c.type === M ? v / 100 : c.type === D ? U.parseISO(v) : v;
    s.rows.forEach((r) => aoa.push(r.map((v, i) => conv(v, s.columns[i]))));
    if (s.foot && s.rows.length) aoa.push(s.foot.map((v, i) => conv(v, s.columns[i])));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 4; r <= range.e.r; r++) s.columns.forEach((c, ci) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (!cell) return;
      if (c.type === M) cell.z = '#,##0.00;[Red]-#,##0.00';
      if (c.type === P) cell.z = '0.0%';
      if (c.type === D) cell.z = 'dd/mm/yyyy';
    });
    ws['!cols'] = s.columns.map((c, i) => ({ wch: Math.min(60, Math.max(c.label.length + 2, ...s.rows.slice(0, 300).map((r) => String(fmtCell(r[i], c)).length + 2))) }));
    return ws;
  }
  function toXLSX(R, filename) {
    const wb = XLSX.utils.book_new(); const used = new Set();
    R.sections.filter((s) => s.kind === 'table').forEach((s) => {
      let n = s.title.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'Dados'; let k = n; let i = 2; while (used.has(k)) k = n.slice(0, 25) + ' ' + i++; used.add(k);
      XLSX.utils.book_append_sheet(wb, sheetFromTable(s, R), k);
    });
    const kp = R.sections.filter((s) => s.kind === 'kpis').flatMap((s) => s.items);
    if (kp.length) {
      const ws = XLSX.utils.aoa_to_sheet([[R.title], [R.subtitle], [], ['Indicador', 'Valor'], ...kp.map((k) => [k.label, k.text !== undefined ? k.text : k.value / 100])]);
      kp.forEach((k, i) => { const c = ws[XLSX.utils.encode_cell({ r: 4 + i, c: 1 })]; if (c && k.text === undefined) c.z = '#,##0.00;[Red]-#,##0.00'; });
      ws['!cols'] = [{ wch: 26 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Indicadores');
    }
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return U.saveFile(filename + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // ---------- CSV (padrão Excel Brasil: ; e vírgula decimal) ----------
  function toCSV(R, filename) {
    const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const val = (v, c) => (v === null || v === undefined || v === '') ? '' : c.type === M ? U.num(v).replace(/\./g, '') : fmtCell(v, c);
    let out = '';
    R.sections.filter((s) => s.kind === 'table').forEach((s) => {
      out += q(s.title) + '\n' + s.columns.map((c) => q(c.label)).join(';') + '\n';
      s.rows.forEach((r) => (out += r.map((v, i) => q(val(v, s.columns[i]))).join(';') + '\n'));
      if (s.foot && s.rows.length) out += s.foot.map((v, i) => q(val(v, s.columns[i]))).join(';') + '\n';
      out += '\n';
    });
    return U.saveFile(filename + '.csv', '﻿' + out, 'text/csv;charset=utf-8');
  }

  // ---------- exportação completa / modelo de planilha ----------
  const SYS_HEADERS = ['ID', 'Data', 'Descrição', 'Tipo', 'Valor', 'Categoria', 'Conta', 'Conta destino', 'Status', 'Observações', 'Tags'];
  function exportAll() {
    const wb = XLSX.utils.book_new();
    const txRows = F.txs().sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.id, U.parseISO(t.date), t.description, F.TX_TYPES[t.type], t.amount / 100, t.type === 'transferencia' ? '' : F.catName(t.category_id), F.accName(t.account_id), t.to_account_id ? F.accName(t.to_account_id) : '', t.status === 'pendente' ? 'Pendente' : 'Efetivada', t.notes || '', (t.tags || []).join(', ')]);
    const ws = XLSX.utils.aoa_to_sheet([SYS_HEADERS, ...txRows], { cellDates: true });
    for (let r = 1; r <= txRows.length; r++) { ws[XLSX.utils.encode_cell({ r, c: 1 })].z = 'dd/mm/yyyy'; ws[XLSX.utils.encode_cell({ r, c: 4 })].z = '#,##0.00'; }
    ws['!cols'] = [{ wch: 10 }, { wch: 11 }, { wch: 40 }, { wch: 13 }, { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
    const accs = F.accounts(true).map((a) => [a.name, F.ACCOUNT_TYPES[a.type], a.bank || '', (a.initial_balance || 0) / 100, F.balance(a.id) / 100, F.balance(a.id, { mode: 'previsto', until: '9999-12-31' }) / 100, a.archived ? 'Sim' : 'Não']);
    const wa = XLSX.utils.aoa_to_sheet([['Conta', 'Tipo', 'Banco', 'Saldo inicial', 'Saldo atual', 'Saldo com pendentes', 'Arquivada'], ...accs]);
    wa['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wa, 'Contas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Categoria', 'Tipo', 'Cor'], ...F.categories().map((c) => [c.name, c.type, c.color])]), 'Categorias');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Categoria', 'Mês (vazio = todo mês)', 'Limite'], ...Store.all('budgets').map((b) => [F.catName(b.category_id), b.month || '', b.amount / 100])]), 'Orçamentos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Meta', 'Valor alvo', 'Valor atual', 'Prazo'], ...Store.all('goals').map((g) => [g.name, g.target / 100, g.saved / 100, g.deadline ? U.fmtDate(g.deadline) : ''])]), 'Metas');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return U.saveFile(`financas-completo-${U.fileStamp()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function template() {
    const ex = [
      ['', U.parseISO(U.today()), 'Salário', 'Receita', 5000, 'Salário', 'Conta corrente', '', 'Efetivada', '', ''],
      ['', U.parseISO(U.today()), 'Supermercado', 'Despesa', 350.9, 'Supermercado', 'Conta corrente', '', 'Efetivada', '', 'casa'],
      ['', U.parseISO(U.today()), 'Guardar dinheiro', 'Transferência', 500, '', 'Conta corrente', 'Poupança', 'Pendente', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([SYS_HEADERS, ...ex], { cellDates: true });
    for (let r = 1; r <= ex.length; r++) ws[XLSX.utils.encode_cell({ r, c: 1 })].z = 'dd/mm/yyyy';
    ws['!cols'] = [{ wch: 8 }, { wch: 11 }, { wch: 30 }, { wch: 13 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 12 }];
    const info = XLSX.utils.aoa_to_sheet([['Instruções'], ['Preencha uma linha por lançamento na aba "Lançamentos".'], ['Tipo: Receita, Despesa ou Transferência. Valor sempre positivo.'], ['Categoria e Conta: use o nome exato; se não existir, o sistema cria.'], ['Status: Efetivada ou Pendente. Deixe a coluna ID vazia para novos lançamentos.'], ['Ao reimportar uma planilha exportada pelo sistema, linhas com ID atualizam o lançamento existente (não duplicam).']]);
    info['!cols'] = [{ wch: 100 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos'); XLSX.utils.book_append_sheet(wb, info, 'Instruções');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return U.saveFile('modelo-lancamentos.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  /** Verifica se a grade segue o modelo do sistema (cabeçalhos Data, Descrição, Tipo, Valor, Conta...) */
  function isSystemSheet(grid) {
    const h = (grid[0] || []).map((x) => U.norm(x));
    return h.includes('data') && h.includes('descricao') && h.includes('tipo') && h.includes('valor') && h.includes('conta');
  }
  /** Importa planilha no modelo do sistema; cria contas e categorias que não existirem */
  async function importSystemSheet(grid) {
    const h = grid[0].map((x) => U.norm(x)); const ix = (n) => h.indexOf(n);
    const I = { id: ix('id'), date: ix('data'), desc: ix('descricao'), type: ix('tipo'), val: ix('valor'), cat: ix('categoria'), acc: ix('conta'), to: ix('conta destino'), st: ix('status'), notes: ix('observacoes'), tags: ix('tags') };
    const accByName = new Map(F.accounts(true).map((a) => [U.norm(a.name), a.id]));
    const catByName = new Map(F.categories().map((c) => [U.norm(c.name) + '|' + c.type, c.id]));
    const newAccs = [], newCats = [], recs = [], errors = [];
    const accId = (name) => {
      const k = U.norm(name); if (!k) return null;
      if (!accByName.has(k)) { const id = U.uuid(); accByName.set(k, id); newAccs.push({ id, name: String(name).trim(), type: /cart/.test(k) ? 'cartao' : /poup/.test(k) ? 'poupanca' : 'corrente', initial_balance: 0 }); }
      return accByName.get(k);
    };
    const catId = (name, type) => {
      const k = U.norm(name); if (!k) return null;
      const hit = catByName.get(k + '|' + type) || catByName.get(k + '|ambos'); if (hit) return hit;
      const id = U.uuid(); catByName.set(k + '|' + type, id); newCats.push({ id, name: String(name).trim(), type, color: '#64748b' }); return id;
    };
    for (let i = 1; i < grid.length; i++) {
      const r = grid[i]; if (!r || !r.some((x) => String(x).trim())) continue;
      const date = U.parseDate(r[I.date], 'dmy'); let amount = U.parseMoney(r[I.val]);
      const tn = U.norm(r[I.type]);
      let type = /^rec|^cred|^entr/.test(tn) ? 'receita' : /^transf/.test(tn) ? 'transferencia' : /^desp|^deb|^sai/.test(tn) ? 'despesa' : null;
      if (!type && amount !== null) type = amount < 0 ? 'despesa' : 'receita';
      const account_id = accId(r[I.acc]);
      if (!date || amount === null || amount === 0 || !account_id) { errors.push(i + 1); continue; }
      amount = Math.abs(amount);
      const rec = {
        id: (I.id >= 0 && String(r[I.id]).trim()) || U.uuid(), date, description: String(r[I.desc] || '').trim() || 'Lançamento', type, amount, account_id,
        to_account_id: type === 'transferencia' ? accId(r[I.to]) : null, category_id: type === 'transferencia' ? null : catId(r[I.cat], type),
        status: /pend/.test(U.norm(r[I.st])) ? 'pendente' : 'efetivada', notes: I.notes >= 0 ? String(r[I.notes] || '') : '',
        tags: I.tags >= 0 ? String(r[I.tags] || '').split(',').map((x) => x.trim()).filter(Boolean) : [],
      };
      if (type === 'transferencia' && (!rec.to_account_id || rec.to_account_id === account_id)) { errors.push(i + 1); continue; }
      recs.push(rec);
    }
    if (newAccs.length) await Store.upsertMany('accounts', newAccs);
    if (newCats.length) await Store.upsertMany('categories', newCats);
    if (recs.length) await Store.upsertMany('transactions', recs);
    return { imported: recs.length, newAccs: newAccs.length, newCats: newCats.length, errors };
  }

  return { TYPES, build, toHTML, toPDF, toXLSX, toCSV, exportAll, template, isSystemSheet, importSystemSheet };
})();
