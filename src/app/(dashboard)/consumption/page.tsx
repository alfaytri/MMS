'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { ChevronRight, HandCoins, MapPin, Package, Plus, Users2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { useHasPermission } from '@/hooks/usePermissions'
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
  type ConsumerType,
  type ConsumptionListRow,
  type ConsumptionStatus,
} from '@/hooks/useConsumption'
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
  { value: 'team',     label: 'Team' },
  { value: 'place',    label: 'Place' },
  { value: 'internal', label: 'Internal' },
]

const STATUSES: { value: ConsumptionStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All statuses' },
  { value: 'posted',    label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
]

function ConsumerIcon({ type }: { type: ConsumerType }) {
  if (type === 'team')  return <Users2  className="h-3 w-3 text-muted-foreground" />
  if (type === 'place') return <MapPin  className="h-3 w-3 text-muted-foreground" />
  return <Package className="h-3 w-3 text-muted-foreground" />
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function ConsumptionPage() {
  const [status,       setStatus]       = useState<ConsumptionStatus | 'all'>('all')
  const [consumerType, setConsumerType] = useState<ConsumerType      | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const { data: rows = [], isLoading } = useConsumptionList({
    status,
    consumerType,
    fromDate: fromDate || null,
    toDate:   toDate   || null,
  })

  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const canCreate = useHasPermission('consumption.create')

  const totals = useMemo(() => {
    const posted = rows.filter((r) => r.status === 'posted')
    return {
      count:      rows.length,
      postedCount: posted.length,
      postedValue: posted.reduce((sum, r) => sum + r.total_value, 0),
    }
  }, [rows])

  const columns = useMemo<ColumnDef<ConsumptionListRow>[]>(() => [
    {
      accessorKey: 'ce_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CE #" />,
      cell: ({ row }) => (
        <span className="font-medium text-xs tabular-nums">{row.original.ce_number}</span>
      ),
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
            <div className="text-xs font-medium truncate">{row.original.consumer_display}</div>
            <div className="text-[10px] text-muted-foreground capitalize">
              {row.original.consumer_type}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'lines',
      header: () => <span className="text-right block">Lines</span>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums text-xs">{row.original.line_count}</div>
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
  ], [])

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entries</div>
          <div className="text-lg font-semibold tabular-nums">{totals.count}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Posted</div>
          <div className="text-lg font-semibold tabular-nums">{totals.postedCount}</div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-lg border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Posted COGS</div>
          <div className="text-lg font-semibold tabular-nums">{QAR.format(totals.postedValue)}</div>
        </div>
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
          title: 'No consumption entries yet',
          description: 'Post a consumption to deduct stock and book COGS to a consumer.',
          action: canCreate ? (
            <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Consumption
            </Button>
          ) : undefined,
        }}
      />

      <NewConsumptionDialog open={newOpen} onOpenChange={setNewOpen} />
      <ConsumptionDetailDialog
        open={!!detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
        consumptionId={detailId}
      />
    </PageWrapper>
  )
}
