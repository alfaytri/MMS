// Usage-manual screenshot capture tool.
// Drives system Chrome headless via puppeteer-core, authenticated with a
// Supabase session cookie (read from a local file — never committed), hides
// dev-only overlays on every navigation, and full-page-screenshots each page in
// the manifest into docs/usage-manual/assets/<name>.png.
//
// Run (from repo root, dev server on :3000, a fresh logged-in session cookie in
// the file pointed to by COOKIE_FILE):
//   COOKIE_FILE=/path/to/sb-cookie.txt node docs/usage-manual/capture.mjs
//   (optional: ONLY="purchase-,getting-" to capture just matching names)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const OUT = process.env.OUT_DIR || 'docs/usage-manual/assets'
const COOKIE_FILE = process.env.COOKIE_FILE
const COOKIE_NAME = process.env.COOKIE_NAME || 'sb-mwvblpgbgxipvrevkeff-auth-token'
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)

if (!COOKIE_FILE || !fs.existsSync(COOKIE_FILE)) {
  console.error('COOKIE_FILE env var must point to a file containing the sb auth cookie value')
  process.exit(1)
}
const cookieValue = fs.readFileSync(COOKIE_FILE, 'utf8').trim()

const HIDE = `.tsqd-open-btn-container,[class*="tsqd-"],nextjs-portal,[data-nextjs-toast],[data-next-badge-root],[data-nextjs-dev-tools-button],#__next-build-watcher,[id^="__nextjs"]{display:none !important;}`

// Manifest of pages to capture. name = output filename (no ext); url = route.
const PAGES = [
  // Getting Started
  { name: 'getting-started-01-dashboard', url: '/' },
  { name: 'getting-started-03-profile',   url: '/profile' },
  // Master Data
  { name: 'master-data-01-inventory',     url: '/master-data/inventory' },
  { name: 'master-data-02-warehouses',    url: '/master-data/warehouses' },
  { name: 'master-data-03-users',         url: '/master-data/users' },
  { name: 'master-data-04-audit-trail',   url: '/master-data/audit-trail' },
  { name: 'master-data-05-admin',         url: '/master-data/admin' },
  { name: 'master-data-admin-companies',        url: '/master-data/admin/companies' },
  { name: 'master-data-admin-warehouses',       url: '/master-data/admin/warehouses' },
  { name: 'master-data-admin-custody',          url: '/master-data/admin/custody' },
  { name: 'master-data-admin-repair-vendors',   url: '/master-data/admin/repair-vendors' },
  { name: 'master-data-admin-credit-groups',    url: '/master-data/admin/credit-groups' },
  { name: 'master-data-admin-credit-group-approvals', url: '/master-data/admin/credit-group-approvals' },
  { name: 'master-data-admin-reason-lists',     url: '/master-data/admin/reason-lists' },
  { name: 'master-data-admin-warranty-policies', url: '/master-data/admin/warranty-policies' },
  { name: 'master-data-admin-payment-methods',  url: '/master-data/admin/payment-methods' },
  { name: 'master-data-admin-currencies',       url: '/master-data/admin/currencies' },
  { name: 'master-data-admin-country-codes',    url: '/master-data/admin/country-codes' },
  { name: 'master-data-admin-approval-settings', url: '/master-data/admin/approval-settings' },
  { name: 'master-data-admin-approval-workflows', url: '/master-data/admin/approval-workflows' },
  // Purchase (suppliers/orders/approvals/receivals/bills/returns/debit-notes/aging already captured in pilot)
  { name: 'purchase-01-suppliers',        url: '/master-data/suppliers' },
  { name: 'purchase-02-orders',           url: '/purchase/orders' },
  { name: 'purchase-05-approvals',        url: '/purchase/approvals' },
  { name: 'purchase-06-receivals',        url: '/purchase/receivals' },
  { name: 'purchase-07-bills',            url: '/purchase/bills' },
  { name: 'purchase-08-returns',          url: '/purchase/returns' },
  { name: 'purchase-09-debit-notes',      url: '/purchase/debit-notes' },
  { name: 'purchase-10-aging',            url: '/purchase/aging-report' },
  { name: 'purchase-11-shipments',        url: '/purchase/shipments' },
  { name: 'purchase-12-landed-costs',     url: '/purchase/landed-costs' },
  { name: 'purchase-13-dead-stock',       url: '/purchase/dead-stock' },
  // Sales
  { name: 'sales-01-customers',           url: '/master-data/customers' },
  { name: 'sales-02-orders',              url: '/sales/orders' },
  { name: 'sales-03-approvals',           url: '/sales/approvals' },
  { name: 'sales-04-invoices',            url: '/sales/invoices' },
  { name: 'sales-05-returns',             url: '/sales/returns' },
  { name: 'sales-06-warranties',          url: '/sales/warranties' },
  { name: 'sales-07-deliveries',          url: '/sales/deliveries' },
  { name: 'sales-08-credit-notes',        url: '/sales/credit-notes' },
  { name: 'sales-09-customer-statement',  url: '/sales/customer-statement' },
  { name: 'sales-10-aging',               url: '/sales/aging-report' },
  // Operations
  { name: 'operations-01-custody',        url: '/warehouse/custody' },
  { name: 'operations-02-consumption',    url: '/consumption' },
  { name: 'operations-03-damaged-stock',  url: '/warehouse/damaged-stock' },
  { name: 'operations-04-tools-assets',   url: '/warehouse/tools-assets' },
  { name: 'operations-05-picture-transfer', url: '/warehouse/picture-transfer' },
  // Reports
  { name: 'reports-01-dashboard',         url: '/reports/dashboard' },
  { name: 'reports-02-product-profitability', url: '/reports/product-profitability' },
  { name: 'reports-03-product-cost',      url: '/reports/product-cost' },
  { name: 'reports-04-revenue-cogs',      url: '/reports/revenue-cogs' },
  { name: 'reports-05-receivables',       url: '/reports/receivables' },
  { name: 'reports-06-payables',          url: '/reports/payables' },
  { name: 'reports-07-cash',              url: '/reports/cash' },
  { name: 'reports-08-profit-loss',       url: '/reports/profit-loss' },
  { name: 'reports-09-consumption',       url: '/reports/project-consumption' },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  args: ['--hide-scrollbars', '--disable-features=Translate', '--no-first-run'],
})
try {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument((css) => {
    const add = () => {
      const s = document.createElement('style')
      s.id = '__manual_hide_overlays'
      s.textContent = css
      document.documentElement.appendChild(s)
    }
    if (document.documentElement) add()
    else document.addEventListener('DOMContentLoaded', add)
  }, HIDE)
  await page.setCookie({ name: COOKIE_NAME, value: cookieValue, url: BASE })

  fs.mkdirSync(OUT, { recursive: true })
  const list = ONLY.length ? PAGES.filter(p => ONLY.some(o => p.name.includes(o))) : PAGES
  let ok = 0, fail = 0
  for (const p of list) {
    try {
      await page.goto(BASE + p.url, { waitUntil: 'networkidle0', timeout: 60000 })
      // Poll until skeleton loaders are CONSISTENTLY gone (3 clear reads ~0.7s
      // apart). This survives both the t=0 race (skeletons not mounted yet, esp.
      // under dev-server route compilation) and slow data fetches — a single
      // "no skeleton" read isn't trusted; skeletons reappearing resets the count.
      await sleep(800)
      let clear = 0
      for (let t = 0; t < 40 && clear < 3; t++) {
        const hasSkel = await page.evaluate(() => !!document.querySelector('.animate-pulse, .animate-shimmer')).catch(() => false)
        clear = hasSkel ? 0 : clear + 1
        await sleep(700)
      }
      await sleep(1000) // final settle for charts / late renders
      const file = path.join(OUT, p.name + '.png')
      await page.screenshot({ path: file, fullPage: true })
      const kb = Math.round(fs.statSync(file).size / 1024)
      console.log(`OK   ${p.name}  (${kb} KB)`)
      ok++
    } catch (e) {
      console.log(`FAIL ${p.name}  ${e.message}`)
      fail++
    }
  }
  console.log(`DONE  ok=${ok} fail=${fail}`)
} finally {
  await browser.close()
}
