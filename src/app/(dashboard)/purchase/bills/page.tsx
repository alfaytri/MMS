'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
import { useSupplierBills, type ApInvoice } from '@/hooks/useSupplierBills'
import { formatCurrency } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PAY_STATUS_CONFIG: Record<string, string> = {
  unpaid:          'bg-slate-100 text-slate-600',
  partially_paid:  'bg-amber-100 text-amber-700',
  paid:            'bg-green-100 text-green-700',
  overdue:         'bg-red-100 text-red-700',
}

export default function BillsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data: bills, isLoading } = useSupplierBills({ search })
  const columns = useMemo<ColumnDef<ApInvoice>[]>(() => [
    {
      accessorKey: 'invoice_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bill #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('invoice_id')}</span>,
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => row.original.po_number ?? '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount') ?? 0, 'QAR'),
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const s = row.getValue('payment_status') as string
        return <Badge className={cn('text-xs', PAY_STATUS_CONFIG[s] ?? '')}>{s.replace('_', ' ')}</Badge>
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Supplier Bills"
        description="AP invoices with 3-way match verification"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Bill
          </Button>
        }
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search bill # or supplier…" />
      <DataTable
        columns={columns}
        data={bills ?? []}
        isLoading={isLoading}
        onRowClick={(row: ApInvoice) => router.push(`/purchase/bills/${row.id}`)}
      />
      <BillFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageWrapper>
  )
}
