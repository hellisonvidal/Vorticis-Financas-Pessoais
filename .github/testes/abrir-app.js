// Conecta ao app aberto (--remote-debugging-port) e confere se a interface carregou.
const { chromium } = require('playwright-core');
(async () => {
  const port = process.argv[2] || '9333';
  let last;
  for (let i = 0; i < 60; i++) {
    try {
      const b = await chromium.connectOverCDP('http://127.0.0.1:' + port);
      const pages = b.contexts().flatMap((c) => c.pages());
      const p = pages[0];
      await p.waitForSelector('nav a', { timeout: 20000 });
      const n = await p.evaluate(() => document.querySelectorAll('nav a').length);
      console.log('URL:', p.url(), '| itens do menu:', n);
      console.log((await p.evaluate(() => document.body.innerText)).slice(0, 300));
      await b.close();
      process.exit(n > 3 ? 0 : 1);
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1000)); }
  }
  console.error('Falhou ao abrir o app:', last && last.message);
  process.exit(1);
})();
