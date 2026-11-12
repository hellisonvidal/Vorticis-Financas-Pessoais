'use strict';
/* Categorias e regras, Orçamentos e Metas */
Views.categorias = (() => {
  const { $, $$, icon } = UI;
  function render() {
    const counts = {}; F.txs().forEach((t) => { if (t.category_id) counts[t.category_id] = (counts[t.category_id] || 0) + 1; });
    const list = (type) => F.categories().filter((c) => c.type === type).map((c) => `<li data-cat="${c.id}" style="cursor:pointer"><i class="dot" style="background:${U.esc(c.color)}"></i><span>${U.esc(c.name)}</span><small class="muted">${counts[c.id] || 0} lanç.</small>${icon('edit')}</li>`).join('') || '<li class="empty">Nenhuma</li>';
    const rules = Store.all('rules').filter((r) => Store.get('categories', r.category_id)).sort((a, b) => a.pattern.localeCompare(b.pattern));
    return `
    <div class="row between" style="margin-bottom:12px"><p class="muted small" style="margin:0">Organize receitas e despesas. As regras categorizam automaticamente lançamentos novos e importados.</p><button class="btn primary" data-new>${icon('plus')}Nova categoria</button></div>
    <div class="grid g3">
      <div class="card"><h3 class="neg">Despesas</h3><ul class="mini">${list('despesa')}</ul></div>
      <div class="card"><h3 class="pos">Receitas</h3><ul class="mini">${list('receita')}</ul><h3 style="margin-top:16px">Ambos</h3><ul class="mini">${list('ambos')}</ul></div>
      <div class="card"><div class="row between"><h3>Regras automáticas</h3><button class="btn sm" data-newrule>${icon('plus')}Regra</button></div>
        <p class="small muted">Se a descrição contém o texto → usa a categoria. Além das regras, o sistema aprende com os lançamentos que você já categorizou.</p>
        <ul class="mini">${rules.map((r) => `<li data-rule="${r.id}" style="cursor:pointer"><span><code>${U.esc(r.pattern)}</code> → ${U.esc(F.catName(r.category_id))}</span>${icon('edit')}</li>`).join('') || '<li class="empty">Nenhuma regra</li>'}</ul>
      </div>
    </div>`;
  }
  function bind(root) {
    $('[data-new]', root).onclick = () => form();
    $('[data-newrule]', root).onclick = () => ruleForm();
    $$('[data-cat]', root).forEach((li) => (li.onclick = () => form(Store.get('categories', li.dataset.cat))));
    $$('[data-rule]', root).forEach((li) => (li.onclick = () => ruleForm(Store.get('rules', li.dataset.rule))));
  }
  function form(cat = null) {
    const c = cat ? { ...cat } : { type: 'despesa', color: UI.COLORS[Math.floor(Math.random() * UI.COLORS.length)] };
    UI.modal({
      title: cat ? 'Editar categoria' : 'Nova categoria',
      body: `<div class="form"><label class="field full"><span>Nome</span><input class="input" id="cn" value="${U.esc(c.name || '')}"></label>
        <label class="field full"><span>Tipo</span><select class="input" id="ct" ${c.id === F.ADJ_CAT ? 'disabled' : ''}>${UI.opt('despesa', 'Despesa', c.type)}${UI.opt('receita', 'Receita', c.type)}${UI.opt('ambos', 'Receita e despesa', c.type)}</select></label>
        <div class="field full"><span>Cor</span>${UI.colorPicker(c.color)}</div></div><p class="err" id="cerr"></p>`,
      onOpen: UI.bindColorPicker,
      actions: [
        ...(cat && c.id !== F.ADJ_CAT ? [{ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: () => removeCat(c) }] : []),
        { label: 'Cancelar' },
        { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const name = $('#cn', b).value.trim(); if (!name) { $('#cerr', b).textContent = 'Informe o nome.'; return false; }
          const type = $('#ct', b).value;
          if (cat && type !== cat.type && type !== 'ambos') {
            const n = F.txs().filter((t) => t.category_id === c.id && t.type !== type).length;
            if (n) { $('#cerr', b).textContent = `Há ${n} lançamento(s) de outro tipo nesta categoria. Use "Receita e despesa" ou mova-os antes.`; return false; }
          }
          await Store.upsert('categories', { ...c, name, type, color: $('[name=color]', b).value }); UI.toast('Categoria salva', 'ok');
        } },
      ],
    });
  }
  async function removeCat(c) {
    const used = F.txs().filter((t) => t.category_id === c.id);
    if (used.length) {
      let target = null;
      const ok = await new Promise((res) => {
        let done = false;
        UI.modal({ title: 'Excluir categoria', body: `<p>${used.length} lançamento(s) usam "${U.esc(c.name)}". Para onde movê-los?</p><select class="input" id="mv">${UI.categoryOptions(c.type === 'ambos' ? null : c.type, '', { none: true }).replace(`<option value="${c.id}"`, `<option disabled value="${c.id}"`)}</select>`,
          onClose: () => !done && res(false),
          actions: [{ label: 'Cancelar' }, { label: 'Mover e excluir', cls: 'danger', onClick: (b) => { target = $('#mv', b).value || null; if (target === c.id) return false; done = true; res(true); } }] });
      });
      if (!ok) return false;
      await Store.upsertMany('transactions', used.map((t) => ({ ...t, category_id: target })));
    } else if (!(await UI.confirm(`Excluir a categoria "${U.esc(c.name)}"?`, { ok: 'Excluir', danger: true }))) return false;
    await Store.removeMany('budgets', Store.all('budgets').filter((b) => b.category_id === c.id).map((b) => b.id));
    await Store.removeMany('rules', Store.all('rules').filter((r) => r.category_id === c.id).map((r) => r.id));
    await Store.remove('categories', c.id); UI.toast('Categoria excluída', 'ok'); return true;
  }
  function ruleForm(rule = null) {
    const r = rule ? { ...rule } : { pattern: '', category_id: '' };
    UI.modal({
      title: rule ? 'Editar regra' : 'Nova regra',
      body: `<div class="form"><label class="field full"><span>Se a descrição contém</span><input class="input" id="rp" value="${U.esc(r.pattern)}" placeholder="ex.: posto shell"></label>
      <label class="field full"><span>Usar a categoria</span><select class="input" id="rc">${UI.categoryOptions(null, r.category_id, { none: false })}</select></label>
      <label class="check full"><input type="checkbox" id="rap"> Aplicar agora aos lançamentos sem categoria que combinam</label></div><p class="err" id="rerr"></p>`,
      actions: [
        ...(rule ? [{ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: async () => { await Store.remove('rules', r.id); UI.toast('Regra excluída', 'ok'); } }] : []),
        { label: 'Cancelar' },
        { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const pattern = $('#rp', b).value.trim(); if (pattern.length < 2) { $('#rerr', b).textContent = 'Informe pelo menos 2 caracteres.'; return false; }
          const category_id = $('#rc', b).value;
          await Store.upsert('rules', { ...r, pattern, category_id });
          if ($('#rap', b).checked) {
            const cat = Store.get('categories', category_id); const p = U.norm(pattern);
            const upd = F.txs().filter((t) => !t.category_id && t.type !== 'transferencia' && (cat.type === 'ambos' || cat.type === t.type) && U.norm(t.description).includes(p)).map((t) => ({ ...t, category_id }));
            if (upd.length) await Store.upsertMany('transactions', upd);
            UI.toast(`Regra salva e aplicada a ${upd.length} lançamento(s)`, 'ok');
          } else UI.toast('Regra salva', 'ok');
        } },
      ],
    });
  }
  return { title: 'Categorias e regras', render, bind, form };
})();

Views.orcamentos = (() => {
  const { $, $$, icon } = UI;
  let month = null;
  function render() {
    if (!month) month = App.state.month;
    const b = F.budgetStatus(month);
    const to = b.reduce((s, x) => s + x.amount, 0), tr = b.reduce((s, x) => s + x.spent, 0);
    const s = F.summary(U.monthStart(month), U.monthEnd(month));
    const semOrc = s.cats.filter((c) => c.type === 'despesa' && !b.some((x) => x.category_id === c.id));
    const [y, m] = month.split('-').map(Number);
    const isCur = month === U.monthOf(U.today());
    const dayFrac = isCur ? new Date().getDate() / U.daysInMonth(y, m) : month < U.monthOf(U.today()) ? 1 : 0;
    return `
    <div class="row between" style="margin-bottom:12px">${monthNav(month)}<div class="row"><button class="btn" data-suggest>Sugerir pela média</button><button class="btn primary" data-new>${icon('plus')}Novo orçamento</button></div></div>
    <div class="kpis">
      <div class="kpi"><span>Orçado</span><b class="money">${U.money(to)}</b></div>
      <div class="kpi"><span>Gasto</span><b class="money ${tr > to ? 'neg' : ''}">${U.money(tr)}</b></div>
      <div class="kpi"><span>Disponível</span><b class="money ${UI.moneyClass(to - tr)}">${U.money(to - tr)}</b></div>
      <div class="kpi"><span>Gastos sem orçamento</span><b class="money">${U.money(semOrc.reduce((a, c) => a + c.total, 0))}</b></div>
    </div>
    <div class="card">
      ${b.length ? b.map((x) => { const p = x.amount ? x.spent / x.amount : 0; const warn = dayFrac && p > dayFrac + 0.1 && p <= 1; return `<div data-b="${x.id}" style="padding:10px 4px;cursor:pointer;border-bottom:1px solid var(--line)">
        <div class="row between"><span><i class="dot" style="background:${x.color}"></i> <b>${U.esc(x.name)}</b> ${x.month ? '<span class="badge">só este mês</span>' : ''}</span><span class="money"><b class="${p > 1 ? 'neg' : ''}">${U.money(x.spent)}</b> <span class="muted">de ${U.money(x.amount)}</span></span></div>
        <div class="bar ${p > 1 ? 'over' : p > 0.85 ? 'near' : ''}" style="margin:6px 0 4px"><i style="width:${Math.min(100, p * 100).toFixed(1)}%"></i></div>
        <div class="row between small muted"><span>${(p * 100).toFixed(0)}% usado${warn ? ' • <span class="warn">acima do ritmo do mês</span>' : ''}</span><span>${p > 1 ? '<span class="neg">Estourou ' + U.money(x.spent - x.amount) + '</span>' : 'Restam ' + U.money(x.amount - x.spent)}</span></div></div>`; }).join('') : '<p class="empty">Nenhum orçamento. Crie limites mensais por categoria de despesa.</p>'}
    </div>
    ${semOrc.length ? `<div class="card"><h3>Despesas sem orçamento neste mês</h3><ul class="mini">${semOrc.map((c) => `<li><i class="dot" style="background:${c.color}"></i><span>${U.esc(c.name)}</span><b class="money">${U.money(c.total)}</b><button class="btn sm" data-add="${c.id}">Orçar</button></li>`).join('')}</ul></div>` : ''}`;
  }
  function bind(root) {
    bindMonthNav(root, () => month, (v) => (month = v));
    $('[data-new]', root).onclick = () => form();
    $$('[data-b]', root).forEach((d) => (d.onclick = () => form(Store.get('budgets', d.dataset.b))));
    $$('[data-add]', root).forEach((d) => (d.onclick = () => form(null, d.dataset.add)));
    $('[data-suggest]', root).onclick = async () => {
      const ms = [1, 2, 3].map((i) => U.addMonthYM(month, -i));
      const sums = {};
      ms.forEach((ym) => F.summary(U.monthStart(ym), U.monthEnd(ym)).cats.filter((c) => c.type === 'despesa').forEach((c) => (sums[c.id] = (sums[c.id] || 0) + c.total)));
      const existing = new Set(Store.all('budgets').filter((x) => !x.month).map((x) => x.category_id));
      const sug = Object.entries(sums).filter(([id]) => !existing.has(id) && id && id !== F.ADJ_CAT).map(([id, v]) => ({ id: U.uuid(), category_id: id, amount: Math.ceil(v / 3 / 1000) * 1000, month: null })).filter((x) => x.amount > 0);
      if (!sug.length) return UI.toast('Sem histórico suficiente (ou todas as categorias já têm orçamento).');
      if (!(await UI.confirm(`Criar ${sug.length} orçamento(s) com base na média dos últimos 3 meses (arredondada para cima)?<br><br>${sug.map((x) => `${U.esc(F.catName(x.category_id))}: <b>${U.money(x.amount)}</b>`).join('<br>')}`, { ok: 'Criar' }))) return;
      await Store.upsertMany('budgets', sug); UI.toast('Orçamentos criados', 'ok');
    };
  }
  function form(bud = null, catId = null) {
    const x = bud ? { ...bud } : { category_id: catId || '', amount: 0, month: null };
    UI.modal({
      title: bud ? 'Editar orçamento' : 'Novo orçamento',
      body: `<div class="form"><label class="field full"><span>Categoria de despesa</span><select class="input" id="bc">${UI.categoryOptions('despesa', x.category_id, { none: false })}</select></label>
      <label class="field"><span>Limite mensal (R$)</span><input class="input big" id="ba" inputmode="decimal" value="${x.amount ? U.num(x.amount) : ''}"></label>
      <label class="field"><span>Vale para</span><select class="input" id="bm">${UI.opt('', 'Todos os meses', x.month || '')}${UI.opt(month, 'Somente ' + U.fmtMonth(month), x.month || '')}${x.month && x.month !== month ? UI.opt(x.month, 'Somente ' + U.fmtMonth(x.month), x.month) : ''}</select></label></div><p class="err" id="berr"></p>`,
      actions: [
        ...(bud ? [{ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: async () => { await Store.remove('budgets', x.id); UI.toast('Orçamento excluído', 'ok'); } }] : []),
        { label: 'Cancelar' },
        { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const amount = U.parseMoney($('#ba', b).value); if (!amount || amount <= 0) { $('#berr', b).textContent = 'Informe um valor maior que zero.'; return false; }
          const category_id = $('#bc', b).value; const m = $('#bm', b).value || null;
          const dup = Store.all('budgets').find((o) => o.id !== x.id && o.category_id === category_id && (o.month || null) === m);
          if (dup) { $('#berr', b).textContent = 'Já existe um orçamento desta categoria para o mesmo período. Edite o existente.'; return false; }
          await Store.upsert('budgets', { ...x, category_id, amount, month: m }); UI.toast('Orçamento salvo', 'ok');
        } },
      ],
    });
  }
  return { title: 'Orçamentos', render, bind };
})();

Views.metas = (() => {
  const { $, $$, icon } = UI;
  const current = (g) => (g.account_id && Store.get('accounts', g.account_id) ? F.balance(g.account_id) : g.saved || 0);
  function render() {
    const goals = Store.all('goals').sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
    return `<div class="row between" style="margin-bottom:12px"><p class="small muted" style="margin:0">Defina objetivos e acompanhe quanto falta. Uma meta pode usar o saldo de uma conta (ex.: poupança) automaticamente.</p><button class="btn primary" data-new>${icon('plus')}Nova meta</button></div>
    ${goals.length ? `<div class="acc-grid">${goals.map((g) => {
      const cur = current(g); const p = g.target ? cur / g.target : 0;
      let ritmo = '';
      if (g.deadline && cur < g.target) {
        const [y1, m1] = U.today().split('-').map(Number), [y2, m2] = g.deadline.split('-').map(Number);
        const months = Math.max(1, (y2 - y1) * 12 + (m2 - m1));
        ritmo = g.deadline < U.today() ? '<span class="neg">Prazo vencido</span>' : `Guardar <b>${U.money(Math.ceil((g.target - cur) / months))}</b>/mês por ${months} ${months === 1 ? 'mês' : 'meses'}`;
      }
      return `<div class="card acc" data-g="${g.id}" style="--c:${U.esc(g.color || '#0f766e')}"><h4>${U.esc(g.name)}</h4><span class="small muted">${g.account_id ? 'Saldo de ' + U.esc(F.accName(g.account_id)) : 'Valor guardado manualmente'}${g.deadline ? ' • até ' + U.fmtDate(g.deadline) : ''}</span>
        <div class="bal money">${U.money(cur)} <small class="muted" style="font-size:13px">de ${U.money(g.target)}</small></div>
        <div class="bar ${p >= 1 ? '' : ''}" style="margin-top:8px"><i style="width:${Math.min(100, Math.max(0, p) * 100).toFixed(1)}%;background:${U.esc(g.color || '')}"></i></div>
        <div class="row between small" style="margin-top:6px"><span>${p >= 1 ? '<b class="pos">Meta atingida! 🎉</b>' : (Math.max(0, p) * 100).toFixed(1).replace('.', ',') + '%'}</span><span class="muted">${ritmo}</span></div>
        ${!g.account_id ? `<div class="row" style="margin-top:10px"><button class="btn sm" data-add="${g.id}">${icon('plus')}Guardar</button><button class="btn sm" data-sub="${g.id}">Retirar</button></div>` : ''}</div>`;
    }).join('')}</div>` : '<div class="card empty">Nenhuma meta cadastrada.</div>'}`;
  }
  function bind(root) {
    $('[data-new]', root).onclick = () => form();
    $$('[data-g]', root).forEach((c) => (c.onclick = (e) => { if (!e.target.closest('button')) form(Store.get('goals', c.dataset.g)); }));
    $$('[data-add],[data-sub]', root).forEach((btn) => (btn.onclick = async () => {
      const g = Store.get('goals', btn.dataset.add || btn.dataset.sub); const sub = !!btn.dataset.sub;
      const v = await UI.promptMoney(sub ? 'Retirar da meta' : 'Guardar na meta', 'Valor (R$)'); if (!v) return;
      await Store.upsert('goals', { ...g, saved: Math.max(0, (g.saved || 0) + (sub ? -Math.abs(v) : Math.abs(v))) }); UI.toast('Meta atualizada', 'ok');
    }));
  }
  function form(goal = null) {
    const g = goal ? { ...goal } : { target: 0, saved: 0, color: '#0f766e' };
    UI.modal({
      title: goal ? 'Editar meta' : 'Nova meta',
      body: `<div class="form"><label class="field full"><span>Nome</span><input class="input" id="gn" value="${U.esc(g.name || '')}" placeholder="ex.: Reserva de emergência"></label>
        <label class="field"><span>Valor da meta (R$)</span><input class="input" id="gt" inputmode="decimal" value="${g.target ? U.num(g.target) : ''}"></label>
        <label class="field"><span>Prazo (opcional)</span><input class="input" type="date" id="gd" value="${g.deadline || ''}"></label>
        <label class="field"><span>Acompanhar pelo saldo da conta</span><select class="input" id="ga">${UI.opt('', 'Não — informar manualmente', g.account_id || '')}${UI.accountOptions(g.account_id || '')}</select></label>
        <label class="field" id="gsw"><span>Já guardado (R$)</span><input class="input" id="gs" inputmode="decimal" value="${U.num(g.saved || 0)}"></label>
        <div class="field full"><span>Cor</span>${UI.colorPicker(g.color)}</div></div><p class="err" id="gerr"></p>`,
      onOpen: (b) => { UI.bindColorPicker(b); const u = () => ($('#gsw', b).hidden = !!$('#ga', b).value); $('#ga', b).onchange = u; u(); },
      actions: [
        ...(goal ? [{ label: icon('trash') + 'Excluir', cls: 'danger', left: true, onClick: async () => { if (!(await UI.confirm('Excluir esta meta?', { danger: true, ok: 'Excluir' }))) return false; await Store.remove('goals', g.id); } }] : []),
        { label: 'Cancelar' },
        { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const name = $('#gn', b).value.trim(); const target = U.parseMoney($('#gt', b).value); const saved = U.parseMoney($('#gs', b).value || '0');
          if (!name) { $('#gerr', b).textContent = 'Informe o nome.'; return false; }
          if (!target || target <= 0) { $('#gerr', b).textContent = 'Informe o valor da meta.'; return false; }
          await Store.upsert('goals', { ...g, name, target, saved: saved || 0, deadline: $('#gd', b).value || null, account_id: $('#ga', b).value || null, color: $('[name=color]', b).value }); UI.toast('Meta salva', 'ok');
        } },
      ],
    });
  }
  return { title: 'Metas', render, bind };
})();
