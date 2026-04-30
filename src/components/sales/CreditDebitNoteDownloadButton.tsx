'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { CreditDebitNoteDocument } from './CreditDebitNotePdf'
import { useCompanies } from '@/hooks/useCompanies'
import type { CreditNote } from '@/hooks/useCreditNotes'

interface Props {
  note: CreditNote
  referenceNumber: string  // invoice_id string or PO number
  returnNumber: string     // SR-XXXXX or PR-XXXXX
}

export function CreditDebitNoteDownloadButton({ note, referenceNumber, returnNumber }: Props) {
  const { data: companies, isLoading: companiesLoading } = useCompanies()
  const c = companies?.find((co) => co.is_active) ?? companies?.[0]
  const company = c
    ? {
        name:      c.name_en,
        address:   c.address_en ?? null,
        vat_id:    c.vat_id ?? null,
        cr_number: c.cr_number ?? null,
      }
    : undefined

  const pdfData = note.line_items ?? { original_lines: [], returned_lines: [] }
  const partyName = note.note_type === 'credit'
    ? (note.customer_name ?? '—')
    : (note.supplier_name ?? '—')
  const prefix   = note.note_type === 'credit' ? 'CreditNote' : 'DebitNote'
  const fileName = `${prefix}-${note.credit_note_id}.pdf`

  return (
    <PDFDownloadLink
      document={
        <CreditDebitNoteDocument
          noteId={note.credit_note_id}
          noteType={note.note_type}
          partyName={partyName}
          referenceNumber={referenceNumber}
          returnNumber={returnNumber}
          reason={note.reason}
          createdAt={note.created_at}
          pdfData={pdfData}
          originalTotal={note.original_total ?? 0}
          newTotal={note.new_total ?? 0}
          company={company}
        />
      }
      fileName={fileName}
    >
      {({ loading }: { loading: boolean }) => (
        <Button variant="outline" size="sm" disabled={loading || companiesLoading} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          {loading || companiesLoading ? 'Preparing…' : 'PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
