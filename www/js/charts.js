/* Gráficos SVG leves (sem bibliotecas). Cores explícitas para também funcionarem dentro do PDF. */
'use strict';

const Charts = (() => {
  const css = (v, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d; } catch (e) { return d; } };
  const theme = () => ({ text: css('--muted', '#64748b'), grid: css('--line', '#e2e8f0'), pos: css('--pos', '#16a34a'), neg: css('--neg', '#dc2626'), acc: css('--accent', '#4f46e5'), bg: css('--card', '#ffffff') });
  const short = (c) => {
    const v = Math.abs(c / 100);
    const s = v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',') + ' mil' : v.toFixed(0);
    return (c < 0 ? '-' : '') + s;
  };
  function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  /** Barras agrupadas: series = [{name, color, values:[]}], labels = [] */
  function bars(labels, series, { height = 240, t = theme() } = {}) {
    const W = 640, H = height, L = 52, R = 10, T = 14, B = 30;
    const all = series.flatMap((s) => s.values);
    const max = niceMax(Math.max(0, ...all)); const min = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
    const y = (v) => T + (H - T - B) * (max - v) / (max - min || 1);
    const gw = (W - L - R) / labels.length; const bw = Math.min(26, (gw * 0.7) / series.length);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = min + (max - min) * i / 4; const yy = y(v); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${t.grid}" stroke-width="1" stroke-dasharray="${v === 0 ? '0' : '3 4'}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${t.text}">${short(v)}</text>`; }
    labels.forEach((lab, i) => {
      const x0 = L + gw * i + (gw - bw * series.length) / 2;
      series.forEach((s, j) => {
        const v = s.values[i] || 0; const y1 = y(Math.max(0, v)), y2 = y(Math.min(0, v));
        g += `<rect x="${x0 + j * bw}" y="${y1}" width="${bw - 2}" height="${Math.max(0.5, y2 - y1)}" rx="${Math.min(6, (bw - 2) / 2)}" fill="${s.color}"><title>${U.esc(s.name)} ${U.esc(lab)}: ${U.money(v)}</title></rect>`;
      });
      g += `<text x="${L + gw * i + gw / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="${t.text}">${U.esc(lab)}</text>`;
    });
    const legend = series.map((s) => `<span class="lg"><i style="background:${s.color}"></i>${U.esc(s.name)}</span>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,Segoe UI,Roboto,sans-serif">${g}</svg><div class="legend">${legend}</div>`;
  }

  /** Linha: points=[{label, value}] */
  function line(points, { height = 220, color, t = theme() } = {}) {
    const W = 640, H = height, L = 56, R = 12, T = 14, B = 30; color = color || t.acc;
    if (!points.length) return '';
    const vals = points.map((p) => p.value);
    let max = Math.max(...vals), min = Math.min(...vals);
    if (max === min) { max += 10000; min -= 10000; }
    const pad = (max - min) * 0.1; max += pad; min -= pad;
    const x = (i) => L + (W - L - R) * (points.length === 1 ? 0.5 : i / (points.length - 1));
    const y = (v) => T + (H - T - B) * (max - v) / (max - min);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = min + (max - min) * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${t.grid}" stroke-dasharray="3 4"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${t.text}">${short(v)}</text>`; }
    if (min < 0 && max > 0) g += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="${t.text}" stroke-dasharray="3 3"/>`;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const gid = 'lg' + Math.random().toString(36).slice(2, 8);
    g += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    const step = Math.ceil(points.length / 12);
    points.forEach((p, i) => {
      g += `<circle cx="${x(i)}" cy="${y(p.value)}" r="4" fill="${t.bg}" stroke="${color}" stroke-width="2.5"><title>${U.esc(p.label)}: ${U.money(p.value)}</title></circle>`;
      if (i % step === 0) g += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="${t.text}">${U.esc(p.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,Segoe UI,Roboto,sans-serif">${g}</svg>`;
  }

  /** Rosca: items=[{name,color,total}] */
  function donut(items, { size = 200, t = theme(), centerLabel = '' } = {}) {
    const total = items.reduce((s, i) => s + i.total, 0);
    if (!total) return '<p class="empty">Sem dados no período.</p>';
    const top = items.slice(0, 8); const rest = items.slice(8).reduce((s, i) => s + i.total, 0);
    if (rest) top.push({ name: 'Outras', color: '#94a3b8', total: rest });
    const r = 80, cx = 100, cy = 100, sw = 30; let a0 = -Math.PI / 2; let g = '';
    top.forEach((it) => {
      const frac = it.total / total; const a1 = a0 + frac * Math.PI * 2;
      if (frac >= 0.9999) g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${sw}"/>`;
      else {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        g += `<path d="M${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)}" fill="none" stroke="${it.color}" stroke-width="${sw}"><title>${U.esc(it.name)}: ${U.money(it.total)} (${(frac * 100).toFixed(1).replace('.', ',')}%)</title></path>`;
      }
      a0 = a1;
    });
    g += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="12" fill="${t.text}">${U.esc(centerLabel)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${css('--text', '#0f172a')}">${short(total)}</text>`;
    const legend = top.map((it) => `<li><i style="background:${it.color}"></i><span>${U.esc(it.name)}</span><b>${U.money(it.total)}</b><em>${(it.total / total * 100).toFixed(1).replace('.', ',')}%</em></li>`).join('');
    return `<div class="donut"><svg viewBox="0 0 200 200" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,Segoe UI,Roboto,sans-serif">${g}</svg><ul class="dl">${legend}</ul></div>`;
  }

  /** Converte o primeiro <svg> de um HTML em PNG (dataURL) para inserir em PDF */
  function svgToPng(svgHtml, width = 1280) {
    return new Promise((resolve) => {
      try {
        const m = svgHtml.match(/<svg[\s\S]*?<\/svg>/); if (!m) return resolve(null);
        let s = m[0]; if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        const vb = s.match(/viewBox="0 0 (\d+) (\d+)"/); const ratio = vb ? +vb[2] / +vb[1] : 0.4;
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * ratio);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve({ data: c.toDataURL('image/jpeg', 0.9), ratio }); // JPEG: PDF bem menor
        };
        img.onerror = () => resolve(null);
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch (e) { resolve(null); }
    });
  }
  const lightTheme = () => ({ text: '#475569', grid: '#e2e8f0', pos: '#16a34a', neg: '#dc2626', acc: '#4f46e5', bg: '#fff' });

  return { bars, line, donut, svgToPng, theme, lightTheme, short };
})();
