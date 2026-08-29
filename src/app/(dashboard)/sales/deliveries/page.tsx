'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Truck, CheckCircle2, Clock, Package, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useSaleDeliveries, type SaleDelivery, type DeliveryStatus } from '@/hooks/useSaleDeliveries'
import { useSaleOrders, type SaleOrder } from '@/hooks/useSaleOrders'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { DeliveryDetailDialog } from '@/components/sales/DeliveryDetailDialog'
import { SoDeliveryDialog } from '@/components/sales/SoDeliveryDialog'
import { formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-muted text-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  delivered:   { label: 'Delivered',   className: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',   className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: DeliveryStatus | ''; label: string }[] = [
  { value: '',            label: 'All' },
  { value: 'pending',     label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'delivered',   label: 'Delivered' },
  { value: 'cancelled',   label: 'Cancelled' },
]

export default function DeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | ''>('')
  const [detailDelivery, setDetailDelivery] = useState<SaleDelivery | null>(null)
  const [soPickerOpen, setSoPickerOpen] = useState(false)
  const [pickedSo, setPickedSo] = useState<SaleOrder | null>(null)

  const { data: deliveries, isLoading } = useSaleDeliveries({ status: statusFilter })
  // Sale orders that still have stock left to ship — the source list for a new
  // delivery (mirrors the returns page's SO picker).
  const { data: deliverableSOs = [] } = useSaleOrders({ statuses: ['confirmed', 'partial_delivery'] })

  // Scope deliveries to the active division via their sale order's division
  // (mirrors sales/returns). No active division / unknown division → show.
  const { activeDivisionId } = useActiveDivision()
  const scopedDeliveries = useMemo(() => {
    const list = deliveries ?? []
    if (!activeDivisionId) return list
    return list.filter((d) => !d.division_id || d.division_id === activeDivisionId)
  }, [deliveries, activeDivisionId])

  const stats = useMemo(() => {
    const list = scopedDeliveries
    let totalItems = 0
    let deliveredCount = 0
    let pendingCount = 0
    let cancelledCount = 0
    for (const d of list) {
      totalItems += (d.sale_delivery_lines ?? []).reduce((s, l) => s + l.qty_delivered, 0)
      if (d.status === 'delivered') deliveredCount++
      if (d.status === 'pending' || d.status === 'in_progress') pendingCount++
      if (d.status === 'cancelled') cancelledCount++
    }
    return { total: list.length, totalItems, deliveredCount, pendingCount, cancelledCount }
  }, [scopedDeliveries])

  const columns = useMemo<ColumnDef<SaleDelivery>[]>(() => [
    {
      accessorKey: 'delivery_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Delivery #" />,
      cell: ({ row }) => (
        <span className={cn(
          'font-mono text-sm font-medium',
          row.original.type === 'replacement' && 'text-amber-700',
        )}>
          {row.getValue('delivery_number')}
        </span>
      ),
    },
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.so_number ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[160px] block">
          {row.original.customer_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => {
        const d = row.getValue('date') as string
        return <span className="text-xs tabular-nums">{d ? formatDate(d) : '—'}</span>
      },
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const lines = row.original.sale_delivery_lines ?? []
        const totalQty = lines.reduce((s, l) => s + l.qty_delivered, 0)
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="tabular-nums font-medium">{lines.length}</span>
            <span className="text-muted-foreground">line{lines.length === 1 ? '' : 's'}</span>
            {totalQty > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                <Package className="h-2.5 w-2.5" /> {totalQty} units
              </span>
            )}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'pending') as DeliveryStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.pending
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Deliveries"
        description="Sale order fulfilment tracking"
        actions={
          <Button size="sm" onClick={() => setSoPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Delivery
          </Button>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Truck className="h-2.5 w-2.5" /> Total deliveries
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Package className="h-2.5 w-2.5" /> Total items
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">
            {stats.totalItems.toLocaleString('en-QA')}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Delivered
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.deliveredCount > 0 && 'text-green-700')}>
            {stats.deliveredCount}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Pending
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.pendingCount > 0 && 'text-amber-600')}>
            {stats.pendingCount}
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
        columns={columns}
        data={scopedDeliveries}
        isLoading={isLoading}
        onRowClick={(row) => setDetailDelivery(row)}
        mobileCardRender={(del: SaleDelivery) => {
          const s = (del.status ?? 'pending') as DeliveryStatus
          const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.pending
          const lines = del.sale_delivery_lines ?? []
          const totalQty = lines.reduce((sum, l) => sum + l.qty_delivered, 0)
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  'font-mono text-sm font-semibold',
                  del.type === 'replacement' && 'text-amber-700',
                )}>
                  {del.delivery_number}
                </span>
                <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{del.so_number ?? '—'}</span>
                <span className="ml-auto tabular-nums">{del.date ? formatDate(del.date) : '—'}</span>
              </div>
              <p className="text-sm truncate">{del.customer_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="tabular-nums font-medium text-foreground">{lines.length}</span> line{lines.length === 1 ? '' : 's'}
                  {totalQty > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                      <Package className="h-2.5 w-2.5" /> {totalQty}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )
        }}
      />

      <DeliveryDetailDialog
        delivery={detailDelivery}
        onClose={() => setDetailDelivery(null)}
      />

      {/* New delivery — pick a sale order, then reuse the SO view's delivery dialog */}
      <Dialog open={soPickerOpen} onOpenChange={setSoPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New delivery — pick a sale order</DialogTitle>
          </DialogHeader>
          {deliverableSOs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No confirmed sale orders with stock left to deliver.
            </p>
          ) : (
            <Select
              onValueChange={(id) => {
                const so = deliverableSOs.find((s) => s.id === id) ?? null
                if (so) {
                  setPickedSo(so)
                  setSoPickerOpen(false)
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a sale order…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {deliverableSOs.map((so) => (
                  <SelectItem key={so.id} value={so.id}>
                    {so.so_number}
                    {so.customer_name ? ` — ${so.customer_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </DialogContent>
      </Dialog>

      {pickedSo && (
        <SoDeliveryDialog
          open
          onOpenChange={(o) => { if (!o) setPickedSo(null) }}
          so={pickedSo}
        />
      )}
    </PageWrapper>
  )
}
