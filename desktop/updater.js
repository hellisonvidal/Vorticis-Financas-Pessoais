/* Atualização dentro do app (Windows).
 * - Versão instalada: electron-updater (baixa o novo instalador da Release do GitHub, confere o SHA-512 e reinicia já atualizado).
 * - Versão portátil: baixa o novo .exe portátil para a mesma pasta e abre a versão nova.
 * Variáveis só para testes automáticos: FP_UPDATE_URL (servidor genérico) e FP_RELEASES_URL (JSON no formato da API do GitHub). */
const { app, ipcMain, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO = 'hellisonvidal/Vorticis-Financas-Pessoais';
const RELEASES_URL = process.env.FP_RELEASES_URL || `https://api.github.com/repos/${REPO}/releases/latest`;
const portableFile = process.env.PORTABLE_EXECUTABLE_FILE || '';
const mode = () => (!app.isPackaged ? 'dev' : portableFile ? 'portatil' : process.platform === 'win32' ? 'instalado' : 'outro');

const cmp = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };

function setup(getWin, log) {
  const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  let au = null; let portable = null; // { version, url, name, size, file }

  function updater() {
    if (au) return au;
    au = require('electron-updater').autoUpdater;
    au.autoDownload = false; au.autoInstallOnAppQuit = true; au.allowDowngrade = false; au.disableWebInstaller = true;
    au.logger = { info: (m) => log('atualizador:', m), warn: (m) => log('atualizador (aviso):', m), error: (m) => log('atualizador (erro):', m), debug: () => {} };
    if (process.env.FP_UPDATE_URL) au.setFeedURL({ provider: 'generic', url: process.env.FP_UPDATE_URL });
    au.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent || 0), transferred: p.transferred, total: p.total }));
    au.on('update-downloaded', (i) => send('update:downloaded', { version: i.version }));
    au.on('error', (e) => send('update:error', { message: String((e && e.message) || e) }));
    return au;
  }

  async function latestRelease() {
    const r = await net.fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FinancasPessoais' } });
    if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
    return r.json();
  }

  ipcMain.handle('update:info', () => ({ mode: mode(), version: app.getVersion() }));

  ipcMain.handle('update:check', async () => {
    const m = mode();
    if (m === 'instalado') {
      const r = await updater().checkForUpdates();
      const v = r && r.updateInfo && r.updateInfo.version;
      return { mode: m, current: app.getVersion(), latest: v || app.getVersion(), available: !!v && cmp(v, app.getVersion()) > 0, notes: r && r.updateInfo && typeof r.updateInfo.releaseNotes === 'string' ? r.updateInfo.releaseNotes : '' };
    }
    if (m === 'portatil') {
      const rel = await latestRelease();
      const v = String(rel.tag_name || '').replace(/^v/, '');
      const asset = (rel.assets || []).find((a) => /Portatil.*\.exe$/i.test(a.name));
      portable = asset ? { version: v, url: asset.browser_download_url, name: asset.name, size: asset.size } : null;
      return { mode: m, current: app.getVersion(), latest: v, available: !!asset && cmp(v, app.getVersion()) > 0, notes: rel.body || '' };
    }
    return { mode: m, current: app.getVersion(), latest: app.getVersion(), available: false };
  });

  ipcMain.handle('update:download', async () => {
    const m = mode();
    if (m === 'instalado') { await updater().downloadUpdate(); return { ok: true }; }
    if (m !== 'portatil' || !portable) throw new Error('Verifique as atualizações primeiro.');
    const dir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(portableFile);
    const dest = path.join(dir, portable.name); const tmp = dest + '.baixando';
    const res = await net.fetch(portable.url);
    if (!res.ok || !res.body) throw new Error('Falha ao baixar (' + res.status + ')');
    const total = +res.headers.get('content-length') || portable.size || 0;
    const out = fs.createWriteStream(tmp); let got = 0; let last = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        got += value.length;
        if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
        if (total && Date.now() - last > 200) { last = Date.now(); send('update:progress', { percent: Math.round(got / total * 100), transferred: got, total }); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    } catch (e) { out.destroy(); fs.rmSync(tmp, { force: true }); throw e; }
    if (portable.size && got !== portable.size) { fs.rmSync(tmp, { force: true }); throw new Error('Download incompleto. Tente de novo.'); }
    fs.renameSync(tmp, dest);
    portable.file = dest;
    send('update:progress', { percent: 100, transferred: got, total: got });
    send('update:downloaded', { version: portable.version, file: dest });
    return { ok: true, file: dest };
  });

  ipcMain.handle('update:install', async () => {
    const m = mode();
    if (m === 'instalado') { setImmediate(() => updater().quitAndInstall(false, true)); return { ok: true }; }
    if (m === 'portatil' && portable && portable.file && fs.existsSync(portable.file)) {
      app.releaseSingleInstanceLock();
      spawn(portable.file, [], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 300);
      return { ok: true };
    }
    throw new Error('Nada para instalar.');
  });

  ipcMain.handle('update:open-page', () => shell.openExternal(`https://github.com/${REPO}/releases/latest`));
}

module.exports = { setup, cmp };
