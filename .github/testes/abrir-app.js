// Conecta ao app aberto (--remote-debugging-port) e confere se a interface carregou e se o banco local funciona.
// Uso: node abrir-app.js <porta> [gravar|conferir]
const { chromium } = require('playwright-core');
(async () => {
  const port = process.argv[2] || '9333'; const mode = process.argv[3] || '';
  let last;
  for (let i = 0; i < 60; i++) {
    try {
      const b = await chromium.connectOverCDP('http://127.0.0.1:' + port);
      const p = b.contexts().flatMap((c) => c.pages())[0];
      await p.waitForSelector('nav a', { timeout: 20000 }); await p.waitForTimeout(800);
      const r = await p.evaluate(async (mode) => {
        const idb = await new Promise((res) => { const q = indexedDB.open('financas-pessoais', 1); q.onsuccess = () => { q.result.close(); res('ok'); }; q.onerror = () => res('ERRO: ' + q.error); });
        if (mode === 'antigo') await Store.upsert('accounts', { id: 'teste-migracao', name: 'Dado da versão anterior', type: 'corrente', initial_balance: 777 });
        if (mode === 'gravar') await Store.upsert('accounts', { id: 'teste-persistencia', name: 'Teste de persistência', type: 'corrente', initial_balance: 4242 });
        return { menu: document.querySelectorAll('nav a').length, idb, registro: !!Store.get('accounts', 'teste-persistencia'), migrado: !!Store.get('accounts', 'teste-migracao'), ponte: !!(window.desktop && desktop.http) };
      }, mode);
      console.log('URL:', p.url(), '|', JSON.stringify(r));
      await b.close();
      if (mode === 'antigo') { console.log('VERSAO_ANTIGA_IDB=' + r.idb); process.exit(r.menu > 3 ? 0 : 1); }
      const ok = r.menu > 3 && r.idb === 'ok' && r.ponte && (mode !== 'conferir' || r.registro) && (mode !== 'migracao' || r.migrado);
      if (!ok) console.error('Falha: ' + (r.idb !== 'ok' ? 'banco local (IndexedDB) não abriu' : mode === 'conferir' && !r.registro ? 'dado gravado antes não foi encontrado' : mode === 'migracao' && !r.migrado ? 'dado da versão anterior não foi migrado' : 'interface incompleta'));
      process.exit(ok ? 0 : 1);
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1000)); }
  }
  console.error('Falhou ao abrir o app:', last && last.message);
  process.exit(1);
})();
