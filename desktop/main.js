/* Aplicativo Windows (Electron): abre a mesma interface da pasta www em uma janela própria. */
const { app, BrowserWindow, protocol, shell, Menu, dialog, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, 'www');
// Protocolo próprio (app://) = origem fixa e segura: o banco local (IndexedDB) fica sempre no mesmo lugar
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Mesma pasta de dados para o instalador e para a versão portátil.
// Nome SEM acentos: com "ç" no caminho o banco local (IndexedDB/LevelDB) do Chromium não abre.
const USER_DATA = process.env.FP_UD || path.join(app.getPath('appData'), 'FinancasPessoais');
const OLD_USER_DATA = path.join(app.getPath('appData'), 'Finanças Pessoais'); // versões até 1.0.6
try {
  if (!process.env.FP_UD && !fs.existsSync(USER_DATA) && fs.existsSync(OLD_USER_DATA)) {
    // copia para uma pasta temporária e só renomeia no fim: uma cópia interrompida nunca vira a pasta oficial
    const tmp = USER_DATA + '.migrando';
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(OLD_USER_DATA, tmp, { recursive: true, filter: (src) => !/[\\/](Singleton\w*|lockfile|LOCK)$/.test(src) });
    fs.writeFileSync(path.join(tmp, 'migrado-de-versao-anterior.txt'), 'Dados copiados de ' + OLD_USER_DATA + ' em ' + new Date().toISOString() + '\n');
    fs.renameSync(tmp, USER_DATA);
  }
} catch (e) {
  // se a cópia falhar (ex.: versão antiga aberta), tenta de novo na próxima abertura
  try { fs.rmSync(USER_DATA + '.migrando', { recursive: true, force: true }); } catch (e2) { /* ignora */ }
}
app.setPath('userData', USER_DATA);

// Registro de erros (ajuda a diagnosticar problemas): %APPDATA%\FinancasPessoais\registro.txt
function log(...a) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'registro.txt'), new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch (e) { /* ignora */ }
}
process.on('uncaughtException', (e) => { log('erro:', e && e.stack || e); });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 560,
    title: 'Vorticis Finanças Pessoais', backgroundColor: '#f4f6fb', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadURL('app://financas/index.html');
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log('falha ao carregar', code, desc, url);
    dialog.showErrorBox('Vorticis Finanças Pessoais', 'Não foi possível abrir a interface (' + desc + ').\nDetalhes em: ' + path.join(app.getPath('userData'), 'registro.txt'));
  });
  win.webContents.on('render-process-gone', (e, d) => { log('interface encerrada:', d.reason, d.exitCode); if (d.reason !== 'clean-exit') win.reload(); });
  win.webContents.on('console-message', (e, ...a) => { const m = a[0] && a[0].message ? a[0] : { level: a[0], message: a[1] }; if (m.level === 'error' || m.level === 3) log('console:', m.message); });
  // Janelas da Pluggy (autorização do Open Finance/MeuPluggy) abrem DENTRO do app, como num navegador:
  // assim a resposta da autorização volta para a tela de conexão. Os demais links abrem no navegador padrão.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isPluggyUrl(url) || process.env.FP_TESTE_POPUP && url.startsWith(process.env.FP_TESTE_POPUP)) {
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 520, height: 760, parent: win, autoHideMenuBar: true, title: 'Conectar banco', backgroundColor: '#ffffff', icon: path.join(__dirname, 'icon.ico'),
        webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } } };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
}

const isPluggyUrl = (u) => { try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)pluggy\.ai$/i.test(h.hostname); } catch (e) { return false; } };
// Dentro da janela de autorização a navegação é livre (o MeuPluggy/banco pode redirecionar para páginas de login),
// mas novas janelas que ela tentar abrir fora da Pluggy vão para o navegador padrão.
app.on('web-contents-created', (e, wc) => {
  if (wc.getType() !== 'window') return;
  wc.once('did-start-navigation', () => {
    if (win && wc.id === win.webContents.id) return;
    wc.setWindowOpenHandler(({ url }) => {
      if (isPluggyUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: { parent: win, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } } };
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Requisições do Open Finance feitas pelo processo principal (sem CORS). Só para a API da Pluggy.
const ALLOWED_HTTP = [/^https:\/\/api\.pluggy\.ai\//];
if (process.env.FP_TESTE_URL) ALLOWED_HTTP.push(new RegExp('^' + process.env.FP_TESTE_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
ipcMain.handle('http', async (e, req) => {
  if (!req || typeof req.url !== 'string' || !ALLOWED_HTTP.some((r) => r.test(req.url))) throw new Error('Endereço não permitido');
  const method = ['GET', 'POST', 'PATCH'].includes(req.method) ? req.method : 'GET';
  const res = await net.fetch(req.url, { method, headers: req.headers || {}, body: method === 'GET' ? undefined : req.body, redirect: 'error' });
  return { status: res.status, body: await res.text() };
});

require('./updater').setup(() => win, log);

app.whenReady().then(() => {
  log('iniciando versão', app.getVersion(), 'em', app.getAppPath());
  // Lê os arquivos da interface direto do pacote (não depende do caminho de instalação)
  protocol.handle('app', async (request) => {
    try {
      let p = decodeURIComponent(new URL(request.url).pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(WEB, p));
      if (file !== WEB && !file.startsWith(WEB + path.sep)) return new Response('Não encontrado', { status: 404 });
      const data = await fs.promises.readFile(file);
      return new Response(data, { status: 200, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) {
      log('arquivo não encontrado:', request.url, e.message);
      return new Response('Não encontrado', { status: 404 });
    }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Arquivo', submenu: [{ role: 'reload', label: 'Recarregar' }, { type: 'separator' }, { role: 'quit', label: 'Sair' }] },
    { label: 'Exibir', submenu: [{ role: 'zoomIn', label: 'Aumentar zoom' }, { role: 'zoomOut', label: 'Diminuir zoom' }, { role: 'resetZoom', label: 'Zoom normal' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela cheia' }, { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }] },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
