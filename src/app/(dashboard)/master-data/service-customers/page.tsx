'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ServiceCustomerFormDialog } from '@/components/master-data/ServiceCustomerFormDialog'
import { useServiceCustomers, type ServiceCustomerRow } from '@/hooks/useServiceCustomers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function formatPrimaryAddress(row: ServiceCustomerRow): string {
  const a = row.primaryAddress
  if (!a) return '—'
  if (a.address_type === 'blue-plate') {
    const parts = [
      a.zone     && `Zone ${a.zone}`,
      a.street   && `St ${a.street}`,
      a.building && `Bldg ${a.building}`,
      a.unit     && `Unit ${a.unit}`,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : (a.label ?? '—')
  }
  if (a.lat != null && a.lng != null) return `${a.lat}, ${a.lng}`
  return a.label ?? '—'
}

export default function ServiceCustomersPage() {
  const [search, setSearch]         = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing]       = useState<ServiceCustomerRow | null>(null)

  const { data: customers = [], isLoading } = useServiceCustomers()

  const columns = useMemo<ColumnDef<ServiceCustomerRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{row.original.name}</span>
            {row.original.is_blocked && (
              <Badge variant="destructive" className="text-[10px]">Blacklisted</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'primary_phone',
        header: 'Primary Phone',
        cell: ({ row }) => (
          <span className="text-sm font-mono text-muted-foreground">
            {row.original.primaryPhone?.phone ?? '—'}
          </span>
        ),
      },
      {
        id: 'primary_address',
        header: () => <span className="hidden md:inline">Primary Address</span>,
        cell: ({ row }) => {
          const a = row.original.primaryAddress
          if (!a) return <span className="hidden md:inline text-muted-foreground text-sm">—</span>
          return (
            <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-[10px] shrink-0">
                {a.address_type === 'blue-plate' ? 'BP' : 'GPS'}
              </Badge>
              <span className="truncate max-w-[200px]">{formatPrimaryAddress(row.original)}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'referral_source',
        header: () => <span className="hidden lg:inline">Found Us Via</span>,
        cell: ({ row }) => (
          <span className="hidden lg:inline text-sm text-muted-foreground capitalize">
            {row.original.referral_source?.replace('-', ' ') ?? '—'}
          </span>
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
        title="Service Customers"
        description="Manage customers for service orders"
        action={{
          label: 'Add Customer',
          onClick: () => { setEditing(null); setDialogOpen(true) },
        }}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name or phone…"
      />

      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        globalFilter={search}
      />

      <ServiceCustomerFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        customer={editing}
      />
    </PageWrapper>
  )
}
