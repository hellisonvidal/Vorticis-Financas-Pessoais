/* Atualização dentro do próprio app.
 *  - Windows (instalado): baixa e instala a nova versão e reinicia (electron-updater, pelo processo principal).
 *  - Windows (portátil): baixa o novo .exe portátil na mesma pasta e abre a versão nova.
 *  - Android: baixa o novo APK dentro do app e abre o instalador do sistema.
 *  - Navegador: a versão web se atualiza ao recarregar a página.
 * As versões vêm da página de Releases do GitHub do projeto. */
'use strict';

const Updater = (() => {
  const REPO = 'hellisonvidal/Vorticis-Financas-Pessoais';
  const API = () => Store.getMeta('upd_api') || `https://api.github.com/repos/${REPO}/releases/latest`;
  const PAGE = `https://github.com/${REPO}/releases/latest`;
  const current = () => window.APP_VERSION || '0.0.0';
  const state = { status: 'idle', latest: null, notes: '', percent: 0, error: '', mode: null, file: null, asset: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(state); } catch (e) { console.error(e); } });
  const on = (f) => { listeners.add(f); return () => listeners.delete(f); };
  const set = (o) => { Object.assign(state, o); emit(); };

  const cmp = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
  const isDesktop = () => !!(globalThis.desktop && desktop.update);
  const isAndroid = () => U.isNative() && Capacitor.getPlatform && Capacitor.getPlatform() === 'android';

  async function mode() {
    if (state.mode) return state.mode;
    if (isDesktop()) { const i = await desktop.update.info(); state.mode = i.mode; }
    else state.mode = isAndroid() ? 'android' : 'web';
    return state.mode;
  }
  /** O que este aparelho consegue fazer sozinho */
  async function canInstall() { const m = await mode(); return ['instalado', 'portatil', 'android'].includes(m); }

  async function latestRelease() {
    const r = await fetch(API(), { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (r.status === 403 || r.status === 429) throw new Error('O GitHub limitou as consultas por agora. Tente de novo mais tarde.');
    if (!r.ok) throw new Error('Não foi possível consultar as versões (GitHub respondeu ' + r.status + ').');
    return r.json();
  }

  let offDesk = null;
  function listenDesktop() {
    if (offDesk || !isDesktop()) return;
    offDesk = desktop.update.on((ev, d) => {
      if (ev === 'progress') set({ status: 'downloading', percent: d.percent || 0 });
      if (ev === 'downloaded') set({ status: 'ready', percent: 100 });
      if (ev === 'error' && state.status === 'downloading') set({ status: 'error', error: d.message || 'Falha ao baixar a atualização.' });
    });
  }

  async function check({ silent = false } = {}) {
    if (state.status === 'downloading' || state.status === 'installing') return state;
    set({ status: 'checking', error: '' });
    try {
      const m = await mode();
      await Store.setMeta('upd_last_check', Date.now());
      if (m === 'instalado' || m === 'portatil') {
        listenDesktop();
        const r = await desktop.update.check();
        set({ status: r.available ? 'available' : 'uptodate', latest: r.latest, notes: r.notes || '' });
      } else if (m === 'dev') {
        set({ status: 'uptodate', latest: current() });
      } else {
        const rel = await latestRelease();
        const v = String(rel.tag_name || '').replace(/^v/, '');
        const asset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
        set({ status: cmp(v, current()) > 0 ? 'available' : 'uptodate', latest: v, notes: rel.body || '', asset });
      }
    } catch (e) {
      console.warn('atualização', e);
      set({ status: silent ? 'idle' : 'error', error: e.message || String(e) });
    }
    return state;
  }

  async function download() {
    set({ status: 'downloading', percent: 0, error: '' });
    const m = await mode();
    try {
      if (m === 'instalado' || m === 'portatil') { listenDesktop(); await desktop.update.download(); set({ status: 'ready', percent: 100 }); return; }
      if (m === 'android') {
        const FS = Capacitor.Plugins.Filesystem;
        if (!state.asset) throw new Error('Arquivo da nova versão não encontrado na página de versões.');
        // limpa downloads anteriores (pasta antiga e APKs soltos no cache)
        try { await FS.rmdir({ path: 'atualizacao', directory: 'CACHE', recursive: true }); } catch (e) { /* não existia */ }
        try {
          const ls = await FS.readdir({ path: '', directory: 'CACHE' });
          for (const f of (ls && ls.files) || []) { const n = typeof f === 'string' ? f : f.name; if (/^(Vorticis)?FinancasPessoais-.*\.apk$/.test(n)) { try { await FS.deleteFile({ path: n, directory: 'CACHE' }); } catch (e) { /* ignora */ } } }
        } catch (e) { /* sem listagem */ }
        // grava direto na raiz do cache: não depende de criar subpastas (o download não cria pastas no Android)
        const nome = `VorticisFinancasPessoais-${state.latest}.apk`;
        let sub = null;
        try { sub = await FS.addListener('progress', (p) => { if (p.contentLength) set({ percent: Math.min(99, Math.round(p.bytes / p.contentLength * 100)) }); }); } catch (e) { /* sem progresso */ }
        let r;
        try { r = await FS.downloadFile({ url: state.asset.browser_download_url, path: nome, directory: 'CACHE', progress: true }); }
        finally { if (sub && sub.remove) sub.remove(); }
        const st = await FS.stat({ path: nome, directory: 'CACHE' });
        if (state.asset.size && st.size !== state.asset.size) throw new Error('Download incompleto. Tente de novo.');
        set({ status: 'ready', percent: 100, file: r.path || st.uri });
        return;
      }
      throw new Error('Neste aparelho a atualização é feita pela página de versões.');
    } catch (e) {
      const det = String((e && e.message) || e || '');
      const amigavel = /incompleto|página de versões|não encontrado/i.test(det) ? det : 'Não foi possível baixar a atualização. Tente de novo ou use "Baixar pela página".' + (det ? ' (' + det.replace(/\/data\/[^\s:]+/g, '…').slice(0, 120) + ')' : '');
      set({ status: 'error', error: amigavel });
    }
  }

  async function install() {
    const m = await mode();
    try {
      if (m === 'instalado' || m === 'portatil') { set({ status: 'installing' }); await desktop.update.install(); return; }
      if (m === 'android') {
        const FO = Capacitor.Plugins.FileOpener;
        if (!FO) { openPage(); return; }
        await FO.openFile({ path: state.file, mimeType: 'application/vnd.android.package-archive' });
        set({ status: 'ready' });
        return;
      }
      location.reload();
    } catch (e) {
      const msg = /permission|unknown|desconhecid/i.test(e.message || '') ? 'Permita "Instalar apps desconhecidos" para o Vorticis Finanças Pessoais nas configurações do Android e tente de novo.' : (e.message || String(e));
      set({ status: 'error', error: msg });
    }
  }
  function openPage() {
    if (isDesktop()) return desktop.update.openPage();
    window.open(PAGE, '_blank', 'noopener');
  }

  /** Verificação automática ao abrir o app (no máximo a cada 6 horas) */
  async function autoCheck() {
    if (Store.getMeta('upd_auto', true) === false) return;
    if (!(await canInstall())) return;
    const last = Store.getMeta('upd_last_check', 0);
    if (Date.now() - last < 6 * 3600 * 1000) return;
    await check({ silent: true });
  }

  // ---------- interface (faixa no topo e cartão em Configurações) ----------
  const notesTxt = (n) => String(n || '').replace(/\r/g, '').split('\n').filter((l) => l.trim() && !/^(Co-Authored-By|Claude-Session):/i.test(l.trim())).slice(0, 12).join('\n');
  function panel({ compact = false } = {}) {
    const s = state; const m = state.mode;
    const installLabel = m === 'android' ? 'Instalar atualização' : m === 'portatil' ? 'Abrir a nova versão' : m === 'instalado' ? 'Reiniciar e atualizar' : 'Recarregar';
    let msg = '', btns = '';
    if (s.status === 'checking') msg = 'Verificando atualizações…';
    else if (s.status === 'available') { msg = `<b>Nova versão ${U.esc(s.latest)} disponível</b> (você usa a ${U.esc(current())}).`; btns = (m === 'web' ? `<button class="btn sm" data-upd="page">Ver novidades</button>` : `<button class="btn sm primary" data-upd="download">${UI.icon('importar')}Baixar e instalar</button>`); }
    else if (s.status === 'downloading') msg = `Baixando a versão ${U.esc(s.latest || '')}… <b>${s.percent || 0}%</b><div class="bar" style="margin-top:6px;max-width:320px"><i style="width:${s.percent || 0}%"></i></div>`;
    else if (s.status === 'ready') { msg = `<b>Versão ${U.esc(s.latest || '')} pronta para instalar.</b>${m === 'android' ? ' O Android vai pedir confirmação. Na primeira vez, permita "Instalar apps desconhecidos" para este app.' : m === 'portatil' ? ' O novo arquivo foi salvo na mesma pasta do atual.' : ' Seus dados são mantidos.'}`; btns = `<button class="btn sm primary" data-upd="install">${UI.icon('check')}${installLabel}</button>`; }
    else if (s.status === 'installing') msg = 'Instalando… o app vai fechar e abrir de novo.';
    else if (s.status === 'uptodate') msg = `Você está na versão mais recente (${U.esc(current())}).`;
    else if (s.status === 'error') { msg = `<span class="neg">${U.esc(s.error)}</span>`; btns = `<button class="btn sm" data-upd="check">Tentar de novo</button><button class="btn sm ghost" data-upd="page">Baixar pela página</button>`; }
    else msg = `Versão instalada: <b>${U.esc(current())}</b>.`;
    if (!compact && !['checking', 'downloading', 'installing'].includes(s.status)) btns += `<button class="btn sm" data-upd="check">${UI.icon('sync')}Verificar atualizações</button>`;
    const notes = !compact && s.notes && ['available', 'ready'].includes(s.status) ? `<details style="margin-top:8px"><summary class="small">Novidades desta versão</summary><pre class="small" style="white-space:pre-wrap;font-family:inherit;margin:6px 0 0">${U.esc(notesTxt(s.notes))}</pre></details>` : '';
    return `<div class="small">${msg}</div>${notes}${btns ? `<div class="row" style="margin-top:8px">${btns}</div>` : ''}`;
  }
  function bindPanel(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-upd]'); if (!b) return;
      const a = b.dataset.upd;
      if (a === 'check') check(); else if (a === 'download') download(); else if (a === 'install') install(); else if (a === 'page') openPage(); else if (a === 'later') { Store.setMeta('upd_snooze', state.latest); emit(); }
    });
  }

  return { state, on, check, download, install, openPage, autoCheck, canInstall, mode, current, cmp, PAGE, panel, bindPanel };
})();
