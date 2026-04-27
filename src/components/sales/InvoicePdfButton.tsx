'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from './InvoicePdf'
import { useCompanies } from '@/hooks/useCompanies'
import type { ArInvoice } from '@/types/invoice'

interface Props {
  invoice:     ArInvoice
  amountPaid:  number
  outstanding: number
}

export function InvoicePdfButton({ invoice, amountPaid, outstanding }: Props) {
  const { data: companies } = useCompanies()
  const c = companies?.find((co) => co.is_active) ?? companies?.[0]

  const company = c ? {
    name:      c.name_en,
    address:   c.address_en ?? null,
    vat_id:    c.vat_id ?? null,
    cr_number: c.cr_number ?? null,
  } : undefined

  return (
    <PDFDownloadLink
      document={
        <InvoiceDocument
          invoice={invoice}
          amountPaid={amountPaid}
          outstanding={outstanding}
          company={company}
        />
      }
      fileName={`Invoice-${invoice.invoice_id}.pdf`}
    >
      {({ loading }: { loading: boolean }) => (
        <Button variant="outline" size="sm" disabled={loading}>
          {loading ? 'Preparing…' : 'Download PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
