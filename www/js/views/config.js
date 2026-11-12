'use strict';
/* Configurações: sincronização, backup, segurança, aparência e dados */
Views.config = (() => {
  const { $, $$, icon } = UI;
  const VERSION = '1.0.0';
  function render() {
    const c = Sync.cfg(); const s = Sync.session(); const st = Sync.state;
    const last = Store.getMeta('sb_last');
    const nTx = F.txs().length, nDirty = Store.dirty().length;
    const hasPin = !!Store.getMeta('pin_hash');
    const theme = Store.getMeta('theme', 'auto');
    const batches = Store.getMeta('import_batches', []).filter((b) => F.txs().some((t) => t.import_batch === b.id));
    const platform = U.isNative() ? 'Aplicativo Android' : navigator.userAgent.includes('Electron') ? 'Aplicativo Windows' : 'Navegador';
    return `<div class="grid g2">
    <div class="card">
      <h3>${icon('sync')} Sincronização entre computador e celular</h3>
      ${s ? `<p>Conectado como <b>${U.esc(s.user.email)}</b></p>
        <p class="small">Status: <b class="${st.status === 'error' ? 'neg' : st.status === 'ok' ? 'pos' : ''}">${U.esc(st.message || st.status)}</b>${last ? ` • última sincronização: ${new Date(last).toLocaleString('pt-BR')}` : ''}${nDirty ? ` • ${nDirty} alteração(ões) aguardando envio` : ''}</p>
        <div class="row"><button class="btn primary" id="ssync">${icon('sync')}Sincronizar agora</button><button class="btn" id="sout">Sair</button></div>`
      : `<p class="small muted">Os dados ficam neste aparelho. Para ver e lançar no Windows e no Android ao mesmo tempo, conecte os dois à mesma conta gratuita do Supabase (veja o passo a passo no arquivo LEIA-ME).</p>
        <div class="form">
          <label class="field full"><span>URL do projeto Supabase</span><input class="input" id="surl" value="${U.esc(c.url)}" placeholder="https://xxxxxxxx.supabase.co"></label>
          <label class="field full"><span>Chave pública (anon / publishable key)</span><input class="input" id="skey" value="${U.esc(c.key)}" placeholder="eyJhbGciOi… ou sb_publishable_…"></label>
          <label class="field"><span>E-mail</span><input class="input" id="smail" type="email" autocomplete="username" value="${U.esc(Store.getMeta('sb_email') || '')}"></label>
          <label class="field"><span>Senha</span><input class="input" id="spass" type="password" autocomplete="current-password"></label>
        </div><p class="err" id="serr"></p>
        <div class="row"><button class="btn primary" id="sin">Entrar e sincronizar</button><button class="btn" id="sup">Criar conta</button></div>
        <p class="small muted">Use a mesma URL, chave, e-mail e senha no computador e no celular. Os dados existentes neste aparelho são enviados e mesclados com os da nuvem.</p>`}
    </div>
    <div class="card">
      <h3>Backup e planilhas</h3>
      <p class="small muted">Faça cópias de segurança periódicas. O backup (.json) restaura tudo; a planilha (.xlsx) serve para consulta e edição no Excel.</p>
      <div class="row"><button class="btn primary" id="bexp">Fazer backup (.json)</button><button class="btn" id="bimp">Restaurar backup…</button><input type="file" id="bfile" accept=".json,application/json" hidden></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="xall">${icon('sheet')}Exportar tudo para Excel</button><button class="btn" id="xtpl">Baixar modelo de planilha</button></div>
      ${Store.getMeta('last_backup') ? `<p class="small muted">Último backup: ${new Date(Store.getMeta('last_backup')).toLocaleString('pt-BR')}</p>` : '<p class="small warn">Nenhum backup feito ainda neste aparelho.</p>'}
    </div>
    <div class="card">
      <h3>Segurança e aparência</h3>
      <div class="row"><span>PIN de acesso: <b>${hasPin ? 'ativado' : 'desativado'}</b></span><span class="spacer"></span><button class="btn sm" id="pin">${hasPin ? 'Alterar/remover PIN' : 'Definir PIN'}</button></div>
      <p class="small muted">O PIN bloqueia a abertura do app neste aparelho (e após 5 minutos em segundo plano).</p>
      <div class="row" style="margin-top:10px"><span>Tema</span><span class="spacer"></span><div class="seg" id="theme">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, v]) => `<button data-v="${k}" class="${theme === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <label class="field" style="margin-top:12px"><span>Nome do titular (aparece no cabeçalho dos PDFs)</span><input class="input" id="owner" value="${U.esc(Store.getMeta('owner_name') || '')}"></label>
      ${App.installEvt ? `<button class="btn primary" id="install" style="margin-top:12px">Instalar como aplicativo</button>` : ''}
    </div>
    <div class="card">
      <h3>Dados</h3>
      <p class="small">${nTx} lançamento(s) • ${F.accounts(true).length} conta(s) • ${F.categories().length} categoria(s) • armazenamento: ${Store.usingIDB ? 'IndexedDB' : 'localStorage'} • ${platform} • versão ${VERSION}</p>
      ${batches.length ? `<h3 style="margin-top:12px">Importações recentes</h3><ul class="mini">${batches.slice(0, 6).map((b) => `<li><span>${U.esc(b.file)} <small class="muted">${new Date(b.at).toLocaleString('pt-BR')} • ${U.esc(F.accName(b.account_id))}</small></span><button class="btn sm danger" data-undo="${b.id}">Desfazer</button></li>`).join('')}</ul>` : ''}
      <div class="row" style="margin-top:12px">
        <button class="btn" id="dsample">Carregar dados de exemplo</button>
        ${F.txs().some((t) => t.sample) || F.accounts(true).some((a) => a.sample) ? '<button class="btn" id="dclearsample">Remover dados de exemplo</button>' : ''}
        <button class="btn danger" id="dwipe">${icon('trash')}Apagar todos os dados</button>
      </div>
    </div>
    </div>`;
  }

  function bind(root) {
    const on = (id, fn) => { const el = $('#' + id, root); if (el) el.onclick = fn; };
    const creds = async () => {
      const url = $('#surl', root).value.trim(), key = $('#skey', root).value.trim(), email = $('#smail', root).value.trim(), pass = $('#spass', root).value;
      if (!/^https:\/\/[^/]+$/.test(url.replace(/\/+$/, ''))) throw new Error('Informe a URL do projeto (ex.: https://xxxx.supabase.co).');
      if (key.length < 20) throw new Error('Informe a chave pública (anon key).');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Informe um e-mail válido.');
      if (pass.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      await Sync.setConfig(url, key); await Store.setMeta('sb_email', email);
      return { email, pass };
    };
    const err = (m) => { const e = $('#serr', root); if (e) e.textContent = m; };
    on('sin', async (ev) => {
      ev.target.disabled = true; err('');
      try { const { email, pass } = await creds(); const r = await Sync.signIn(email, pass); UI.toast(`Sincronizado: ${r ? r.got : 0} recebido(s), ${r ? r.sent : 0} enviado(s)`, 'ok', 5000); App.render(); }
      catch (e) { err(e.message); } finally { ev.target.disabled = false; }
    });
    on('sup', async (ev) => {
      ev.target.disabled = true; err('');
      try {
        const { email, pass } = await creds(); const r = await Sync.signUp(email, pass);
        if (r.confirmed) { await Sync.signIn(email, pass); UI.toast('Conta criada e sincronizada', 'ok'); App.render(); }
        else UI.modal({ title: 'Confirme seu e-mail', body: `<p>Enviamos um link de confirmação para <b>${U.esc(email)}</b>. Abra o e-mail, confirme e depois toque em <b>Entrar e sincronizar</b>.</p><p class="small muted">Não chegou? Verifique o spam. Você também pode desativar a confirmação em Supabase → Authentication → Sign In / Providers → Email → "Confirm email".</p>`, actions: [{ label: 'OK', cls: 'primary' }] });
      } catch (e) { err(e.message); } finally { ev.target.disabled = false; }
    });
    on('ssync', async (ev) => { ev.target.disabled = true; try { const r = await Sync.syncNow(); UI.toast(`Sincronizado: ${r.got} recebido(s), ${r.sent} enviado(s)`, 'ok'); } catch (e) { UI.toast(e.message, 'error', 5000); } finally { App.render(); } });
    on('sout', async () => { if (await UI.confirm('Desconectar a sincronização neste aparelho? Os dados locais continuam aqui.', { ok: 'Sair' })) { await Sync.signOut(); App.render(); } });

    on('bexp', async () => {
      const data = Store.exportJSON();
      await U.saveFile(`financas-backup-${U.fileStamp()}.json`, JSON.stringify(data), 'application/json');
      await Store.setMeta('last_backup', new Date().toISOString()); UI.toast('Backup gerado', 'ok'); App.render();
    });
    on('bimp', () => $('#bfile', root).click());
    const bf = $('#bfile', root);
    bf.onchange = async () => {
      const file = bf.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await U.readText(file));
        if (!data || data.app !== 'financas-pessoais') throw new Error('Este arquivo não é um backup do Finanças Pessoais.');
        const n = Object.values(data.collections || {}).reduce((a, x) => a + x.length, 0);
        const mode = await UI.choose(`Backup de ${data.exported_at ? new Date(data.exported_at).toLocaleString('pt-BR') : 'data desconhecida'} com ${n} registro(s).<br><br><b>Mesclar</b>: mantém os dados atuais e acrescenta/atualiza com o backup (o mais recente vence).<br><b>Substituir</b>: apaga os dados atuais e deixa exatamente como no backup.`, [{ v: 'merge', label: 'Mesclar', cls: 'primary' }, { v: 'replace', label: 'Substituir tudo', cls: 'danger' }], 'Restaurar backup');
        if (!mode) return;
        if (mode === 'replace' && !(await UI.confirm('Substituir TODOS os dados atuais pelo backup? Se a sincronização estiver ativa, os outros aparelhos também serão atualizados.', { ok: 'Substituir', danger: true }))) return;
        const k = await Store.importJSON(data, mode);
        UI.toast(`Backup restaurado (${k} registro(s))`, 'ok'); App.render();
      } catch (e) { UI.toast('Erro: ' + e.message, 'error', 6000); } finally { bf.value = ''; }
    };
    on('xall', () => Promise.resolve(Reports.exportAll()).then(() => UI.toast('Planilha gerada', 'ok')).catch((e) => UI.toast(e.message, 'error')));
    on('xtpl', () => Reports.template());
    on('pin', () => {
      const has = !!Store.getMeta('pin_hash');
      UI.modal({ title: has ? 'Alterar PIN' : 'Definir PIN', body: `<div class="form"><label class="field"><span>Novo PIN (4 a 8 números)</span><input class="input" type="password" inputmode="numeric" id="p1" maxlength="8"></label><label class="field"><span>Repita o PIN</span><input class="input" type="password" inputmode="numeric" id="p2" maxlength="8"></label></div><p class="small warn">Se esquecer o PIN, só será possível entrar apagando os dados do app (restaure pelo backup ou pela sincronização).</p><p class="err" id="perr"></p>`,
        actions: [...(has ? [{ label: 'Remover PIN', cls: 'danger', left: true, onClick: async () => { await Store.setMeta('pin_hash', null); UI.toast('PIN removido', 'ok'); App.render(); } }] : []), { label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: async (b) => {
          const p1 = $('#p1', b).value, p2 = $('#p2', b).value;
          if (!/^\d{4,8}$/.test(p1)) { $('#perr', b).textContent = 'Use de 4 a 8 números.'; return false; }
          if (p1 !== p2) { $('#perr', b).textContent = 'Os PINs não conferem.'; return false; }
          await Store.setMeta('pin_hash', await U.sha256('fp:' + p1)); UI.toast('PIN definido', 'ok'); App.render();
        } }] });
    });
    $$('#theme button', root).forEach((b) => (b.onclick = async () => { await Store.setMeta('theme', b.dataset.v); App.applyTheme(); App.render(); }));
    const ow = $('#owner', root); ow.onchange = () => Store.setMeta('owner_name', ow.value.trim());
    on('install', async () => { const e = App.installEvt; if (!e) return; e.prompt(); await e.userChoice; App.installEvt = null; App.render(); });
    $$('[data-undo]', root).forEach((b) => (b.onclick = async () => {
      const ids = F.txs().filter((t) => t.import_batch === b.dataset.undo).map((t) => t.id);
      if (!(await UI.confirm(`Excluir os ${ids.length} lançamento(s) desta importação?`, { ok: 'Excluir', danger: true }))) return;
      await Store.removeMany('transactions', ids); UI.toast('Importação desfeita', 'ok'); App.render();
    }));
    on('dsample', async () => {
      if (F.accounts(true).some((a) => a.sample) && !(await UI.confirm('Os dados de exemplo já foram carregados. Carregar novamente (duplica)?'))) return;
      await Sample.load(); UI.toast('Dados de exemplo carregados', 'ok'); App.go('painel');
    });
    on('dclearsample', async () => {
      if (!(await UI.confirm('Remover contas, lançamentos, orçamentos e metas de exemplo?', { ok: 'Remover', danger: true }))) return;
      const accs = F.accounts(true).filter((a) => a.sample).map((a) => a.id);
      await Store.removeMany('transactions', F.txs().filter((t) => t.sample || accs.includes(t.account_id) || accs.includes(t.to_account_id)).map((t) => t.id));
      await Store.removeMany('goals', Store.all('goals').filter((g) => g.sample || accs.includes(g.account_id)).map((g) => g.id));
      await Store.removeMany('budgets', Store.all('budgets').filter((b) => b.sample).map((b) => b.id));
      await Store.removeMany('accounts', accs);
      UI.toast('Dados de exemplo removidos', 'ok'); App.render();
    });
    on('dwipe', async () => {
      const synced = Sync.loggedIn();
      if (!(await UI.confirm(`Apagar TODOS os lançamentos, contas, orçamentos e metas${synced ? ' — inclusive na nuvem e nos outros aparelhos sincronizados' : ''}? Recomendamos fazer um backup antes.`, { ok: 'Apagar tudo', danger: true }))) return;
      if (!(await UI.confirm('Tem certeza? Esta ação não pode ser desfeita.', { ok: 'Sim, apagar', danger: true }))) return;
      for (const c of ['transactions', 'accounts', 'budgets', 'goals']) await Store.removeMany(c, Store.all(c).map((r) => r.id));
      UI.toast('Dados apagados', 'ok'); App.go('painel');
    });
  }
  return { title: 'Configurações', render, bind, live: false };
})();
