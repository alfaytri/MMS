// Builds the Alfaytri Staff User Guide PDF (and a standalone HTML) from the
// ordered Markdown sections in this folder, embedding the screenshots in
// assets/. Uses puppeteer-core + system Chrome (same stack as the app's PDF
// export). Run from repo root:  node docs/usage-manual/build.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DIR = path.dirname(fileURLToPath(import.meta.url))

// Section order (full guide).
const SECTIONS = ['00-cover', '01-getting-started', '02-master-data', '03-purchase', '04-sales', '05-operations', '06-reports', '07-common-tasks']

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')

// Minimal Markdown -> HTML for the subset used in these files:
// # / ## / ### headings, paragraphs, ![alt](src) figures, > blockquotes,
// - bullet lists, --- rules, **bold**, `code`.
function mdToHtml(md) {
  const lines = md.split(/\r?\n/)
  const out = []
  let i = 0
  const flushList = (items) => {
    if (items.length) out.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>')
  }
  while (i < lines.length) {
    let line = lines[i]
    if (/^\s*$/.test(line)) { i++; continue }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (img) {
      out.push(`<figure><img src="${img[2]}" alt="${esc(img[1])}"/>${img[1] ? `<figcaption>${inline(img[1])}</figcaption>` : ''}</figure>`)
      i++; continue
    }
    if (/^---\s*$/.test(line)) { out.push('<hr/>'); i++; continue }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue }
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`)
      continue
    }
    if (/^\s*-\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*-\s+/, '')); i++ }
      flushList(items)
      continue
    }
    // paragraph (gather until blank line)
    const buf = [line]; i++
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|!\[|>\s?|\s*-\s|---\s*$)/.test(lines[i])) { buf.push(lines[i]); i++ }
    out.push(`<p>${inline(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}

const body = SECTIONS.map((s, idx) => {
  const md = fs.readFileSync(path.join(DIR, s + '.md'), 'utf8')
  return `<section class="${idx === 0 ? 'cover' : 'chapter'}">${mdToHtml(md)}</section>`
}).join('\n')

const css = `
  :root { --ink:#0F172A; --muted:#64748B; --accent:#F97316; --line:#E2E8F0; --tip:#FFF7ED; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); line-height: 1.55; font-size: 11pt; margin: 0; }
  section.chapter { page-break-before: always; }
  h1 { font-size: 24pt; color: var(--accent); margin: 0 0 .4em; line-height: 1.15; }
  h2 { font-size: 15pt; margin: 1.4em 0 .4em; padding-bottom: .2em; border-bottom: 2px solid var(--line); }
  h3 { font-size: 12.5pt; margin: 1.1em 0 .3em; color: var(--ink); }
  p { margin: .5em 0; }
  ul { margin: .5em 0; padding-left: 1.3em; }
  li { margin: .25em 0; }
  code { background: #F1F5F9; padding: .05em .35em; border-radius: 4px; font-family: "Cascadia Code", Consolas, monospace; font-size: .9em; }
  strong { color: var(--ink); }
  hr { border: none; border-top: 1px solid var(--line); margin: 1.2em 0; }
  blockquote { margin: .8em 0; padding: .7em 1em; background: var(--tip); border-radius: 8px; border: 1px solid #FED7AA; color: #7C2D12; }
  blockquote strong { color: #7C2D12; }
  figure { margin: 1em 0; break-inside: avoid; page-break-inside: avoid; }
  img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  figcaption { font-size: 9.5pt; color: var(--muted); font-style: italic; margin-top: .4em; text-align: center; }
  section.cover h1 { font-size: 30pt; margin-top: 1.2em; }
  a { color: var(--accent); text-decoration: none; }
`

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Alfaytri — Staff User Guide</title><style>${css}</style></head><body>${body}</body></html>`
const htmlPath = path.join(DIR, 'Alfaytri-User-Guide.html')
fs.writeFileSync(htmlPath, html, 'utf8')

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] })
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: 60000 })
  const pdfPath = path.join(DIR, 'Alfaytri-User-Guide.pdf')
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#94A3B8;padding:0 15mm;display:flex;justify-content:space-between;"><span>Alfaytri — Staff User Guide</span><span class="pageNumber"></span></div>',
  })
  console.log('PDF written:', pdfPath, '(' + Math.round(fs.statSync(pdfPath).size / 1024) + ' KB)')
  console.log('HTML written:', htmlPath)
} finally {
  await browser.close()
}
