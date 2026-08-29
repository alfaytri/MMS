'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { ChevronRight, HandCoins, Package, Plus, Users2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { useCanCreateAnyConsumption, useHasPermission } from '@/hooks/usePermissions'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { NewConsumptionDialog } from '@/components/consumption/NewConsumptionDialog'
import { ConsumptionDetailDialog } from '@/components/consumption/ConsumptionDetailDialog'
import {
  useConsumptionList,
  useConsumerLabel,
  type ConsumerType,
  type ConsumptionListRow,
  type ConsumptionStatus,
} from '@/hooks/useConsumption'
import { useDivisionScopedVisibility } from '@/hooks/useWarehouseSubContainers'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 2,
})

// ─── Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ConsumptionStatus, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-muted text-muted-foreground' },
  posted:    { label: 'Posted',    className: 'bg-success/10 text-success border-success/30' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

const CONSUMER_TYPES: { value: ConsumerType | 'all'; label: string }[] = [
  { value: 'all',      label: 'All consumers' },
  { value: 'custody',  label: 'Custody' },
  { value: 'internal', label: 'Internal' },
]

const STATUSES: { value: ConsumptionStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All statuses' },
  { value: 'posted',    label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
]

function ConsumerIcon({ type }: { type: ConsumerType }) {
  if (type === 'custody') return <Users2 className="h-3 w-3 text-muted-foreground" />
  return <Package className="h-3 w-3 text-muted-foreground" />
}

// Service vs Team-item entry — replaces the old page-level tabs so the split is
// still visible per row now that both kinds share one list.
function TypeBadge({ isTeam }: { isTeam: boolean }) {
  return isTeam ? (
    <Badge className="text-[10px] h-4 px-1.5 border-0 bg-primary/10 text-primary hover:bg-primary/10 gap-1">
      <Users2 className="h-2.5 w-2.5" /> Team
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1 text-muted-foreground">
      <Package className="h-2.5 w-2.5" /> Service
    </Badge>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function ConsumptionPage() {
  const [status,       setStatus]       = useState<ConsumptionStatus | 'all'>('all')
  const [consumerType, setConsumerType] = useState<ConsumerType      | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  // Service + Team-item entries are listed together — the page-level tabs were
  // removed now that the Service/Team switch lives inside the New Consumption
  // dialog. `teamItems` omitted → the query returns both; each row carries a
  // Type badge so the two stay distinguishable.
  const { data: rawRows = [], isLoading } = useConsumptionList({
    status,
    consumerType,
    fromDate: fromDate || null,
    toDate:   toDate   || null,
  })
  // Scope the history to the active-division view (top-bar selector). Each entry
  // carries its source sub-container, whose division decides visibility.
  const divVisible = useDivisionScopedVisibility()
  const rows = useMemo(
    () => rawRows.filter((r) => divVisible(r.source_sub_container_id)),
    [rawRows, divVisible],
  )

  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  // True if the caller can create at least ONE consumer type — the dialog
  // itself further filters the segmented control based on which types they
  // actually hold.
  const canCreate = useCanCreateAnyConsumption()
  // COGS is accounting-sensitive. Field users (consumption.view without
  // consumption.cost.view) may post consumption but must not see cost — gate
  // every money figure on this list behind the same permission the New/Detail
  // dialogs use.
  const canSeeCost = useHasPermission('consumption.cost.view')
  // Resolve the consumer custody-location name from the cross-division master
  // list so cross-division rows never render as "(location removed)".
  const consumerLabel = useConsumerLabel()

  const totals = useMemo(() => {
    const posted = rows.filter((r) => r.status === 'posted')
    return {
      count:      rows.length,
      postedCount: posted.length,
      postedValue: posted.reduce((sum, r) => sum + r.total_value, 0),
    }
  }, [rows])

  const columns = useMemo<ColumnDef<ConsumptionListRow>[]>(() => {
    const cols: ColumnDef<ConsumptionListRow>[] = [
    {
      accessorKey: 'ce_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CE #" />,
      cell: ({ row }) => (
        <span className="font-medium text-xs tabular-nums">{row.original.ce_number}</span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <TypeBadge isTeam={row.original.is_team_item} />,
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="text-xs">{row.original.date}</span>,
    },
    {
      id: 'source',
      header: 'Source',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">{row.original.source_warehouse_name ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground truncate">{row.original.source_sub_container_name ?? '—'}</div>
        </div>
      ),
    },
    {
      id: 'consumer',
      header: 'Consumer',
      cell: ({ row }) => (
        <div className="min-w-0 flex items-center gap-1.5">
          <ConsumerIcon type={row.original.consumer_type} />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{consumerLabel(row.original)}</div>
            <div className="text-[10px] text-muted-foreground capitalize">
              {row.original.consumer_type}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.items
        const head = items.slice(0, 2).map((i) => `${i.item_name} ×${i.qty}`).join(', ')
        const label = items.length > 2 ? `${head} +${items.length - 2} more` : (head || '—')
        return (
          <span className="text-xs truncate max-w-[240px] block" title={label}>{label}</span>
        )
      },
    },
    {
      id: 'notes',
      header: 'Notes',
      cell: ({ row }) => (
        <span
          className="text-xs text-muted-foreground truncate max-w-[180px] block"
          title={row.original.notes ?? ''}
        >
          {row.original.notes || '—'}
        </span>
      ),
    },
    {
      id: 'total',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      accessorFn: (r) => r.total_value,
      cell: ({ row }) => (
        <div className="text-right tabular-nums text-xs font-medium">
          {QAR.format(row.original.total_value)}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status]
        return (
          <Badge className={cn('text-[10px] h-4 px-1.5 border-0 hover:bg-current/10', cfg.className)}>
            {cfg.label}
          </Badge>
        )
      },
    },
    ]
    // Hide the COGS column entirely from users without pricing visibility.
    return canSeeCost ? cols : cols.filter((c) => c.id !== 'total')
  }, [canSeeCost, consumerLabel])

  return (
    <PageWrapper>
      <PageHeader
        title="Consumption"
        description="Deducts stock from a source location and books COGS to a team, customer site, customer, or internal use."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Operations</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Consumption</span>
          </nav>
        }
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Consumption
            </Button>
          ) : null
        }
      />

      {/* Stat strip */}
      <div className={cn('grid gap-2', canSeeCost ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entries</div>
          <div className="text-lg font-semibold tabular-nums">{totals.count}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Posted</div>
          <div className="text-lg font-semibold tabular-nums">{totals.postedCount}</div>
        </div>
        {canSeeCost && (
          <div className="col-span-2 sm:col-span-1 rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Posted COGS</div>
            <div className="text-lg font-semibold tabular-nums">{QAR.format(totals.postedValue)}</div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ConsumptionStatus | 'all')}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Consumer</Label>
          <Select value={consumerType} onValueChange={(v) => setConsumerType(v as ConsumerType | 'all')}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONSUMER_TYPES.map((s) => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">From</Label>
          <Input type="date" className="h-8 text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">To</Label>
          <Input type="date" className="h-8 text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        onRowClick={(row) => setDetailId(row.id)}
        emptyState={{
          icon: <HandCoins className="h-6 w-6 text-muted-foreground" />,
          title: 'No consumption yet',
          description: "Items consumed from a warehouse or a team's custody appear here.",
          action: canCreate ? (
            <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Consumption
            </Button>
          ) : undefined,
        }}
        mobileCardRender={(row) => {
          const cfg = STATUS_CONFIG[row.status]
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-sm tabular-nums">{row.ce_number}</span>
                  <TypeBadge isTeam={row.is_team_item} />
                </div>
                <Badge className={cn('text-[10px] h-4 px-1.5 border-0', cfg.className)}>{cfg.label}</Badge>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <ConsumerIcon type={row.consumer_type} />
                <span className="text-xs font-medium truncate">{consumerLabel(row)}</span>
                <span className="text-[10px] text-muted-foreground capitalize shrink-0">· {row.consumer_type}</span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {row.source_warehouse_name ?? '—'}{row.source_sub_container_name ? ` · ${row.source_sub_container_name}` : ''}
              </div>
              <div className="text-[11px] truncate">
                {row.items.length
                  ? (row.items.slice(0, 2).map((i) => `${i.item_name} ×${i.qty}`).join(', ') + (row.items.length > 2 ? ` +${row.items.length - 2} more` : ''))
                  : '—'}
              </div>
              {row.notes && (
                <div className="text-[11px] text-muted-foreground truncate" title={row.notes}>📝 {row.notes}</div>
              )}
              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-muted-foreground tabular-nums">{row.date} · {row.line_count} line{row.line_count === 1 ? '' : 's'}</span>
                {canSeeCost && <span className="font-semibold tabular-nums">{QAR.format(row.total_value)}</span>}
              </div>
            </div>
          )
        }}
      />

      {/* The Service/Team switch lives INSIDE the dialog (defaults to Service). */}
      <NewConsumptionDialog open={newOpen} onOpenChange={setNewOpen} />
      <ConsumptionDetailDialog
        open={!!detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
        consumptionId={detailId}
      />
    </PageWrapper>
  )
}
