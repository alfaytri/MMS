// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildTlInvoiceHtml, type TlInvoiceLineInput } from '../tl-invoice-pdf-html'
import type { PdfAssets, PdfFonts } from '@/lib/pdf/pdf-fonts'

const fonts = {
  ibmPlexRegular: '', ibmPlexMedium: '', ibmPlexSemiBold: '', ibmPlexBold: '',
  ibmPlexArRegular: '', ibmPlexArSemiBold: '', ibmPlexArBold: '',
} as PdfFonts
const assets = { logo: '', footer: '', stamp: null } as PdfAssets

function line(over: Partial<TlInvoiceLineInput> = {}): TlInvoiceLineInput {
  return {
    name: 'Deep Clean', nameAr: null, unitEn: 'Unit', unitAr: 'الوحده',
    qty: 1, unitPrice: 180, total: 180, imageDataUri: null, ...over,
  }
}

function html(lines: TlInvoiceLineInput[]): string {
  return buildTlInvoiceHtml({
    invoiceNumber: 'SINV/2026/10/0001', orderRef: 'ORD-1', issuingDate: '21 Oct 2026',
    customerName: 'Probe', customerPhone: '+974', lines,
    subtotal: 180, discount: 0, total: 180, paid: 0, remaining: 180,
    status: 'unpaid', payments: [], assets, fonts,
  })
}


/** Header cell labels, in markup order. */
function headerOrder(out: string): string[] {
  const thead = out.slice(out.indexOf('<thead>'), out.indexOf('</thead>'))
  return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    /\(Photo\)/.test(m[1]) ? 'PHOTO'
      : /\(Service\)/.test(m[1]) ? 'SERVICE'
      : /\(Unit Price/.test(m[1]) ? 'UNIT_PRICE'
      : /\(Unit\)/.test(m[1]) ? 'UNIT'
      : /\(Quantity\)/.test(m[1]) ? 'QTY'
      : 'SUBTOTAL')
}

/** First body row's cell kinds, in markup order. */
function bodyOrder(out: string): string[] {
  const tbody = out.slice(out.indexOf('<tbody>'), out.indexOf('</tbody>'))
  const firstRow = tbody.slice(tbody.indexOf('<tr>'), tbody.indexOf('</tr>'))
  return [...firstRow.matchAll(/<td class="([a-z-]+)"/g)].map((m) => m[1])
}

describe('tl invoice html — image column', () => {
  it('omits the image column entirely when no line has an image', () => {
    // An invoice raised before this feature has no snapshot anywhere; its PDF
    // must print exactly as it always did.
    const out = html([line(), line({ name: 'Gas Refill' })])
    // The CSS rule may exist; what must not exist is any image CELL or header.
    expect(out).not.toContain('<td class="cell-img"')
    expect(out).not.toContain('(Photo)')
  })

  it('renders the column for every line once any line has an image', () => {
    const out = html([
      line({ imageDataUri: 'data:image/png;base64,AAA' }),
      line({ name: 'Gas Refill' }),
    ])
    // A table cannot be ragged: two body rows means two image cells.
    expect(out.match(/class="cell-img"/g) ?? []).toHaveLength(2)
  })

  it('renders an empty image cell for the line that has none', () => {
    const out = html([
      line({ imageDataUri: 'data:image/png;base64,AAA' }),
      line({ name: 'Gas Refill' }),
    ])
    // Scoped to image cells — the logo, footer and stamp are <img> too.
    expect(out.match(/<td class="cell-img"><img /g) ?? []).toHaveLength(1)
    expect(out.match(/<td class="cell-img"><\/td>/g) ?? []).toHaveLength(1)
  })

  it('embeds the data uri rather than linking to a url', () => {
    const out = html([line({ imageDataUri: 'data:image/png;base64,ZZZ' })])
    expect(out).toContain('src="data:image/png;base64,ZZZ"')
  })
})

describe('tl invoice html — paged layout', () => {
  it('keeps a line row from splitting across a page boundary', () => {
    expect(html([line()])).toMatch(/table\.lines\s+tr\s*\{[^}]*break-inside:\s*avoid/)
  })

  it('repeats the line table header on later pages', () => {
    const out = html([line()])
    expect(out).toContain('<thead>')
    expect(out).toMatch(/table\.lines\s+thead\s*\{[^}]*display:\s*table-header-group/)
  })
})

describe('tl invoice html — column alignment', () => {
  it('puts the Photo header in the same position as the image cell', () => {
    // The whole document is a money table sent to a customer. A header one
    // column out puts the price under "Photo" and the service name under
    // "Unit Price". Counting cells cannot see this; placing them can.
    const out = html([line({ imageDataUri: 'data:image/png;base64,AAA' })])
    const heads = headerOrder(out)
    const cells = bodyOrder(out)
    expect(heads).toHaveLength(cells.length)
    expect(heads.indexOf('PHOTO')).toBe(cells.indexOf('cell-img'))
    expect(heads.indexOf('SERVICE')).toBe(cells.indexOf('cell-desc'))
    expect(heads.indexOf('UNIT_PRICE')).toBe(2 + cells.slice(2).indexOf('cell-num'))
  })

  it('keeps header and body cell counts equal when there is no photo', () => {
    const out = html([line()])
    expect(headerOrder(out)).toHaveLength(bodyOrder(out).length)
  })

  it('declares column widths that sum to 100%', () => {
    const out = html([line({ imageDataUri: 'data:image/png;base64,AAA' })])
    const thead = out.slice(out.indexOf('<thead>'), out.indexOf('</thead>'))
    const widths = [...thead.matchAll(/width:(\d+)%/g)].map((m) => Number(m[1]))
    expect(widths.reduce((a, b) => a + b, 0)).toBe(100)
  })
})
