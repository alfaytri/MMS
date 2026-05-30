'use client'

import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import type { CreditNote } from '@/hooks/useCreditNotes'

interface Props {
  note: CreditNote
  referenceNumber: string
  returnNumber: string
}

// @react-pdf/renderer is ~1MB. Loading it dynamically keeps it out of the
// route's initial JS chunk so the page becomes interactive sooner; the PDF
// implementation streams in alongside.
const CreditDebitNoteDownloadButtonInner = dynamic(
  () =>
    import('./CreditDebitNoteDownloadButtonInner').then(
      (m) => m.CreditDebitNoteDownloadButtonInner
    ),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" disabled className="gap-1.5">
        <Download className="h-3.5 w-3.5" />
        Loading…
      </Button>
    ),
  }
)

export function CreditDebitNoteDownloadButton(props: Props) {
  return <CreditDebitNoteDownloadButtonInner {...props} />
}
