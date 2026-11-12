/* Utilitários gerais: formatação, parsing de valores e datas, arquivos */
'use strict';

const U = (() => {
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Valores são guardados em centavos (inteiros) para evitar erros de arredondamento. */
  const money = (cents) => BRL.format((cents || 0) / 100);
  const num = (cents) => NUM.format((cents || 0) / 100);
  const toCents = (v) => Math.round(Number(v) * 100);

  function uuid() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.random() * 256));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDate(new Date());
  const nowISO = () => new Date().toISOString();

  /** 'YYYY-MM-DD' -> 'dd/mm/aaaa' */
  function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  /** 'YYYY-MM' -> 'Março/2026' */
  const fmtMonth = (ym) => { const [y, m] = ym.split('-'); return `${MESES[+m - 1]}/${y}`; };
  const fmtMonthShort = (ym) => { const [y, m] = ym.split('-'); return `${MESES_ABR[+m - 1]}/${y.slice(2)}`; };

  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m: 1-12
  /** Soma meses preservando o dia (limitado ao último dia do mês) */
  function addMonths(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const total = (y * 12 + (m - 1)) + n;
    const ny = Math.floor(total / 12), nm = (total % 12) + 1;
    return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
  }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
  const monthOf = (iso) => iso.slice(0, 7);
  function monthStart(ym) { return `${ym}-01`; }
  function monthEnd(ym) { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(daysInMonth(y, m))}`; }
  function addMonthYM(ym, n) { return addMonths(`${ym}-01`, n).slice(0, 7); }
  function monthsBetween(fromYM, toYM) {
    const out = []; let c = fromYM; let guard = 0;
    while (c <= toYM && guard++ < 600) { out.push(c); c = addMonthYM(c, 1); }
    return out;
  }

  /**
   * Converte texto monetário em centavos (com sinal).
   * Aceita: "R$ 1.234,56", "-1.234,56", "1,234.56", "1234.56", "(123,45)", "123,45-", "123,45 D", números.
   * decimal: 'auto' | ',' | '.'
   */
  function parseMoney(input, decimal = 'auto') {
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') return isFinite(input) ? Math.round(input * 100) : null;
    let s = String(input).trim();
    if (!s) return null;
    let neg = false;
    s = s.replace(/ /g, ' ');
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    // Sufixos D/C usados por bancos (Débito/Crédito)
    const suf = s.match(/\s*([DC])\s*$/i);
    if (suf && /\d/.test(s.slice(0, -suf[0].length))) { if (suf[1].toUpperCase() === 'D') neg = true; s = s.slice(0, -suf[0].length); }
    s = s.replace(/R\$|BRL|\s/gi, '');
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
    else if (s.startsWith('+')) s = s.slice(1);
    if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } // "R$ -10" após remoção
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    let dec = decimal;
    if (dec === 'auto') {
      const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
      if (lc >= 0 && ld >= 0) dec = lc > ld ? ',' : '.';
      else if (lc >= 0) dec = ',';
      else if (ld >= 0) dec = /^\d{1,3}(\.\d{3})+$/.test(s) ? ',' : '.'; // "1.234" = milhar
      else dec = '.';
    }
    if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if ((s.match(/\./g) || []).length > 1) return null;
    const v = Number(s);
    if (!isFinite(v)) return null;
    const c = Math.round(v * 100);
    return neg ? -c : c;
  }

  /**
   * Converte data em 'YYYY-MM-DD'.
   * fmt: 'auto' | 'dmy' | 'ymd' | 'mdy'. defaultYear para datas 'dd/mm'.
   */
  function parseDate(input, fmt = 'auto', defaultYear) {
    if (input === null || input === undefined || input === '') return null;
    if (input instanceof Date) {
      if (isNaN(input)) return null;
      // SheetJS cria datas em UTC à meia-noite local; arredonda para evitar fuso
      const d = new Date(input.getTime() + 12 * 3600 * 1000);
      return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    if (typeof input === 'number') {
      // número serial do Excel
      if (input > 20000 && input < 80000) {
        const ms = Math.round((input - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
      input = String(input);
    }
    const s = String(input).trim();
    let m;
    // OFX: 20260131 ou 20260131120000[-3:BRT]
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{6})?(\.\d+)?(\[.*\])?$/))) return valid(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      if (fmt === 'mdy' || (fmt === 'auto' && a <= 12 && b > 12)) return valid(y, a, b);
      return valid(y, b, a);
    }
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/))) {
      const y = defaultYear || new Date().getFullYear();
      return fmt === 'mdy' ? valid(y, +m[1], +m[2]) : valid(y, +m[2], +m[1]);
    }
    // "12 jan 2026", "12/jan/2026", "12 JAN"
    if ((m = s.match(/^(\d{1,2})[\s/.-]*([a-zç]{3})[a-zç]*[\s/.-]*(\d{2,4})?/i))) {
      const mi = MESES_ABR.indexOf(m[2].toLowerCase().replace('ç', 'c'));
      const alt = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
      const mm = mi >= 0 ? mi : alt;
      if (mm >= 0) {
        let y = m[3] ? +m[3] : (defaultYear || new Date().getFullYear());
        if (y < 100) y += 2000;
        return valid(y, mm + 1, +m[1]);
      }
    }
    return null;
    function valid(y, mo, d) {
      if (!(y > 1900 && y < 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo))) return null;
      return `${y}-${pad(mo)}-${pad(d)}`;
    }
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Normaliza texto para comparação (sem acentos, minúsculo, espaços simples) */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  /** Remove números variáveis (datas, códigos) da descrição para aprendizagem de categorias */
  const descKey = (s) => norm(s).replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, '').replace(/\d+/g, '#').replace(/[^a-z# ]/g, ' ').replace(/\s+/g, ' ').trim();

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  const isNative = () => !!(globalThis.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  /** Salva/baixa um arquivo. No Android (Capacitor) grava no cache e abre o menu "Compartilhar/Salvar". */
  async function saveFile(filename, data, mime = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    if (isNative() && Capacitor.Plugins && Capacitor.Plugins.Filesystem) {
      const { Filesystem, Share } = Capacitor.Plugins;
      const base64 = await blobToBase64(blob);
      const r = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      let saved = false;
      try {
        await Filesystem.writeFile({ path: 'FinancasPessoais/' + filename, data: base64, directory: 'DOCUMENTS', recursive: true });
        saved = true;
      } catch (e) { /* sem permissão nesta versão do Android: segue só com o compartilhamento */ }
      try { if (Share) await Share.share({ title: filename, url: r.uri, dialogTitle: 'Salvar ou compartilhar' }); }
      catch (e) { /* usuário fechou o menu de compartilhar */ }
      return saved ? 'Documentos/FinancasPessoais/' + filename : null;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /** Lê arquivo de texto detectando a codificação (UTF-8 ou Windows-1252, comum em bancos brasileiros) */
  async function readText(file) {
    const buf = await file.arrayBuffer();
    return decodeText(buf);
  }
  function decodeText(buf) {
    const bytes = new Uint8Array(buf);
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 400));
    if (/CHARSET:\s*1252|encoding="?(windows-1252|iso-8859-1)/i.test(head)) return new TextDecoder('windows-1252').decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function fileStamp() { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; }

  async function sha256(text) {
    if (globalThis.crypto && crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0x811c9dc5; for (const ch of text) { h1 ^= ch.charCodeAt(0); h1 = Math.imul(h1, 16777619) >>> 0; }
    return 'f' + h1.toString(16);
  }

  /** Divide um valor em N parcelas; a diferença de centavos vai para a primeira parcela */
  function splitInstallments(total, n) {
    const base = Math.floor(total / n);
    const parts = Array(n).fill(base);
    parts[0] += total - base * n;
    return parts;
  }

  return {
    money, num, toCents, uuid, today, nowISO, isoDate, fmtDate, fmtMonth, fmtMonthShort, MESES, MESES_ABR,
    parseISO, addMonths, addDays, monthOf, monthStart, monthEnd, addMonthYM, monthsBetween, daysInMonth,
    parseMoney, parseDate, esc, norm, descKey, debounce, isNative, saveFile, readText, decodeText, fileStamp, sha256,
    splitInstallments, pad,
  };
})();
if (typeof module !== 'undefined') module.exports = U;
