'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useSaleDeliveries, type SaleDelivery, type DeliveryStatus } from '@/hooks/useSaleDeliveries'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  delivered:   { label: 'Delivered',   className: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',   className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: DeliveryStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function DeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | ''>('')

  const { data: deliveries, isLoading } = useSaleDeliveries({ status: statusFilter })

  const columns = useMemo<ColumnDef<SaleDelivery>[]>(() => [
    {
      accessorKey: 'delivery_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Delivery #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('delivery_number')}</span>,
    },
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => row.original.so_number ?? '—',
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => {
        const d = row.getValue('date') as string
        return d ? formatDate(d) : '—'
      },
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.items ?? []
        return `${items.length} lines`
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
      <PageHeader title="Deliveries" description="Sale order fulfilment tracking" />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <DataTable columns={columns} data={deliveries ?? []} isLoading={isLoading} />
    </PageWrapper>
  )
}
