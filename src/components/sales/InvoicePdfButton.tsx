'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from './InvoicePdf'
import type { ArInvoice } from '@/types/invoice'

interface Props {
  invoice:     ArInvoice
  amountPaid:  number
  outstanding: number
}

export function InvoicePdfButton({ invoice, amountPaid, outstanding }: Props) {
  return (
    <PDFDownloadLink
      document={
        <InvoiceDocument
          invoice={invoice}
          amountPaid={amountPaid}
          outstanding={outstanding}
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
