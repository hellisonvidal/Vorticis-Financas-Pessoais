/* Aplicativo Windows (Electron): abre a mesma interface da pasta www em uma janela própria. */
const { app, BrowserWindow, protocol, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, 'www');
// Protocolo próprio (app://) = origem fixa e segura: o banco local (IndexedDB) fica sempre no mesmo lugar
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Mesma pasta de dados para o instalador e para a versão portátil
app.setPath('userData', path.join(app.getPath('appData'), 'Finanças Pessoais'));

// Registro de erros (ajuda a diagnosticar problemas): %APPDATA%\Finanças Pessoais\registro.txt
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
    title: 'Finanças Pessoais', backgroundColor: '#f4f6fb', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.loadURL('app://financas/index.html');
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log('falha ao carregar', code, desc, url);
    dialog.showErrorBox('Finanças Pessoais', 'Não foi possível abrir a interface (' + desc + ').\nDetalhes em: ' + path.join(app.getPath('userData'), 'registro.txt'));
  });
  win.webContents.on('render-process-gone', (e, d) => { log('interface encerrada:', d.reason, d.exitCode); if (d.reason !== 'clean-exit') win.reload(); });
  win.webContents.on('console-message', (e, ...a) => { const m = a[0] && a[0].message ? a[0] : { level: a[0], message: a[1] }; if (m.level === 'error' || m.level === 3) log('console:', m.message); });
  // links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

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
