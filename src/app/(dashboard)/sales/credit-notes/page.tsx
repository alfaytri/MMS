// src/app/(dashboard)/sales/credit-notes/page.tsx
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
import { useCreditNotes, useApplyCreditNote, type CreditNote, type CreditNoteStatus } from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-slate-100 text-slate-700' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

export default function CreditNotesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [applyTarget, setApplyTarget] = useState<CreditNote | null>(null)

  const { data: creditNotes, isLoading } = useCreditNotes()
  const applyCreditNote = useApplyCreditNote()

  const columns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CN #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('credit_note_id')}</span>,
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount'), 'QAR'),
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
        if (note.status === 'issued' || note.status === 'approved') {
          return (
            <Button variant="outline" size="sm" onClick={() => setApplyTarget(note)}>
              Apply to Invoice
            </Button>
          )
        }
        return null
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Credit Notes"
        description="Manually issued credits against customer invoices"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Credit Note
          </Button>
        }
      />
      <DataTable columns={columns} data={creditNotes ?? []} isLoading={isLoading} />

      <CreditNoteFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {applyTarget && (
        <ConfirmDialog
          open
          title="Apply Credit Note?"
          description={`Apply ${applyTarget.credit_note_id} (${formatCurrency(applyTarget.total_amount, 'QAR')}) to invoice ${applyTarget.invoice_display ?? applyTarget.invoice_id}? Any excess will be stored as customer credit balance.`}
          confirmLabel="Apply"
          onConfirm={async () => {
            await applyCreditNote.mutateAsync({ id: applyTarget.id, invoiceId: applyTarget.invoice_id ?? '' })
            toast.success('Credit note applied')
            setApplyTarget(null)
          }}
          onOpenChange={(v) => { if (!v) setApplyTarget(null) }}
        />
      )}
    </PageWrapper>
  )
}
