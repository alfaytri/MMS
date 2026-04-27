'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { SoStatusBadge } from '@/components/sales/SoStatusBadge'
import { SoDetailDialog } from '@/components/sales/SoDetailDialog'
import {
  useSaleOrders,
  useConfirmSO,
  type SaleOrder,
  type SOStatus,
} from '@/hooks/useSaleOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STATUSES: { value: SOStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'partial_delivery', label: 'Partial Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function SaleOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SOStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailSO, setDetailSO] = useState<SaleOrder | null>(null)

  const confirmSO = useConfirmSO()

  const searchRef = useState<ReturnType<typeof setTimeout> | null>(null)
  function handleSearch(val: string) {
    setSearch(val)
    if (searchRef[0]) clearTimeout(searchRef[0])
    searchRef[1](setTimeout(() => setDebouncedSearch(val), 300))
  }

  const { data: orders, isLoading } = useSaleOrders({
    search: debouncedSearch,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<SOStatus, number>> = {}
    ;(orders ?? []).forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    })
    return counts
  }, [orders])

  function handleConfirm(so: SaleOrder) {
    confirmSO.mutate(
      { id: so.id, lineItems: so.sale_order_lines ?? [] },
      {
        onSuccess: () => toast.success(`${so.so_number} confirmed`),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const columns = useMemo<ColumnDef<SaleOrder>[]>(() => [
    {
      accessorKey: 'so_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="SO #" />,
      cell: ({ row }) => (
        <button
          className="font-mono text-sm font-medium text-primary hover:underline"
          onClick={() => setDetailSO(row.original)}
        >
          {row.getValue('so_number')}
        </button>
      ),
    },
    {
      accessorKey: 'customer_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('customer_name') ?? '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <SoStatusBadge status={row.getValue('status')} />,
    },
    {
      accessorKey: 'subtotal',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subtotal" />,
      cell: ({ row }) => <span className="text-sm">{formatCurrency(row.getValue('subtotal'), 'QAR')}</span>,
    },
    {
      accessorKey: 'total',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total (QAR)" />,
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.getValue('total'), 'QAR')}</span>,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.getValue('created_at'))}</span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setDetailSO(row.original)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Sale Orders"
        description="Create and manage customer sale orders"
        actions={
          <Button onClick={() => router.push('/sales/create-so')}>
            + Create Sale Order
          </Button>
        }
      />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted'
            )}
          >
            {s.label}
            {s.value && statusCounts[s.value] !== undefined && (
              <span className={cn(
                'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px]',
                statusFilter === s.value ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
              )}>
                {statusCounts[s.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search SO number or customer…" />
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-36"
            aria-label="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-36"
            aria-label="To date"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo('') }}>
              Clear dates
            </Button>
          )}
        </div>
      </div>

      <DataTable columns={columns} data={orders ?? []} isLoading={isLoading} />

      <SoDetailDialog
        open={!!detailSO}
        onOpenChange={(open) => { if (!open) setDetailSO(null) }}
        so={detailSO}
        onEdit={(so) => router.push(`/sales/edit-so/${so.id}`)}
        onConfirm={handleConfirm}
      />
    </PageWrapper>
  )
}
