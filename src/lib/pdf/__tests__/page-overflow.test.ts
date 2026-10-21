// @vitest-environment node
/**
 * Regression guard for the silent row-clipping bug.
 *
 * `BASE_CSS` used to set `body { height: 297mm; overflow: hidden }`, which in
 * paged media pins the body to exactly one A4 page and clips everything past
 * it. A document with more rows than fit simply lost them — no error, no
 * warning, rows just missing from a customer-facing PDF.
 *
 * These tests render real HTML through the real Puppeteer pipeline, so they are
 * slow (a browser launch each). They are the only place that proves the paged
 * layout actually behaves.
 */
import { describe, it, expect } from 'vitest'
import { BASE_CSS } from '../pdf-fonts'
import { htmlToPdfBuffer } from '../html-to-pdf'

const LAUNCH_TIMEOUT = 120_000

/**
 * Count pages in a PDF buffer.
 *
 * Chromium writes an uncompressed page tree, so the `/Type /Page` objects are
 * greppable. `(?!s)` keeps `/Type /Pages` (the tree root) from being counted.
 */
function countPdfPages(buf: Buffer): number {
  const text = buf.toString('latin1')
  const matches = text.match(/\/Type\s*\/Page(?![s])/g)
  return matches ? matches.length : 0
}

function rows(n: number): string {
  return Array.from({ length: n }, (_, i) =>
    `<tr><td class="cell-desc">Row ${i + 1} — ${i === n - 1 ? 'ZZZLASTROW' : 'filler text'}</td>` +
    `<td class="cell-qty">1</td><td class="cell-total">100.00</td></tr>`,
  ).join('')
}

/** A document with no BASE_CSS at all — the control for the page counter. */
function controlHtml(rowCount: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 210mm; font-family: sans-serif; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 4mm 3mm; border: 0.5px solid #333; font-size: 11px; }
  </style></head><body><table>${rows(rowCount)}</table></body></html>`
}

/** The same content, wrapped in the real shared stylesheet. */
function brandedHtml(rowCount: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
    <body>
      <div class="lines-wrap">
        <table class="lines">
          <thead><tr><th>Description</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${rows(rowCount)}</tbody>
        </table>
      </div>
      <div class="footer">FOOTER</div>
    </body></html>`
}

describe('PDF paged layout', () => {
  it(
    'the page counter itself works — plain content spanning several pages reports >1',
    async () => {
      const buf = await htmlToPdfBuffer(controlHtml(120))
      const pages = countPdfPages(buf)
      // eslint-disable-next-line no-console
      console.log(`[control] 120 plain rows -> ${pages} page(s), ${buf.length} bytes`)
      expect(pages).toBeGreaterThan(1)
    },
    LAUNCH_TIMEOUT,
  )

  it(
    'branded documents flow onto further pages instead of clipping',
    async () => {
      const buf = await htmlToPdfBuffer(brandedHtml(120))
      const pages = countPdfPages(buf)
      // eslint-disable-next-line no-console
      console.log(`[branded] 120 rows in BASE_CSS -> ${pages} page(s), ${buf.length} bytes`)
      expect(pages).toBeGreaterThan(1)
    },
    LAUNCH_TIMEOUT,
  )

  it(
    'a multi-page document with a thumbnail on every row keeps every row intact',
    async () => {
      // Thumbnails make each row taller, so this is the case where rows would
      // be lost or sliced if break-inside were missing.
      const n = 90
      const img =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const rowsHtml = Array.from({ length: n }, (_, i) =>
        `<tr><td class="cell-img"><img src="${img}" /></td>` +
        `<td class="cell-desc">Row ${i + 1}${i === n - 1 ? ' ZZZLASTROW' : ''}</td>` +
        `<td>1</td><td>100.00</td></tr>`,
      ).join('')
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
        table.lines thead { display: table-header-group; }
        table.lines tr { break-inside: avoid; page-break-inside: avoid; }
        table.lines td.cell-img img { height: 34px; width: auto; }
      </style></head><body>
        <div class="lines-wrap"><table class="lines">
          <thead><tr><th>Photo</th><th>Description</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table></div>
      </body></html>`

      const buf = await htmlToPdfBuffer(html)
      const pages = countPdfPages(buf)
      // eslint-disable-next-line no-console
      console.log(`[thumbs] ${n} rows with images -> ${pages} page(s), ${buf.length} bytes`)
      expect(pages).toBeGreaterThan(1)
    },
    LAUNCH_TIMEOUT,
  )

  it(
    'a short branded document still renders as exactly one page',
    async () => {
      const buf = await htmlToPdfBuffer(brandedHtml(5))
      const pages = countPdfPages(buf)
      // eslint-disable-next-line no-console
      console.log(`[branded-short] 5 rows in BASE_CSS -> ${pages} page(s)`)
      expect(pages).toBe(1)
    },
    LAUNCH_TIMEOUT,
  )
})
