import { describe, it, expect, vi, beforeEach } from 'vitest'

// The generators pull in puppeteer/fonts and the admin client refuses to load
// in a jsdom window, so every collaborator is replaced with a mock.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/sales/generate-invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }))
vi.mock('@/lib/orders/generate-tl-invoice-pdf', () => ({ generateTlInvoicePdf: vi.fn() }))
vi.mock('@/lib/contracts/generate-contract-invoice-pdf', () => ({ generateContractInvoicePdf: vi.fn() }))

import { pdfRendererFor } from '../pdf-registry'
import type { InvoiceType } from '../types'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateInvoicePdf } from '@/lib/sales/generate-invoice-pdf'
import { generateTlInvoicePdf } from '@/lib/orders/generate-tl-invoice-pdf'
import { generateContractInvoicePdf } from '@/lib/contracts/generate-contract-invoice-pdf'

const adminClient = { tag: 'service-role-client' }

// Every generator resolves the same { url, storageKey, invoiceId, bytes, regenerated } shape.
const generated = (url: string) => ({
  url,
  storageKey: 'file.pdf',
  invoiceId:  'invoice-ref',
  bytes:      1,
  regenerated: true,
})

const CASES = [
  { type: 'sales',    generator: generateInvoicePdf,         url: 'https://cdn.test/invoice-pdfs/INV-00001.pdf?v=1' },
  { type: 'service',  generator: generateTlInvoicePdf,       url: 'https://cdn.test/tl-invoice-pdfs/SINV_2026_10_0001.pdf' },
  { type: 'contract', generator: generateContractInvoicePdf, url: 'https://cdn.test/contract-invoice-pdfs/CINV_2026_10_0001.pdf' },
] as const

describe('pdfRendererFor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)
  })

  it.each(CASES)(
    '$type: calls only its generator with (detailId, admin client) and returns the stored url',
    async ({ type, generator, url }) => {
      vi.mocked(generator).mockResolvedValue(generated(url))

      const render = pdfRendererFor(type)
      expect(typeof render).toBe('function')

      await expect(render('detail-uuid-1')).resolves.toBe(url)

      expect(generator).toHaveBeenCalledTimes(1)
      expect(generator).toHaveBeenCalledWith('detail-uuid-1', adminClient)
      for (const other of CASES.filter((c) => c.type !== type)) {
        expect(other.generator).not.toHaveBeenCalled()
      }
    },
  )

  it('does not touch the admin client or any generator until the renderer is invoked', () => {
    pdfRendererFor('service')

    expect(createAdminClient).not.toHaveBeenCalled()
    for (const { generator } of CASES) expect(generator).not.toHaveBeenCalled()
  })

  it('rejects when the generator fails, so the caller can record the failure', async () => {
    vi.mocked(generateTlInvoicePdf).mockRejectedValue(new Error('TL invoice not found: gone'))

    await expect(pdfRendererFor('service')('gone')).rejects.toThrow('TL invoice not found: gone')
  })

  it.each(['x', 'constructor', 'toString'])('throws "no PDF renderer" for unknown type %s', (bad) => {
    expect(() => pdfRendererFor(bad as InvoiceType)).toThrow(`no PDF renderer for ${bad}`)
  })
})
