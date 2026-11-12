/* Leitura de extratos bancários: OFX/QFX, CSV/TXT, Excel (XLS/XLSX/ODS), PDF e texto colado.
 * Todos os leitores produzem linhas no formato { date:'YYYY-MM-DD', description, amount (centavos, com sinal), fitid? } */
'use strict';

const Importers = (() => {
  // ---------------- OFX ----------------
  function parseOFX(text) {
    const body = text.replace(/\r/g, '');
    const tag = (blk, name) => {
      const m = blk.match(new RegExp('<' + name + '>\\s*([^<\\n]*)', 'i'));
      return m ? decodeEntities(m[1].trim()) : '';
    };
    const rows = [];
    const re = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi;
    let m;
    while ((m = re.exec(body))) {
      const b = m[1];
      const ra = tag(b, 'TRNAMT');
      const amount = U.parseMoney(ra, ra.includes(',') ? (ra.includes('.') ? 'auto' : ',') : '.');
      const date = U.parseDate(tag(b, 'DTPOSTED')) || U.parseDate(tag(b, 'DTUSER'));
      if (amount === null || !date) continue;
      const memo = tag(b, 'MEMO'), name = tag(b, 'NAME');
      let description = [name, memo].filter(Boolean).join(' - ');
      if (name && memo && (U.norm(memo).includes(U.norm(name)) || U.norm(name).includes(U.norm(memo)))) description = memo.length >= name.length ? memo : name;
      rows.push({ date, amount, description: description || tag(b, 'TRNTYPE') || 'Lançamento', fitid: tag(b, 'FITID') || null, checknum: tag(b, 'CHECKNUM') || null });
    }
    const info = {
      bankId: tag(body, 'BANKID') || tag(body, 'ORG'), acctId: tag(body, 'ACCTID'), currency: tag(body, 'CURDEF'),
      start: U.parseDate(tag(body, 'DTSTART')), end: U.parseDate(tag(body, 'DTEND')), isCard: /<CCSTMTRS>/i.test(body),
    };
    const lb = body.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i);
    if (lb) { info.balance = U.parseMoney(tag(lb[1], 'BALAMT'), '.'); info.balanceDate = U.parseDate(tag(lb[1], 'DTASOF')); }
    if (!rows.length && !/<OFX>/i.test(body)) throw new Error('Arquivo não parece ser um OFX válido.');
    return { rows, info };
  }
  function decodeEntities(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)); }

  // ---------------- CSV ----------------
  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
    let best = ';', bestScore = -1;
    for (const d of [';', ',', '\t', '|']) {
      const counts = lines.map((l) => splitCSVLine(l, d).length);
      const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
      const score = mode > 1 ? counts.filter((c) => c === mode).length * mode : 0;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
  function splitCSVLine(line, d) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
      else if (ch === d) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parseCSV(text, delimiter) {
    const d = delimiter || detectDelimiter(text);
    // junta linhas com aspas quebradas
    const rows = []; let buf = '';
    for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
      buf = buf ? buf + '\n' + line : line;
      if ((buf.match(/"/g) || []).length % 2 === 0) { if (buf.trim()) rows.push(splitCSVLine(buf, d)); buf = ''; }
    }
    if (buf.trim()) rows.push(splitCSVLine(buf, d));
    return { grid: rows, delimiter: d };
  }

  // ---------------- Excel ----------------
  async function parseSheet(file) {
    if (!globalThis.XLSX) throw new Error('Biblioteca de planilhas não carregada.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.map((name) => ({ name, grid: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }) }));
    return sheets;
  }

  /** Sugere o mapeamento de colunas olhando cabeçalhos e conteúdo */
  function guessMapping(grid) {
    const norm = (v) => U.norm(v instanceof Date ? '' : v);
    let headerRow = -1;
    for (let i = 0; i < Math.min(grid.length, 30); i++) {
      const r = grid[i].map(norm);
      if (r.some((c) => /^data|^date|lancamento$|^dt/.test(c)) && r.some((c) => /valor|amount|debito|credito|historico|descri|lancamento|movimenta/.test(c))) { headerRow = i; break; }
    }
    const m = { headerRow, date: -1, description: -1, amount: -1, debit: -1, credit: -1, dateFmt: 'auto', decimal: 'auto', invert: false };
    const first = headerRow >= 0 ? headerRow + 1 : 0;
    if (headerRow >= 0) {
      grid[headerRow].map(norm).forEach((c, i) => {
        if (m.date < 0 && /^data|^date|^dt/.test(c)) m.date = i;
        else if (m.description < 0 && /descri|historico|lancamento|memo|estabelecimento|title|titulo|detalhe|identificador/.test(c) && !/data/.test(c)) m.description = i;
        else if (m.debit < 0 && /debito|saida|debit/.test(c)) m.debit = i;
        else if (m.credit < 0 && /credito|entrada|credit/.test(c)) m.credit = i;
        else if (m.amount < 0 && /valor|amount|quantia|montante/.test(c) && !/saldo/.test(c)) m.amount = i;
      });
      if (m.amount >= 0) { m.debit = -1; m.credit = -1; }
    }
    // pelo conteúdo, se faltou algo
    const sample = grid.slice(first, first + 15);
    const cols = Math.max(0, ...grid.slice(0, 50).map((r) => r.length));
    if (m.date < 0) for (let c = 0; c < cols; c++) { if (sample.filter((r) => U.parseDate(r[c])).length >= sample.length * 0.6) { m.date = c; break; } }
    if (m.amount < 0 && (m.debit < 0 || m.credit < 0)) {
      m.debit = -1; m.credit = -1;
      for (let c = cols - 1; c >= 0; c--) {
        if (c === m.date) continue;
        if (sample.filter((r) => r[c] !== '' && U.parseMoney(r[c]) !== null).length >= sample.length * 0.6) { m.amount = c; if (headerRow < 0 || !/saldo/.test(norm(grid[headerRow][c]))) break; }
      }
    }
    if (m.description < 0) {
      let best = -1, len = 0;
      for (let c = 0; c < cols; c++) {
        if (c === m.date || c === m.amount) continue;
        const l = sample.reduce((s, r) => s + (typeof r[c] === 'string' && U.parseMoney(r[c]) === null ? r[c].length : 0), 0);
        if (l > len) { len = l; best = c; }
      }
      m.description = best;
    }
    return m;
  }

  /** Converte a grade (linhas x colunas) em lançamentos com base no mapeamento escolhido */
  function gridToRows(grid, m, { skipBalance = true } = {}) {
    const out = []; const errors = [];
    const start = m.headerRow >= 0 ? m.headerRow + 1 : 0;
    for (let i = start; i < grid.length; i++) {
      const r = grid[i] || [];
      const date = U.parseDate(r[m.date], m.dateFmt);
      const description = String(m.description >= 0 ? (r[m.description] ?? '') : '').trim();
      let amount = null;
      if (m.amount >= 0) amount = U.parseMoney(r[m.amount], m.decimal);
      else {
        const d = m.debit >= 0 ? U.parseMoney(r[m.debit], m.decimal) : null;
        const c = m.credit >= 0 ? U.parseMoney(r[m.credit], m.decimal) : null;
        if (d || c) amount = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0);
      }
      if (!date && amount === null) continue; // linha vazia/cabeçalho
      if (!date || amount === null || amount === 0) { if (r.some((x) => String(x).trim())) errors.push(i + 1); continue; }
      if (skipBalance && /^saldo|saldo anterior|saldo do dia|saldo final|s a l d o/i.test(U.norm(description))) continue;
      out.push({ date, description: description || 'Lançamento', amount: m.invert ? -amount : amount });
    }
    return { rows: out, errors };
  }

  // ---------------- PDF ----------------
  let pdfReady = null;
  function loadPdfJs() {
    if (globalThis.pdfjsLib) return Promise.resolve();
    if (pdfReady) return pdfReady;
    pdfReady = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
      s.onload = () => { try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; } catch (e) { /* ok */ } res(); };
      s.onerror = () => { pdfReady = null; rej(new Error('Não foi possível carregar o leitor de PDF.')); };
      document.head.appendChild(s);
    });
    return pdfReady;
  }
  /** Extrai as linhas de texto de um PDF, agrupando por posição vertical */
  async function pdfLines(file, password) {
    await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data, password: password || undefined, isEvalSupported: false }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      items.forEach((it) => {
        const row = rows.find((r) => Math.abs(r.y - it.y) < 3);
        if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
      });
      rows.sort((a, b) => b.y - a.y).forEach((r) => {
        r.items.sort((a, b) => a.x - b.x);
        let txt = ''; let lastEnd = null;
        r.items.forEach((it) => { if (lastEnd !== null) txt += it.x - lastEnd > 12 ? '   ' : (it.x - lastEnd > 1 ? ' ' : ''); txt += it.s; lastEnd = it.x + it.w; });
        lines.push(txt.replace(/\s+$/, ''));
      });
    }
    return lines;
  }

  const MONEY_RE = /(?:^|[\s(])(-?\s?(?:R\$\s?)?-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?(?:\s?[-DC](?![a-z]))?)(?=\s|$)/gi;
  const DATE_RE = /^\s*(\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?|\d{2}\s?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s?\d{2,4})?)\b/i;

  /**
   * Interpreta linhas de texto de extrato (de PDF ou coladas).
   * Heurística: linha começando por data + pelo menos um valor monetário. Se houver 2+ valores,
   * o primeiro é o lançamento e o último costuma ser o saldo.
   */
  function textToRows(lines, { year, skipBalance = true } = {}) {
    const out = []; let lastDate = null;
    const yr = year || new Date().getFullYear();
    let inferredYear = null;
    for (const l of lines) { const m = l.match(/\b\d{2}\/\d{2}\/(\d{4})\b/); if (m) { inferredYear = +m[1]; break; } }
    for (let raw of lines) {
      const line = raw.replace(/ /g, ' ');
      const dm = line.match(DATE_RE);
      let rest = line;
      let date = null;
      if (dm) { date = U.parseDate(dm[1].replace(/\s+/g, ' '), 'dmy', inferredYear || yr); rest = line.slice(dm[0].length); }
      const moneys = [...rest.matchAll(MONEY_RE)].map((x) => ({ txt: x[1], idx: x.index }));
      if (!moneys.length) continue;
      if (!date) { if (!lastDate) continue; date = lastDate; } else lastDate = date;
      const first = moneys[0];
      let desc = rest.slice(0, first.idx).replace(/\s{2,}/g, ' ').trim();
      if (!desc) desc = rest.replace(MONEY_RE, ' ').replace(/\s{2,}/g, ' ').trim();
      desc = desc.replace(/^[-–|]+\s*/, '');
      if (skipBalance && /^saldo|saldo anterior|saldo do dia|saldo final|saldo em|total/i.test(U.norm(desc))) continue;
      let amount = U.parseMoney(first.txt.replace(/\s/g, ''), ',');
      if (amount === null || amount === 0) continue;
      // marcadores de débito no texto da linha
      if (amount > 0 && /\b(debito|pagamento efetuado|compra|saque|pix enviado|transf(erencia)? enviada|tarifa|ted enviada|doc enviado)\b/i.test(U.norm(desc)) && !/estorno/i.test(desc)) amount = -amount;
      out.push({ date, description: desc || 'Lançamento', amount });
    }
    return out;
  }

  // ---------------- detecção de duplicidade ----------------
  /** Marca linhas já existentes na conta: 'dup' (certeza) ou 'maybe' (mesma data e valor) */
  function markDuplicates(rows, accountId) {
    const existing = F.txs().filter((t) => t.account_id === accountId || t.to_account_id === accountId);
    const fit = new Set(existing.filter((t) => t.fitid).map((t) => t.fitid));
    const strong = new Map(); const weak = new Map();
    existing.forEach((t) => {
      const v = F.effect(t, accountId);
      const ks = t.date + '|' + v + '|' + U.descKey(t.description);
      strong.set(ks, (strong.get(ks) || 0) + 1);
      const kw = t.date + '|' + v; weak.set(kw, (weak.get(kw) || 0) + 1);
    });
    const seenFit = new Set();
    rows.forEach((r) => {
      r.dup = null;
      if (r.fitid) {
        if (fit.has(r.fitid) || seenFit.has(r.fitid)) { r.dup = 'dup'; return; }
        seenFit.add(r.fitid);
      }
      const ks = r.date + '|' + r.amount + '|' + U.descKey(r.description);
      if (strong.get(ks) > 0) { strong.set(ks, strong.get(ks) - 1); r.dup = 'dup'; const kw = r.date + '|' + r.amount; weak.set(kw, (weak.get(kw) || 1) - 1); return; }
      const kw = r.date + '|' + r.amount;
      if (weak.get(kw) > 0) { weak.set(kw, weak.get(kw) - 1); r.dup = 'maybe'; }
    });
    return rows;
  }

  async function readAny(file) {
    const name = file.name.toLowerCase();
    if (/\.(ofx|qfx)$/.test(name)) return { kind: 'ofx', ...parseOFX(await U.readText(file)) };
    if (/\.(xlsx|xls|xlsm|ods)$/.test(name)) return { kind: 'sheet', sheets: await parseSheet(file) };
    if (/\.pdf$/.test(name)) return { kind: 'pdf', lines: await pdfLines(file) };
    const text = await U.readText(file);
    if (/<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) return { kind: 'ofx', ...parseOFX(text) };
    if (/\.json$/.test(name)) return { kind: 'json', data: JSON.parse(text) };
    const csv = parseCSV(text);
    return { kind: 'sheet', sheets: [{ name: file.name, grid: csv.grid }], delimiter: csv.delimiter };
  }

  return { parseOFX, parseCSV, parseSheet, guessMapping, gridToRows, pdfLines, textToRows, markDuplicates, readAny, loadPdfJs };
})();
