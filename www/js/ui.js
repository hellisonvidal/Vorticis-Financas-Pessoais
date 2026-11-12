/* Componentes de interface: avisos, janelas, confirmações, ícones e campos */
'use strict';

const UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const ICONS = {
    painel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    lancamentos: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    contas: '<path d="M3 10h18M5 6l7-3 7 3M4 10v8M20 10v8M8 14v4M12 14v4M16 14v4M2 21h20"/>',
    categorias: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    orcamentos: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    metas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    importar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    relatorios: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', check: '<path d="M20 6 9 17l-5-5"/>',
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/>', card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    transfer: '<path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  function toast(msg, type = '', ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + type; el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  const stack = [];
  /**
   * Abre uma janela. actions: [{label, cls, onClick(body) -> false para manter aberta, left}]
   * Retorna { el, body, close }
   */
  function modal({ title, body = '', actions = [], wide = false, onOpen, onClose }) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}"><header><h2>${U.esc(title)}</h2><button class="iconbtn" data-x aria-label="Fechar">${icon('x')}</button></header><div class="body">${body}</div>${actions.length ? '<footer></footer>' : ''}</div>`;
    const b = $('.body', bg);
    let closed = false;
    const close = () => { if (closed) return; closed = true; bg.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); onClose && onClose(); };
    const api = { el: bg, body: b, close };
    const foot = $('footer', bg);
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.cls || '') + (a.left ? ' left' : ''); btn.innerHTML = a.label;
      btn.onclick = async () => {
        if (!a.onClick) return close();
        btn.disabled = true;
        try { const r = await a.onClick(b, api); if (r !== false) close(); }
        catch (e) { console.error(e); toast(e.message || String(e), 'error', 5000); }
        finally { btn.disabled = false; }
      };
      foot.appendChild(btn);
    });
    $('[data-x]', bg).onclick = close;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.dataset.down = '1'; });
    bg.addEventListener('mouseup', (e) => { if (e.target === bg && bg.dataset.down) close(); delete bg.dataset.down; });
    $('#modals').appendChild(bg);
    stack.push(api);
    onOpen && onOpen(b, api);
    const f = $('input:not([type=checkbox]):not([type=hidden]),select,textarea', b);
    if (f && !('ontouchstart' in window)) setTimeout(() => f.focus(), 30);
    return api;
  }
  const closeTop = () => { const m = stack[stack.length - 1]; if (m) { m.close(); return true; } return false; };
  const hasModal = () => stack.length > 0;

  function confirm(msg, { ok = 'Confirmar', danger = false, title = 'Confirmação' } = {}) {
    return new Promise((res) => {
      let done = false;
      modal({
        title, body: `<p>${msg}</p>`, onClose: () => { if (!done) res(false); },
        actions: [{ label: 'Cancelar' }, { label: ok, cls: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } }],
      });
    });
  }
  /** Pergunta com opções: choices=[{v, label, cls}] -> resolve v ou null */
  function choose(msg, choices, title = 'Escolha') {
    return new Promise((res) => {
      let done = false;
      modal({ title, body: `<p>${msg}</p>`, onClose: () => { if (!done) res(null); }, actions: [{ label: 'Cancelar' }, ...choices.map((c) => ({ label: c.label, cls: c.cls, onClick: () => { done = true; res(c.v); } }))] });
    });
  }
  function promptMoney(title, label, initial = '') {
    return new Promise((res) => {
      let done = false;
      modal({
        title, body: `<label class="field"><span>${U.esc(label)}</span><input class="input big" id="pm" inputmode="decimal" value="${U.esc(initial)}" placeholder="0,00"></label><p class="err" id="pme"></p>`,
        onClose: () => { if (!done) res(null); },
        onOpen: (b) => { $('#pm', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') $$('footer .primary', b.parentElement)[0].click(); }); },
        actions: [{ label: 'Cancelar' }, { label: 'OK', cls: 'primary', onClick: (b) => { const v = U.parseMoney($('#pm', b).value); if (v === null) { $('#pme', b).textContent = 'Valor inválido'; return false; } done = true; res(v); } }],
      });
    });
  }

  const opt = (v, label, sel) => `<option value="${U.esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${U.esc(label)}</option>`;
  const accountOptions = (sel, { all = false, archived = false, exclude = null, allLabel = 'Todas as contas' } = {}) =>
    (all ? opt('', allLabel, sel) : '') + F.accounts(archived).filter((a) => a.id !== exclude).map((a) => opt(a.id, a.name + (a.archived ? ' (arquivada)' : ''), sel)).join('');
  const categoryOptions = (type, sel, { none = true, all = false } = {}) =>
    (all ? opt('', 'Todas as categorias', sel) : '') + (none ? opt('', 'Sem categoria', sel) : '') + F.categories(type).map((c) => opt(c.id, c.name, sel)).join('');
  const COLORS = ['#0f766e', '#16a34a', '#65a30d', '#ca8a04', '#f97316', '#dc2626', '#ec4899', '#a855f7', '#7c3aed', '#4f46e5', '#2563eb', '#0284c7', '#0891b2', '#64748b', '#78716c', '#0f172a'];
  const colorPicker = (sel) => `<div class="colorpick" data-colorpick>${COLORS.map((c) => `<button type="button" style="background:${c}" data-c="${c}" class="${c === sel ? 'on' : ''}" aria-label="cor ${c}"></button>`).join('')}<input type="hidden" name="color" value="${U.esc(sel || COLORS[0])}"></div>`;
  function bindColorPicker(root) {
    $$('[data-colorpick]', root).forEach((cp) => cp.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c]'); if (!b) return;
      $$('button', cp).forEach((x) => x.classList.toggle('on', x === b)); $('input', cp).value = b.dataset.c;
    }));
  }
  const moneyClass = (v) => (v < 0 ? 'neg' : v > 0 ? 'pos' : '');
  const initials = (s) => U.esc((String(s || '?').trim().match(/[A-Za-zÀ-ú0-9]/g) || ['?']).slice(0, 2).join('').toUpperCase());

  return { $, $$, icon, toast, modal, closeTop, hasModal, confirm, choose, promptMoney, opt, accountOptions, categoryOptions, colorPicker, bindColorPicker, moneyClass, initials, COLORS };
})();
