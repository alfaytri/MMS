'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileText, CheckCircle2, Clock, CreditCard } from 'lucide-react'
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

const STATUSES: { value: CreditNoteStatus | ''; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'draft',    label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'issued',   label: 'Issued' },
  { value: 'redeemed', label: 'Redeemed' },
]

export default function CreditNotesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<CreditNoteStatus | ''>('')
  const [applyTarget, setApplyTarget] = useState<CreditNote | null>(null)
  const [detailNote, setDetailNote] = useState<CreditNote | null>(null)
  const searchParams = useSearchParams()

  const { data: allCreditNotes = [], isLoading: cnLoading } = useCreditNotes()
  const applyCreditNote = useApplyCreditNote()

  // Deep-link support: `?cn=<id>` auto-opens the detail dialog once the list
  // has loaded. Used by the customer credit-balance popup (opens in new tab).
  useEffect(() => {
    const cnId = searchParams.get('cn')
    if (!cnId || detailNote) return
    const match = allCreditNotes.find((n) => n.id === cnId)
    if (match) setDetailNote(match)
  }, [searchParams, allCreditNotes, detailNote])

  const creditNotes = useMemo(() => {
    if (!statusFilter) return allCreditNotes
    return allCreditNotes.filter((cn) => cn.status === statusFilter)
  }, [allCreditNotes, statusFilter])

  const stats = useMemo(() => {
    const list = allCreditNotes
    let totalAmount = 0
    let draftCount = 0
    let issuedCount = 0
    let redeemedCount = 0
    for (const cn of list) {
      totalAmount += cn.total_amount ?? 0
      if (cn.status === 'draft') draftCount++
      if (cn.status === 'issued' || cn.status === 'approved') issuedCount++
      if (cn.status === 'redeemed') redeemedCount++
    }
    return { total: list.length, totalAmount, draftCount, issuedCount, redeemedCount }
  }, [allCreditNotes])

  const detailRefNumber = detailNote
    ? (detailNote.invoice_display ?? detailNote.invoice_id ?? '—')
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
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[160px] block">
          {row.original.customer_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.invoice_display ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.return_number ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-medium">
          {formatCurrency(row.getValue('total_amount'), 'QAR')}
        </span>
      ),
    },
    {
      accessorKey: 'new_total',
      header: () => <span className="text-right w-full block">New Total</span>,
      cell: ({ row }) => {
        const v = row.original.new_total
        return (
          <span className="text-xs tabular-nums block text-right font-medium">
            {v != null ? formatCurrency(v, 'QAR') : '—'}
          </span>
        )
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
      cell: ({ row }) => <span className="text-xs tabular-nums">{formatDate(row.getValue('created_at'))}</span>,
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
              <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={(e) => { e.stopPropagation(); setApplyTarget(note) }}>
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

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <FileText className="h-2.5 w-2.5" /> Total notes
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CreditCard className="h-2.5 w-2.5" /> Total amount
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">
            {stats.totalAmount.toLocaleString('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Issued / Pending
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.issuedCount > 0 && 'text-amber-600')}>
            {stats.issuedCount}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Redeemed
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.redeemedCount > 0 && 'text-green-700')}>
            {stats.redeemedCount}
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'px-3 py-1 min-h-11 md:min-h-0 rounded-full text-xs font-medium border transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={creditColumns}
        data={creditNotes}
        isLoading={cnLoading}
        onRowClick={(note: CreditNote) => setDetailNote(note)}
        mobileCardRender={(note: CreditNote) => {
          const s = (note.status ?? 'draft') as CreditNoteStatus
          const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{note.credit_note_id}</span>
                <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{note.invoice_display ?? '—'}</span>
                {note.return_number && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono">{note.return_number}</span>
                  </>
                )}
                <span className="ml-auto tabular-nums">{formatDate(note.created_at)}</span>
              </div>
              <p className="text-sm truncate">{note.customer_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="tabular-nums font-medium">
                  {formatCurrency(note.total_amount, 'QAR')}
                </span>
                {note.new_total != null && (
                  <span className="text-muted-foreground tabular-nums">
                    New: {formatCurrency(note.new_total, 'QAR')}
                  </span>
                )}
              </div>
            </div>
          )
        }}
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
