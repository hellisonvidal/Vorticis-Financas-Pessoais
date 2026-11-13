'use strict';
/* Importação de extratos: 1) arquivo  2) mapeamento de colunas (planilhas)  3) revisão e confirmação */
Views.importar = (() => {
  const { $, $$, icon } = UI;
  let S = fresh();
  function fresh(accountId) { return { step: 1, accountId: accountId || Store.getMeta('last_import_account') || '', fileName: '', kind: '', sheets: null, sheetIdx: 0, map: null, rows: [], info: null, lines: null, year: new Date().getFullYear(), onlyNew: false, done: true, busy: false, errors: [] }; }
  const start = (accountId) => { S = fresh(accountId); };

  function render() {
    const accs = F.accounts();
    if (!accs.length) return '<div class="card empty">Cadastre uma conta antes de importar. <a href="#/contas">Ir para contas</a></div>';
    if (!S.accountId || !Store.get('accounts', S.accountId)) S.accountId = accs[0].id;
    const steps = `<div class="steps"><span class="${S.step === 1 ? 'on' : ''}">1. Arquivo</span><span class="${S.step === 2 ? 'on' : ''}">2. Colunas</span><span class="${S.step === 3 ? 'on' : ''}">3. Revisar e importar</span></div>`;
    if (S.step === 1) return steps + step1();
    if (S.step === 2) return steps + step2();
    return steps + step3();
  }

  function step1() {
    return `<div class="grid g2">
      <div class="card">
        <label class="field" style="margin-bottom:14px"><span>Importar para a conta</span><select class="input" id="iacc">${UI.accountOptions(S.accountId)}</select></label>
        <div class="drop" id="drop">${icon('importar')}<p><b>Clique para escolher</b> ou arraste o arquivo do extrato aqui</p><p class="small">OFX/QFX • CSV/TXT • Excel (XLS, XLSX, ODS) • PDF</p>${S.busy ? '<p><b>Lendo arquivo…</b></p>' : ''}</div>
        <input type="file" id="ifile" accept=".ofx,.qfx,.csv,.txt,.xls,.xlsx,.xlsm,.ods,.pdf,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
        <details style="margin-top:14px"><summary class="small" style="cursor:pointer">Ou colar o texto do extrato (copiado do internet banking ou de um PDF)</summary>
          <textarea class="input" id="ipaste" rows="7" style="margin-top:8px" placeholder="05/03/2026  PIX RECEBIDO FULANO   1.250,00&#10;06/03/2026  COMPRA CARTAO MERCADO   -235,90"></textarea>
          <div class="row" style="margin-top:8px"><label class="field" style="width:120px"><span>Ano (se faltar)</span><input class="input" type="number" id="iyear" value="${S.year}"></label><span class="spacer"></span><button class="btn" id="iparse">Interpretar texto</button></div>
        </details>
      </div>
      <div class="card help">
        <h3>Qual formato usar?</h3>
        <ol>
          <li><b>OFX</b> (recomendado): quase todos os bancos oferecem em "Extrato → Exportar/Salvar como OFX/Money/Quicken". Traz identificadores que evitam duplicidade.</li>
          <li><b>CSV ou Excel</b>: você escolhe quais colunas são data, descrição e valor. O mapeamento fica salvo para a próxima vez.</li>
          <li><b>PDF</b>: leitura automática do texto (PDFs gerados pelo banco, não escaneados). Sempre revise o resultado.</li>
          <li><b>Open Finance (automático)</b>: traga os lançamentos direto do banco, sem baixar arquivo, pela tela <a href="#/bancos">Open Finance</a> (Pluggy, plano gratuito).</li>
          <li><b>Planilha do sistema</b>: use o <a href="#" id="itpl">modelo de lançamentos</a> para importar várias contas de uma vez (também aceita a planilha exportada em "Exportar tudo").</li>
        </ol>
        <p class="small muted">Lançamentos já existentes na conta são detectados e desmarcados automaticamente.</p>
      </div>
    </div>`;
  }

  function step2() {
    const grid = S.sheets[S.sheetIdx].grid; const m = S.map;
    const cols = Math.max(1, ...grid.slice(0, 60).map((r) => r.length));
    const letter = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
    const header = m.headerRow >= 0 ? grid[m.headerRow] || [] : [];
    const colOpts = (sel) => UI.opt(-1, '— nenhuma —', sel) + Array.from({ length: cols }, (_, i) => UI.opt(i, `${letter(i)}${header[i] ? ' · ' + String(header[i]).slice(0, 24) : ''}`, sel)).join('');
    const prev = Importers.gridToRows(grid, m);
    const show = (v) => (v instanceof Date ? U.fmtDate(U.parseDate(v)) : String(v ?? ''));
    return `<div class="card">
      <div class="row between"><h3>Arquivo: ${U.esc(S.fileName)}</h3>${S.sheets.length > 1 ? `<label class="field"><span>Aba</span><select class="input" id="isheet">${S.sheets.map((s, i) => UI.opt(i, s.name, S.sheetIdx)).join('')}</select></label>` : ''}</div>
      <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <label class="field"><span>Linha do cabeçalho</span><select class="input" data-m="headerRow">${UI.opt(-1, 'Sem cabeçalho', m.headerRow)}${grid.slice(0, 40).map((_, i) => UI.opt(i, 'Linha ' + (i + 1), m.headerRow)).join('')}</select></label>
        <label class="field"><span>Coluna da data</span><select class="input" data-m="date">${colOpts(m.date)}</select></label>
        <label class="field"><span>Coluna da descrição</span><select class="input" data-m="description">${colOpts(m.description)}</select></label>
        <label class="field"><span>Coluna do valor</span><select class="input" data-m="amount">${colOpts(m.amount)}</select></label>
        <label class="field"><span>…ou coluna de débito</span><select class="input" data-m="debit">${colOpts(m.debit)}</select></label>
        <label class="field"><span>…e coluna de crédito</span><select class="input" data-m="credit">${colOpts(m.credit)}</select></label>
        <label class="field"><span>Formato da data</span><select class="input" data-m="dateFmt">${UI.opt('auto', 'Automático', m.dateFmt)}${UI.opt('dmy', 'dia/mês/ano', m.dateFmt)}${UI.opt('mdy', 'mês/dia/ano', m.dateFmt)}${UI.opt('ymd', 'ano-mês-dia', m.dateFmt)}</select></label>
        <label class="field"><span>Separador decimal</span><select class="input" data-m="decimal">${UI.opt('auto', 'Automático', m.decimal)}${UI.opt(',', 'Vírgula (1.234,56)', m.decimal)}${UI.opt('.', 'Ponto (1,234.56)', m.decimal)}</select></label>
        <div class="field"><span>Sinal</span><label class="check"><input type="checkbox" data-m="invert" ${m.invert ? 'checked' : ''}> Inverter (compras vêm positivas, ex.: fatura de cartão)</label></div>
      </div>
      <p class="small ${prev.rows.length ? 'pos' : 'neg'}" style="margin-top:12px">${prev.rows.length} lançamento(s) reconhecido(s)${prev.errors.length ? ` • ${prev.errors.length} linha(s) ignorada(s) por data/valor inválido (linhas ${prev.errors.slice(0, 8).join(', ')}${prev.errors.length > 8 ? '…' : ''})` : ''}</p>
      <div class="tablewrap" style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px"><table class="tbl small"><thead><tr><th>#</th>${Array.from({ length: cols }, (_, i) => `<th>${letter(i)}${i === m.date ? ' 📅' : i === m.description ? ' 📝' : i === m.amount || i === m.debit || i === m.credit ? ' 💲' : ''}</th>`).join('')}</tr></thead>
        <tbody>${grid.slice(0, 30).map((r, ri) => `<tr style="${ri === m.headerRow ? 'font-weight:700;background:var(--soft)' : ''}"><td class="muted">${ri + 1}</td>${Array.from({ length: cols }, (_, i) => `<td>${U.esc(show(r[i]).slice(0, 40))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:14px"><button class="btn" data-back>Voltar</button><span class="spacer"></span><button class="btn primary" data-next ${prev.rows.length ? '' : 'disabled'}>Continuar</button></div>
    </div>`;
  }

  function step3() {
    const acc = Store.get('accounts', S.accountId);
    const rows = S.rows;
    const vis = rows.map((r, i) => ({ r, i })).filter(({ r }) => !S.onlyNew || !r.dup);
    const selRows = rows.filter((r) => r.on);
    const ent = selRows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0), sai = selRows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
    const dups = rows.filter((r) => r.dup === 'dup').length, maybe = rows.filter((r) => r.dup === 'maybe').length;
    const catsR = UI.categoryOptions('receita', ''), catsD = UI.categoryOptions('despesa', '');
    const catSel = (r, i) => `<select class="input" data-cat="${i}">${(r.amount > 0 ? catsR : catsD).replace(`value="${r.category_id}"`, `value="${r.category_id}" selected`)}</select>`;
    const balInfo = S.info && S.info.balance !== undefined && S.info.balance !== null ? `<p class="small">Saldo informado pelo banco${S.info.balanceDate ? ' em ' + U.fmtDate(S.info.balanceDate) : ''}: <b class="money">${U.money(S.info.balance)}</b>. Após importar você poderá conferir e ajustar o saldo da conta.</p>` : '';
    return `<div class="card">
      <div class="row between" style="margin-bottom:8px"><div><h3 style="margin:0">Revise os lançamentos — ${U.esc(acc.name)}</h3><span class="small muted">${U.esc(S.fileName)} • ${rows.length} encontrados${dups ? ` • <span class="warn">${dups} já existiam</span>` : ''}${maybe ? ` • <span class="warn">${maybe} possíveis duplicados</span>` : ''}</span></div>
        <div class="row"><label class="check small"><input type="checkbox" id="ionlynew" ${S.onlyNew ? 'checked' : ''}> Ocultar já existentes</label><button class="btn sm" id="iinv">Inverter sinais</button>${S.lines ? '<button class="btn sm" id="itext">Ver texto lido</button>' : ''}</div></div>
      ${S.note ? `<p class="help small">${U.esc(S.note)}</p>` : ''}
      ${S.kind === 'pdf' || S.kind === 'text' ? '<p class="help small">Leitura automática de PDF/texto: confira datas, valores e <b>sinais</b> (entrada positiva, saída negativa). Use o botão ± na linha para corrigir. Se a leitura não ficar boa, prefira o arquivo OFX ou CSV do banco.</p>' : ''}
      ${S.info && S.info.isCard && acc.type !== 'cartao' ? '<p class="help small warn">Este arquivo parece ser de cartão de crédito, mas a conta escolhida não é um cartão.</p>' : ''}
      ${balInfo}
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th><input type="checkbox" id="iall" ${vis.length && vis.every(({ r }) => r.on) ? 'checked' : ''} aria-label="Todos"></th><th>Data</th><th>Descrição</th><th>Categoria</th><th class="right">Valor</th><th></th></tr></thead>
        <tbody>${vis.map(({ r, i }) => `<tr class="${r.dup === 'dup' ? 'dup' : ''}">
          <td><input type="checkbox" data-on="${i}" ${r.on ? 'checked' : ''}></td>
          <td><input class="input" type="date" data-date="${i}" value="${r.date}" style="width:140px"></td>
          <td><input class="input" data-desc="${i}" value="${U.esc(r.description)}" style="min-width:200px"> ${r.dup === 'dup' ? '<span class="badge warn">já existe</span>' : r.dup === 'maybe' ? '<span class="badge warn" title="Mesma data e valor de um lançamento existente">possível duplicado</span>' : ''}</td>
          <td style="min-width:170px">${catSel(r, i)}</td>
          <td class="right money ${UI.moneyClass(r.amount)}"><b>${U.money(r.amount)}</b></td>
          <td><button class="btn sm ghost" data-flip="${i}" title="Inverter sinal">±</button></td></tr>`).join('')}</tbody>
      </table></div>
      ${!vis.length ? '<p class="empty">Nenhum lançamento para mostrar.</p>' : ''}
      <div class="row" style="margin-top:12px;gap:16px">
        <label class="check"><input type="checkbox" id="idone" ${S.done ? 'checked' : ''}> Marcar como efetivados (já aconteceram)</label>
        <span class="spacer"></span>
        <span class="small">Selecionados: <b>${selRows.length}</b> • Entradas <b class="pos money">${U.money(ent)}</b> • Saídas <b class="neg money">${U.money(sai)}</b></span>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn" data-back>Voltar</button><span class="spacer"></span><button class="btn primary" id="igo" ${selRows.length ? '' : 'disabled'}>${icon('check')}Importar ${selRows.length} lançamento(s)</button></div>
    </div>`;
  }

  async function handleFile(file) {
    if (!file) return;
    S.busy = true; App.render();
    try {
      S.fileName = file.name; S.info = null; S.lines = null;
      const r = await Importers.readAny(file);
      S.kind = r.kind;
      if (r.kind === 'json') { S.busy = false; App.render(); return UI.toast('Arquivo JSON: use Configurações → Restaurar backup.', 'error', 5000); }
      if (r.kind === 'ofx') { S.info = r.info; return toReview(r.rows.map((x) => ({ ...x }))); }
      if (r.kind === 'pdf') {
        S.lines = r.lines;
        const rows = Importers.textToRows(r.lines, { year: S.year });
        if (!rows.length) { S.busy = false; App.render(); showText('Não foi possível reconhecer lançamentos neste PDF. Ele pode ser escaneado (imagem) ou ter um layout diferente. Abaixo está o texto lido — você pode copiar as linhas, colar no campo "colar texto" e ajustar, ou usar o arquivo OFX/CSV do banco.'); return; }
        return toReview(rows);
      }
      // planilha
      S.sheets = r.sheets.filter((s) => s.grid.length);
      if (!S.sheets.length) throw new Error('A planilha está vazia.');
      const sysIdx = S.sheets.findIndex((s) => Reports.isSystemSheet(s.grid));
      if (sysIdx >= 0) {
        S.busy = false; App.render();
        const n = S.sheets[sysIdx].grid.length - 1;
        if (!(await UI.confirm(`Esta é uma planilha no modelo do sistema (${n} linha(s)). Os lançamentos serão importados para as contas indicadas na coluna "Conta" (contas e categorias inexistentes serão criadas). Linhas com ID já existente atualizam o lançamento em vez de duplicar. Continuar?`, { ok: 'Importar' }))) return;
        const res = await Reports.importSystemSheet(S.sheets[sysIdx].grid);
        UI.toast(`${res.imported} lançamento(s) importado(s)` + (res.newAccs ? `, ${res.newAccs} conta(s) criada(s)` : '') + (res.newCats ? `, ${res.newCats} categoria(s) criada(s)` : '') + (res.errors.length ? `. ${res.errors.length} linha(s) com erro: ${res.errors.slice(0, 10).join(', ')}` : ''), res.errors.length ? '' : 'ok', 8000);
        S = fresh(S.accountId); App.render(); return;
      }
      S.sheetIdx = 0; prepareMap(); S.step = 2;
    } catch (e) {
      console.error(e);
      const msg = /password/i.test(e.name || '') || /password/i.test(e.message) ? 'Este PDF está protegido por senha. Abra no leitor de PDF, salve uma cópia sem senha e tente de novo.' : e.message;
      UI.toast('Erro ao ler o arquivo: ' + msg, 'error', 7000);
    } finally { S.busy = false; App.render(); }
  }
  function prepareMap() {
    const grid = S.sheets[S.sheetIdx].grid;
    const cols = Math.max(...grid.slice(0, 30).map((r) => r.length));
    const saved = Store.getMeta('map:' + S.accountId + ':' + cols);
    S.map = saved && saved.date < cols ? { ...saved } : Importers.guessMapping(grid);
    if (!saved) {
      const acc = Store.get('accounts', S.accountId);
      const test = Importers.gridToRows(grid, S.map).rows;
      if (acc.type === 'cartao' && test.length && test.filter((r) => r.amount > 0).length / test.length > 0.7) S.map.invert = true;
    }
  }
  function prepRows(rows) {
    Importers.markDuplicates(rows, S.accountId);
    const learn = F.buildLearner();
    rows.forEach((r) => { r.on = !r.dup; r.category_id = learn(r.description, r.amount > 0 ? 'receita' : 'despesa') || ''; });
    S.rows = rows.sort((a, b) => a.date.localeCompare(b.date)); S.step = 3; S.busy = false;
  }
  function toReview(rows) {
    if (!rows.length) { UI.toast('Nenhum lançamento encontrado no arquivo.', 'error'); S.busy = false; App.render(); return; }
    prepRows(rows); App.render();
  }
  /** Recebe lançamentos já prontos (Open Finance) e abre a revisão */
  function loadRows(accountId, rows, { fileName = 'Open Finance', info = null, note = '' } = {}) {
    S = fresh(accountId); S.fileName = fileName; S.kind = 'api'; S.info = info; S.note = note;
    prepRows(rows); App.go('importar');
  }
  function showText(msg) {
    UI.modal({ title: 'Texto lido do arquivo', wide: true, body: `${msg ? `<p class="help small">${U.esc(msg)}</p>` : ''}<textarea class="input" rows="18" readonly style="font-family:ui-monospace,monospace;font-size:12px">${U.esc((S.lines || []).join('\n'))}</textarea>`, actions: [{ label: 'Fechar', cls: 'primary' }] });
  }

  async function doImport() {
    const acc = Store.get('accounts', S.accountId);
    const batch = U.uuid();
    const sel = S.rows.filter((r) => r.on);
    const recs = sel.map((r) => ({
      id: U.uuid(), account_id: acc.id, date: r.date, description: r.description.trim() || 'Lançamento', amount: Math.abs(r.amount), type: r.amount > 0 ? 'receita' : 'despesa',
      category_id: r.category_id || null, status: S.done ? 'efetivada' : 'pendente', fitid: r.fitid || null, import_batch: batch, imported_from: S.fileName,
    }));
    await Store.upsertMany('transactions', recs);
    await Store.setMeta('last_import_account', acc.id);
    const batches = Store.getMeta('import_batches', []); batches.unshift({ id: batch, account_id: acc.id, file: S.fileName, count: recs.length, at: new Date().toISOString() }); await Store.setMeta('import_batches', batches.slice(0, 30));
    UI.toast(`${recs.length} lançamento(s) importado(s) para ${acc.name}`, 'ok', 4500);
    const info = S.info;
    S = fresh(acc.id);
    App.go('conta', acc.id);
    if (info && typeof info.balance === 'number') {
      const cur = F.balance(acc.id, { mode: 'data', until: info.balanceDate || U.today() });
      if (cur !== info.balance) {
        const ok = await UI.confirm(`O banco informa saldo de <b>${U.money(info.balance)}</b>${info.balanceDate ? ' em ' + U.fmtDate(info.balanceDate) : ''}, e o sistema calcula <b>${U.money(cur)}</b> nessa data (diferença de ${U.money(info.balance - cur)}).<br><br>Deseja lançar um ajuste para igualar? (Útil quando o saldo inicial da conta não foi informado.)`, { ok: 'Lançar ajuste', title: 'Conferência de saldo' });
        if (ok) { await Store.upsert('transactions', { id: U.uuid(), account_id: acc.id, date: info.balanceDate || U.today(), type: info.balance - cur > 0 ? 'receita' : 'despesa', amount: Math.abs(info.balance - cur), category_id: F.ADJ_CAT, description: 'Ajuste de saldo (conferência com extrato)', status: 'efetivada' }); UI.toast('Ajuste lançado', 'ok'); }
      } else UI.toast('Saldo conferido: igual ao do banco ✔', 'ok', 4500);
    }
  }

  function bind(root) {
    const acc = $('#iacc', root);
    if (acc) acc.onchange = () => { S.accountId = acc.value; };
    const drop = $('#drop', root), inp = $('#ifile', root);
    if (drop) {
      drop.onclick = () => inp.click();
      inp.onchange = () => handleFile(inp.files[0]);
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); handleFile(e.dataTransfer.files[0]); };
      $('#itpl', root).onclick = (e) => { e.preventDefault(); Reports.template(); };
      $('#iparse', root).onclick = () => {
        const txt = $('#ipaste', root).value; S.year = +$('#iyear', root).value || new Date().getFullYear();
        if (!txt.trim()) return UI.toast('Cole o texto do extrato.');
        S.kind = 'text'; S.fileName = 'Texto colado'; S.info = null; S.lines = txt.split(/\r?\n/);
        // texto com separadores (ex.: copiado de planilha) vira grade para mapear colunas
        if (/\t|;/.test(txt) && txt.split(/\r?\n/).filter((l) => /\t|;/.test(l)).length > 2) {
          const g = Importers.parseCSV(txt); S.sheets = [{ name: 'Texto', grid: g.grid }]; S.sheetIdx = 0; prepareMap(); S.step = 2; App.render(); return;
        }
        const rows = Importers.textToRows(S.lines, { year: S.year });
        if (!rows.length) return UI.toast('Nenhuma linha com data e valor foi reconhecida.', 'error');
        toReview(rows);
      };
    }
    $$('[data-back]', root).forEach((b) => (b.onclick = () => { S.step = S.step === 3 && S.sheets && S.kind === 'sheet' ? 2 : 1; App.render(); }));
    if (S.step === 2) {
      const sh = $('#isheet', root); if (sh) sh.onchange = () => { S.sheetIdx = +sh.value; prepareMap(); App.render(); };
      $$('[data-m]', root).forEach((el) => (el.onchange = () => {
        const k = el.dataset.m; S.map[k] = el.type === 'checkbox' ? el.checked : (['dateFmt', 'decimal'].includes(k) ? el.value : +el.value);
        if (k === 'amount' && S.map.amount >= 0) { S.map.debit = -1; S.map.credit = -1; }
        if ((k === 'debit' || k === 'credit') && S.map[k] >= 0) S.map.amount = -1;
        App.render();
      }));
      $('[data-next]', root).onclick = async () => {
        const grid = S.sheets[S.sheetIdx].grid; const cols = Math.max(...grid.slice(0, 30).map((r) => r.length));
        await Store.setMeta('map:' + S.accountId + ':' + cols, S.map);
        const res = Importers.gridToRows(grid, S.map);
        S.kind = 'sheet'; toReview(res.rows);
      };
    }
    if (S.step === 3) {
      root.addEventListener('change', (e) => {
        const t = e.target; const d = t.dataset;
        if (d.on !== undefined) { S.rows[+d.on].on = t.checked; App.render(); }
        if (d.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) S.rows[+d.date].date = t.value;
        if (d.desc !== undefined) S.rows[+d.desc].description = t.value;
        if (d.cat !== undefined) S.rows[+d.cat].category_id = t.value;
      });
      $$('[data-flip]', root).forEach((b) => (b.onclick = () => { const r = S.rows[+b.dataset.flip]; r.amount = -r.amount; r.category_id = ''; Importers.markDuplicates(S.rows, S.accountId); App.render(); }));
      const all = $('#iall', root); if (all) all.onchange = () => { S.rows.forEach((r) => { if (!S.onlyNew || !r.dup) r.on = all.checked; }); App.render(); };
      $('#ionlynew', root).onchange = (e) => { S.onlyNew = e.target.checked; App.render(); };
      $('#idone', root).onchange = (e) => { S.done = e.target.checked; };
      $('#iinv', root).onclick = () => { S.rows.forEach((r) => { r.amount = -r.amount; r.category_id = ''; }); const learn = F.buildLearner(); S.rows.forEach((r) => (r.category_id = learn(r.description, r.amount > 0 ? 'receita' : 'despesa') || '')); Importers.markDuplicates(S.rows, S.accountId); S.rows.forEach((r) => (r.on = !r.dup)); App.render(); };
      const tx = $('#itext', root); if (tx) tx.onclick = () => showText();
      $('#igo', root).onclick = doImport;
    }
  }

  return { title: 'Importar extrato', render, bind, start, loadRows, live: false };
})();
