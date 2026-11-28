'use strict';
/* Categorias e regras de categorização automática */
Views.categorias = (() => {
  const { $, $$, icon } = UI;
  const S = { q: '' };
  function render() {
    const counts = {}; F.txs().forEach((t) => { if (t.category_id) counts[t.category_id] = (counts[t.category_id] || 0) + 1; });
    const list = (type) => F.categories().filter((c) => c.type === type && (!S.q || U.norm(c.name).includes(U.norm(S.q)))).map((c) => `<li data-cat="${c.id}" style="cursor:pointer"><i class="dot" style="background:${U.esc(c.color)}"></i><span>${U.esc(c.name)}</span><small class="muted">${counts[c.id] || 0} lanç.</small>${icon('edit')}</li>`).join('') || '<li class="empty">Nenhuma</li>';
    const rules = Store.all('rules').filter((r) => Store.get('categories', r.category_id) && (!S.q || U.norm(r.pattern + ' ' + F.catName(r.category_id)).includes(U.norm(S.q)))).sort((a, b) => a.pattern.localeCompare(b.pattern));
    return `
    <div class="row between" style="margin-bottom:12px"><p class="muted small" style="margin:0">Organize receitas e despesas. As regras categorizam automaticamente lançamentos novos e importados.</p><button class="btn primary" data-new>${icon('plus')}Nova categoria</button></div>
    <div class="filters"><input class="input search" id="catq" placeholder="Buscar categoria ou regra…" value="${U.esc(S.q)}"></div>
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
    bindSearch($('#catq', root), (v) => (S.q = v));
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
