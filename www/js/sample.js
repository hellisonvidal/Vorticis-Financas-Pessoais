/* Dados de exemplo para conhecer o sistema (podem ser apagados depois em Configurações) */
'use strict';

const Sample = (() => {
  async function load() {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const between = (a, b) => Math.round((a + rnd() * (b - a)) * 100);
    const hoje = U.today(); const ym0 = U.monthOf(hoje);
    const A = { cc: U.uuid(), poup: U.uuid(), cart: U.uuid(), card: U.uuid() };
    await Store.upsertMany('accounts', [
      { id: A.cc, name: 'Conta corrente', type: 'corrente', bank: 'Banco Exemplo', initial_balance: 250000, color: '#0f766e', order: 1, sample: true },
      { id: A.poup, name: 'Poupança', type: 'poupanca', bank: 'Banco Exemplo', initial_balance: 800000, color: '#2563eb', order: 2, sample: true },
      { id: A.cart, name: 'Carteira', type: 'carteira', initial_balance: 15000, color: '#ca8a04', order: 3, sample: true },
      { id: A.card, name: 'Cartão de crédito', type: 'cartao', bank: 'Banco Exemplo', initial_balance: 0, credit_limit: 600000, closing_day: 3, due_day: 10, color: '#7c3aed', order: 4, sample: true },
    ]);
    const tx = []; const add = (o) => tx.push({ id: U.uuid(), status: 'efetivada', sample: true, ...o });
    const months = U.monthsBetween(U.addMonthYM(ym0, -6), U.addMonthYM(ym0, 1));
    months.forEach((ym) => {
      const d = (day) => `${ym}-${U.pad(Math.min(day, U.daysInMonth(+ym.slice(0, 4), +ym.slice(5))))}`;
      const st = (date) => (date > hoje ? 'pendente' : 'efetivada');
      add({ date: d(5), type: 'receita', amount: 520000, account_id: A.cc, category_id: 'cat-salario', description: 'Salário', status: st(d(5)) });
      add({ date: d(10), type: 'despesa', amount: 160000, account_id: A.cc, category_id: 'cat-moradia', description: 'Aluguel', status: st(d(10)) });
      add({ date: d(12), type: 'despesa', amount: between(140, 230), account_id: A.cc, category_id: 'cat-contas-casa', description: 'Conta de luz', status: st(d(12)) });
      add({ date: d(15), type: 'despesa', amount: 11990, account_id: A.cc, category_id: 'cat-contas-casa', description: 'Internet fibra', status: st(d(15)) });
      add({ date: d(6), type: 'transferencia', amount: 50000, account_id: A.cc, to_account_id: A.poup, description: 'Guardar na poupança', status: st(d(6)) });
      add({ date: d(28), type: 'receita', amount: between(30, 45), account_id: A.poup, category_id: 'cat-rendimentos', description: 'Rendimento poupança', status: st(d(28)) });
      [3, 11, 18, 25].forEach((day) => add({ date: d(day), type: 'despesa', amount: between(180, 420), account_id: A.card, category_id: 'cat-mercado', description: 'Supermercado Bom Preço', status: st(d(day)) }));
      [8, 21].forEach((day) => add({ date: d(day), type: 'despesa', amount: between(45, 120), account_id: A.card, category_id: 'cat-alimentacao', description: 'iFood', status: st(d(day)) }));
      [2, 9, 16, 23].forEach((day) => add({ date: d(day), type: 'despesa', amount: between(25, 60), account_id: A.card, category_id: 'cat-transporte', description: 'Uber', status: st(d(day)) }));
      add({ date: d(14), type: 'despesa', amount: 5590, account_id: A.card, category_id: 'cat-assinaturas', description: 'Netflix', status: st(d(14)) });
      add({ date: d(20), type: 'despesa', amount: between(60, 180), account_id: A.cc, category_id: 'cat-saude', description: 'Farmácia', status: st(d(20)) });
      add({ date: d(19), type: 'despesa', amount: between(80, 300), account_id: A.card, category_id: 'cat-lazer', description: 'Cinema e jantar', status: st(d(19)) });
      add({ date: d(7), type: 'despesa', amount: between(20, 60), account_id: A.cart, category_id: 'cat-alimentacao', description: 'Padaria', status: st(d(7)) });
      add({ date: d(1), type: 'transferencia', amount: 20000, account_id: A.cc, to_account_id: A.cart, description: 'Saque', status: st(d(1)) });
    });
    await Store.upsertMany('transactions', tx);
    // compra parcelada no cartão
    await F.createTransaction({ date: U.addMonths(hoje, -2), type: 'despesa', amount: 239940, account_id: A.card, category_id: 'cat-compras', description: 'Notebook', status: 'efetivada', sample: true }, { repeat: 'parcelas', count: 6 });
    // pagamento das faturas fechadas
    const pays = [];
    F.invoices(A.card).forEach((inv) => {
      if (!inv.vencimento || inv.ym >= ym0 && inv.vencimento > hoje) return;
      if (inv.total > 0) pays.push({ id: U.uuid(), date: inv.vencimento, type: 'transferencia', amount: inv.total, account_id: A.cc, to_account_id: A.card, description: 'Pagamento fatura ' + U.fmtMonth(inv.ym), status: inv.vencimento > hoje ? 'pendente' : 'efetivada', sample: true });
    });
    await Store.upsertMany('transactions', pays);
    await Store.upsertMany('budgets', [
      { id: U.uuid(), category_id: 'cat-mercado', amount: 140000, month: null, sample: true }, { id: U.uuid(), category_id: 'cat-alimentacao', amount: 40000, month: null, sample: true },
      { id: U.uuid(), category_id: 'cat-transporte', amount: 25000, month: null, sample: true }, { id: U.uuid(), category_id: 'cat-lazer', amount: 30000, month: null, sample: true },
      { id: U.uuid(), category_id: 'cat-contas-casa', amount: 35000, month: null, sample: true },
    ]);
    await Store.upsertMany('goals', [
      { id: U.uuid(), name: 'Reserva de emergência', target: 3000000, saved: 0, account_id: A.poup, deadline: U.addMonths(hoje, 18), color: '#2563eb', sample: true },
      { id: U.uuid(), name: 'Viagem de férias', target: 800000, saved: 210000, deadline: U.addMonths(hoje, 8), color: '#ec4899', sample: true },
    ]);
  }
  return { load };
})();
