'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { CreditDebitNoteDownloadButton } from '@/components/sales/CreditDebitNoteDownloadButton'
import { CreditDebitNoteDetailDialog } from '@/components/sales/CreditDebitNoteDetailDialog'
import { useDebitNotes, type CreditNote, type CreditNoteStatus } from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-muted text-foreground' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

export default function DebitNotesPage() {
  const [detailNote, setDetailNote] = useState<CreditNote | null>(null)

  const { data: debitNotes = [], isLoading } = useDebitNotes()

  const columns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="DN #" />,
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
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'po_ref',
      header: 'PO #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.po_number ?? '—'}</span>
      ),
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.return_number ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Debit Amount" />,
      cell: ({ row }) => (
        <span className="text-destructive">{formatCurrency(row.getValue('total_amount'), 'QAR')}</span>
      ),
    },
    {
      accessorKey: 'new_total',
      header: 'New PO Total',
      cell: ({ row }) => {
        const v = row.original.new_total
        return v != null ? formatCurrency(v, 'QAR') : '—'
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'issued') as CreditNoteStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.issued
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'resolution',
      header: 'Resolution',
      cell: ({ row }) => {
        const resolution = row.original.resolution_type
        if (resolution === 'supplier_credit') {
          return <Badge className="text-xs bg-blue-100 text-blue-700">Supplier Credit</Badge>
        }
        if (resolution === 'replacement') {
          return <Badge className="text-xs bg-green-100 text-green-700">Replacement</Badge>
        }
        return <span className="text-xs text-muted-foreground">Unresolved</span>
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
        if (!note.credit_note_lines?.length) return null
        return (
          <CreditDebitNoteDownloadButton
            note={note}
            referenceNumber={note.po_number ?? '—'}
            returnNumber={note.return_number ?? '—'}
          />
        )
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Debit Notes"
        description="Auto-generated notes from supplier returns"
      />

      <DataTable
        columns={columns}
        data={debitNotes}
        isLoading={isLoading}
        onRowClick={(note: CreditNote) => setDetailNote(note)}
        mobileCardRender={(note: CreditNote) => {
          const s = (note.status ?? 'issued') as CreditNoteStatus
          const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.issued
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{note.credit_note_id}</span>
                <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{note.supplier_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>PO: {note.po_number ?? '—'}</span>
                <span className="font-medium text-destructive">{formatCurrency(note.total_amount, 'QAR')}</span>
              </div>
              {note.resolution_type && (
                <Badge className={cn('text-xs', note.resolution_type === 'supplier_credit' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700')}>
                  {note.resolution_type === 'supplier_credit' ? 'Supplier Credit' : 'Replacement'}
                </Badge>
              )}
            </div>
          )
        }}
      />

      <CreditDebitNoteDetailDialog
        note={detailNote}
        referenceNumber={detailNote?.po_number ?? '—'}
        open={!!detailNote}
        onOpenChange={(v) => { if (!v) setDetailNote(null) }}
      />
    </PageWrapper>
  )
}
