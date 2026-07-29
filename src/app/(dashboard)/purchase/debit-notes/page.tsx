'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import {
  FileText, ShoppingCart, RotateCcw, TrendingDown, CheckCircle2, AlertTriangle, Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { CreditDebitNoteDownloadButton } from '@/components/sales/CreditDebitNoteDownloadButton'
import { CreditDebitNoteDetailDialog } from '@/components/sales/CreditDebitNoteDetailDialog'
import { useDebitNotes, type CreditNoteStatus } from '@/hooks/useCreditNotes'
import type { DebitNote, DebitNoteLine } from '@/types/invoice'

/** DebitNote row with joined relations from the useDebitNotes hook */
type DebitNoteRow = DebitNote & {
  debit_note_lines?: DebitNoteLine[]
  po_number?: string | null
  return_number?: string | null
}
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  open:        { label: 'Open',        className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  resolved:    { label: 'Resolved',    className: 'bg-green-100 text-green-700' },
  void:        { label: 'Void',        className: 'bg-muted text-muted-foreground' },
}

const STATUS_FILTERS: { value: '' | CreditNoteStatus; label: string }[] = [
  { value: '',            label: 'All' },
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'void',        label: 'Void' },
]

export default function DebitNotesPage() {
  const [detailNote, setDetailNote] = useState<DebitNoteRow | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | CreditNoteStatus>('')
  const searchParams = useSearchParams()

  const { data: debitNotes = [], isLoading } = useDebitNotes()

  // Deep-link support: `?dn=<id>` auto-opens the detail dialog once the list
  // has loaded. Used by the supplier credit-balance popup (opens in new tab).
  useEffect(() => {
    const dnId = searchParams.get('dn')
    if (!dnId || detailNote) return
    const match = debitNotes.find((n) => n.id === dnId)
    if (match) setDetailNote(match as DebitNoteRow)
  }, [searchParams, debitNotes, detailNote])

  // Client-side filter — DN#, supplier, PO#, Return#
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return debitNotes.filter((n) => {
      if (statusFilter && (n.status ?? 'open') !== statusFilter) return false
      if (!q) return true
      const hay = [n.debit_note_id, n.supplier_name, n.po_number, n.return_number]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [debitNotes, search, statusFilter])

  // Stat strip metrics — computed from the full (unfiltered) list
  const stats = useMemo(() => {
    let totalDebit = 0
    let unresolved = 0
    let resolved   = 0
    for (const n of debitNotes) {
      totalDebit += n.total_amount ?? 0
      const s = n.status ?? 'open'
      if (s === 'resolved') resolved++
      if (!n.resolution_type && (s === 'open' || s === 'in_progress')) unresolved++
    }
    return { total: debitNotes.length, totalDebit, unresolved, resolved }
  }, [debitNotes])

  const columns = useMemo<ColumnDef<DebitNoteRow>[]>(() => [
    {
      accessorKey: 'debit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="DN #" />,
      cell: ({ row }) => (
        <button
          type="button"
          className="font-mono text-sm font-semibold text-primary hover:underline underline-offset-2"
          onClick={() => setDetailNote(row.original)}
        >
          {row.getValue('debit_note_id')}
        </button>
      ),
    },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[180px] block">
          {row.original.supplier_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'po_ref',
      header: 'PO #',
      cell: ({ row }) => {
        const po = row.original.po_number
        return po ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <ShoppingCart className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{po}</span>
          </span>
        ) : <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: ({ row }) => {
        const ret = row.original.return_number
        return ret ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <RotateCcw className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{ret}</span>
          </span>
        ) : <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => (
        <div className="text-right w-full"><DataTableColumnHeader column={column} title="Debit" /></div>
      ),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-semibold text-destructive">
          {formatCurrency(row.getValue('total_amount'), row.original.currency ?? 'QAR')}
        </span>
      ),
    },
    {
      accessorKey: 'new_total',
      header: () => <span className="text-right w-full block">New PO Total</span>,
      cell: ({ row }) => {
        const v = row.original.new_total
        return v != null
          ? <span className="text-xs tabular-nums block text-right">{formatCurrency(v, row.original.currency ?? 'QAR')}</span>
          : <span className="text-xs text-muted-foreground block text-right">—</span>
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'open') as CreditNoteStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.open
        return <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'resolution',
      header: 'Resolution',
      cell: ({ row }) => {
        const resolution = row.original.resolution_type
        if (resolution === 'supplier_credit') {
          return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 gap-1"><Wallet className="h-2.5 w-2.5" />Supplier Credit</Badge>
        }
        if (resolution === 'replacement') {
          return <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Replacement</Badge>
        }
        return <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle className="h-2.5 w-2.5" />Unresolved</span>
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatDate(row.getValue('created_at'))}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const note = row.original
        if (!note.debit_note_lines?.length) return null
        return (
          <CreditDebitNoteDownloadButton
            note={note}
            noteKind="debit"
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
            <TrendingDown className="h-2.5 w-2.5" /> Total debit
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight text-destructive">
            {stats.totalDebit.toLocaleString('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> Unresolved
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.unresolved > 0 && 'text-amber-600')}>
            {stats.unresolved}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.resolved > 0 && 'text-success')}>
            {stats.resolved}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search DN #, supplier, PO # or Return #…" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1 min-h-11 md:min-h-0 rounded-full text-xs font-medium border transition-colors',
                statusFilter === f.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        onRowClick={(note: DebitNoteRow) => setDetailNote(note)}
        mobileCardRender={(note: DebitNoteRow) => {
          const s = (note.status ?? 'open') as CreditNoteStatus
          const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.open
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-primary">{note.debit_note_id}</span>
                <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
              </div>
              <p className="text-sm truncate">{note.supplier_name ?? '—'}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {note.po_number && (
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span className="font-mono">{note.po_number}</span>
                  </span>
                )}
                {note.return_number && (
                  <span className="inline-flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" />
                    <span className="font-mono">{note.return_number}</span>
                  </span>
                )}
                <span className="ml-auto tabular-nums font-semibold text-destructive">
                  {formatCurrency(note.total_amount, note.currency ?? 'QAR')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {note.resolution_type === 'supplier_credit' && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 gap-1"><Wallet className="h-2.5 w-2.5" />Supplier Credit</Badge>
                )}
                {note.resolution_type === 'replacement' && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Replacement</Badge>
                )}
                {!note.resolution_type && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle className="h-2.5 w-2.5" />Unresolved</span>
                )}
              </div>
            </div>
          )
        }}
      />

      <CreditDebitNoteDetailDialog
        note={detailNote}
        noteKind="debit"
        referenceNumber={detailNote?.po_number ?? '—'}
        open={!!detailNote}
        onOpenChange={(v) => { if (!v) setDetailNote(null) }}
      />
    </PageWrapper>
  )
}
