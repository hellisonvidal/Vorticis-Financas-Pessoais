/* Endividamento: cadastro de dívidas, indicadores, plano de quitação e leitura do relatório do Registrato (SCR/Banco Central) */
'use strict';

const Debts = (() => {
  const KINDS = {
    cartao_rotativo: 'Cartão de crédito (rotativo/atraso)', cartao_parcelado: 'Cartão de crédito (fatura parcelada)', cheque_especial: 'Cheque especial',
    credito_pessoal: 'Empréstimo pessoal', consignado: 'Empréstimo consignado', financiamento_veiculo: 'Financiamento de veículo',
    financiamento_imovel: 'Financiamento imobiliário', estudantil: 'Crédito estudantil (FIES etc.)', acordo: 'Acordo / renegociação',
    conta_atrasada: 'Conta em atraso (luz, telefone, loja…)', imposto: 'Impostos / tributos', outro: 'Outra dívida',
  };
  const STATUS = { em_dia: 'Em dia', atrasada: 'Em atraso', negociando: 'Negociando', quitada: 'Quitada' };
  const SOURCES = { manual: 'Cadastro manual', registrato: 'Registrato (Banco Central)', serasa: 'Serasa', spc: 'SPC Brasil', boavista: 'Boa Vista (SCPC)', protesto: 'Protesto em cartório', openfinance: 'Open Finance (banco)' };
  const CAT = 'cat-dividas';

  // Fontes oficiais de consulta gratuita do próprio CPF
  const OFFICIAL = [
    { id: 'registrato', name: 'Registrato — Banco Central', url: 'https://www.bcb.gov.br/cidadaniafinanceira/registrato',
      what: 'Todos os empréstimos, financiamentos, cartões e cheque especial que os bancos informam ao Banco Central (SCR), inclusive valores vencidos.',
      how: 'Entre com a conta gov.br (nível prata ou ouro), escolha "Empréstimos e Financiamentos (SCR)" e baixe o PDF. Depois importe o arquivo aqui.', importable: true },
    { id: 'serasa', name: 'Serasa', url: 'https://www.serasa.com.br',
      what: 'Dívidas negativadas no seu CPF (nome sujo), score e ofertas de acordo do Serasa Limpa Nome.', how: 'Consulta grátis do CPF pelo site ou aplicativo. Cadastre aqui as dívidas encontradas, com a origem "Serasa".' },
    { id: 'spc', name: 'SPC Brasil', url: 'https://www.spcbrasil.org.br',
      what: 'Registros de inadimplência informados pelo comércio (lojistas e CDLs).', how: 'Consulta do consumidor pelo site. Cadastre as pendências com a origem "SPC Brasil".' },
    { id: 'boavista', name: 'Boa Vista (SCPC) — Consumidor Positivo', url: 'https://www.consumidorpositivo.com.br',
      what: 'Pendências registradas no SCPC/Boa Vista e score.', how: 'Consulta grátis do CPF. Cadastre as pendências com a origem "Boa Vista".' },
    { id: 'protesto', name: 'Protestos em cartório (CENPROT)', url: 'https://www.protestodetitulos.org.br',
      what: 'Títulos protestados em cartório no seu CPF em todo o Brasil.', how: 'Consulta grátis por CPF. Cadastre os protestos com a origem "Protesto".' },
  ];

  async function ensureCategory() {
    if (Store.all('categories', true).some((c) => c.id === CAT)) return;
    await Store.upsertMany('categories', [{ id: CAT, name: 'Empréstimos e dívidas', type: 'despesa', color: '#be123c' }], { seed: true, silent: true });
  }

  const list = (incPaid = true) => Store.all('debts').filter((d) => incPaid || d.status !== 'quitada')
    .sort((a, b) => (a.status === 'quitada') - (b.status === 'quitada') || (b.balance || 0) - (a.balance || 0));

  /** Cartões de crédito com saldo devedor (vêm das contas, não precisam ser cadastrados) */
  function cardDebts() {
    return F.accounts().filter((a) => a.type === 'cartao' && a.include_total !== false).map((a) => {
      const owed = Math.max(0, -F.balance(a.id, { mode: 'previsto', until: '9999-12-31' }));
      return { id: 'acc:' + a.id, account_id: a.id, name: a.name, creditor: a.bank || '', kind: 'cartao_parcelado', balance: owed, rate: 0, installment: 0, status: 'em_dia', auto: true };
    }).filter((d) => d.balance > 0);
  }

  /** Renda mensal média dos últimos 3 meses fechados (se não houver, usa o mês atual) */
  function avgIncome(ym = U.monthOf(U.today())) {
    const ms = F.monthly(U.addMonthYM(ym, -3), U.addMonthYM(ym, -1)).filter((m) => m.receitas > 0);
    if (ms.length) return Math.round(ms.reduce((a, m) => a + m.receitas, 0) / ms.length);
    return F.summary(U.monthStart(ym), U.monthEnd(ym)).receitas;
  }

  /** Pagamento mensal mínimo considerado no plano */
  function minPayment(d) {
    if (d.installment > 0) return d.installment;
    const r = (d.rate || 0) / 100;
    return Math.max(Math.round(d.balance * r) + Math.round(d.balance * 0.03), Math.min(d.balance, 5000));
  }

  function overview({ includeCards = true } = {}) {
    const ds = list(false); const cards = includeCards ? cardDebts() : [];
    const all = ds.concat(cards);
    const total = all.reduce((a, d) => a + (d.balance || 0), 0);
    const overdue = ds.reduce((a, d) => a + (d.status === 'atrasada' ? (d.overdue || d.balance || 0) : (d.overdue || 0)), 0);
    const monthly = ds.reduce((a, d) => a + (d.installment || 0), 0);
    const withRate = ds.filter((d) => d.rate > 0 && d.balance > 0);
    const wRate = withRate.length ? withRate.reduce((a, d) => a + d.rate * d.balance, 0) / withRate.reduce((a, d) => a + d.balance, 0) : 0;
    const income = avgIncome();
    const ratio = income ? monthly / income : null;
    const level = ratio === null ? 'sem_renda' : ratio <= 0.3 ? 'saudavel' : ratio <= 0.5 ? 'atencao' : 'critico';
    const byKind = {};
    all.forEach((d) => { byKind[d.kind] = (byKind[d.kind] || 0) + (d.balance || 0); });
    return { debts: ds, cards, all, total, overdue, monthly, wRate, income, ratio, level, count: all.length, byKind,
      lateCount: ds.filter((d) => d.status === 'atrasada').length };
  }

  /**
   * Simula a quitação. strategy: 'avalanche' (maiores juros primeiro), 'bolaneve' (menores saldos primeiro) ou 'minimo' (só as parcelas).
   * extra: valor mensal adicional (centavos). Retorna meses, juros totais e mês de quitação de cada dívida.
   */
  function simulate(debts, { strategy = 'avalanche', extra = 0, maxMonths = 600 } = {}) {
    const ds = debts.filter((d) => d.balance > 0).map((d) => ({ id: d.id, name: d.name, bal: d.balance, r: (d.rate || 0) / 100, min: minPayment(d), rate: d.rate || 0, paidAt: null, interest: 0 }));
    if (!ds.length) return { months: 0, interest: 0, total: 0, order: [], feasible: true, budget: 0 };
    const budget = ds.reduce((a, d) => a + d.min, 0) + (strategy === 'minimo' ? 0 : Math.max(0, extra));
    const prio = (a, b) => (strategy === 'bolaneve' ? a.bal - b.bal || b.rate - a.rate : b.rate - a.rate || a.bal - b.bal);
    let month = 0, interest = 0, paid = 0;
    while (ds.some((d) => d.bal > 0) && month < maxMonths) {
      month++;
      ds.forEach((d) => { if (d.bal > 0) { const j = Math.round(d.bal * d.r); d.bal += j; d.interest += j; interest += j; } });
      let avail = budget;
      ds.forEach((d) => { if (d.bal > 0) { const p = Math.min(d.bal, d.min, avail); d.bal -= p; avail -= p; paid += p; } });
      if (strategy !== 'minimo') {
        ds.filter((d) => d.bal > 0).sort(prio).forEach((d) => { if (avail <= 0) return; const p = Math.min(d.bal, avail); d.bal -= p; avail -= p; paid += p; });
      }
      ds.forEach((d) => { if (d.bal <= 0 && !d.paidAt) d.paidAt = month; });
    }
    const feasible = ds.every((d) => d.bal <= 0);
    return { months: feasible ? month : null, interest, total: paid, budget, feasible,
      order: ds.slice().sort((a, b) => (a.paidAt || 1e9) - (b.paidAt || 1e9)).map((d) => ({ id: d.id, name: d.name, month: d.paidAt, interest: d.interest, rate: d.rate, min: d.min })) };
  }

  const LOAN_KINDS = ['credito_pessoal', 'consignado', 'financiamento_veiculo', 'financiamento_imovel', 'estudantil', 'acordo', 'cartao_parcelado'];
  const isLoan = (d) => !!(d && LOAN_KINDS.includes(d.kind));
  const MAX_PARC = 420;

  function dateForYM(ym, day) {
    const [y, m] = ym.split('-').map(Number);
    const d = Math.min(Math.max(1, day | 0), U.daysInMonth(y, m));
    return `${ym}-${U.pad(d)}`;
  }

  /**
   * Calcula o cronograma de vencimentos de um empréstimo/financiamento.
   * Quando há data de contratação e total de parcelas, a 1ª parcela vence no mês seguinte à contratação
   * (no dia de vencimento informado, ou no mesmo dia da contratação).
   */
  function calcSchedule(debt, { paidNums = new Set(), today = U.today() } = {}) {
    if (!debt) return { items: [], total: 0, remaining: 0, firstDate: null, lastDate: null, endDate: null };
    const total = debt.total_installments > 0 ? Math.min(MAX_PARC, parseInt(debt.total_installments, 10)) : 0;
    const hasRem = debt.remaining !== null && debt.remaining !== undefined && debt.remaining !== '';
    const remInput = hasRem ? Math.max(0, Math.min(MAX_PARC, parseInt(debt.remaining, 10))) : null;
    const hasContract = /^\d{4}-\d{2}-\d{2}$/.test(debt.contract_date || '');

    if (hasContract) {
      const N = total || (remInput || 0);
      if (N <= 0) return { items: [], total: 0, remaining: 0, firstDate: null, lastDate: null, endDate: null };
      const day = debt.due_day || +debt.contract_date.slice(8, 10);
      const baseYM = U.monthOf(debt.contract_date);
      const all = Array.from({ length: N }, (_, idx) => {
        const number = idx + 1;
        return { number, total: N, date: dateForYM(U.addMonthYM(baseYM, number), day) };
      });
      const endDate = all[all.length - 1].date;
      if (debt.status === 'quitada') return { items: [], total: N, remaining: 0, firstDate: null, lastDate: null, endDate };
      const unpaid = all.filter((x) => !paidNums.has(x.number));
      let items;
      if (remInput !== null) items = remInput > 0 ? unpaid.slice(-Math.min(remInput, unpaid.length)) : [];
      else {
        const curStart = U.monthStart(U.monthOf(today));
        items = unpaid.filter((x) => x.date >= curStart);
      }
      return {
        items, total: N, remaining: items.length,
        firstDate: items[0] ? items[0].date : null,
        lastDate: items.length ? items[items.length - 1].date : null,
        endDate,
      };
    }

    const rem = remInput !== null ? remInput : total;
    const N = Math.max(total, rem);
    if (debt.status === 'quitada' || rem <= 0) return { items: [], total: N, remaining: 0, firstDate: null, lastDate: null, endDate: null };
    const day = debt.due_day || (debt.balance_date ? +debt.balance_date.slice(8, 10) : +today.slice(8, 10));
    const curYM = U.monthOf(today);
    const thisMonthDate = dateForYM(curYM, day);
    const startYM = debt.status === 'atrasada' || thisMonthDate >= today ? curYM : U.addMonthYM(curYM, 1);
    const unpaidNums = [];
    for (let k = 1; k <= N; k++) if (!paidNums.has(k)) unpaidNums.push(k);
    const nums = unpaidNums.slice(-Math.min(rem, unpaidNums.length));
    const items = nums.map((number, idx) => ({ number, total: N, date: dateForYM(U.addMonthYM(startYM, idx), day) }));
    const endDate = items.length ? items[items.length - 1].date : null;
    return { items, total: N, remaining: items.length, firstDate: items[0] ? items[0].date : null, lastDate: endDate, endDate };
  }

  /** Data prevista da última parcela do contrato */
  function endDate(debt, today = U.today()) {
    if (!debt) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(debt.contract_date || '') && debt.total_installments > 0) {
      const n = Math.min(MAX_PARC, parseInt(debt.total_installments, 10));
      const day = debt.due_day || +debt.contract_date.slice(8, 10);
      return dateForYM(U.addMonthYM(U.monthOf(debt.contract_date), n), day);
    }
    const pend = pendingInstallments(debt.id);
    if (pend.length) return pend[pend.length - 1].date;
    if (debt.remaining > 0) return dateForYM(U.addMonthYM(U.monthOf(today), debt.remaining), debt.due_day || 1);
    return null;
  }

  const payments = (id) => F.txs().filter((t) => t.debt_id === id).sort((a, b) => b.date.localeCompare(a.date));
  const paidPayments = (id) => F.txs().filter((t) => t.debt_id === id && t.status !== 'pendente').sort((a, b) => b.date.localeCompare(a.date));
  const pendingInstallments = (id) => F.txs().filter((t) => t.debt_id === id && t.status === 'pendente')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.debt_installment || 0) - (b.debt_installment || 0));

  /**
   * Gera ou atualiza em Despesas os vencimentos mensais (pendentes) de um empréstimo/financiamento.
   * Usa IDs determinísticos (debt:<id>:p<n>) para evitar duplicidade entre aparelhos sincronizados
   * e nunca altera nem apaga parcelas já pagas (efetivadas).
   */
  async function syncExpenses(debt, { today = U.today() } = {}) {
    if (!debt || !debt.id) return { created: 0, updated: 0, removed: 0, total: 0 };
    await ensureCategory();
    const existingActive = F.txs().filter((t) => t.debt_id === debt.id && t.debt_installment > 0);
    const paidNums = new Set(existingActive.filter((t) => t.status !== 'pendente').map((t) => t.debt_installment));
    const pendingByNum = new Map();
    existingActive.filter((t) => t.status === 'pendente').forEach((t) => pendingByNum.set(t.debt_installment, t));

    if (debt.sync_expenses === false || debt.status === 'quitada' || !(debt.installment > 0)) {
      const toRemove = [...pendingByNum.values()].map((t) => t.id);
      if (toRemove.length) await Store.removeMany('transactions', toRemove);
      return { created: 0, updated: 0, removed: toRemove.length, total: 0 };
    }

    const sched = calcSchedule(debt, { paidNums, today });
    const desiredNums = new Set();
    const toUpsert = [];
    let created = 0, updated = 0;

    for (const it of sched.items) {
      if (paidNums.has(it.number)) continue;
      desiredNums.add(it.number);
      const id = `debt:${debt.id}:p${it.number}`;
      const description = it.total > 1 ? `${debt.name} (${it.number}/${it.total})` : debt.name;
      const accId = debt.account_id || null;
      const cur = pendingByNum.get(it.number);
      if (cur && cur.id === id && cur.date === it.date && cur.amount === debt.installment && cur.description === description
        && (cur.account_id || null) === accId && cur.category_id === CAT && cur.installment === it.number && cur.installments === it.total) {
        continue;
      }
      if (cur) updated++; else created++;
      toUpsert.push({
        ...(cur || {}),
        id,
        type: 'despesa',
        account_id: accId,
        to_account_id: null,
        category_id: CAT,
        date: it.date,
        amount: debt.installment,
        description,
        status: 'pendente',
        debt_id: debt.id,
        debt_installment: it.number,
        group_id: 'debt:' + debt.id,
        installment: it.number,
        installments: it.total,
        repeat: 'parcelas',
        ...(debt.sample ? { sample: true } : {}),
      });
    }

    const toRemove = [...pendingByNum.entries()].filter(([num]) => !desiredNums.has(num)).map(([, t]) => t.id);
    if (toRemove.length) await Store.removeMany('transactions', toRemove);
    if (toUpsert.length) await Store.upsertMany('transactions', toUpsert);
    return { created, updated, removed: toRemove.length, total: sched.items.length };
  }

  /** Ao abrir o app, gera despesas mensais para empréstimos/financiamentos ativos ainda sem parcelas lançadas */
  async function syncExistingLoans() {
    const allTxInclDeleted = Store.all('transactions', true);
    const syncedDebtIds = new Set(allTxInclDeleted.filter((t) => t.debt_id && t.debt_installment > 0).map((t) => t.debt_id));
    for (const d of Store.all('debts')) {
      if (d.status === 'quitada' || d.sync_expenses === false) continue;
      if (!(d.installment > 0) || !(d.total_installments > 0 || d.remaining > 0)) continue;
      if (syncedDebtIds.has(d.id)) continue;
      await syncExpenses(d);
    }
  }

  /** Mantém o saldo e as parcelas restantes da dívida em dia quando uma parcela é paga/reaberta em Despesas */
  async function onTxStatusChange(beforeTx, afterTx) {
    if (!afterTx || !afterTx.debt_id || !beforeTx || beforeTx.status === afterTx.status) return null;
    const debt = Store.get('debts', afterTx.debt_id);
    if (!debt) return null;
    const hasSched = F.txs().some((t) => t.debt_id === debt.id && t.debt_installment > 0);
    const pend = pendingInstallments(debt.id);
    if (beforeTx.status === 'pendente' && afterTx.status !== 'pendente') {
      const nextRem = hasSched ? pend.length : (debt.remaining > 0 ? debt.remaining - 1 : debt.remaining);
      const finished = hasSched && pend.length === 0;
      const bal = finished ? 0 : Math.max(0, (debt.balance || 0) - afterTx.amount);
      const upd = { ...debt, balance: bal, balance_date: afterTx.date, remaining: nextRem };
      if (bal === 0 || finished) upd.status = 'quitada';
      else if (upd.status === 'atrasada' && (debt.overdue || 0) <= afterTx.amount) { upd.status = 'em_dia'; upd.overdue = 0; }
      else if (debt.overdue) upd.overdue = Math.max(0, debt.overdue - afterTx.amount);
      const saved = await Store.upsert('debts', upd);
      if (saved.status === 'quitada' && pend.length) await Store.removeMany('transactions', pend.filter((t) => t.debt_installment > 0).map((t) => t.id));
      return saved;
    }
    if (beforeTx.status !== 'pendente' && afterTx.status === 'pendente') {
      const nextRem = hasSched ? pend.length : ((debt.remaining || 0) + 1);
      const upd = { ...debt, balance: (debt.balance || 0) + afterTx.amount, remaining: nextRem };
      if (upd.status === 'quitada') upd.status = 'em_dia';
      return Store.upsert('debts', upd);
    }
    return null;
  }

  /** Atualiza parcelas restantes caso parcelas pendentes sejam excluídas diretamente em Despesas */
  async function reconcileAfterTxRemove(debtId) {
    if (!debtId) return;
    const debt = Store.get('debts', debtId);
    if (!debt || debt.status === 'quitada') return;
    const sched = F.txs().filter((t) => t.debt_id === debtId && t.debt_installment > 0);
    const pend = sched.filter((t) => t.status === 'pendente');
    if (sched.length && debt.remaining !== pend.length) {
      await Store.upsert('debts', { ...debt, remaining: pend.length });
    }
  }

  /** Exclui a dívida e seus vencimentos pendentes em Despesas (pagamentos já efetuados são mantidos) */
  async function remove(debtId) {
    const pendIds = F.txs().filter((t) => t.debt_id === debtId && t.debt_installment > 0 && t.status === 'pendente').map((t) => t.id);
    if (pendIds.length) await Store.removeMany('transactions', pendIds);
    await Store.remove('debts', debtId);
  }

  /** Registra um pagamento: efetiva a próxima parcela em Despesas (ou cria a despesa) e abate do saldo devedor */
  async function pay(debt, { amount, principal, date, account_id, status = 'efetivada' }) {
    if (!(amount > 0)) throw new Error('Informe o valor pago.');
    if (!account_id) throw new Error('Escolha a conta de onde saiu o pagamento.');
    await ensureCategory();
    const nextPend = pendingInstallments(debt.id).find((t) => t.debt_installment > 0);
    if (nextPend) {
      await Store.upsert('transactions', { ...nextPend, account_id, date, amount, status, category_id: CAT });
    } else {
      await Store.upsert('transactions', { id: U.uuid(), account_id, date, type: 'despesa', amount, category_id: CAT, description: 'Pagamento: ' + debt.name, status, debt_id: debt.id });
    }
    if (status === 'pendente') return debt;
    const remainingPend = pendingInstallments(debt.id).filter((t) => t.debt_installment > 0);
    const finished = !!nextPend && remainingPend.length === 0;
    const bal = finished ? 0 : Math.max(0, (debt.balance || 0) - (principal ?? amount));
    const upd = { ...debt, balance: bal, balance_date: date };
    if (nextPend) upd.remaining = remainingPend.length;
    else if (debt.remaining > 0) upd.remaining = debt.remaining - 1;
    if (bal === 0 || finished) upd.status = 'quitada';
    else if (upd.status === 'atrasada' && (debt.overdue || 0) <= amount) { upd.status = 'em_dia'; upd.overdue = 0; }
    else if (debt.overdue) upd.overdue = Math.max(0, debt.overdue - amount);
    const saved = await Store.upsert('debts', upd);
    if (saved.status === 'quitada' && remainingPend.length) {
      await Store.removeMany('transactions', remainingPend.map((t) => t.id));
    }
    return saved;
  }

  // ---------- leitura do relatório do Registrato (SCR) ----------
  const KIND_RULES = [
    [/cheque especial|conta garantida/, 'cheque_especial'],
    [/consignad/, 'consignado'],
    [/rotativo|cartao.*(atraso|vencid)/, 'cartao_rotativo'],
    [/cartao|fatura/, 'cartao_parcelado'],
    [/imobiliari|habitac|imovel|sfh|sfi/, 'financiamento_imovel'],
    [/veicul|automovel|aquisicao de bens/, 'financiamento_veiculo'],
    [/estudantil|fies/, 'estudantil'],
    [/renegocia|composicao de divida|acordo/, 'acordo'],
    [/emprestimo|credito pessoal|capital de giro|adiantamento|financiamento|desconto de|arrendamento|outros creditos|repasse/, 'credito_pessoal'],
  ];
  const MONEY = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const INST_RE = /(banco|caixa|bradesco|itau|santander|nubank|nu pagamentos|inter\b|c6|sicoob|sicredi|btg|original|pan\b|bmg|safra|mercado pago|picpay|neon|agibank|daycoval|votorantim|cooperativa|financeira|credito,? financiamento|s\.?\/?a\.?$|scfi|ltda|instituicao de pagamento|pagamentos s)/;

  function kindOf(text) { const n = U.norm(text); const r = KIND_RULES.find(([re]) => re.test(n)); return r ? r[1] : null; }

  /**
   * Lê as linhas de texto do PDF do Registrato e devolve as dívidas por instituição e modalidade.
   * É uma leitura aproximada: o usuário sempre revisa antes de salvar.
   */
  function parseSCR(lines) {
    const out = new Map(); let inst = '', sit = 'a_vencer', refDate = null;
    const clean = (s) => s.replace(/\s{2,}/g, ' ').trim();
    for (const raw of lines) {
      const line = clean(String(raw || '')); if (!line) continue;
      const n = U.norm(line);
      const dm = n.match(/(data[- ]base|referencia|mes)\D{0,20}(\d{2})\/(\d{4})/); if (dm && !refDate) refDate = `${dm[3]}-${dm[2]}`;
      // instituição
      const im = line.match(/^(?:institui[cç][aã]o(?: financeira)?|credor|IF)\s*[:\-–]\s*(.+)$/i);
      if (im) { inst = clean(im[1].replace(MONEY, '')); sit = 'a_vencer'; continue; }
      const money = line.match(MONEY) || [];
      if (!money.length && INST_RE.test(n) && line.length <= 90 && !kindOf(line)) { inst = line; sit = 'a_vencer'; continue; }
      // situação (blocos)
      if (/^(total )?(a vencer|em dia)\b/.test(n)) sit = 'a_vencer';
      else if (/^(total )?vencid/.test(n)) sit = 'vencido';
      else if (/^(total )?(prejuizo|baixad)/.test(n)) sit = 'prejuizo';
      else if (/^(total )?(limite|credito a liberar|coobriga|garantia)/.test(n)) sit = 'ignorar';
      if (/^total\b|^subtotal\b|responsabilidade total/.test(n)) continue;
      const kind = kindOf(line);
      if (!kind || !money.length) continue;
      let s = sit;
      if (/vencid|atraso/.test(n)) s = 'vencido'; else if (/prejuizo/.test(n)) s = 'prejuizo'; else if (/a vencer|em dia/.test(n)) s = 'a_vencer'; else if (/limite|a liberar|coobriga/.test(n)) s = 'ignorar';
      if (s === 'ignorar') continue;
      const v = U.parseMoney(money[money.length - 1]); if (!v || v <= 0) continue;
      const modal = clean(line.replace(MONEY, '').replace(/R\$/g, '')).replace(/[\s\-–|]+$/, '').slice(0, 120);
      const key = U.norm(inst || 'instituicao nao identificada') + '|' + kind;
      const cur = out.get(key) || { key, creditor: inst || 'Instituição não identificada', kind, modalidade: modal, a_vencer: 0, vencido: 0, prejuizo: 0 };
      cur[s] += v; out.set(key, cur);
    }
    return { refDate, items: [...out.values()].map((r) => ({ ...r, balance: r.a_vencer + r.vencido + r.prejuizo, overdue: r.vencido + r.prejuizo })) };
  }

  /** Grava itens revisados do Registrato: atualiza a dívida já importada da mesma instituição/modalidade */
  async function saveSCR(items, refDate) {
    const existing = Store.all('debts').filter((d) => d.source === 'registrato');
    const recs = items.map((it) => {
      const old = existing.find((d) => d.src_key === it.key);
      return { ...(old || { id: U.uuid(), rate: 0, installment: 0, color: '#be123c' }), name: it.name || `${KINDS[it.kind]} — ${it.creditor}`, creditor: it.creditor, kind: it.kind,
        balance: it.balance, overdue: it.overdue, status: it.overdue > 0 ? 'atrasada' : (old && old.status === 'negociando' ? 'negociando' : 'em_dia'),
        source: 'registrato', src_key: it.key, balance_date: refDate ? refDate + '-01' : U.today(), notes: (old && old.notes) || (it.modalidade ? 'SCR: ' + it.modalidade : '') };
    });
    if (recs.length) await Store.upsertMany('debts', recs);
    return recs.length;
  }

  return {
    KINDS, LOAN_KINDS, isLoan, STATUS, SOURCES, OFFICIAL, CAT, ensureCategory, list, cardDebts, overview, avgIncome, minPayment, simulate,
    dateForYM, calcSchedule, endDate, syncExpenses, syncExistingLoans, onTxStatusChange, reconcileAfterTxRemove, remove,
    pay, payments, paidPayments, pendingInstallments, parseSCR, saveSCR, kindOf,
  };
})();
if (typeof module !== 'undefined') module.exports = Debts;
