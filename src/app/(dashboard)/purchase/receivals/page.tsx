'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ReceivalFormDialog } from '@/components/purchase/ReceivalFormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useReceivals, useApproveReceival, type Receival, type ReceivalStatus } from '@/hooks/useReceivals'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<ReceivalStatus, { label: string; className: string }> = {
  pending_approval: { label: 'Pending',  className: 'bg-amber-100 text-amber-700' },
  approved:         { label: 'Approved', className: 'bg-green-100 text-green-700' },
  rejected:         { label: 'Rejected', className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: ReceivalStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function ReceivalsPage() {
  const [statusFilter, setStatusFilter] = useState<ReceivalStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [approving, setApproving] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null)

  const { data: receivals, isLoading } = useReceivals({ status: statusFilter })
  const approveReceival = useApproveReceival()

  const columns = useMemo<ColumnDef<Receival>[]>(() => [
    {
      accessorKey: 'receival_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Receival #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('receival_number')}</span>,
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => row.original.po_number ?? '—',
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => `${row.original.receival_items?.length ?? 0} lines`,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as ReceivalStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.pending_approval
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) =>
        row.original.status === 'pending_approval' ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-green-600 hover:text-green-700"
              onClick={() => setApproving({ id: row.original.id, action: 'approved' })}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setApproving({ id: row.original.id, action: 'rejected' })}
            >
              <XCircle className="w-4 h-4 mr-1" /> Reject
            </Button>
          </div>
        ) : null,
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Receivals"
        description="Goods received from Purchase Orders"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Receival
          </Button>
        }
      />

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

      <DataTable columns={columns} data={receivals ?? []} isLoading={isLoading} />

      <ReceivalFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {approving && (
        <ConfirmDialog
          open
          onOpenChange={(v) => { if (!v) setApproving(null) }}
          title={approving.action === 'approved' ? 'Approve Receival?' : 'Reject Receival?'}
          description={
            approving.action === 'approved'
              ? 'This will mark the receival as approved and allow bill creation against it.'
              : 'This will reject the receival. It cannot be undone.'
          }
          confirmLabel={approving.action === 'approved' ? 'Approve' : 'Reject'}
          variant={approving.action === 'rejected' ? 'destructive' : 'default'}
          onConfirm={async () => {
            await approveReceival.mutateAsync({ id: approving.id, action: approving.action })
            toast.success(approving.action === 'approved' ? 'Receival approved' : 'Receival rejected')
            setApproving(null)
          }}
        />
      )}
    </div>
  )
}
