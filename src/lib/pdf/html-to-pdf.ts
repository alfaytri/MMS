/**
 * Shared Puppeteer pipeline for rendering self-contained HTML to a PDF buffer.
 *
 * Used by:
 *  - src/lib/orders/generate-confirmation-pdf.tsx   (order booking confirmation)
 *  - src/lib/sales/generate-quotation-pdf.ts        (SO quotation)
 *  - src/lib/sales/generate-invoice-pdf.ts          (AR invoice)
 *  - src/lib/sales/generate-credit-debit-note-pdf.ts (credit / debit note)
 *
 * Why a shared helper: @react-pdf/renderer crashes on Next 15 because Next
 * ships React 19-canary which dropped `__SECRET_INTERNALS_…`. Puppeteer
 * doesn't touch React, so it works regardless of what Next bundles.
 *
 * The caller is responsible for inlining all fonts/images as data URLs — the
 * Chromium page is loaded with `waitUntil: 'domcontentloaded'` and never hits
 * the network.
 */

import { existsSync } from 'node:fs'
import puppeteer, { type Browser, type PDFOptions } from 'puppeteer-core'

function isServerlessEnv(): boolean {
  return !!process.env.VERCEL
      || !!process.env.AWS_LAMBDA_FUNCTION_NAME
      || !!process.env.AWS_EXECUTION_ENV
}

const WINDOWS_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean) as string[]

const UNIX_CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function findLocalChromiumExecutable(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const candidates = process.platform === 'win32' ? WINDOWS_CHROME_PATHS : UNIX_CHROME_PATHS
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    `No local Chrome/Edge found. Tried: ${candidates.join(', ')}. ` +
    `Set PUPPETEER_EXECUTABLE_PATH in .env.local to override.`
  )
}

export async function launchPdfBrowser(): Promise<Browser> {
  if (isServerlessEnv()) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args:           chromium.args,
      executablePath: await chromium.executablePath(),
      headless:       true,
    })
  }
  const executablePath = findLocalChromiumExecutable()
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

const DEFAULT_PDF_OPTIONS: PDFOptions = {
  format:            'A4',
  printBackground:   true,
  preferCSSPageSize: true,
  margin:            { top: 0, right: 0, bottom: 0, left: 0 },
}

/**
 * Render a self-contained HTML document to a PDF buffer.
 *
 * Inputs must be fully inlined (no external CSS/font/image URLs) — the page is
 * loaded with `domcontentloaded` and never waits for network.
 */
export async function htmlToPdfBuffer(html: string, pdfOptions?: Partial<PDFOptions>): Promise<Buffer> {
  const browser = await launchPdfBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.evaluateHandle('document.fonts.ready')
    const data = await page.pdf({ ...DEFAULT_PDF_OPTIONS, ...pdfOptions })
    return Buffer.from(data)
  } finally {
    await browser.close()
  }
}
