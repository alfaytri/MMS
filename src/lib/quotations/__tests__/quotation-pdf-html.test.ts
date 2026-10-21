// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildQuotationHtml, type QuotationLineItem } from '../quotation-pdf-html'
import type { PdfAssets, PdfFonts } from '@/lib/pdf/pdf-fonts'

const fonts = {
  ibmPlexRegular: '', ibmPlexMedium: '', ibmPlexSemiBold: '', ibmPlexBold: '',
  ibmPlexArRegular: '', ibmPlexArSemiBold: '', ibmPlexArBold: '',
} as PdfFonts
const assets = { logo: '', footer: '', stamp: null } as PdfAssets

function line(over: Partial<QuotationLineItem> = {}): QuotationLineItem {
  return {
    imageDataUri: null, name: 'Deep Clean', pathLabel: 'AC › Split',
    qty: 1, unitPrice: 180, subtotal: 180, ...over,
  }
}

function html(services: QuotationLineItem[]): string {
  return buildQuotationHtml({
    quotationNumber: 'QT-0001', issuingDate: '21 Oct 2026', validUntilDate: '20 Nov 2026',
    validityDays: 30, customerName: 'Probe', customerPhone: '+974', customerAddress: '',
    services, subtotal: 180, discount: 0, total: 180,
    notes: '', preparedBy: '', assets, fonts,
  } as Parameters<typeof buildQuotationHtml>[0])
}

/** Count cells in the services table's header and first body row. */
function counts(out: string) {
  const table = out.slice(out.indexOf('table.lines') >= 0 ? 0 : 0)
  const thead = table.slice(table.indexOf('<thead>'), table.indexOf('</thead>'))
  const tbody = table.slice(table.indexOf('<tbody>'), table.indexOf('</tbody>'))
  const firstRow = tbody.slice(tbody.indexOf('<tr>'), tbody.indexOf('</tr>'))
  return {
    heads: (thead.match(/<th\s/g) ?? []).length,
    cells: (firstRow.match(/<td\s/g) ?? []).length,
    headHasPhoto: /\(Photo\)|صورة/.test(thead),
    cellHasImg: /class="cell-img"/.test(firstRow),
  }
}

describe('quotation html — image column', () => {
  it('omits the image column entirely when no line has a photo', () => {
    const out = html([line(), line({ name: 'Gas Refill' })])
    expect(out).not.toContain('<td class="cell-img"')
    const c = counts(out)
    expect(c.headHasPhoto).toBe(false)
    expect(c.heads).toBe(c.cells)
  })

  it('adds a header cell whenever it adds an image cell', () => {
    // A body column with no header leaves the header band one short and the
    // customer sees an untitled column hanging off the table.
    const out = html([
      line({ imageDataUri: 'data:image/png;base64,AAA' }),
      line({ name: 'Gas Refill' }),
    ])
    const c = counts(out)
    expect(c.cellHasImg).toBe(true)
    expect(c.headHasPhoto).toBe(true)
    expect(c.heads).toBe(c.cells)
  })

  it('renders the column for every row once any row has a photo', () => {
    const out = html([
      line({ imageDataUri: 'data:image/png;base64,AAA' }),
      line({ name: 'Gas Refill' }),
    ])
    expect(out.match(/class="cell-img"/g) ?? []).toHaveLength(2)
    expect(out.match(/<td class="cell-img"><img /g) ?? []).toHaveLength(1)
  })

  it('embeds the data uri rather than linking to a url', () => {
    const out = html([line({ imageDataUri: 'data:image/png;base64,ZZZ' })])
    expect(out).toContain('src="data:image/png;base64,ZZZ"')
  })

  it('declares column widths that sum to 100%', () => {
    const out = html([line({ imageDataUri: 'data:image/png;base64,AAA' })])
    const thead = out.slice(out.indexOf('<thead>'), out.indexOf('</thead>'))
    const widths = [...thead.matchAll(/width:(\d+)%/g)].map((m) => Number(m[1]))
    expect(widths.reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('quotation html — paged layout', () => {
  it('keeps a line row from splitting across a page boundary', () => {
    expect(html([line()])).toMatch(/table\.lines\s+tr\s*\{[^}]*break-inside:\s*avoid/)
  })

  it('repeats the line table header on later pages', () => {
    expect(html([line()])).toMatch(/table\.lines\s+thead\s*\{[^}]*display:\s*table-header-group/)
  })
})
