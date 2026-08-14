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
import { useSuppliers, type SupplierWithCurrency } from '@/hooks/useSuppliers'
import { useDivisions } from '@/hooks/useDivisions'
import { useSupplierCreditBalances, groupBalancesByParty } from '@/hooks/useCreditBalances'
import { CreditBalanceDialog } from '@/components/shared/CreditBalanceDialog'
import { Badge } from '@/components/ui/badge'
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
  const [editing, setEditing] = useState<SupplierWithCurrency | null>(null)
  const [balanceView, setBalanceView] = useState<{ id: string; name: string } | null>(null)
  const { data: suppliers, isLoading } = useSuppliers()
  const { data: divisions = [] } = useDivisions()
  const { data: balances = [] } = useSupplierCreditBalances()
  const balanceMap = useMemo(() => groupBalancesByParty(balances), [balances])
  const divisionMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of divisions) m.set(d.id, d.short_name || d.name)
    return m
  }, [divisions])

  const columns = useMemo<ColumnDef<SupplierWithCurrency>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
      },
      {
        accessorKey: 'supplier_type',
        header: 'Type',
        cell: ({ row }) => {
          const t = row.getValue('supplier_type') as string | null
          if (!t) return <span className="text-muted-foreground">—</span>
          return (
            <Badge variant={t === 'international' ? 'secondary' : 'outline'} className="text-[10px] capitalize">
              {t}
            </Badge>
          )
        },
      },
      {
        id: 'scope',
        header: 'Scope',
        cell: ({ row }) => {
          const divId = row.original.division_id
          if (!divId) {
            return <Badge variant="outline" className="text-[10px] text-muted-foreground">Global</Badge>
          }
          return <Badge variant="secondary" className="text-[10px]">{divisionMap.get(divId) ?? 'Division'}</Badge>
        },
      },
      {
        accessorKey: 'country',
        header: 'Country',
        cell: ({ row }) => row.getValue('country') || <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'currency',
        header: 'Currency',
        cell: ({ row }) => {
          const c = row.original.currencies
          if (!c) return <span className="text-muted-foreground">—</span>
          return <Badge variant="outline" className="text-[10px] font-mono">{c.code}</Badge>
        },
      },
      {
        id: 'credit_balance',
        header: 'Credit Balance',
        cell: ({ row }) => {
          const rows = balanceMap.get(row.original.id) ?? []
          if (rows.length === 0) return <span className="text-muted-foreground">—</span>
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setBalanceView({ id: row.original.id, name: row.original.name })
              }}
              className="flex flex-wrap items-center gap-1 hover:opacity-80"
              title="Click for details"
            >
              {rows.map((r) => (
                <Badge
                  key={r.currency}
                  variant="outline"
                  className="text-[10px] font-mono border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300"
                >
                  {r.currency} {r.open_amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Badge>
              ))}
            </button>
          )
        },
      },
      {
        accessorKey: 'category',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" className="hidden lg:flex" />,
        cell: ({ row }) => (
          <span className="hidden lg:inline">
            {row.getValue('category') || <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      {
        accessorKey: 'contact_name',
        header: 'Contact',
        cell: ({ row }) => row.getValue('contact_name') || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" className="hidden md:flex" />,
        cell: ({ row }) => (
          <span className="hidden md:inline">
            {row.getValue('phone') || <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" className="hidden xl:flex" />,
        cell: ({ row }) => (
          <span className="hidden xl:inline">
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
              render={<Button variant="ghost" size="icon" className="h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0" aria-label="Open actions" />}
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
    [balanceMap, divisionMap]
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
        onRowClick={(supplier) => {
          setEditing(supplier)
          setDialogOpen(true)
        }}
        mobileCardRender={(supplier: SupplierWithCurrency) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{supplier.name}</span>
              <StatusBadge variant={supplier.is_active ? 'active' : 'inactive'}>
                {supplier.is_active ? 'Active' : 'Inactive'}
              </StatusBadge>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              {supplier.supplier_type && (
                <Badge variant={supplier.supplier_type === 'international' ? 'secondary' : 'outline'} className="text-[10px] capitalize">
                  {supplier.supplier_type}
                </Badge>
              )}
              {supplier.division_id
                ? <Badge variant="secondary" className="text-[10px]">{divisionMap.get(supplier.division_id) ?? 'Division'}</Badge>
                : <Badge variant="outline" className="text-[10px] text-muted-foreground">Global</Badge>}
              {supplier.country && <span>{supplier.country}</span>}
              {supplier.currencies?.code && (
                <Badge variant="outline" className="text-[10px] font-mono">{supplier.currencies.code}</Badge>
              )}
            </div>
            {supplier.contact_name && (
              <p className="text-xs text-muted-foreground truncate">{supplier.contact_name}</p>
            )}
          </div>
        )}
      />

      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        supplier={editing}
      />

      {balanceView && (
        <CreditBalanceDialog
          open={!!balanceView}
          onOpenChange={(o) => { if (!o) setBalanceView(null) }}
          partyId={balanceView.id}
          partyName={balanceView.name}
          kind="supplier"
        />
      )}
    </PageWrapper>
  )
}
