/**
 * PDF renderer registry for the unified invoice hub.
 *
 * Maps each business-line kind to the existing generator that renders that
 * invoice's PDF, uploads it to Storage and persists `pdf_url` on the detail
 * row. `pdfRendererFor(kind)` adapts a generator to `(detailId) => pdf_url`,
 * where `detailId` is the hub row's `detail_id` (the primary key of the
 * so_invoices / tl_invoices / contract_invoices row), which is exactly the
 * `invoiceUuid` each generator takes.
 *
 * Server-only: it renders with the service-role client, and `createAdminClient`
 * refuses to load in the browser. The generators return the URL already stored
 * on the detail row when there is one (no `force`), so a second call does not
 * re-render.
 *
 * To register a new invoice kind, add it to `InvoiceType` and give it a
 * generator below; the `Record` makes the compiler enforce the pairing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateInvoicePdf } from '@/lib/sales/generate-invoice-pdf'
import { generateTlInvoicePdf } from '@/lib/orders/generate-tl-invoice-pdf'
import { generateContractInvoicePdf } from '@/lib/contracts/generate-contract-invoice-pdf'
import type { InvoiceType } from '@/lib/invoices/types'

// The part of each generator's signature the registry relies on. They also
// accept an optional { force, divisionId } and return { storageKey, invoiceId,
// bytes, regenerated }, none of which is needed here.
type PdfGenerator = (invoiceUuid: string, supabase: SupabaseClient) => Promise<{ url: string }>

const GENERATORS: Record<InvoiceType, PdfGenerator> = {
  sales:    generateInvoicePdf,
  service:  generateTlInvoicePdf,
  contract: generateContractInvoicePdf,
}

export function pdfRendererFor(type: InvoiceType): (detailId: string) => Promise<string> {
  // Own-property check: a plain `GENERATORS[type]` would hand back inherited
  // members (e.g. `constructor`) for a bad key instead of failing.
  if (!Object.hasOwn(GENERATORS, type)) throw new Error('no PDF renderer for ' + type)
  const generate = GENERATORS[type]

  return async (detailId) => {
    // Created per call so selecting a renderer has no side effects and a missing
    // service-role key surfaces as a rejection from the renderer itself.
    const { url } = await generate(detailId, createAdminClient())
    return url
  }
}
