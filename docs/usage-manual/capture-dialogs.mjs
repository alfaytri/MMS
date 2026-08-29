// Interactive dialog capture for the usage manual. Same auth/overlay-hide as
// capture.mjs, but each entry navigates to a page, performs click steps to open
// a dialog, and screenshots the viewport (modals are centered overlays).
// Run AFTER capture.mjs finishes (avoid two capture browsers at once):
//   COOKIE_FILE=<scratch>/sb-cookie.txt node docs/usage-manual/capture-dialogs.mjs
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const OUT = process.env.OUT_DIR || 'docs/usage-manual/assets'
const COOKIE_FILE = process.env.COOKIE_FILE
const COOKIE_NAME = process.env.COOKIE_NAME || 'sb-mwvblpgbgxipvrevkeff-auth-token'
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
if (!COOKIE_FILE || !fs.existsSync(COOKIE_FILE)) { console.error('COOKIE_FILE missing'); process.exit(1) }
const cookieValue = fs.readFileSync(COOKIE_FILE, 'utf8').trim()

const HIDE = `.tsqd-open-btn-container,[class*="tsqd-"],nextjs-portal,[data-nextjs-toast],[data-next-badge-root],[data-nextjs-dev-tools-button],#__next-build-watcher,[id^="__nextjs"]{display:none !important;}`
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// steps: {text:'Create PO' | ['Create PO','New PO']} click first visible btn/link/role=button whose
//        text includes any candidate; {row:1} click the Nth (1-based) table data row; {wait:ms}
const DIALOGS = [
  { name: 'purchase-dlg-create-po',      url: '/purchase/orders',    steps: [{ nativeText: ['Create PO', 'New PO', 'Create Purchase'] }] },
  { name: 'purchase-dlg-po-detail',      url: '/purchase/orders',    steps: [{ row: 1 }] },
  { name: 'purchase-dlg-receival-detail',url: '/purchase/receivals', steps: [{ row: 1 }] },
  { name: 'sales-dlg-create-so',         url: '/sales/orders',       steps: [{ nativeText: ['Create SO', 'New SO', 'Create Sale'] }] },
  { name: 'sales-dlg-so-detail',         url: '/sales/orders',       steps: [{ row: 1 }] },
  { name: 'sales-dlg-delivery-detail',   url: '/sales/deliveries',   steps: [{ row: 1 }] },
  { name: 'sales-dlg-warranty-record',   url: '/sales/warranties',   steps: [{ row: 1 }] },
  { name: 'sales-dlg-file-claim',        url: '/sales/warranties',   steps: [{ row: 1 }, { wait: 900 }, { text: ['File a claim', 'File claim'] }] },
  { name: 'sales-dlg-claim-detail',      url: '/sales/warranties',   steps: [{ text: ['Claims'] }, { wait: 1000 }, { row: 1 }] },
  { name: 'sales-dlg-credit-note-detail',url: '/sales/credit-notes', steps: [{ row: 1 }] },
  { name: 'md-dlg-new-supplier',         url: '/master-data/suppliers', steps: [{ text: ['New Supplier', 'Add Supplier', 'Create Supplier', 'New'] }] },
  { name: 'md-dlg-new-customer',         url: '/master-data/customers', steps: [{ text: ['New Customer', 'Add Customer', 'Create Customer', 'New'] }] },
  { name: 'ops-dlg-new-consumption',     url: '/consumption',        steps: [{ text: ['New Consumption', 'Add Consumption', 'New'] }] },
]

async function clickText(page, candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates]
  return page.evaluate((cands) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const els = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(e => e.offsetParent !== null && !e.disabled)
    for (const c of cands) {
      const el = els.find(e => norm(e.textContent) === c) || els.find(e => norm(e.textContent).includes(c))
      if (el) { el.click(); return norm(el.textContent) }
    }
    return null
  }, list)
}
async function clickNative(page, candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates]
  const box = await page.evaluate((cands) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const els = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(e => e.offsetParent !== null && !e.disabled)
    for (const c of cands) {
      const el = els.find(e => norm(e.textContent) === c) || els.find(e => norm(e.textContent).includes(c))
      if (el) { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: norm(el.textContent) } }
    }
    return null
  }, list)
  if (!box) return null
  await page.mouse.click(box.x, box.y) // trusted click → triggers Next <Link> navigation / onClick
  return box.t
}
async function clickRow(page, n) {
  return page.evaluate((idx) => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'))
      .filter(r => r.offsetParent !== null && r.querySelector('td'))
    const row = rows[idx - 1]
    if (row) { (row.querySelector('td') || row).click(); return true }
    return false
  }, n)
}
async function dialogPresent(page) {
  return page.evaluate(() => !!document.querySelector('[role="dialog"], [data-slot="dialog-content"]'))
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 2 },
  args: ['--hide-scrollbars', '--no-first-run'],
})
try {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s) }
    if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add)
  }, HIDE)
  await page.setCookie({ name: COOKIE_NAME, value: cookieValue, url: BASE })
  fs.mkdirSync(OUT, { recursive: true })

  const list = ONLY.length ? DIALOGS.filter(d => ONLY.some(o => d.name.includes(o))) : DIALOGS
  let ok = 0, warn = 0, fail = 0
  for (const d of list) {
    try {
      await page.goto(BASE + d.url, { waitUntil: 'networkidle0', timeout: 60000 })
      await sleep(2000)
      await page.waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 20000 }).catch(() => {})
      let stepNote = ''
      for (const s of d.steps) {
        if (s.wait) { await sleep(s.wait); continue }
        if (s.text) { const hit = await clickText(page, s.text); stepNote += hit ? ` text="${hit}"` : ` text=MISS(${JSON.stringify(s.text)})`; await sleep(1200) }
        if (s.nativeText) { const hit = await clickNative(page, s.nativeText); stepNote += hit ? ` native="${hit}"` : ` native=MISS(${JSON.stringify(s.nativeText)})`; await sleep(2500) }
        if (s.row) { const hit = await clickRow(page, s.row); stepNote += hit ? ` row${s.row}` : ` row${s.row}=MISS`; await sleep(1200) }
      }
      await sleep(600)
      const hasDialog = await dialogPresent(page)
      const file = path.join(OUT, d.name + '.png')
      await page.screenshot({ path: file, fullPage: false })
      const kb = Math.round(fs.statSync(file).size / 1024)
      if (hasDialog) { console.log(`OK   ${d.name}  (${kb} KB)${stepNote}`); ok++ }
      else { console.log(`WARN ${d.name}  no dialog detected (${kb} KB)${stepNote}`); warn++ }
    } catch (e) {
      console.log(`FAIL ${d.name}  ${e.message}`); fail++
    }
  }
  console.log(`DONE dialogs ok=${ok} warn=${warn} fail=${fail}`)
} finally {
  await browser.close()
}
