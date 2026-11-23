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
      // Data pura em meia-noite UTC (ex.: new Date('2024-03-15')) mantém o dia UTC sem deslocar pelo fuso
      if (input.getUTCHours() === 0 && input.getUTCMinutes() === 0 && input.getUTCSeconds() === 0 && input.getUTCMilliseconds() === 0) {
        return valid(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
      }
      // SheetJS à meia-noite local pode ter desvio de segundos do fuso histórico de 1899 (ex.: 23:53:32)
      const d = input.getHours() === 23 && input.getMinutes() >= 50 && input.getSeconds() > 0 ? new Date(input.getTime() + 15 * 60 * 1000) : input;
      return valid(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (typeof input === 'number') {
      // número serial do Excel (usa a parte inteira do dia para que horários como 22h não virem o dia seguinte)
      if (input > 20000 && input < 80000) {
        const ms = Math.round((Math.floor(input) - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
      input = String(input);
    }
    const s = String(input).trim();
    let m;
    // OFX: 20260131, 20260131120000[-3:BRT], 20260131220000 [-03:EST], 202601311200, 20260131120000.000[-3:BRT] etc.
    // Extrai diretamente ano, mês e dia (YYYYMMDD) sem passar por new Date(), preservando a data original do lançamento sem conversão para UTC.
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?:[T\s]?\d{2}(?::?\d{2}(?::?\d{2})?)?(?:[.,]\d{1,9})?)?(?:\s*(?:\[[^\]]*\]|Z|[+-]\d{1,2}(?::?\d{2})?(?:\s*[A-Z]{2,5})?|[A-Z]{2,5}))?$/i))) {
      const d = valid(+m[1], +m[2], +m[3]);
      if (d) return d;
    }
    if ((m = s.match(/^(\d{2})(\d{2})(\d{4})(?:[T\s]?\d{2}(?::?\d{2}(?::?\d{2})?)?(?:[.,]\d{1,9})?)?(?:\s*(?:\[[^\]]*\]|Z|[+-]\d{1,2}(?::?\d{2})?))?$/i))) {
      const d = valid(+m[3], +m[2], +m[1]);
      if (d) return d;
    }
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
        await Filesystem.writeFile({ path: 'VorticisFinancasPessoais/' + filename, data: base64, directory: 'DOCUMENTS', recursive: true });
        saved = true;
      } catch (e) { /* sem permissão nesta versão do Android: segue só com o compartilhamento */ }
      try { if (Share) await Share.share({ title: filename, url: r.uri, dialogTitle: 'Salvar ou compartilhar' }); }
      catch (e) { /* usuário fechou o menu de compartilhar */ }
      return saved ? 'Documentos/VorticisFinancasPessoais/' + filename : null;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /** Lê os bytes de um File/Blob com fallback para FileReader (necessário em alguns provedores content:// do Android) */
  function readBuffer(file) {
    const viaReader = () => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('Não foi possível ler o arquivo.'));
      r.readAsArrayBuffer(file);
    });
    if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer().catch(viaReader);
    return viaReader();
  }

  /** Lê arquivo de texto detectando a codificação (UTF-8, Windows-1252/ISO-8859-1 ou UTF-16, comuns em bancos brasileiros) */
  async function readText(file) {
    const buf = await readBuffer(file);
    return decodeText(buf);
  }
  function decodeText(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes).replace(/^\uFEFF/, '').replace(/\0/g, '');
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes).replace(/^\uFEFF/, '').replace(/\0/g, '');
    try {
      const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').replace(/\0/g, '');
      if (!/[\u0080-\u009f]/.test(utf8)) return utf8;
    } catch (e) { /* bytes inválidos em UTF-8: segue para Windows-1252 */ }
    try { return new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, '').replace(/\0/g, ''); }
    catch (e) { return new TextDecoder('iso-8859-1').decode(bytes).replace(/^\uFEFF/, '').replace(/\0/g, ''); }
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
    parseMoney, parseDate, esc, norm, descKey, debounce, isNative, saveFile, readBuffer, readText, decodeText, fileStamp, sha256,
    splitInstallments, pad,
  };
})();
if (typeof module !== 'undefined') module.exports = U;
