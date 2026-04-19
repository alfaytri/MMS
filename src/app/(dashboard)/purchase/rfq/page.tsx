'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { RfqFormDialog } from '@/components/purchase/RfqFormDialog'
import { useRfqs, useUpdateRfq, type Rfq, type RfqStatus } from '@/hooks/useRfqs'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<RfqStatus, { label: string; className: string }> = {
  draft:      { label: 'Draft',     className: 'bg-slate-100 text-slate-700' },
  sent:       { label: 'Sent',      className: 'bg-blue-100 text-blue-700' },
  received:   { label: 'Received',  className: 'bg-amber-100 text-amber-700' },
  cancelled:  { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: RfqStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function RfqPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RfqStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editRfq, setEditRfq] = useState<Rfq | null>(null)

  const { data: rfqs, isLoading } = useRfqs({ status: statusFilter })
  const updateRfq = useUpdateRfq()

  const filtered = useMemo(() => {
    if (!search) return rfqs ?? []
    const q = search.toLowerCase()
    return (rfqs ?? []).filter(
      (r) => r.rfq_number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)
    )
  }, [rfqs, search])

  const columns = useMemo<ColumnDef<Rfq>[]>(() => [
    {
      accessorKey: 'rfq_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="RFQ #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.getValue('rfq_number')}</span>
      ),
    },
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due Date" />,
      cell: ({ row }) => formatDate(row.getValue('due_date')),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => (row.original.rfq_line_items?.length ?? 0) + ' items',
    },
    {
      id: 'suppliers',
      header: 'Suppliers',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {(row.original.suppliers ?? []).slice(0, 2).join(', ')}
          {(row.original.suppliers?.length ?? 0) > 2 ? ` +${row.original.suppliers!.length - 2}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as RfqStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft
        return <Badge className={cn('text-xs font-medium', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditRfq(row.original)}>
            Edit
          </Button>
          {row.original.status === 'draft' && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await updateRfq.mutateAsync({ id: row.original.id, status: 'sent' })
                toast.success('RFQ marked as sent')
              }}
            >
              Mark Sent
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(
                `/purchase/orders/create?rfq_ref=${row.original.rfq_number}`
              )
            }
          >
            <ExternalLink className="w-3 h-3 mr-1" /> Ref on PO
          </Button>
        </div>
      ),
    },
  ], [router, updateRfq])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="RFQ"
        description="Request for Quotation"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create RFQ
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

      <SearchInput value={search} onChange={setSearch} placeholder="Search RFQ # or title…" />

      <DataTable columns={columns} data={filtered} isLoading={isLoading} />

      <RfqFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editRfq && (
        <RfqFormDialog
          open={!!editRfq}
          onOpenChange={(v) => { if (!v) setEditRfq(null) }}
          rfq={editRfq}
        />
      )}
    </div>
  )
}
