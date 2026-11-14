/* Inicialização, navegação e estado global */
'use strict';

const Views = {};
const App = (() => {
  const { $, $$, icon } = UI;
  const NAV = [
    ['§', 'Visão geral'], ['painel', 'Painel'], ['lancamentos', 'Lançamentos'], ['contas', 'Contas e cartões'],
    ['§', 'Planejamento'], ['orcamentos', 'Orçamentos'], ['metas', 'Metas'], ['dividas', 'Endividamento'],
    ['§', 'Ferramentas'], ['importar', 'Importar extrato'], ['bancos', 'Open Finance'], ['relatorios', 'Relatórios'], ['categorias', 'Categorias e regras'], ['config', 'Configurações'],
  ];
  const state = { month: U.monthOf(U.today()), route: 'painel', param: null };
  let installEvt = null;

  function parseHash() {
    const h = (location.hash || '#/painel').replace(/^#\/?/, '');
    const [route, param] = h.split('/');
    return { route: Views[route] ? route : 'painel', param: param ? decodeURIComponent(param) : null };
  }
  const go = (route, param) => { const h = '#/' + route + (param ? '/' + encodeURIComponent(param) : ''); if (location.hash === h) render(); else location.hash = h; };

  function render() {
    const { route, param } = parseHash();
    const changed = route !== state.route || param !== state.param;
    state.route = route; state.param = param;
    const v = Views[route];
    const view = $('#view');
    const y = window.scrollY;
    try {
      const title = typeof v.title === 'function' ? v.title(param) : v.title;
      $('#title').textContent = title; document.title = title + ' • Vorticis Finanças Pessoais';
      // contêiner novo a cada renderização: os eventos antigos são descartados junto
      const inner = document.createElement('div');
      inner.innerHTML = v.render(param);
      view.replaceChildren(inner);
      v.bind && v.bind(inner, param);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="card"><h3>Ocorreu um erro ao abrir esta tela</h3><p class="neg">${U.esc(e.message)}</p><button class="btn" onclick="location.hash='#/painel'">Voltar ao painel</button></div>`;
    }
    const navKey = route === 'conta' ? 'contas' : route;
    $$('#nav a, #bottom a').forEach((a) => a.classList.toggle('on', a.dataset.r === navKey));
    document.body.classList.remove('menu');
    if (changed) window.scrollTo(0, 0); else window.scrollTo(0, y);
  }
  const rerender = U.debounce(() => { const v = Views[state.route]; if (v && v.live !== false && !UI.hasModal()) render(); else if (v && v.live !== false) pending = true; }, 60);
  let pending = false;

  function buildNav() {
    $('#nav').innerHTML = NAV.map(([r, n]) => (r === '§' ? `<div class="navsec">${n}</div>` : `<a href="#/${r}" data-r="${r}">${icon(r)}<span>${n}</span></a>`)).join('');
    $('#bottom').innerHTML = [['painel', 'Painel'], ['lancamentos', 'Lançamentos']].map(([r, n]) => `<a href="#/${r}" data-r="${r}">${icon(r)}<span>${n}</span></a>`).join('')
      + `<a href="#" class="fab" id="fab" aria-label="Novo lançamento"><span class="f">${icon('plus')}</span></a>`
      + [['contas', 'Contas'], ['relatorios', 'Relatórios']].map(([r, n]) => `<a href="#/${r}" data-r="${r}">${icon(r)}<span>${n}</span></a>`).join('');
    $('#fab').onclick = (e) => { e.preventDefault(); Views.lancamentos.form(); };
    $('#quickadd').onclick = () => Views.lancamentos.form();
    $('#menubtn').onclick = () => document.body.classList.toggle('menu');
    $('#scrim').onclick = () => document.body.classList.remove('menu');
    ['#syncbadge', '#syncbadge2'].forEach((s) => ($(s).onclick = () => go('config')));
  }

  function updateSyncBadge(st) {
    ['#syncbadge', '#syncbadge2'].forEach((s) => {
      const el = $(s); el.className = 'syncbadge ' + (s === '#syncbadge2' ? 'only-mobile ' : '') + st.status;
      const label = st.status === 'off' ? (Sync.configured() ? 'Sincronização desligada' : 'Somente neste aparelho') : st.message;
      el.title = label; const sp = $('span', el); if (sp) sp.textContent = label;
    });
  }

  function applyTheme() {
    const t = Store.getMeta('theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }

  // ----- bloqueio por PIN -----
  async function lockIfNeeded() {
    const hash = Store.getMeta('pin_hash'); if (!hash) return;
    const lock = $('#lock'); lock.hidden = false;
    const inp = $('#lockpin'); inp.value = ''; setTimeout(() => inp.focus(), 50);
    await new Promise((res) => {
      const tryIt = async () => {
        if ((await U.sha256('fp:' + inp.value)) === hash) { lock.hidden = true; $('#lockerr').textContent = ''; res(); }
        else { $('#lockerr').textContent = 'PIN incorreto'; inp.value = ''; inp.focus(); }
      };
      $('#lockbtn').onclick = tryIt;
      inp.onkeydown = (e) => { if (e.key === 'Enter') tryIt(); };
    });
  }
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 5 * 60000 && Store.getMeta('pin_hash')) lockIfNeeded();
  });

  async function boot() {
    Store.UIHook.error = (m) => UI.toast(m, 'error', 6000);
    await Store.init();
    applyTheme();
    await F.seedIfEmpty();
    await Debts.ensureCategory();
    buildNav();
    await lockIfNeeded();
    window.addEventListener('hashchange', render);
    Store.on(() => rerender());
    Sync.onState((st) => { updateSyncBadge(st); if (state.route === 'config' && !UI.hasModal() && Sync.loggedIn()) render(); });
    updateSyncBadge(Sync.state);
    render();
    Sync.start();
    // atualização dentro do app: faixa no topo quando houver versão nova
    const bar = $('#updbar');
    Updater.bindPanel(bar);
    Updater.on((st) => {
      const show = ['available', 'downloading', 'ready', 'installing'].includes(st.status) && !(st.status === 'available' && Store.getMeta('upd_snooze') === st.latest) || (st.status === 'error' && bar.dataset.active === '1');
      bar.hidden = !show; bar.dataset.active = show ? '1' : '';
      if (show) bar.innerHTML = `<div class="updin">${UI.icon('sync')}<div class="updtx">${Updater.panel({ compact: true })}</div>${st.status === 'available' ? '<button class="iconbtn" data-upd="later" title="Lembrar depois" aria-label="Fechar">' + UI.icon('x') + '</button>' : ''}</div>`;
      if (state.route === 'config' && !UI.hasModal()) { const p = document.getElementById('updpanel'); if (p) p.innerHTML = Updater.panel(); }
    });
    setTimeout(() => Updater.autoCheck().catch(() => {}), 5000);
    // Open Finance: traz lançamentos novos dos bancos conectados ao abrir o app (no máximo a cada 6 horas)
    setTimeout(async () => {
      try {
        if (!OpenFinance.cloud() || !Sync.loggedIn() || Store.getMeta('pluggy_autosync', true) === false) return;
        if (Date.now() - Store.getMeta('pluggy_last_sync', 0) < 6 * 3600 * 1000) return;
        const r = await OpenFinance.syncEverything();
        if (r.novos) UI.toast('Open Finance: ' + OpenFinance.resumo(r), 'ok', 7000);
      } catch (e) { console.warn('sincronização Open Finance', e); }
    }, 8000);
    // fecha janelas com Esc
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') UI.closeTop(); });
    // re-renderiza o que ficou pendente quando a janela fechar
    new MutationObserver(() => { if (!UI.hasModal() && pending) { pending = false; render(); } }).observe($('#modals'), { childList: true });
    // PWA (navegador): funciona offline e pode ser instalado
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !U.isNative()) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
    }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
    // Android: botão voltar
    if (U.isNative() && Capacitor.Plugins.App) {
      Capacitor.Plugins.App.addListener('backButton', () => {
        if (UI.closeTop()) return;
        if (document.body.classList.contains('menu')) return document.body.classList.remove('menu');
        if (state.route !== 'painel') return history.length > 1 ? history.back() : go('painel');
        Capacitor.Plugins.App.exitApp();
      });
    }
  }

  return { state, go, render, boot, applyTheme, NAV, get installEvt() { return installEvt; }, set installEvt(v) { installEvt = v; } };
})();

/* Navegador de mês reutilizável: devolve HTML; os botões usam data-mnav="-1|1" */
function monthNav(ym) {
  return `<div class="monthnav"><button class="iconbtn" data-mnav="-1" aria-label="Mês anterior">${UI.icon('left')}</button><b>${U.fmtMonth(ym)}</b><button class="iconbtn" data-mnav="1" aria-label="Próximo mês">${UI.icon('right')}</button></div>`;
}
function bindMonthNav(root, get, set) {
  UI.$$('[data-mnav]', root).forEach((b) => (b.onclick = () => { set(U.addMonthYM(get(), +b.dataset.mnav)); App.render(); }));
}

document.addEventListener('DOMContentLoaded', () => App.boot().catch((e) => { console.error(e); document.body.innerHTML = '<p style="padding:20px">Erro ao iniciar: ' + U.esc(e.message) + '</p>'; }));
