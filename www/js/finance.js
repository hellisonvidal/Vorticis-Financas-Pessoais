/* Regras de negócio: saldos, categorias, lançamentos recorrentes/parcelados, cartões, orçamentos */
'use strict';

const F = (() => {
  const ACCOUNT_TYPES = {
    corrente: 'Conta corrente', poupanca: 'Poupança', carteira: 'Dinheiro / Carteira',
    investimento: 'Investimento', cartao: 'Cartão de crédito', outro: 'Outro',
  };
  const TX_TYPES = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' };
  const ADJ_CAT = 'cat-ajuste';

  // ids fixos: dispositivos diferentes criam as mesmas categorias padrão sem duplicar
  const DEFAULT_CATEGORIES = [
    ['cat-salario', 'Salário', 'receita', '#16a34a'], ['cat-renda-extra', 'Renda extra / Freelance', 'receita', '#22c55e'],
    ['cat-rendimentos', 'Rendimentos e juros', 'receita', '#0d9488'], ['cat-reembolso', 'Reembolsos', 'receita', '#65a30d'],
    ['cat-vendas', 'Vendas', 'receita', '#059669'], ['cat-outras-receitas', 'Outras receitas', 'receita', '#84cc16'],
    ['cat-moradia', 'Moradia (aluguel, condomínio)', 'despesa', '#7c3aed'], ['cat-contas-casa', 'Contas da casa (luz, água, gás, internet)', 'despesa', '#6366f1'],
    ['cat-mercado', 'Supermercado', 'despesa', '#f97316'], ['cat-alimentacao', 'Restaurantes e delivery', 'despesa', '#fb923c'],
    ['cat-transporte', 'Transporte (combustível, app, ônibus)', 'despesa', '#0ea5e9'], ['cat-veiculo', 'Veículo (manutenção, IPVA, seguro)', 'despesa', '#0284c7'],
    ['cat-saude', 'Saúde e farmácia', 'despesa', '#ef4444'], ['cat-educacao', 'Educação', 'despesa', '#eab308'],
    ['cat-lazer', 'Lazer e viagens', 'despesa', '#ec4899'], ['cat-assinaturas', 'Assinaturas e streaming', 'despesa', '#a855f7'],
    ['cat-compras', 'Compras e vestuário', 'despesa', '#d946ef'], ['cat-cuidados', 'Cuidados pessoais', 'despesa', '#f472b6'],
    ['cat-pets', 'Pets', 'despesa', '#b45309'], ['cat-impostos', 'Impostos e taxas', 'despesa', '#78716c'],
    ['cat-tarifas', 'Tarifas bancárias e juros', 'despesa', '#57534e'], ['cat-presentes', 'Presentes e doações', 'despesa', '#f43f5e'],
    ['cat-investimentos', 'Aportes em investimentos', 'despesa', '#14b8a6'], ['cat-outras-despesas', 'Outras despesas', 'despesa', '#94a3b8'],
    [ADJ_CAT, 'Ajuste de saldo', 'ambos', '#64748b'],
  ].map(([id, name, type, color]) => ({ id, name, type, color }));

  const DEFAULT_RULES = [
    ['rule-uber', 'uber', 'cat-transporte'], ['rule-99', '99app', 'cat-transporte'], ['rule-posto', 'posto', 'cat-transporte'],
    ['rule-ifood', 'ifood', 'cat-alimentacao'], ['rule-netflix', 'netflix', 'cat-assinaturas'], ['rule-spotify', 'spotify', 'cat-assinaturas'],
    ['rule-farmacia', 'farmacia', 'cat-saude'], ['rule-drogaria', 'drogaria', 'cat-saude'], ['rule-tarifa', 'tarifa', 'cat-tarifas'],
    ['rule-iof', 'iof', 'cat-tarifas'], ['rule-rendimento', 'rendimento', 'cat-rendimentos'], ['rule-salario', 'salario', 'cat-salario'],
    ['rule-supermerc', 'supermerc', 'cat-mercado'], ['rule-mercado', 'mercado', 'cat-mercado'],
  ].map(([id, pattern, category_id]) => ({ id, pattern, category_id }));

  async function seedIfEmpty() {
    if (Store.getMeta('seeded')) return;
    if (!Store.all('categories', true).length) await Store.upsertMany('categories', DEFAULT_CATEGORIES, { seed: true, silent: true });
    if (!Store.all('rules', true).length) await Store.upsertMany('rules', DEFAULT_RULES, { seed: true, silent: true });
    await Store.setMeta('seeded', true);
  }

  const accounts = (incArchived = false) => Store.all('accounts').filter((a) => incArchived || !a.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  const categories = (type) => Store.all('categories').filter((c) => !type || c.type === type || c.type === 'ambos').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const txs = () => Store.all('transactions');
  const catName = (id) => (Store.get('categories', id) || {}).name || 'Sem categoria';
  const catColor = (id) => (Store.get('categories', id) || {}).color || '#94a3b8';
  const accName = (id) => (Store.get('accounts', id) || {}).name || '(conta excluída)';

  /** Efeito (com sinal, em centavos) de um lançamento sobre uma conta */
  function effect(t, accId) {
    if (t.type === 'transferencia') {
      let v = 0;
      if (t.account_id === accId) v -= t.amount;
      if (t.to_account_id === accId) v += t.amount;
      return v;
    }
    if (t.account_id !== accId) return 0;
    return t.type === 'receita' ? t.amount : -t.amount;
  }
  const isDone = (t) => t.status !== 'pendente';

  /**
   * Saldo de uma conta.
   *  - mode 'atual': saldo inicial + lançamentos efetivados (pagos/recebidos)
   *  - mode 'previsto': saldo inicial + todos os lançamentos até a data 'until'
   *  - mode 'data': saldo inicial + efetivados com data <= until
   */
  function balance(accId, { mode = 'atual', until = null } = {}) {
    const a = Store.get('accounts', accId); if (!a) return 0;
    let b = a.initial_balance || 0;
    for (const t of txs()) {
      if (t.account_id !== accId && t.to_account_id !== accId) continue;
      if (mode === 'atual' && !isDone(t)) continue;
      if (mode === 'data' && (!isDone(t) || t.date > until)) continue;
      if (mode === 'previsto' && until && t.date > until) continue;
      b += effect(t, accId);
    }
    return b;
  }
  function totals({ until } = {}) {
    let atual = 0, previsto = 0, cartoes = 0, invest = 0;
    accounts().forEach((a) => {
      if (a.include_total === false) return;
      const s = balance(a.id); const p = balance(a.id, { mode: 'previsto', until: until || U.monthEnd(U.monthOf(U.today())) });
      atual += s; previsto += p;
      if (a.type === 'cartao') cartoes += s;
      if (a.type === 'investimento') invest += s;
    });
    return { atual, previsto, cartoes, invest };
  }

  /** Resumo de receitas/despesas num período (transferências e ajustes ficam de fora) */
  function summary(from, to, { accountId = null, onlyDone = false, includeAdjust = false } = {}) {
    let rec = 0, desp = 0; const porCat = {};
    for (const t of txs()) {
      if (t.type === 'transferencia' || t.date < from || t.date > to) continue;
      if (accountId && t.account_id !== accountId) continue;
      if (onlyDone && !isDone(t)) continue;
      if (!includeAdjust && t.category_id === ADJ_CAT) continue;
      const acc = Store.get('accounts', t.account_id); if (acc && acc.include_total === false && !accountId) continue;
      if (t.type === 'receita') rec += t.amount; else desp += t.amount;
      const k = (t.category_id || '') + '|' + t.type;
      porCat[k] = (porCat[k] || 0) + t.amount;
    }
    const cats = Object.entries(porCat).map(([k, v]) => { const [id, type] = k.split('|'); return { id, type, name: catName(id), color: catColor(id), total: v }; }).sort((a, b) => b.total - a.total);
    return { receitas: rec, despesas: desp, resultado: rec - desp, cats };
  }

  function monthly(fromYM, toYM, opts = {}) {
    return U.monthsBetween(fromYM, toYM).map((ym) => ({ ym, ...summary(U.monthStart(ym), U.monthEnd(ym), opts) }));
  }

  /** Evolução do patrimônio total (saldo no fim de cada mês, considerando lançamentos até a data) */
  function netWorthSeries(fromYM, toYM) {
    const accs = accounts(true).filter((a) => a.include_total !== false);
    return U.monthsBetween(fromYM, toYM).map((ym) => {
      const end = U.monthEnd(ym); let v = 0;
      accs.forEach((a) => { v += balance(a.id, { mode: 'previsto', until: end }); });
      return { ym, value: v };
    });
  }

  /** Cria lançamento(s): simples, parcelado ou recorrente. Retorna registros criados. */
  async function createTransaction(base, { repeat = 'none', count = 1 } = {}) {
    const t0 = { ...base };
    if (!t0.amount || t0.amount <= 0) throw new Error('Informe um valor maior que zero.');
    if (t0.type === 'transferencia') {
      if (!t0.to_account_id || t0.to_account_id === t0.account_id) throw new Error('Escolha contas de origem e destino diferentes.');
      t0.category_id = null;
    } else t0.to_account_id = null;
    if (repeat === 'none' || count <= 1) return Store.upsertMany('transactions', [{ ...t0, id: U.uuid() }]);
    count = Math.min(Math.max(2, count | 0), 360);
    const group = U.uuid(); const recs = [];
    const amounts = repeat === 'parcelas' ? U.splitInstallments(t0.amount, count) : Array(count).fill(t0.amount);
    const hoje = U.today();
    for (let i = 0; i < count; i++) {
      let date = t0.date;
      if (repeat === 'parcelas' || repeat === 'mensal') date = U.addMonths(t0.date, i);
      else if (repeat === 'semanal') date = U.addDays(t0.date, 7 * i);
      else if (repeat === 'quinzenal') date = U.addDays(t0.date, 14 * i);
      else if (repeat === 'anual') date = U.addMonths(t0.date, 12 * i);
      const status = i === 0 ? t0.status : (date > hoje ? 'pendente' : t0.status);
      recs.push({
        ...t0, id: U.uuid(), date, amount: amounts[i], status, group_id: group, installment: i + 1, installments: count, repeat,
        description: repeat === 'parcelas' ? `${t0.description} (${i + 1}/${count})` : t0.description,
      });
    }
    return Store.upsertMany('transactions', recs);
  }

  /** Lança um ajuste para que o saldo atual da conta fique igual ao informado */
  async function adjustBalance(accId, target, date = U.today()) {
    const diff = target - balance(accId);
    if (diff === 0) return null;
    return Store.upsert('transactions', {
      id: U.uuid(), account_id: accId, date, type: diff > 0 ? 'receita' : 'despesa', amount: Math.abs(diff),
      category_id: ADJ_CAT, description: 'Ajuste de saldo', status: 'efetivada',
    });
  }

  // ----- cartão de crédito -----
  /** Mês (YYYY-MM) da fatura em que uma compra cai, conforme o dia de fechamento */
  function invoiceMonth(acc, date) {
    const close = acc.closing_day || 31;
    const [y, m, d] = date.split('-').map(Number);
    const lastDay = U.daysInMonth(y, m);
    const ym = date.slice(0, 7);
    return d > Math.min(close, lastDay) ? U.addMonthYM(ym, 1) : ym;
  }
  function invoices(accId) {
    const acc = Store.get('accounts', accId); if (!acc) return [];
    const map = {};
    for (const t of txs()) {
      if (t.account_id !== accId && t.to_account_id !== accId) continue;
      const ym = invoiceMonth(acc, t.date);
      const inv = (map[ym] = map[ym] || { ym, compras: 0, creditos: 0, pagamentos: 0, itens: [] });
      if (t.type === 'transferencia' && t.to_account_id === accId) inv.pagamentos += t.amount;
      else if (t.type === 'transferencia') inv.compras += t.amount;
      else if (t.type === 'despesa') inv.compras += t.amount;
      else inv.creditos += t.amount;
      inv.itens.push(t);
    }
    const curYM = invoiceMonth(acc, U.today());
    return Object.values(map).sort((a, b) => b.ym.localeCompare(a.ym)).map((i) => {
      const dueYM = acc.due_day && acc.due_day < (acc.closing_day || 0) ? U.addMonthYM(i.ym, 1) : i.ym;
      const vencimento = acc.due_day ? `${dueYM}-${U.pad(Math.min(acc.due_day, U.daysInMonth(+dueYM.slice(0, 4), +dueYM.slice(5))))}` : null;
      const total = i.compras - i.creditos;
      // pagamentos de uma fatura acontecem depois do fechamento, ou seja, no ciclo seguinte
      const paid = (map[U.addMonthYM(i.ym, 1)] || {}).pagamentos || 0;
      const status = i.ym > curYM ? 'Futura' : i.ym === curYM ? 'Aberta' : (total <= 0 || paid >= total ? 'Paga' : 'Fechada');
      return { ...i, total, vencimento, paid, status };
    });
  }

  // ----- orçamento -----
  function budgetStatus(ym) {
    const s = summary(U.monthStart(ym), U.monthEnd(ym));
    const spent = {}; s.cats.filter((c) => c.type === 'despesa').forEach((c) => (spent[c.id] = c.total));
    return Store.all('budgets').filter((b) => !b.month || b.month === ym)
      .reduce((acc, b) => { // orçamento específico do mês substitui o padrão
        const i = acc.findIndex((x) => x.category_id === b.category_id);
        if (i < 0) acc.push(b); else if (b.month) acc[i] = b;
        return acc;
      }, [])
      .map((b) => ({ ...b, name: catName(b.category_id), color: catColor(b.category_id), spent: spent[b.category_id] || 0 }))
      .sort((a, b) => b.spent / (b.amount || 1) - a.spent / (a.amount || 1));
  }

  // ----- categorização automática -----
  function buildLearner() {
    const hist = new Map();
    txs().filter((t) => t.category_id && t.category_id !== ADJ_CAT).sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .forEach((t) => hist.set(t.type + '|' + U.descKey(t.description), t.category_id));
    const rules = Store.all('rules').filter((r) => r.pattern && Store.get('categories', r.category_id))
      .map((r) => ({ ...r, p: U.norm(r.pattern) })).sort((a, b) => b.p.length - a.p.length);
    return (desc, type) => {
      const n = U.norm(desc);
      const r = rules.find((x) => n.includes(x.p) && (() => { const c = Store.get('categories', x.category_id); return c.type === type || c.type === 'ambos'; })());
      if (r) return r.category_id;
      return hist.get(type + '|' + U.descKey(desc)) || null;
    };
  }

  function upcoming(days = 15) {
    const hoje = U.today(), lim = U.addDays(hoje, days);
    return txs().filter((t) => t.status === 'pendente' && t.date <= lim).sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    ACCOUNT_TYPES, TX_TYPES, ADJ_CAT, DEFAULT_CATEGORIES, seedIfEmpty, accounts, categories, txs, catName, catColor, accName,
    effect, balance, totals, summary, monthly, netWorthSeries, createTransaction, adjustBalance, invoiceMonth, invoices,
    budgetStatus, buildLearner, upcoming, isDone,
  };
})();
