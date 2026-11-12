'use strict';
/* Relatórios com exportação para PDF, Excel e CSV */
Views.relatorios = (() => {
  const { $, $$, icon } = UI;
  const P = { type: 'resumo', preset: 'mes', from: '', to: '', account: '', onlyDone: false, month: null, date: U.today() };
  const PRESETS = [['mes', 'Este mês'], ['mespassado', 'Mês passado'], ['3m', 'Últimos 3 meses'], ['6m', 'Últimos 6 meses'], ['12m', 'Últimos 12 meses'], ['ano', 'Este ano'], ['anopassado', 'Ano passado'], ['custom', 'Personalizado']];
  function applyPreset() {
    const ym = U.monthOf(U.today()); const y = +ym.slice(0, 4);
    const map = {
      mes: [ym, ym], mespassado: [U.addMonthYM(ym, -1), U.addMonthYM(ym, -1)], '3m': [U.addMonthYM(ym, -2), ym], '6m': [U.addMonthYM(ym, -5), ym],
      '12m': [U.addMonthYM(ym, -11), ym], ano: [`${y}-01`, `${y}-12`], anopassado: [`${y - 1}-01`, `${y - 1}-12`],
    };
    if (map[P.preset]) { P.from = U.monthStart(map[P.preset][0]); P.to = U.monthEnd(map[P.preset][1]); }
  }
  function render() {
    if (!P.from) applyPreset();
    if (!P.month) P.month = App.state.month;
    const needs = Reports.TYPES[P.type].needs;
    const cards = F.accounts(true).filter((a) => a.type === 'cartao');
    if (needs.includes('cardRequired') && !cards.some((c) => c.id === P.account)) P.account = cards[0] ? cards[0].id : '';
    if (needs.includes('accountRequired') && !P.account) P.account = (F.accounts()[0] || {}).id || '';
    let R = null, err = '';
    try { R = Reports.build(P.type, P); } catch (e) { err = e.message; }
    return `<div class="card no-print">
      <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <label class="field"><span>Relatório</span><select class="input" data-p="type">${Object.entries(Reports.TYPES).map(([k, v]) => UI.opt(k, v.name, P.type)).join('')}</select></label>
        ${needs.includes('period') ? `<label class="field"><span>Período</span><select class="input" data-p="preset">${PRESETS.map(([k, v]) => UI.opt(k, v, P.preset)).join('')}</select></label>
          <label class="field"><span>De</span><input class="input" type="date" data-p="from" value="${P.from}"></label><label class="field"><span>Até</span><input class="input" type="date" data-p="to" value="${P.to}"></label>` : ''}
        ${needs.includes('month') ? `<label class="field"><span>Mês</span><input class="input" type="month" data-p="month" value="${P.month}"></label>` : ''}
        ${needs.includes('date') ? `<label class="field"><span>Posição em</span><input class="input" type="date" data-p="date" value="${P.date}"></label>` : ''}
        ${needs.includes('account') ? `<label class="field"><span>Conta</span><select class="input" data-p="account">${UI.accountOptions(P.account, { all: true, archived: true })}</select></label>` : ''}
        ${needs.includes('accountRequired') ? `<label class="field"><span>Conta</span><select class="input" data-p="account">${UI.accountOptions(P.account, { archived: true })}</select></label>` : ''}
        ${needs.includes('cardRequired') ? `<label class="field"><span>Cartão</span><select class="input" data-p="account">${cards.map((c) => UI.opt(c.id, c.name, P.account)).join('') || UI.opt('', 'Nenhum cartão cadastrado', '')}</select></label>` : ''}
        ${needs.includes('period') ? `<div class="field"><span>Considerar</span><label class="check"><input type="checkbox" data-p="onlyDone" ${P.onlyDone ? 'checked' : ''}> Somente efetivados</label></div>` : ''}
      </div>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-x="pdf">${icon('pdf')}Gerar PDF</button><button class="btn" data-x="xlsx">${icon('sheet')}Excel (.xlsx)</button><button class="btn" data-x="csv">CSV</button><button class="btn" data-x="print">${icon('print')}Imprimir</button><span class="spacer"></span><button class="btn ghost" data-x="all">Exportar todos os dados (Excel)</button></div>
    </div>
    ${err ? `<div class="card empty">${U.esc(err)}</div>` : `<div class="row between" style="margin:6px 0 12px"><div><h2 style="font-size:18px">${U.esc(R.title)}</h2><span class="muted small">${U.esc(R.subtitle)}</span></div></div>${Reports.toHTML(R)}`}`;
  }
  function bind(root) {
    $$('[data-p]', root).forEach((el) => (el.onchange = () => {
      const k = el.dataset.p; P[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'preset') applyPreset();
      if (k === 'from' || k === 'to') { P.preset = 'custom'; if (P.from && P.to && P.from > P.to) [P.from, P.to] = [P.to, P.from]; }
      App.render();
    }));
    $$('[data-x]', root).forEach((b) => (b.onclick = async () => {
      const x = b.dataset.x;
      try {
        if (x === 'all') { await Reports.exportAll(); return UI.toast('Planilha completa gerada', 'ok'); }
        if (x === 'print') return window.print();
        const R = Reports.build(P.type, P);
        const name = P.type + '-' + U.fileStamp();
        b.disabled = true;
        const r = x === 'pdf' ? await Reports.toPDF(R, name) : x === 'xlsx' ? await Reports.toXLSX(R, name) : await Reports.toCSV(R, name);
        UI.toast(typeof r === 'string' ? 'Salvo em ' + r : 'Arquivo gerado', 'ok');
      } catch (e) { console.error(e); UI.toast(e.message, 'error', 5000); } finally { b.disabled = false; }
    }));
  }
  return { title: 'Relatórios', render, bind };
})();
