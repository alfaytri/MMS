'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SupplierFormDialog } from '@/components/master-data/SupplierFormDialog'
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const { data: suppliers, isLoading } = useSuppliers()

  const columns = useMemo<ColumnDef<Supplier>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
      },
      {
        accessorKey: 'category',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => row.getValue('category') || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'contact_name',
        header: 'Contact',
        cell: ({ row }) => row.getValue('contact_name') || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => row.getValue('phone') || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" className="hidden lg:flex" />,
        cell: ({ row }) => (
          <span className="hidden lg:inline">
            {row.getValue('email') || <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge variant={row.getValue('is_active') ? 'active' : 'inactive'}>
            {row.getValue('is_active') ? 'Active' : 'Inactive'}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open actions" />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(row.original)
                  setDialogOpen(true)
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  )

  return (
    <PageWrapper>
      <PageHeader
        title="Suppliers"
        description="Manage your supplier directory"
        action={{ label: 'Add Supplier', onClick: () => { setEditing(null); setDialogOpen(true) } }}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search suppliers…"
      />

      <DataTable
        columns={columns}
        data={suppliers ?? []}
        isLoading={isLoading}
        globalFilter={search}
      />

      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        supplier={editing}
      />
    </PageWrapper>
  )
}
