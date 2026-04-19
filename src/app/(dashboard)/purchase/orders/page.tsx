'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RfqFormDialog } from '@/components/purchase/RfqFormDialog'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { PoStatusBadge } from '@/components/purchase/PoStatusBadge'
import { PoApprovalChain } from '@/components/purchase/PoApprovalChain'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { usePurchaseOrders, type PurchaseOrder, type POStatus } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUSES: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)
  const [rfqOpen, setRfqOpen] = useState(false)
  const [billPoId, setBillPoId] = useState<string | null>(null)

  const { data: orders, isLoading } = usePurchaseOrders({
    search: search,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<POStatus, number>> = {}
    ;(orders ?? []).forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    })
    return counts
  }, [orders])

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(() => [
    {
      accessorKey: 'po_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="PO #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('po_number')}</span>,
    },
    {
      accessorKey: 'supplier_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('supplier_name')}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <PoStatusBadge status={row.getValue('status')} />,
    },
    {
      accessorKey: 'currency',
      header: 'CCY',
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.getValue('currency')}</Badge>,
    },
    {
      accessorKey: 'subtotal',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subtotal" />,
      cell: ({ row }) => (
        <span className="text-sm">{formatCurrency(row.getValue('subtotal'), row.original.currency)}</span>
      ),
    },
    {
      accessorKey: 'total_qar',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total (QAR)" />,
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency(row.getValue('total_qar'), 'QAR')}</span>
      ),
    },
    {
      accessorKey: 'created_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.getValue('created_date'))}</span>
      ),
    },
    {
      id: 'approvals',
      header: 'Approvals',
      cell: ({ row }) => {
        const steps = row.original.po_approvals ?? []
        return steps.length > 0
          ? <PoApprovalChain steps={steps} />
          : <span className="text-muted-foreground text-xs">—</span>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const po = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Row actions">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailPO(po)}>
                View
              </DropdownMenuItem>
              {po.status === 'draft' && (
                <DropdownMenuItem onClick={() => router.push(`/purchase/edit-po/${po.id}`)}>
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setBillPoId(po.id)}>
                Create Bill
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Manage POs, payments, deliveries and approvals"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRfqOpen(true)}>
              RFQ
            </Button>
            <Button onClick={() => router.push('/purchase/create-po')}>
              + Create PO
            </Button>
          </div>
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
        <SearchInput value={search} onChange={setSearch} placeholder="Search PO number or supplier…" />
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

      <PoDetailDialog
        open={!!detailPO}
        onOpenChange={(open) => { if (!open) setDetailPO(null) }}
        po={detailPO}
        onEdit={(po) => router.push(`/purchase/edit-po/${po.id}`)}
      />

      <RfqFormDialog
        open={rfqOpen}
        onOpenChange={setRfqOpen}
      />

      {billPoId && (
        <BillFormDialog
          open={!!billPoId}
          onOpenChange={(v) => { if (!v) setBillPoId(null) }}
          initialPoId={billPoId}
        />
      )}
    </div>
  )
}
