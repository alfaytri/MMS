// Build inventory-cost-accounting.md -> a professional PDF (+ standalone HTML)
// via puppeteer-core + system Chrome. Full Markdown subset: headings, paragraphs,
// **bold**/`code`, tables, ```fences```, > quotes, - bullets, 1. lists, --- rules.
// Run from repo root:  node docs/build-cost-doc.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(DIR, 'inventory-cost-accounting.md')
const OUT_PDF = path.join(DIR, 'inventory-cost-accounting.pdf')
const OUT_HTML = path.join(DIR, 'inventory-cost-accounting.html')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')

const isSep = (s) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.includes('-')
const cells = (s) => { s = s.trim(); if (s.startsWith('|')) s = s.slice(1); s = s.replace(/\|\s*$/, ''); return s.split('|').map(c => c.trim()) }

function mdToHtml(md) {
  const L = md.split(/\r?\n/); const out = []; let i = 0; let firstH1 = false
  const dateStr = new Date().toISOString().slice(0, 10)
  while (i < L.length) {
    let line = L[i]
    if (/^\s*$/.test(line)) { i++; continue }
    if (line.trimStart().startsWith('```')) {
      i++; const buf = []
      while (i < L.length && !L[i].trimStart().startsWith('```')) { buf.push(L[i]); i++ }
      i++
      out.push(`<pre><code>${buf.map(esc).join('\n')}</code></pre>`); continue
    }
    if (line.trim().startsWith('|') && i + 1 < L.length && isSep(L[i + 1])) {
      const head = cells(line); i += 2; const rows = []
      while (i < L.length && L[i].trim().startsWith('|')) { rows.push(cells(L[i])); i++ }
      const th = head.map(h => `<th>${inline(h)}</th>`).join('')
      const trs = rows.map(r => `<tr>${head.map((_, j) => `<td>${inline(r[j] ?? '')}</td>`).join('')}</tr>`).join('')
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`); continue
    }
    const mh = line.match(/^(#{1,6})\s+(.*)$/)
    if (mh) {
      const n = mh[1].length
      if (n === 1 && !firstH1) {
        firstH1 = true
        out.push(`<div class="title"><h1>${inline(mh[2])}</h1><div class="subtitle">Alfaytri — Technical Reference &nbsp;·&nbsp; Generated ${dateStr}</div></div>`)
      } else {
        out.push(`<h${Math.min(n, 4)}>${inline(mh[2])}</h${Math.min(n, 4)}>`)
      }
      i++; continue
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr/>'); i++; continue }
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < L.length && /^>\s?/.test(L[i])) { buf.push(L[i].replace(/^>\s?/, '')); i++ }
      out.push(`<blockquote>${inline(buf.filter(x => x.trim()).join(' '))}</blockquote>`); continue
    }
    const isCont = (s) => s.trim() && !/^(#{1,6}\s|>\s?|\s*[-*]\s|\s*\d+\.\s|---+\s*$|\s*\|)/.test(s) && !s.trimStart().startsWith('```')
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (i < L.length) {
        if (/^\s*\d+\.\s+/.test(L[i])) { items.push(L[i].replace(/^\s*\d+\.\s+/, '')); i++ }
        else if (items.length && isCont(L[i])) { items[items.length - 1] += ' ' + L[i].trim(); i++ }
        else break
      }
      out.push('<ol>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ol>'); continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < L.length) {
        if (/^\s*[-*]\s+/.test(L[i])) { items.push(L[i].replace(/^\s*[-*]\s+/, '')); i++ }
        else if (items.length && isCont(L[i])) { items[items.length - 1] += ' ' + L[i].trim(); i++ }
        else break
      }
      out.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>'); continue
    }
    const buf = [line]; i++
    while (i < L.length && !/^\s*$/.test(L[i]) && !/^(#{1,6}\s|>\s?|\s*[-*]\s|\s*\d+\.\s|---+\s*$|\s*\|)/.test(L[i]) && !L[i].trimStart().startsWith('```')) { buf.push(L[i]); i++ }
    out.push(`<p>${inline(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}

const css = `
  :root{--ink:#0F172A;--muted:#64748B;--accent:#F97316;--line:#E2E8F0;--tip:#FFF7ED;--code:#F1F5F9;}
  *{box-sizing:border-box;}
  body{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.5;font-size:10.5pt;margin:0;}
  .title{margin:0 0 1.2em;border-bottom:3px solid var(--accent);padding-bottom:.5em;}
  .title h1{font-size:26pt;color:var(--accent);margin:0;line-height:1.1;}
  .subtitle{color:var(--muted);font-size:10pt;margin-top:.3em;}
  h1{font-size:19pt;color:var(--accent);margin:1.2em 0 .3em;}
  h2{font-size:14pt;margin:1.3em 0 .4em;padding-bottom:.18em;border-bottom:2px solid var(--line);}
  h3{font-size:12pt;margin:1em 0 .3em;color:var(--ink);}
  h4{font-size:10.8pt;margin:.9em 0 .25em;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
  p{margin:.45em 0;}
  ul,ol{margin:.4em 0;padding-left:1.4em;}
  li{margin:.22em 0;}
  code{background:var(--code);padding:.05em .35em;border-radius:4px;font-family:"Cascadia Code",Consolas,monospace;font-size:.86em;color:#0B5294;}
  strong{color:var(--ink);}
  pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:.8em 1em;overflow-x:auto;break-inside:avoid;page-break-inside:avoid;margin:.7em 0;}
  pre code{background:none;padding:0;color:#0F172A;font-size:9pt;line-height:1.45;}
  hr{border:none;border-top:1px solid var(--line);margin:1.3em 0;}
  blockquote{margin:.8em 0;padding:.7em 1em;background:var(--tip);border-radius:8px;border:1px solid #FED7AA;color:#7C2D12;}
  blockquote strong{color:#7C2D12;}
  table{border-collapse:collapse;width:100%;margin:.7em 0;font-size:9.2pt;break-inside:avoid;page-break-inside:avoid;}
  th{background:var(--accent);color:#fff;font-weight:600;text-align:left;padding:6px 8px;border:1px solid #EA6A0C;}
  td{padding:5px 8px;border:1px solid var(--line);vertical-align:top;}
  tbody tr:nth-child(even){background:#F8FAFC;}
  h1,h2,h3{break-after:avoid;page-break-after:avoid;}
`

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inventory Cost Accounting</title><style>${css}</style></head><body>${mdToHtml(fs.readFileSync(SRC, 'utf8'))}</body></html>`
fs.writeFileSync(OUT_HTML, html, 'utf8')

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] })
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(OUT_HTML).href, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.pdf({
    path: OUT_PDF, format: 'A4', printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#94A3B8;padding:0 14mm;display:flex;justify-content:space-between;"><span>Alfaytri — Inventory Cost Accounting</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  })
  console.log('PDF written:', OUT_PDF, '(' + Math.round(fs.statSync(OUT_PDF).size / 1024) + ' KB)')
} finally { await browser.close() }
