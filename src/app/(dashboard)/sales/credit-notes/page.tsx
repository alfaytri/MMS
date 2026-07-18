'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CreditNoteFormDialog } from '@/components/sales/CreditNoteFormDialog'
import { CreditDebitNoteDownloadButton } from '@/components/sales/CreditDebitNoteDownloadButton'
import { CreditDebitNoteDetailDialog } from '@/components/sales/CreditDebitNoteDetailDialog'
import {
  useCreditNotes,
  useApplyCreditNote,
  type CreditNote,
  type CreditNoteStatus,
} from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-muted text-foreground' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

export default function CreditNotesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [applyTarget, setApplyTarget] = useState<CreditNote | null>(null)
  const [detailNote, setDetailNote] = useState<CreditNote | null>(null)

  const { data: creditNotes = [], isLoading: cnLoading } = useCreditNotes()
  const applyCreditNote = useApplyCreditNote()

  const detailRefNumber = detailNote
    ? detailNote.note_type === 'credit'
      ? (detailNote.invoice_display ?? detailNote.invoice_id ?? '—')
      : '—'
    : '—'

  const creditColumns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CN #" />,
      cell: ({ row }) => (
        <button
          type="button"
          className="font-mono text-sm font-medium text-primary hover:underline underline-offset-2"
          onClick={() => setDetailNote(row.original)}
        >
          {row.getValue('credit_note_id')}
        </button>
      ),
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: ({ row }) => row.original.return_number ?? '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount'), 'QAR'),
    },
    {
      accessorKey: 'new_total',
      header: 'New Total',
      cell: ({ row }) => {
        const v = row.original.new_total
        return v != null ? formatCurrency(v, 'QAR') : '—'
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'draft') as CreditNoteStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => formatDate(row.getValue('created_at')),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const note = row.original
        return (
          <div className="flex items-center gap-2">
            {(note.credit_note_lines?.length ?? 0) > 0 && (
              <CreditDebitNoteDownloadButton
                note={note}
                referenceNumber={note.invoice_display ?? note.invoice_id ?? '—'}
                returnNumber={note.return_number ?? '—'}
              />
            )}
            {(note.status === 'issued' || note.status === 'approved') && !note.resolution_type && (
              <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setApplyTarget(note)}>
                Apply
              </Button>
            )}
          </div>
        )
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Credit Notes"
        description="Credit notes from customer returns"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Credit Note
          </Button>
        }
      />

      <DataTable
        columns={creditColumns}
        data={creditNotes}
        isLoading={cnLoading}
      />

      <CreditNoteFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <CreditDebitNoteDetailDialog
        note={detailNote}
        referenceNumber={detailRefNumber}
        open={!!detailNote}
        onOpenChange={(v) => { if (!v) setDetailNote(null) }}
      />

      {applyTarget && (
        <ConfirmDialog
          open
          title="Apply Credit Note?"
          description={`Apply ${applyTarget.credit_note_id} (${formatCurrency(applyTarget.total_amount, 'QAR')}) to invoice ${applyTarget.invoice_display ?? applyTarget.invoice_id ?? ''}? Any excess will be stored as customer credit balance.`}
          confirmLabel="Apply"
          onConfirm={async () => {
            if (!applyTarget.invoice_id) return
            await applyCreditNote.mutateAsync({ id: applyTarget.id, invoiceId: applyTarget.invoice_id })
            toast.success('Credit note applied')
            setApplyTarget(null)
          }}
          onOpenChange={(v) => { if (!v) setApplyTarget(null) }}
        />
      )}
    </PageWrapper>
  )
}
