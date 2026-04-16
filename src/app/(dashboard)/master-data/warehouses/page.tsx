'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { WarehouseFormDialog } from '@/components/master-data/WarehouseFormDialog'
import { useWarehouses, type Warehouse } from '@/hooks/useWarehouses'
import { formatNumber } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function WarehousesPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const { data: warehouses, isLoading } = useWarehouses()

  const columns = useMemo<ColumnDef<Warehouse>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) =>
          row.getValue('location') || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'item_count',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Items" className="hidden md:flex" />
        ),
        cell: ({ row }) => (
          <span className="hidden md:inline">
            {formatNumber(row.getValue('item_count') as number)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Open actions"
                />
              }
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
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Manage warehouse locations"
        action={{
          label: 'Add Warehouse',
          onClick: () => {
            setEditing(null)
            setDialogOpen(true)
          },
        }}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search warehouses…"
      />

      <DataTable
        columns={columns}
        data={warehouses ?? []}
        isLoading={isLoading}
        globalFilter={search}
      />

      <WarehouseFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        warehouse={editing}
      />
    </div>
  )
}
