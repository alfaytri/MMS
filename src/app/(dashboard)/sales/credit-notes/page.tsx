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
import {
  useCreditNotes,
  useDebitNotes,
  useApplyCreditNote,
  type CreditNote,
  type CreditNoteStatus,
} from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-slate-100 text-slate-700' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

export default function CreditNotesPage() {
  const [noteType, setNoteType] = useState<'credit' | 'debit'>('credit')
  const [createOpen, setCreateOpen] = useState(false)
  const [applyTarget, setApplyTarget] = useState<CreditNote | null>(null)

  const { data: creditNotes = [], isLoading: cnLoading } = useCreditNotes()
  const { data: debitNotes  = [], isLoading: dnLoading  } = useDebitNotes()
  const applyCreditNote = useApplyCreditNote()

  const rows    = noteType === 'credit' ? creditNotes : debitNotes
  const loading = noteType === 'credit' ? cnLoading   : dnLoading

  const creditColumns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CN #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('credit_note_id')}</span>,
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
      cell: () => '—',
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
            {note.line_items && (
              <CreditDebitNoteDownloadButton
                note={note}
                referenceNumber={note.invoice_display ?? note.invoice_id ?? '—'}
                returnNumber="—"
              />
            )}
            {(note.status === 'issued' || note.status === 'approved') && (
              <Button variant="outline" size="sm" onClick={() => setApplyTarget(note)}>
                Apply
              </Button>
            )}
          </div>
        )
      },
    },
  ], [])

  const debitColumns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="DN #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('credit_note_id')}</span>,
    },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: () => '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Debit Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount'), 'QAR'),
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
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => formatDate(row.getValue('created_at')),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const note = row.original
        if (!note.line_items) return null
        return (
          <CreditDebitNoteDownloadButton
            note={note}
            referenceNumber="—"
            returnNumber="—"
          />
        )
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Credit & Debit Notes"
        description="Auto-generated notes from customer and supplier returns"
        actions={
          noteType === 'credit' ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create Credit Note
            </Button>
          ) : null
        }
      />

      <div className="mb-4 w-48">
        <Select value={noteType} onValueChange={(v) => setNoteType(v as 'credit' | 'debit')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="credit">Credit Notes</SelectItem>
            <SelectItem value="debit">Debit Notes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={noteType === 'credit' ? creditColumns : debitColumns}
        data={rows}
        isLoading={loading}
      />

      {noteType === 'credit' && (
        <CreditNoteFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}

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
