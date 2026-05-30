'use client'

import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import type { ArInvoice } from '@/types/invoice'

interface Props {
  invoice:     ArInvoice
  amountPaid:  number
  outstanding: number
}

// @react-pdf/renderer is ~1MB. Loading it dynamically keeps it out of the
// route's initial JS chunk so the page becomes interactive sooner; the PDF
// implementation streams in alongside.
const InvoicePdfButtonInner = dynamic(
  () => import('./InvoicePdfButtonInner').then((m) => m.InvoicePdfButtonInner),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" disabled>
        Loading…
      </Button>
    ),
  }
)

export function InvoicePdfButton(props: Props) {
  return <InvoicePdfButtonInner {...props} />
}
