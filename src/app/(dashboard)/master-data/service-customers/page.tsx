'use client'

import { useState, useMemo, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Phone } from 'lucide-react'
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
import { cn } from '@/lib/utils'

// ── Debounce hook ──────────────────────────────────────────────────────────────
// Delays the value update so the query only fires after the user pauses typing.
// The page is reset immediately in the onChange handler (not here), so when the
// debounced value finally updates both page=0 and new search are already in
// state — resulting in a single query with the correct offset.
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

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

const PAGE_SIZE = 20

export default function ServiceCustomersPage() {
  const [search, setSearch]               = useState('')
  const [page, setPage]                   = useState(0)
  const [multiplePhones, setMultiPhones]  = useState(false)
  const [dialogOpen, setDialogOpen]       = useState(false)
  const [editing, setEditing]             = useState<ServiceCustomerRow | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  // Reset page immediately on search change so when the debounce fires the
  // query key already has page=0 — no stale-page 416 errors.
  const handleSearchChange = (val: string) => {
    setSearch(val)
    setPage(0)
  }

  const handleFilterToggle = () => {
    setMultiPhones((prev) => !prev)
    setPage(0)
  }

  const { data, isLoading } = useServiceCustomers(
    debouncedSearch,
    page,
    PAGE_SIZE,
    { multiplePhones },
  )
  const customers = data?.data ?? []
  const total     = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
        cell: ({ row }) => {
          const { primaryPhone, allPhones } = row.original
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-mono text-muted-foreground">
                {primaryPhone?.phone ?? '—'}
              </span>
              {allPhones.length > 1 && (
                <span className="text-[10px] text-muted-foreground/60">
                  +{allPhones.length - 1} more
                </span>
              )}
            </div>
          )
        },
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
    [],
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by name or phone…"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFilterToggle}
            className={cn(
              'h-10 gap-1.5 text-sm transition-colors',
              multiplePhones && 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary',
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            Multiple phones
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        manualPagination={{ pageIndex: page, pageCount, total, onPageChange: setPage }}
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
