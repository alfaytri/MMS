# MMS Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all Phase 1 Master Data pages — Suppliers, Companies & Divisions, Warehouses, Inventory Items, Users & Roles, Audit Trail, and Admin settings — with full CRUD, shared table/form infrastructure, and responsive design across all breakpoints.

**Architecture:** Each Master Data page follows the same pattern: a TanStack Query hook for data fetching + mutations, a zod-validated form dialog for create/edit, and a page component with a DataTable. All pages live under `src/app/(dashboard)/master-data/` and share reusable components from `src/components/shared/`. Hooks use the browser Supabase client; pages are client components that own local UI state (dialog open, selected row).

**Tech Stack:** Next.js 15, TypeScript, TanStack Query v5, TanStack Table v8, Supabase, shadcn/ui (Base UI), react-hook-form + zod v4 + @hookform/resolvers, sonner (toasts), Tailwind CSS

**Design Spec:** `docs/superpowers/specs/2026-04-16-mms-phase1-design.md`
**Schema Reference:** `Old Schema/` folder (01, 02, 04, 07, 11, 13, 16)
**UI Reference:** `Ideas/Master Data.txt`
**Foundation Plan:** `docs/superpowers/plans/2026-04-16-mms-foundation.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Add @tanstack/react-table, @hookform/resolvers, sonner |
| `src/app/layout.tsx` | Add Toaster from sonner |
| `src/lib/utils/formatters.ts` | Currency, date, number formatting helpers |
| `src/lib/utils/formatters.test.ts` | Unit tests for formatters |
| `src/components/shared/DataTable.tsx` | Generic sortable, filterable, paginated table |
| `src/components/shared/DataTableColumnHeader.tsx` | Sortable column header with arrow icon |
| `src/components/shared/DataTablePagination.tsx` | Page size selector + page navigation |
| `src/components/shared/PageHeader.tsx` | Page title + optional action button |
| `src/components/shared/SearchInput.tsx` | Debounced search input |
| `src/components/shared/StatusBadge.tsx` | Active/inactive/custom status badge |
| `src/components/shared/ConfirmDialog.tsx` | Confirm-action dialog (archive, delete) |
| `src/hooks/useSuppliers.ts` | Suppliers query + create/update mutations |
| `src/hooks/useCompanies.ts` | Companies query + create/update mutations |
| `src/hooks/useDivisions.ts` | **Modify:** add create/update/archive mutations |
| `src/hooks/useWarehouses.ts` | Warehouses query + create/update mutations |
| `src/hooks/useInventory.ts` | Categories + items + brand variants queries + mutations |
| `src/hooks/useRoles.ts` | Custom roles + user-role assignment queries + mutations |
| `src/hooks/useProfiles.ts` | User profiles query + update + division assignment |
| `src/hooks/useActivityLog.ts` | Activity log paginated query with filters |
| `src/components/master-data/SupplierFormDialog.tsx` | Create/edit supplier form dialog |
| `src/components/master-data/CompanyFormDialog.tsx` | Create/edit company form dialog |
| `src/components/master-data/DivisionFormDialog.tsx` | Create/edit division form dialog |
| `src/components/master-data/WarehouseFormDialog.tsx` | Create/edit warehouse form dialog |
| `src/components/master-data/InventoryItemFormDialog.tsx` | Create/edit inventory item form dialog |
| `src/components/master-data/BrandVariantFormDialog.tsx` | Create/edit brand variant form dialog |
| `src/components/master-data/RoleFormDialog.tsx` | Create/edit custom role with permission checkboxes |
| `src/components/master-data/UserRoleDialog.tsx` | Assign roles + divisions to a user |
| `src/components/master-data/AuditDetailDialog.tsx` | Audit log entry detail with old/new JSON diff |
| `src/components/master-data/AdminSidebar.tsx` | Admin settings sidebar navigation |
| `src/app/(dashboard)/master-data/suppliers/page.tsx` | Suppliers list page |
| `src/app/(dashboard)/master-data/companies/page.tsx` | Companies + divisions page |
| `src/app/(dashboard)/master-data/warehouses/page.tsx` | Warehouses list page |
| `src/app/(dashboard)/master-data/inventory/page.tsx` | Inventory items with category type tabs |
| `src/app/(dashboard)/master-data/users/page.tsx` | Users & Roles page (3 tabs) |
| `src/app/(dashboard)/master-data/audit-trail/page.tsx` | Audit trail log page |
| `src/app/(dashboard)/master-data/admin/layout.tsx` | Admin section sidebar layout |
| `src/app/(dashboard)/master-data/admin/page.tsx` | Admin landing — redirects to divisions |
| `src/app/(dashboard)/master-data/admin/brand-groups/page.tsx` | Brand groups CRUD |
| `src/app/(dashboard)/master-data/admin/reason-lists/page.tsx` | Reason lists CRUD |

---

## Task 1: Install Dependencies + Formatters + Toaster

**Files:**
- Modify: `package.json`
- Create: `src/lib/utils/formatters.ts`
- Create: `src/lib/utils/formatters.test.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install new dependencies**

```bash
npm install @tanstack/react-table @hookform/resolvers sonner
```

- [ ] **Step 2: Verify no peer conflicts**

```bash
npm ls @tanstack/react-table @hookform/resolvers sonner --depth=0
```

Expected: Clean output, all three packages listed.

- [ ] **Step 3: Create formatters utility**

Create `src/lib/utils/formatters.ts`:

```typescript
import { format, formatDistanceToNow } from 'date-fns'

export function formatCurrency(amount: number | null | undefined, currency = 'QAR'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-QA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy, HH:mm')
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-QA').format(value)
}
```

- [ ] **Step 4: Write formatter tests**

Create `src/lib/utils/formatters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, formatNumber } from './formatters'

describe('formatCurrency', () => {
  it('formats QAR amounts', () => {
    expect(formatCurrency(1234.5)).toMatch(/1,234\.50/)
  })

  it('returns dash for null', () => {
    expect(formatCurrency(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatCurrency(undefined)).toBe('—')
  })
})

describe('formatDate', () => {
  it('formats ISO date string', () => {
    expect(formatDate('2026-04-16T10:30:00Z')).toBe('16 Apr 2026')
  })

  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })
})

describe('formatNumber', () => {
  it('formats with thousand separators', () => {
    expect(formatNumber(400000)).toMatch(/400,000/)
  })

  it('returns dash for null', () => {
    expect(formatNumber(null)).toBe('—')
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run src/lib/utils/formatters.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Add Toaster to root layout**

In `src/app/layout.tsx`, add the Toaster import and render it inside the body, after QueryProvider:

Add import:
```typescript
import { Toaster } from 'sonner'
```

Add `<Toaster richColors position="top-right" />` as a sibling of `<QueryProvider>` inside `<body>`.

The updated body should look like:
```typescript
<body className={inter.className}>
  <QueryProvider>
    {children}
  </QueryProvider>
  <Toaster richColors position="top-right" />
</body>
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/utils/formatters.ts src/lib/utils/formatters.test.ts src/app/layout.tsx
git commit -m "feat: add react-table, formatters, sonner toaster for Master Data"
```

---

## Task 2: DataTable Shared Component

**Files:**
- Create: `src/components/shared/DataTableColumnHeader.tsx`
- Create: `src/components/shared/DataTablePagination.tsx`
- Create: `src/components/shared/DataTable.tsx`

- [ ] **Step 1: Create sortable column header**

Create `src/components/shared/DataTableColumnHeader.tsx`:

```typescript
'use client'

import { type Column } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  title: string
  className?: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8 data-[state=open]:bg-accent', className)}
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {title}
      {column.getIsSorted() === 'desc' ? (
        <ArrowDown className="ml-1 h-3.5 w-3.5" />
      ) : column.getIsSorted() === 'asc' ? (
        <ArrowUp className="ml-1 h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />
      )}
    </Button>
  )
}
```

- [ ] **Step 2: Create pagination controls**

Create `src/components/shared/DataTablePagination.tsx`:

```typescript
'use client'

import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="text-sm text-muted-foreground">
        {table.getFilteredRowModel().rows.length} row(s) total
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create DataTable component**

Create `src/components/shared/DataTable.tsx`:

```typescript
'use client'

import { useState } from 'react'
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTablePagination } from './DataTablePagination'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  globalFilter?: string
  pageSize?: number
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  globalFilter = '',
  pageSize = 20,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((_, colIdx) => (
                  <TableCell key={colIdx}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getFilteredRowModel().rows.length > pageSize && (
        <DataTablePagination table={table} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors from the new files.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/DataTable.tsx src/components/shared/DataTableColumnHeader.tsx src/components/shared/DataTablePagination.tsx
git commit -m "feat: add reusable DataTable with sorting, filtering, pagination"
```

---

## Task 3: Shared UI Components

**Files:**
- Create: `src/components/shared/PageHeader.tsx`
- Create: `src/components/shared/SearchInput.tsx`
- Create: `src/components/shared/StatusBadge.tsx`
- Create: `src/components/shared/ConfirmDialog.tsx`

- [ ] **Step 1: Create PageHeader**

Create `src/components/shared/PageHeader.tsx`:

```typescript
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action && (
        <Button onClick={action.onClick} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" />
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create SearchInput**

Create `src/components/shared/SearchInput.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  debounceMs = 300,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
      }
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [localValue, debounceMs, onChange, value])

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="pl-8 pr-8 h-9"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => {
            setLocalValue('')
            onChange('')
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create StatusBadge**

Create `src/components/shared/StatusBadge.tsx`:

```typescript
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusVariant = 'active' | 'inactive' | 'pending' | 'success' | 'destructive' | 'warning'

const VARIANT_STYLES: Record<StatusVariant, string> = {
  active: 'bg-success/10 text-success border-success/30',
  inactive: 'bg-muted text-muted-foreground border-muted',
  pending: 'bg-warning/10 text-warning border-warning/30',
  success: 'bg-success/10 text-success border-success/30',
  destructive: 'bg-destructive/10 text-destructive border-destructive/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
}

interface StatusBadgeProps {
  variant: StatusVariant
  children: React.ReactNode
  className?: string
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(VARIANT_STYLES[variant], className)}>
      {children}
    </Badge>
  )
}
```

- [ ] **Step 4: Create ConfirmDialog**

Create `src/components/shared/ConfirmDialog.tsx`:

```typescript
'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  variant?: 'default' | 'destructive'
  isPending?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Processing…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/PageHeader.tsx src/components/shared/SearchInput.tsx src/components/shared/StatusBadge.tsx src/components/shared/ConfirmDialog.tsx
git commit -m "feat: add PageHeader, SearchInput, StatusBadge, ConfirmDialog shared components"
```

---

## Task 4: Suppliers Module

**Files:**
- Create: `src/hooks/useSuppliers.ts`
- Create: `src/components/master-data/SupplierFormDialog.tsx`
- Create: `src/app/(dashboard)/master-data/suppliers/page.tsx`

- [ ] **Step 1: Create useSuppliers hook**

Create `src/hooks/useSuppliers.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Supplier = DBTable<'suppliers'>
export type SupplierInsert = DBInsert<'suppliers'>
export type SupplierUpdate = DBUpdate<'suppliers'>

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .is('is_active', true)
        .order('name')
      if (error) throw error
      return data as Supplier[]
    },
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: SupplierInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: SupplierUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}
```

- [ ] **Step 2: Create SupplierFormDialog**

Create `src/components/master-data/SupplierFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useCreateSupplier, useUpdateSupplier, type Supplier } from '@/hooks/useSuppliers'

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional().default(''),
  contact_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional().default(''),
  notes: z.string().optional().default(''),
})

type SupplierFormValues = z.infer<typeof supplierSchema>

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: Supplier | null
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const isEditing = !!supplier
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const isPending = create.isPending || update.isPending

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      category: '',
      contact_name: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (open && supplier) {
      form.reset({
        name: supplier.name,
        category: supplier.category ?? '',
        contact_name: supplier.contact_name ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
      })
    } else if (open) {
      form.reset()
    }
  }, [open, supplier, form])

  function onSubmit(values: SupplierFormValues) {
    const cleanValues = {
      ...values,
      category: values.category || null,
      contact_name: values.contact_name || null,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
    }

    if (isEditing) {
      update.mutate(
        { id: supplier!.id, ...cleanValues },
        {
          onSuccess: () => {
            toast.success('Supplier updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(cleanValues, {
        onSuccess: () => {
          toast.success('Supplier created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Supplier</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Supplier name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Cleaning supplies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+974 1234 5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="supplier@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Street address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create Suppliers page**

Create `src/app/(dashboard)/master-data/suppliers/page.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
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
        header: 'Email',
        cell: ({ row }) => row.getValue('email') || <span className="text-muted-foreground">—</span>,
        meta: { hideBelow: 'lg' },
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
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
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
    </div>
  )
}
```

- [ ] **Step 4: Run dev server and verify**

```bash
npm run dev
```

Navigate to `/master-data/suppliers`. Expected: page loads with table (may be empty if no suppliers exist), Add Supplier button opens the form dialog, form validates and submits.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSuppliers.ts src/components/master-data/SupplierFormDialog.tsx src/app/\(dashboard\)/master-data/suppliers/page.tsx
git commit -m "feat: add Suppliers page with CRUD — hook, form dialog, DataTable"
```

---

## Task 5: Companies & Divisions Module

**Files:**
- Create: `src/hooks/useCompanies.ts`
- Modify: `src/hooks/useDivisions.ts`
- Create: `src/components/master-data/CompanyFormDialog.tsx`
- Create: `src/components/master-data/DivisionFormDialog.tsx`
- Create: `src/app/(dashboard)/master-data/companies/page.tsx`

- [ ] **Step 1: Create useCompanies hook**

Create `src/hooks/useCompanies.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Company = DBTable<'companies'>
export type CompanyInsert = DBInsert<'companies'>
export type CompanyUpdate = DBUpdate<'companies'>

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name_en')
      if (error) throw error
      return data as Company[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: CompanyInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: CompanyUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}
```

- [ ] **Step 2: Add mutations to useDivisions**

Replace `src/hooks/useDivisions.ts` with:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Division = DBTable<'divisions'>
export type DivisionInsert = DBInsert<'divisions'>
export type DivisionUpdate = DBUpdate<'divisions'>

export function useDivisions() {
  return useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useDivisionsByCompany(companyId: string | null) {
  return useQuery({
    queryKey: ['divisions', 'company', companyId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('company_id', companyId!)
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    enabled: !!companyId,
  })
}

export function useCreateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: DivisionInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}

export function useUpdateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: DivisionUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}
```

**Note:** The `DivisionFilter` component still works because `useDivisions` returns the same shape. The full `Division` type is a superset of the old `Pick<>` type — the filter only uses `id`, `name`, `short_name`, `color` which are all present.

- [ ] **Step 3: Create CompanyFormDialog**

Create `src/components/master-data/CompanyFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateCompany, useUpdateCompany, type Company } from '@/hooks/useCompanies'

const companySchema = z.object({
  name_en: z.string().min(1, 'English name is required'),
  name_ar: z.string().optional().default(''),
  cr_number: z.string().optional().default(''),
  vat_id: z.string().optional().default(''),
  default_currency: z.string().default('QAR'),
  default_tax_rate: z.coerce.number().min(0).default(0),
  address_en: z.string().optional().default(''),
  address_ar: z.string().optional().default(''),
})

type CompanyFormValues = z.infer<typeof companySchema>

interface CompanyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  company?: Company | null
}

export function CompanyFormDialog({ open, onOpenChange, company }: CompanyFormDialogProps) {
  const isEditing = !!company
  const create = useCreateCompany()
  const update = useUpdateCompany()
  const isPending = create.isPending || update.isPending

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name_en: '', name_ar: '', cr_number: '', vat_id: '',
      default_currency: 'QAR', default_tax_rate: 0, address_en: '', address_ar: '',
    },
  })

  useEffect(() => {
    if (open && company) {
      form.reset({
        name_en: company.name_en,
        name_ar: company.name_ar ?? '',
        cr_number: company.cr_number ?? '',
        vat_id: company.vat_id ?? '',
        default_currency: company.default_currency,
        default_tax_rate: Number(company.default_tax_rate),
        address_en: company.address_en ?? '',
        address_ar: company.address_ar ?? '',
      })
    } else if (open) {
      form.reset()
    }
  }, [open, company, form])

  function onSubmit(values: CompanyFormValues) {
    const payload = {
      ...values,
      name_ar: values.name_ar || null,
      cr_number: values.cr_number || null,
      vat_id: values.vat_id || null,
      address_en: values.address_en || null,
      address_ar: values.address_ar || null,
    }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: company!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Company ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Company</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem><FormLabel>Name (English) *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem><FormLabel>Name (Arabic)</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="cr_number" render={({ field }) => (
                <FormItem><FormLabel>CR Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="vat_id" render={({ field }) => (
                <FormItem><FormLabel>VAT ID</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="default_currency" render={({ field }) => (
                <FormItem><FormLabel>Currency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="default_tax_rate" render={({ field }) => (
                <FormItem><FormLabel>Tax Rate (%)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="address_en" render={({ field }) => (
              <FormItem><FormLabel>Address (English)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="address_ar" render={({ field }) => (
              <FormItem><FormLabel>Address (Arabic)</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Create DivisionFormDialog**

Create `src/components/master-data/DivisionFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateDivision, useUpdateDivision, type Division } from '@/hooks/useDivisions'

const divisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  short_name: z.string().optional().default(''),
  slug: z.string().min(1, 'Slug is required'),
  color: z.string().default('#2563eb'),
  company_name_en: z.string().optional().default(''),
  company_name_ar: z.string().optional().default(''),
  address_en: z.string().optional().default(''),
  address_ar: z.string().optional().default(''),
  logo_url: z.string().optional().default(''),
  stamp_url: z.string().optional().default(''),
  footer_motto: z.string().optional().default(''),
  default_currency: z.string().default('QAR'),
  default_tax_rate: z.coerce.number().min(0).default(0),
  sort_order: z.coerce.number().int().default(0),
})

type DivisionFormValues = z.infer<typeof divisionSchema>

interface DivisionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  division?: Division | null
  companyId: string
}

export function DivisionFormDialog({ open, onOpenChange, division, companyId }: DivisionFormDialogProps) {
  const isEditing = !!division
  const create = useCreateDivision()
  const update = useUpdateDivision()
  const isPending = create.isPending || update.isPending

  const form = useForm<DivisionFormValues>({
    resolver: zodResolver(divisionSchema),
    defaultValues: {
      name: '', short_name: '', slug: '', color: '#2563eb',
      company_name_en: '', company_name_ar: '', address_en: '', address_ar: '',
      logo_url: '', stamp_url: '', footer_motto: '',
      default_currency: 'QAR', default_tax_rate: 0, sort_order: 0,
    },
  })

  useEffect(() => {
    if (open && division) {
      form.reset({
        name: division.name,
        short_name: division.short_name ?? '',
        slug: division.slug,
        color: division.color,
        company_name_en: division.company_name_en ?? '',
        company_name_ar: division.company_name_ar ?? '',
        address_en: division.address_en ?? '',
        address_ar: division.address_ar ?? '',
        logo_url: division.logo_url ?? '',
        stamp_url: division.stamp_url ?? '',
        footer_motto: division.footer_motto ?? '',
        default_currency: division.default_currency,
        default_tax_rate: Number(division.default_tax_rate),
        sort_order: division.sort_order,
      })
    } else if (open) {
      form.reset()
    }
  }, [open, division, form])

  function onSubmit(values: DivisionFormValues) {
    const payload = {
      ...values,
      company_id: companyId,
      short_name: values.short_name || null,
      company_name_en: values.company_name_en || null,
      company_name_ar: values.company_name_ar || null,
      address_en: values.address_en || null,
      address_ar: values.address_ar || null,
      logo_url: values.logo_url || null,
      stamp_url: values.stamp_url || null,
      footer_motto: values.footer_motto || null,
    }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: division!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Division ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Division</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="short_name" render={({ field }) => (
                <FormItem><FormLabel>Short Name</FormLabel><FormControl><Input placeholder="e.g. AFM" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="slug" render={({ field }) => (
                <FormItem><FormLabel>Slug *</FormLabel><FormControl><Input placeholder="alfaytri-maintenance" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem><FormLabel>Color</FormLabel><FormControl><Input type="color" className="h-9 w-full" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="default_currency" render={({ field }) => (
                <FormItem><FormLabel>Currency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="default_tax_rate" render={({ field }) => (
                <FormItem><FormLabel>Tax Rate (%)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="logo_url" render={({ field }) => (
              <FormItem><FormLabel>Logo URL</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="stamp_url" render={({ field }) => (
              <FormItem><FormLabel>Stamp URL</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="sort_order" render={({ field }) => (
              <FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Create Companies & Divisions page**

Create `src/app/(dashboard)/master-data/companies/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CompanyFormDialog } from '@/components/master-data/CompanyFormDialog'
import { DivisionFormDialog } from '@/components/master-data/DivisionFormDialog'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useDivisions, type Division } from '@/hooks/useDivisions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, Pencil, Plus } from 'lucide-react'

export default function CompaniesPage() {
  const { data: companies, isLoading: loadingCompanies } = useCompanies()
  const { data: divisions, isLoading: loadingDivisions } = useDivisions()

  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null })
  const [divisionDialog, setDivisionDialog] = useState<{ open: boolean; division: Division | null; companyId: string }>({ open: false, division: null, companyId: '' })

  if (loadingCompanies || loadingDivisions) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies & Divisions"
        description="Manage your company entities and their divisions"
        action={{ label: 'Add Company', onClick: () => setCompanyDialog({ open: true, company: null }) }}
      />

      {companies?.map((company) => {
        const companyDivisions = divisions?.filter((d) => d.company_id === company.id) ?? []
        return (
          <Card key={company.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">{company.name_en}</CardTitle>
                  {company.name_ar && <p className="text-sm text-muted-foreground" dir="rtl">{company.name_ar}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge variant={company.is_active ? 'active' : 'inactive'}>
                  {company.is_active ? 'Active' : 'Inactive'}
                </StatusBadge>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setCompanyDialog({ open: true, company })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Divisions ({companyDivisions.length})</h3>
                <Button variant="outline" size="sm"
                  onClick={() => setDivisionDialog({ open: true, division: null, companyId: company.id })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Division
                </Button>
              </div>
              {companyDivisions.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Division</TableHead>
                        <TableHead className="hidden sm:table-cell">Short Name</TableHead>
                        <TableHead className="hidden md:table-cell">Currency</TableHead>
                        <TableHead className="hidden md:table-cell">Tax %</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyDivisions.map((div) => (
                        <TableRow key={div.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: div.color }} />
                              <span className="font-medium">{div.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {div.short_name || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{div.default_currency}</TableCell>
                          <TableCell className="hidden md:table-cell">{String(div.default_tax_rate)}%</TableCell>
                          <TableCell>
                            <StatusBadge variant={div.is_active ? 'active' : 'inactive'}>
                              {div.is_active ? 'Active' : 'Inactive'}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => setDivisionDialog({ open: true, division: div, companyId: company.id })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No divisions yet.</p>
              )}
            </CardContent>
          </Card>
        )
      })}

      <CompanyFormDialog
        open={companyDialog.open}
        onOpenChange={(open) => setCompanyDialog((s) => ({ ...s, open }))}
        company={companyDialog.company}
      />
      <DivisionFormDialog
        open={divisionDialog.open}
        onOpenChange={(open) => setDivisionDialog((s) => ({ ...s, open }))}
        division={divisionDialog.division}
        companyId={divisionDialog.companyId}
      />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCompanies.ts src/hooks/useDivisions.ts src/components/master-data/CompanyFormDialog.tsx src/components/master-data/DivisionFormDialog.tsx src/app/\(dashboard\)/master-data/companies/page.tsx
git commit -m "feat: add Companies & Divisions page with full CRUD"
```

---

## Task 6: Warehouses Module

**Files:**
- Create: `src/hooks/useWarehouses.ts`
- Create: `src/components/master-data/WarehouseFormDialog.tsx`
- Create: `src/app/(dashboard)/master-data/warehouses/page.tsx`

- [ ] **Step 1: Create useWarehouses hook**

Create `src/hooks/useWarehouses.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Warehouse = DBTable<'warehouses'>
export type WarehouseInsert = DBInsert<'warehouses'>
export type WarehouseUpdate = DBUpdate<'warehouses'>

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as Warehouse[]
    },
  })
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: WarehouseInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
    },
  })
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: WarehouseUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
    },
  })
}
```

- [ ] **Step 2: Create WarehouseFormDialog**

Create `src/components/master-data/WarehouseFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateWarehouse, useUpdateWarehouse, type Warehouse } from '@/hooks/useWarehouses'

const warehouseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().optional().default(''),
  warehouse_type: z.string().default('central'),
})

type WarehouseFormValues = z.infer<typeof warehouseSchema>

interface WarehouseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse?: Warehouse | null
}

export function WarehouseFormDialog({ open, onOpenChange, warehouse }: WarehouseFormDialogProps) {
  const isEditing = !!warehouse
  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const isPending = create.isPending || update.isPending

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', location: '', warehouse_type: 'central' },
  })

  useEffect(() => {
    if (open && warehouse) {
      form.reset({
        name: warehouse.name,
        location: warehouse.location ?? '',
        warehouse_type: warehouse.warehouse_type,
      })
    } else if (open) {
      form.reset()
    }
  }, [open, warehouse, form])

  function onSubmit(values: WarehouseFormValues) {
    const payload = { ...values, location: values.location || null }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: warehouse!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Warehouse ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Warehouse</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Name *</FormLabel><FormControl><Input placeholder="Central Warehouse" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem><FormLabel>Location</FormLabel><FormControl><Input placeholder="Industrial Area, Doha" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="warehouse_type" render={({ field }) => (
              <FormItem><FormLabel>Type</FormLabel><FormControl>
                <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="central">Central</option>
                  <option value="local">Local</option>
                  <option value="team_vehicle">Team Vehicle</option>
                </select>
              </FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create Warehouses page**

Create `src/app/(dashboard)/master-data/warehouses/page.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { WarehouseFormDialog } from '@/components/master-data/WarehouseFormDialog'
import { useWarehouses, type Warehouse } from '@/hooks/useWarehouses'
import { formatNumber } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const TYPE_LABELS: Record<string, string> = {
  central: 'Central',
  local: 'Local',
  team_vehicle: 'Team Vehicle',
}

export default function WarehousesPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const { data: warehouses, isLoading } = useWarehouses()

  const columns = useMemo<ColumnDef<Warehouse>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'location',
      header: 'Location',
      cell: ({ row }) => row.getValue('location') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'warehouse_type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline">{TYPE_LABELS[row.getValue('warehouse_type') as string] ?? row.getValue('warehouse_type')}</Badge>
      ),
    },
    {
      accessorKey: 'item_count',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => formatNumber(row.getValue('item_count') as number),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
              <Pencil className="h-4 w-4 mr-2" />Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader title="Warehouses" description="Manage warehouse locations" action={{ label: 'Add Warehouse', onClick: () => { setEditing(null); setDialogOpen(true) } }} />
      <SearchInput value={search} onChange={setSearch} placeholder="Search warehouses…" />
      <DataTable columns={columns} data={warehouses ?? []} isLoading={isLoading} globalFilter={search} />
      <WarehouseFormDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }} warehouse={editing} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useWarehouses.ts src/components/master-data/WarehouseFormDialog.tsx src/app/\(dashboard\)/master-data/warehouses/page.tsx
git commit -m "feat: add Warehouses page with CRUD"
```

---

## Task 7: Inventory Hooks

**Files:**
- Create: `src/hooks/useInventory.ts`

- [ ] **Step 1: Create useInventory hook**

Create `src/hooks/useInventory.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type InventoryCategory = DBTable<'inventory_categories'>
export type InventoryItem = DBTable<'inventory_items'>
export type BrandVariant = DBTable<'inventory_brand_variants'>
export type InventoryItemInsert = DBInsert<'inventory_items'>
export type InventoryItemUpdate = DBUpdate<'inventory_items'>
export type BrandVariantInsert = DBInsert<'inventory_brand_variants'>
export type BrandVariantUpdate = DBUpdate<'inventory_brand_variants'>

export function useInventoryCategories() {
  return useQuery({
    queryKey: ['inventory-categories'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('*')
        .eq('status', 'active')
        .order('sort_order')
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useInventoryItems(categoryType?: string) {
  return useQuery({
    queryKey: ['inventory-items', categoryType],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('inventory_items')
        .select('*, inventory_categories!inner(type, name_en)')
        .eq('status', 'active')
        .order('name_en')

      if (categoryType) {
        query = query.eq('inventory_categories.type', categoryType)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useBrandVariants(itemId: string | null) {
  return useQuery({
    queryKey: ['brand-variants', itemId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .select('*, brands(name)')
        .eq('item_id', itemId!)
        .eq('status', 'active')
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!itemId,
  })
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: InventoryItemInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
    },
  })
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: InventoryItemUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
    },
  })
}

export function useCreateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: BrandVariantInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brand-variants', variables.item_id] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
    },
  })
}

export function useUpdateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: BrandVariantUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useInventory.ts
git commit -m "feat: add inventory hooks — categories, items, brand variants with CRUD"
```

---

## Task 8: Inventory Forms + Page

**Files:**
- Create: `src/components/master-data/InventoryItemFormDialog.tsx`
- Create: `src/components/master-data/BrandVariantFormDialog.tsx`
- Create: `src/app/(dashboard)/master-data/inventory/page.tsx`

- [ ] **Step 1: Create InventoryItemFormDialog**

Create `src/components/master-data/InventoryItemFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useCreateInventoryItem, useUpdateInventoryItem,
  useInventoryCategories, type InventoryItem,
} from '@/hooks/useInventory'

const itemSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  name_en: z.string().min(1, 'Name is required'),
  name_ar: z.string().optional().default(''),
  sku: z.string().min(1, 'SKU is required'),
  unit: z.string().min(1, 'Unit is required'),
  cost_price: z.coerce.number().min(0).default(0),
  markup_percent: z.coerce.number().min(0).optional(),
  warranty_months: z.coerce.number().int().min(0).optional(),
  sort_order: z.coerce.number().int().default(0),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface InventoryItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: InventoryItem | null
  defaultCategoryId?: string
}

export function InventoryItemFormDialog({ open, onOpenChange, item, defaultCategoryId }: InventoryItemFormDialogProps) {
  const isEditing = !!item
  const create = useCreateInventoryItem()
  const update = useUpdateInventoryItem()
  const { data: categories } = useInventoryCategories()
  const isPending = create.isPending || update.isPending

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      category_id: defaultCategoryId ?? '', name_en: '', name_ar: '', sku: '', unit: 'pcs',
      cost_price: 0, markup_percent: undefined, warranty_months: undefined, sort_order: 0,
    },
  })

  useEffect(() => {
    if (open && item) {
      form.reset({
        category_id: item.category_id, name_en: item.name_en, name_ar: item.name_ar ?? '',
        sku: item.sku, unit: item.unit, cost_price: Number(item.cost_price ?? 0),
        markup_percent: item.markup_percent ? Number(item.markup_percent) : undefined,
        warranty_months: item.warranty_months ?? undefined, sort_order: item.sort_order,
      })
    } else if (open) {
      form.reset({ category_id: defaultCategoryId ?? '', name_en: '', name_ar: '', sku: '', unit: 'pcs', cost_price: 0, markup_percent: undefined, warranty_months: undefined, sort_order: 0 })
    }
  }, [open, item, defaultCategoryId, form])

  function onSubmit(values: ItemFormValues) {
    const payload = {
      ...values,
      name_ar: values.name_ar || null,
      markup_percent: values.markup_percent ?? null,
      warranty_months: values.warranty_months ?? null,
    }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: item!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Item ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="category_id" render={({ field }) => (
              <FormItem><FormLabel>Category *</FormLabel><FormControl>
                <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">Select category</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                </select>
              </FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem><FormLabel>Name (English) *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem><FormLabel>Name (Arabic)</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem><FormLabel>SKU *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="unit" render={({ field }) => (
                <FormItem><FormLabel>Unit *</FormLabel><FormControl><Input placeholder="pcs, kg, L" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="cost_price" render={({ field }) => (
                <FormItem><FormLabel>Cost Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="markup_percent" render={({ field }) => (
                <FormItem><FormLabel>Markup %</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="warranty_months" render={({ field }) => (
                <FormItem><FormLabel>Warranty (months)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create BrandVariantFormDialog**

Create `src/components/master-data/BrandVariantFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'

const variantSchema = z.object({
  code: z.string().optional().default(''),
  cost_price: z.coerce.number().min(0).default(0),
  selling_price: z.coerce.number().min(0).default(0),
})

type VariantFormValues = z.infer<typeof variantSchema>

interface BrandVariantFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant?: BrandVariant | null
  itemId: string
}

export function BrandVariantFormDialog({ open, onOpenChange, variant, itemId }: BrandVariantFormDialogProps) {
  const isEditing = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()
  const isPending = create.isPending || update.isPending

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: { code: '', cost_price: 0, selling_price: 0 },
  })

  useEffect(() => {
    if (open && variant) {
      form.reset({
        code: variant.code ?? '',
        cost_price: Number(variant.cost_price ?? 0),
        selling_price: Number(variant.selling_price ?? 0),
      })
    } else if (open) {
      form.reset()
    }
  }, [open, variant, form])

  function onSubmit(values: VariantFormValues) {
    const payload = { ...values, item_id: itemId, code: values.code || null }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: variant!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Variant ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Brand Variant</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="code" render={({ field }) => (
              <FormItem><FormLabel>Variant Code</FormLabel><FormControl><Input placeholder="e.g. BV-001" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="cost_price" render={({ field }) => (
                <FormItem><FormLabel>Cost Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="selling_price" render={({ field }) => (
                <FormItem><FormLabel>Selling Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create Inventory page**

Create `src/app/(dashboard)/master-data/inventory/page.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, Package } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { InventoryItemFormDialog } from '@/components/master-data/InventoryItemFormDialog'
import { BrandVariantFormDialog } from '@/components/master-data/BrandVariantFormDialog'
import { useInventoryItems, useBrandVariants, type InventoryItem, type BrandVariant } from '@/hooks/useInventory'
import { formatCurrency, formatNumber } from '@/lib/utils/formatters'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const INVENTORY_TABS = [
  { value: 'product', label: 'Products' },
  { value: 'spare_part', label: 'Spare Parts' },
  { value: 'consumable', label: 'Consumables' },
] as const

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<string>('product')
  const [search, setSearch] = useState('')
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null })
  const [variantDialog, setVariantDialog] = useState<{ open: boolean; variant: BrandVariant | null; itemId: string }>({ open: false, variant: null, itemId: '' })
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const { data: items, isLoading } = useInventoryItems(activeTab)
  const { data: variants } = useBrandVariants(expandedItem)

  const columns = useMemo<ColumnDef<InventoryItem>[]>(() => [
    {
      accessorKey: 'name_en',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <button
          className="font-medium text-left hover:text-primary transition-colors"
          onClick={() => setExpandedItem(expandedItem === row.original.id ? null : row.original.id)}
        >
          {row.getValue('name_en')}
        </button>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.getValue('sku')}</code>,
    },
    {
      accessorKey: 'unit',
      header: 'Unit',
    },
    {
      accessorKey: 'cost_price',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
      cell: ({ row }) => formatCurrency(row.getValue('cost_price') as number),
    },
    {
      accessorKey: 'total_stock',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
      cell: ({ row }) => formatNumber(row.getValue('total_stock') as number),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setItemDialog({ open: true, item: row.original })}>
              <Pencil className="h-4 w-4 mr-2" />Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setVariantDialog({ open: true, variant: null, itemId: row.original.id })}>
              <Plus className="h-4 w-4 mr-2" />Add Variant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [expandedItem])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Items"
        description="Manage products, spare parts, and consumables"
        action={{ label: 'Add Item', onClick: () => setItemDialog({ open: true, item: null }) }}
      />

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as string); setExpandedItem(null) }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList variant="line">
            {INVENTORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          <SearchInput value={search} onChange={setSearch} placeholder="Search items…" />
        </div>

        {INVENTORY_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <DataTable columns={columns} data={(items as InventoryItem[]) ?? []} isLoading={isLoading} globalFilter={search} />
          </TabsContent>
        ))}
      </Tabs>

      {/* Brand variants panel for expanded item */}
      {expandedItem && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Brand Variants
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setVariantDialog({ open: true, variant: null, itemId: expandedItem })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Variant
            </Button>
          </CardHeader>
          <CardContent>
            {variants && variants.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Selling</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="hidden md:table-cell">Reserved</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((v: BrandVariant & { brands?: { name: string } | null }) => (
                      <TableRow key={v.id}>
                        <TableCell><code className="text-xs">{v.code || '—'}</code></TableCell>
                        <TableCell>{v.brands?.name || '—'}</TableCell>
                        <TableCell>{formatCurrency(Number(v.cost_price))}</TableCell>
                        <TableCell>{formatCurrency(Number(v.selling_price))}</TableCell>
                        <TableCell>{formatNumber(v.stock_level)}</TableCell>
                        <TableCell className="hidden md:table-cell">{formatNumber(v.reserved_qty)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => setVariantDialog({ open: true, variant: v, itemId: expandedItem })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No brand variants yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <InventoryItemFormDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog((s) => ({ ...s, open }))}
        item={itemDialog.item}
        defaultCategoryId=""
      />
      <BrandVariantFormDialog
        open={variantDialog.open}
        onOpenChange={(open) => setVariantDialog((s) => ({ ...s, open }))}
        variant={variantDialog.variant}
        itemId={variantDialog.itemId}
      />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/master-data/InventoryItemFormDialog.tsx src/components/master-data/BrandVariantFormDialog.tsx src/app/\(dashboard\)/master-data/inventory/page.tsx
git commit -m "feat: add Inventory Items page with categories, items, and brand variants"
```

---

## Task 9: Users & Roles Hooks + Forms

**Files:**
- Create: `src/hooks/useRoles.ts`
- Create: `src/hooks/useProfiles.ts`
- Create: `src/components/master-data/RoleFormDialog.tsx`
- Create: `src/components/master-data/UserRoleDialog.tsx`

- [ ] **Step 1: Create useRoles hook**

Create `src/hooks/useRoles.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type CustomRole = DBTable<'custom_roles'>
export type CustomRoleInsert = DBInsert<'custom_roles'>
export type CustomRoleUpdate = DBUpdate<'custom_roles'>

export function useRoles() {
  return useQuery({
    queryKey: ['custom-roles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('custom_roles')
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as CustomRole[]
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: CustomRoleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['custom-roles'] }) },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: CustomRoleUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['custom-roles'] }) },
  })
}

export function useUserRoles(profileId: string | null) {
  return useQuery({
    queryKey: ['user-roles', profileId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('*, custom_roles(name, color)')
        .eq('profile_id', profileId!)
      if (error) throw error
      return data
    },
    enabled: !!profileId,
  })
}

export function useAssignRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { profile_id: string; role_id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('user_custom_roles').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', variables.profile_id] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useRemoveRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId }: { id: string; profileId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('user_custom_roles').delete().eq('id', id)
      if (error) throw error
      return profileId
    },
    onSuccess: (profileId) => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', profileId] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}
```

- [ ] **Step 2: Create useProfiles hook**

Create `src/hooks/useProfiles.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBUpdate } from '@/types/database.types'

export type Profile = DBTable<'profiles'>
export type ProfileUpdate = DBUpdate<'profiles'>

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('*, user_custom_roles(role_id, custom_roles(name, color)), user_divisions(division_id, divisions(name, short_name, color))')
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: ProfileUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('profiles').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profiles'] }) },
  })
}

export function useUserDivisions(profileId: string | null) {
  return useQuery({
    queryKey: ['user-divisions', profileId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_divisions')
        .select('*, divisions(name, short_name, color)')
        .eq('profile_id', profileId!)
      if (error) throw error
      return data
    },
    enabled: !!profileId,
  })
}

export function useAssignDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { profile_id: string; division_id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('user_divisions').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-divisions', variables.profile_id] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useRemoveDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId }: { id: string; profileId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('user_divisions').delete().eq('id', id)
      if (error) throw error
      return profileId
    },
    onSuccess: (profileId) => {
      queryClient.invalidateQueries({ queryKey: ['user-divisions', profileId] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}
```

- [ ] **Step 3: Create RoleFormDialog**

Create `src/components/master-data/RoleFormDialog.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useCreateRole, useUpdateRole, type CustomRole } from '@/hooks/useRoles'
import { PERMISSION_GROUPS } from '@/lib/permissions'

const roleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  permissions: z.array(z.string()).default([]),
})

type RoleFormValues = z.infer<typeof roleSchema>

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: CustomRole | null
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEditing = !!role
  const create = useCreateRole()
  const update = useUpdateRole()
  const isPending = create.isPending || update.isPending

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  })

  useEffect(() => {
    if (open && role) {
      form.reset({
        name: role.name,
        description: role.description ?? '',
        permissions: role.permissions ?? [],
      })
    } else if (open) {
      form.reset()
    }
  }, [open, role, form])

  function onSubmit(values: RoleFormValues) {
    const payload = { ...values, description: values.description || null }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: role!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Role ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  const selectedPermissions = form.watch('permissions')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Role</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Role Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={1} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <div>
              <FormLabel>Permissions</FormLabel>
              <div className="mt-2 space-y-4 max-h-80 overflow-y-auto border rounded-md p-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.module}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.module}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                      {group.keys.map((key) => (
                        <label key={key} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={selectedPermissions.includes(key)}
                            onCheckedChange={(checked) => {
                              const current = form.getValues('permissions')
                              form.setValue(
                                'permissions',
                                checked ? [...current, key] : current.filter((k) => k !== key)
                              )
                            }}
                          />
                          {key.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Create permissions data file**

Create `src/lib/permissions.ts`:

```typescript
export const PERMISSION_GROUPS = [
  {
    module: 'Master Data',
    keys: [
      'master_data.companies.view', 'master_data.companies.manage',
      'master_data.divisions.view', 'master_data.divisions.manage',
      'master_data.warehouses.view', 'master_data.warehouses.manage',
      'master_data.inventory.view', 'master_data.inventory.manage',
      'master_data.suppliers.view', 'master_data.suppliers.manage',
      'master_data.users.view', 'master_data.users.manage',
      'master_data.roles.view', 'master_data.roles.manage',
      'master_data.audit.view',
      'master_data.admin.view', 'master_data.admin.manage',
    ],
  },
  {
    module: 'Purchase',
    keys: [
      'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
      'purchase.approvals.view', 'purchase.approvals.manage',
      'purchase.shipments.view', 'purchase.shipments.manage',
      'purchase.landed_costs.view', 'purchase.landed_costs.manage',
      'purchase.warehouses.view', 'purchase.warehouses.manage',
      'purchase.returns.view', 'purchase.returns.manage',
      'purchase.dead_stock.view',
    ],
  },
  {
    module: 'Sales',
    keys: [
      'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
      'sales.returns.view', 'sales.returns.manage',
    ],
  },
  {
    module: 'Orders',
    keys: ['orders.view', 'orders.create', 'orders.edit', 'orders.assign'],
  },
  {
    module: 'Contracts',
    keys: ['contracts.view', 'contracts.create', 'contracts.edit'],
  },
  {
    module: 'Invoices',
    keys: ['invoices.view', 'invoices.create', 'invoices.edit', 'payments.view', 'payments.manage'],
  },
  {
    module: 'Teams',
    keys: ['teams.view', 'teams.manage', 'employees.view', 'employees.manage'],
  },
  {
    module: 'System',
    keys: ['system.admin', 'system.import', 'system.export'],
  },
] as const

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.keys)
```

**Note:** These permission keys are a structured reference. The actual 79 keys in the database may differ slightly — the RoleFormDialog will display whatever keys are defined here, and the stored `permissions` text array on `custom_roles` will contain the checked keys.

- [ ] **Step 5: Create UserRoleDialog**

Create `src/components/master-data/UserRoleDialog.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { X } from 'lucide-react'
import { useRoles, useUserRoles, useAssignRole, useRemoveRole } from '@/hooks/useRoles'
import { useDivisions } from '@/hooks/useDivisions'
import { useUserDivisions, useAssignDivision, useRemoveDivision, type Profile } from '@/hooks/useProfiles'

interface UserRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | null
}

export function UserRoleDialog({ open, onOpenChange, profile }: UserRoleDialogProps) {
  const { data: allRoles } = useRoles()
  const { data: allDivisions } = useDivisions()
  const { data: userRoles, isLoading: loadingRoles } = useUserRoles(profile?.id ?? null)
  const { data: userDivisions, isLoading: loadingDivisions } = useUserDivisions(profile?.id ?? null)

  const assignRole = useAssignRole()
  const removeRole = useRemoveRole()
  const assignDivision = useAssignDivision()
  const removeDivision = useRemoveDivision()

  if (!profile) return null

  const assignedRoleIds = new Set(userRoles?.map((ur) => ur.role_id) ?? [])
  const assignedDivisionIds = new Set(userDivisions?.map((ud) => ud.division_id) ?? [])

  function handleToggleRole(roleId: string) {
    const existing = userRoles?.find((ur) => ur.role_id === roleId)
    if (existing) {
      removeRole.mutate({ id: existing.id, profileId: profile!.id }, {
        onError: (err) => toast.error(err.message),
      })
    } else {
      assignRole.mutate({ profile_id: profile!.id, role_id: roleId }, {
        onError: (err) => toast.error(err.message),
      })
    }
  }

  function handleToggleDivision(divisionId: string) {
    const existing = userDivisions?.find((ud) => ud.division_id === divisionId)
    if (existing) {
      removeDivision.mutate({ id: existing.id, profileId: profile!.id }, {
        onError: (err) => toast.error(err.message),
      })
    } else {
      assignDivision.mutate({ profile_id: profile!.id, division_id: divisionId }, {
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage User: {profile.full_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-2">Roles</h3>
            {loadingRoles ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-1 border rounded-md p-3 max-h-48 overflow-y-auto">
                {allRoles?.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={assignedRoleIds.has(role.id)}
                      onCheckedChange={() => handleToggleRole(role.id)}
                    />
                    {role.name}
                    {role.description && <span className="text-muted-foreground">— {role.description}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Divisions</h3>
            {loadingDivisions ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-1 border rounded-md p-3">
                {allDivisions?.map((div) => (
                  <label key={div.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={assignedDivisionIds.has(div.id)}
                      onCheckedChange={() => handleToggleDivision(div.id)}
                    />
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: div.color }} />
                    {div.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRoles.ts src/hooks/useProfiles.ts src/lib/permissions.ts src/components/master-data/RoleFormDialog.tsx src/components/master-data/UserRoleDialog.tsx
git commit -m "feat: add Users & Roles hooks, RoleFormDialog, UserRoleDialog"
```

---

## Task 10: Users & Roles Page

**Files:**
- Create: `src/app/(dashboard)/master-data/users/page.tsx`

- [ ] **Step 1: Create Users & Roles page with 3 tabs**

Create `src/app/(dashboard)/master-data/users/page.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Shield } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { RoleFormDialog } from '@/components/master-data/RoleFormDialog'
import { UserRoleDialog } from '@/components/master-data/UserRoleDialog'
import { useRoles, type CustomRole } from '@/hooks/useRoles'
import { useProfiles, type Profile } from '@/hooks/useProfiles'
import { PERMISSION_GROUPS } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function UsersRolesPage() {
  const [activeTab, setActiveTab] = useState('permissions')
  const [roleSearch, setRoleSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: CustomRole | null }>({ open: false, role: null })
  const [userRoleDialog, setUserRoleDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })

  const { data: roles, isLoading: loadingRoles } = useRoles()
  const { data: profiles, isLoading: loadingProfiles } = useProfiles()

  const roleColumns = useMemo<ColumnDef<CustomRole>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-medium">{row.getValue('name')}</span>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.getValue('description') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'permissions',
      header: 'Permissions',
      cell: ({ row }) => {
        const perms = row.getValue('permissions') as string[]
        return <Badge variant="outline">{perms?.length ?? 0} permissions</Badge>
      },
    },
    {
      accessorKey: 'is_system',
      header: 'Type',
      cell: ({ row }) => row.getValue('is_system') ? <Badge>System</Badge> : <Badge variant="outline">Custom</Badge>,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRoleDialog({ open: true, role: row.original })} disabled={!!row.original.is_system}>
              <Pencil className="h-4 w-4 mr-2" />Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  const userColumns = useMemo<ColumnDef<Profile>[]>(() => [
    {
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('full_name')}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
    },
    {
      accessorKey: 'user_type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{row.getValue('user_type') as string}</Badge>,
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => {
        const userRoles = (row.original as Profile & { user_custom_roles?: Array<{ custom_roles: { name: string } | null }> }).user_custom_roles
        if (!userRoles?.length) return <span className="text-muted-foreground">None</span>
        return (
          <div className="flex gap-1 flex-wrap">
            {userRoles.slice(0, 2).map((ur, i) => (
              <Badge key={i} variant="outline" className="text-xs">{ur.custom_roles?.name}</Badge>
            ))}
            {userRoles.length > 2 && <Badge variant="outline" className="text-xs">+{userRoles.length - 2}</Badge>}
          </div>
        )
      },
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
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setUserRoleDialog({ open: true, profile: row.original as Profile })}>
              <Shield className="h-4 w-4 mr-2" />Manage Roles
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader title="Users & Roles" description="Manage user accounts, roles, and permissions" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Read-only registry of all permission keys grouped by module.</p>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.module} className="border rounded-md p-4">
                <h3 className="text-sm font-semibold mb-2">{group.module}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {group.keys.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs font-mono">{key}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <div className="space-y-4 mt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput value={roleSearch} onChange={setRoleSearch} placeholder="Search roles…" />
              <Button onClick={() => setRoleDialog({ open: true, role: null })}>Create Role</Button>
            </div>
            <DataTable columns={roleColumns} data={roles ?? []} isLoading={loadingRoles} globalFilter={roleSearch} />
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="space-y-4 mt-4">
            <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Search users…" />
            <DataTable columns={userColumns} data={(profiles as Profile[]) ?? []} isLoading={loadingProfiles} globalFilter={userSearch} />
          </div>
        </TabsContent>
      </Tabs>

      <RoleFormDialog
        open={roleDialog.open}
        onOpenChange={(open) => setRoleDialog((s) => ({ ...s, open }))}
        role={roleDialog.role}
      />
      <UserRoleDialog
        open={userRoleDialog.open}
        onOpenChange={(open) => setUserRoleDialog((s) => ({ ...s, open }))}
        profile={userRoleDialog.profile}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/master-data/users/page.tsx
git commit -m "feat: add Users & Roles page with Permissions, Roles, and Users tabs"
```

---

## Task 11: Audit Trail Module

**Files:**
- Create: `src/hooks/useActivityLog.ts`
- Create: `src/components/master-data/AuditDetailDialog.tsx`
- Create: `src/app/(dashboard)/master-data/audit-trail/page.tsx`

- [ ] **Step 1: Create useActivityLog hook**

Create `src/hooks/useActivityLog.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'

export type ActivityLog = DBTable<'activity_log'>

interface ActivityLogFilters {
  search?: string
  module?: string
  severity?: string
}

export function useActivityLog(filters: ActivityLogFilters = {}) {
  return useQuery({
    queryKey: ['activity-log', filters],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (filters.module) {
        query = query.eq('module', filters.module)
      }
      if (filters.severity) {
        query = query.eq('severity', filters.severity)
      }
      if (filters.search) {
        query = query.or(`action.ilike.%${filters.search}%,details.ilike.%${filters.search}%,performer_name.ilike.%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as ActivityLog[]
    },
    refetchInterval: 30 * 1000,
  })
}

export const AUDIT_MODULES = [
  'companies', 'divisions', 'warehouses', 'inventory', 'suppliers',
  'profiles', 'custom_roles', 'purchase_orders', 'po_approvals',
  'receivals', 'shipments', 'landed_costs', 'sale_orders',
  'deliveries', 'payments', 'stock_adjustments', 'warehouse_transfers',
  'inventory_checks', 'settings',
] as const

export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const
```

- [ ] **Step 2: Create AuditDetailDialog**

Create `src/components/master-data/AuditDetailDialog.tsx`:

```typescript
'use client'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils/formatters'
import type { ActivityLog } from '@/hooks/useActivityLog'

interface AuditDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: ActivityLog | null
}

function JsonDiff({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">{label}</h4>
      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-60">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

export function AuditDetailDialog({ open, onOpenChange, entry }: AuditDetailDialogProps) {
  if (!entry) return null

  const severityVariant = entry.severity === 'critical' ? 'destructive'
    : entry.severity === 'warning' ? 'warning'
    : 'active'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit Log Detail</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Action:</span>
              <p className="font-medium">{entry.action}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Module:</span>
              <p><Badge variant="outline">{entry.module ?? '—'}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">Performed by:</span>
              <p className="font-medium">{entry.performer_name ?? '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span>
              <p>{formatDateTime(entry.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Severity:</span>
              <p><Badge variant="outline" className={severityVariant === 'destructive' ? 'border-destructive text-destructive' : severityVariant === 'warning' ? 'border-warning text-warning' : ''}>{entry.severity ?? 'info'}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">IP Address:</span>
              <p className="font-mono text-xs">{entry.ip_address ?? '—'}</p>
            </div>
          </div>

          {entry.details && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Details</h4>
              <p className="text-sm bg-muted rounded-md p-3">{entry.details}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JsonDiff label="Old Data" data={entry.old_data as Record<string, unknown> | null} />
            <JsonDiff label="New Data" data={entry.new_data as Record<string, unknown> | null} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create Audit Trail page**

Create `src/app/(dashboard)/master-data/audit-trail/page.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { AuditDetailDialog } from '@/components/master-data/AuditDetailDialog'
import { useActivityLog, AUDIT_MODULES, AUDIT_SEVERITIES, type ActivityLog } from '@/hooks/useActivityLog'
import { formatRelative } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function AuditTrailPage() {
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('')
  const [severity, setSeverity] = useState('')
  const [detail, setDetail] = useState<ActivityLog | null>(null)

  const { data: logs, isLoading } = useActivityLog({ search, module: module || undefined, severity: severity || undefined })

  const columns = useMemo<ColumnDef<ActivityLog>[]>(() => [
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatRelative(row.getValue('created_at') as string)}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('action')}</span>,
    },
    {
      accessorKey: 'module',
      header: 'Module',
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.getValue('module') as string ?? '—'}</Badge>,
    },
    {
      accessorKey: 'performer_name',
      header: 'User',
      cell: ({ row }) => row.getValue('performer_name') || <span className="text-muted-foreground">System</span>,
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => {
        const sev = row.getValue('severity') as string
        const variant = sev === 'critical' ? 'destructive' : sev === 'warning' ? 'warning' : 'active'
        return <Badge variant="outline" className={variant === 'destructive' ? 'border-destructive text-destructive' : variant === 'warning' ? 'border-warning text-warning' : 'text-xs'}>{sev ?? 'info'}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Trail" description="Activity log across all modules" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search actions…" />
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-40"
        >
          <option value="">All Modules</option>
          {AUDIT_MODULES.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-36"
        >
          <option value="">All Severities</option>
          {AUDIT_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={logs ?? []} isLoading={isLoading} pageSize={50} />

      <AuditDetailDialog
        open={!!detail}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
        entry={detail}
      />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useActivityLog.ts src/components/master-data/AuditDetailDialog.tsx src/app/\(dashboard\)/master-data/audit-trail/page.tsx
git commit -m "feat: add Audit Trail page with filters, detail dialog, and auto-refresh"
```

---

## Task 12: Admin Layout + Settings Pages

**Files:**
- Create: `src/components/master-data/AdminSidebar.tsx`
- Create: `src/app/(dashboard)/master-data/admin/layout.tsx`
- Create: `src/app/(dashboard)/master-data/admin/page.tsx`
- Create: `src/app/(dashboard)/master-data/admin/brand-groups/page.tsx`
- Create: `src/app/(dashboard)/master-data/admin/reason-lists/page.tsx`

- [ ] **Step 1: Create AdminSidebar**

Create `src/components/master-data/AdminSidebar.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Settings, Tag, List, FileText, Radio, MapPin, Briefcase } from 'lucide-react'

const ADMIN_SECTIONS = [
  {
    label: 'Catalog & Pricing',
    items: [
      { label: 'Brand Groups', href: '/master-data/admin/brand-groups', icon: Tag },
      { label: 'Reason Lists', href: '/master-data/admin/reason-lists', icon: List },
      { label: 'Pricing Factors', href: '/master-data/admin/pricing-factors', comingSoon: true, icon: Briefcase },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Document T&C', href: '/master-data/admin/document-terms', comingSoon: true, icon: FileText },
      { label: 'Work Schedule', href: '/master-data/admin/work-schedule', comingSoon: true, icon: Settings },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'Call Center (3CX)', href: '/master-data/admin/call-center', comingSoon: true, icon: Radio },
      { label: 'Traccar GPS', href: '/master-data/admin/traccar', comingSoon: true, icon: MapPin },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-full lg:w-56 shrink-0 space-y-4">
      {ADMIN_SECTIONS.map((section) => (
        <div key={section.label}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">{section.label}</h3>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              item.comingSoon ? (
                <div key={item.href} className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground/60 cursor-not-allowed">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  <Badge variant="outline" className="text-[10px] h-4 ml-auto">Soon</Badge>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                    pathname === item.href
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Create Admin layout**

Create `src/app/(dashboard)/master-data/admin/layout.tsx`:

```typescript
import { AdminSidebar } from '@/components/master-data/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Organization and system configuration</p>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <AdminSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create Admin landing page**

Create `src/app/(dashboard)/master-data/admin/page.tsx`:

```typescript
import { redirect } from 'next/navigation'

export default function AdminPage() {
  redirect('/master-data/admin/brand-groups')
}
```

- [ ] **Step 4: Create Brand Groups page**

Create `src/app/(dashboard)/master-data/admin/brand-groups/page.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEffect } from 'react'

type BrandGroup = DBTable<'brand_groups'>

function useBrandGroups() {
  return useQuery({
    queryKey: ['brand-groups'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('brand_groups').select('*').is('deleted_at', null).order('name')
      if (error) throw error
      return data as BrandGroup[]
    },
  })
}

const bgSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  name_ar: z.string().optional().default(''),
  scope: z.string().min(1, 'Scope is required'),
})

export default function BrandGroupsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BrandGroup | null>(null)
  const { data, isLoading } = useBrandGroups()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof bgSchema>) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('brand_groups').insert({ ...values, name_ar: values.name_ar || null }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-groups'] }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: z.infer<typeof bgSchema> & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('brand_groups').update({ ...values, name_ar: values.name_ar || null }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-groups'] }),
  })

  const form = useForm<z.infer<typeof bgSchema>>({
    resolver: zodResolver(bgSchema),
    defaultValues: { name: '', name_ar: '', scope: 'inventory' },
  })

  useEffect(() => {
    if (dialogOpen && editing) {
      form.reset({ name: editing.name, name_ar: editing.name_ar ?? '', scope: editing.scope })
    } else if (dialogOpen) {
      form.reset()
    }
  }, [dialogOpen, editing, form])

  function onSubmit(values: z.infer<typeof bgSchema>) {
    const mutation = editing
      ? () => updateMutation.mutateAsync({ id: editing.id, ...values })
      : () => createMutation.mutateAsync(values)

    mutation()
      .then(() => { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); setEditing(null) })
      .catch((err: Error) => toast.error(err.message))
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const columns = useMemo<ColumnDef<BrandGroup>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'name_ar',
      header: 'Arabic Name',
      cell: ({ row }) => row.getValue('name_ar') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'scope',
      header: 'Scope',
      cell: ({ row }) => <Badge variant="outline">{row.getValue('scope') as string}</Badge>,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
              <Pencil className="h-4 w-4 mr-2" />Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Brand Groups</h2>
          <div className="flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
            <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>Add</Button>
          </div>
        </div>
        <DataTable columns={columns} data={data ?? []} isLoading={isLoading} globalFilter={search} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Brand Group</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem><FormLabel>Arabic Name</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="scope" render={({ field }) => (
                <FormItem><FormLabel>Scope *</FormLabel><FormControl>
                  <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="inventory">Inventory</option>
                    <option value="tools">Tools</option>
                  </select>
                </FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 5: Create Reason Lists page**

Create `src/app/(dashboard)/master-data/admin/reason-lists/page.tsx`:

```typescript
'use client'

import { useState, useMemo, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ReasonList = DBTable<'reason_lists'>

function useReasonLists() {
  return useQuery({
    queryKey: ['reason-lists'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').select('*').is('deleted_at', null).order('category', { ascending: true }).order('sort_order')
      if (error) throw error
      return data as ReasonList[]
    },
  })
}

const rlSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  label: z.string().min(1, 'Label is required'),
  sort_order: z.coerce.number().int().default(0),
  active: z.boolean().default(true),
})

const CATEGORIES = [
  'cancellation', 'return', 'adjustment', 'credit_note', 'refund',
  'discount', 'complaint', 'reschedule', 'void',
]

export default function ReasonListsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReasonList | null>(null)
  const { data, isLoading } = useReasonLists()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof rlSchema>) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reason-lists'] }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: z.infer<typeof rlSchema> & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reason-lists'] }),
  })

  const form = useForm<z.infer<typeof rlSchema>>({
    resolver: zodResolver(rlSchema),
    defaultValues: { category: '', label: '', sort_order: 0, active: true },
  })

  useEffect(() => {
    if (dialogOpen && editing) {
      form.reset({ category: editing.category, label: editing.label, sort_order: editing.sort_order ?? 0, active: editing.active ?? true })
    } else if (dialogOpen) {
      form.reset()
    }
  }, [dialogOpen, editing, form])

  function onSubmit(values: z.infer<typeof rlSchema>) {
    const mutation = editing
      ? () => updateMutation.mutateAsync({ id: editing.id, ...values })
      : () => createMutation.mutateAsync(values)

    mutation()
      .then(() => { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); setEditing(null) })
      .catch((err: Error) => toast.error(err.message))
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const columns = useMemo<ColumnDef<ReasonList>[]>(() => [
    {
      accessorKey: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <Badge variant="outline">{(row.getValue('category') as string).replace(/_/g, ' ')}</Badge>,
    },
    {
      accessorKey: 'label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Label" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('label')}</span>,
    },
    {
      accessorKey: 'sort_order',
      header: 'Order',
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge variant={row.getValue('active') ? 'active' : 'inactive'}>
          {row.getValue('active') ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
              <Pencil className="h-4 w-4 mr-2" />Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Reason Lists</h2>
          <div className="flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
            <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>Add</Button>
          </div>
        </div>
        <DataTable columns={columns} data={data ?? []} isLoading={isLoading} globalFilter={search} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Reason</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category *</FormLabel><FormControl>
                  <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="label" render={({ field }) => (
                <FormItem><FormLabel>Label *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="sort_order" render={({ field }) => (
                <FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/master-data/AdminSidebar.tsx src/app/\(dashboard\)/master-data/admin/
git commit -m "feat: add Admin settings — layout, brand groups, reason lists"
```

---

## Task 13: Integration Test + PROGRESS.md

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass (cn tests + formatter tests).

- [ ] **Step 3: Start dev server and verify all pages**

```bash
npm run dev
```

Verify each page loads without errors:

| Route | Expected |
|---|---|
| `/master-data/suppliers` | DataTable with suppliers, Add button opens form dialog |
| `/master-data/companies` | Company cards with nested division tables |
| `/master-data/warehouses` | DataTable with warehouses, type badges |
| `/master-data/inventory` | 3 tabs (Products, Spare Parts, Consumables), click item shows variants |
| `/master-data/users` | 3 tabs (Permissions, Roles, Users), role create dialog has permission checkboxes |
| `/master-data/audit-trail` | Log table with module/severity filters, click row opens detail |
| `/master-data/admin` | Redirects to brand-groups, sidebar shows sections |
| `/master-data/admin/brand-groups` | DataTable with brand groups, CRUD works |
| `/master-data/admin/reason-lists` | DataTable with reason lists, CRUD works |

- [ ] **Step 4: Update PROGRESS.md**

Update `PROGRESS.md`:

In the `## ✅ Completed` section, add:
```markdown
- [2026-04-16] **Master Data complete** — Suppliers, Companies & Divisions, Warehouses, Inventory Items, Users & Roles, Audit Trail, Admin
  - Shared infrastructure: DataTable, PageHeader, SearchInput, StatusBadge, ConfirmDialog, formatters
  - 7 hooks with TanStack Query + Supabase CRUD mutations
  - 10 form dialogs with zod validation
  - 9 pages all responsive across breakpoints
```

Change the `## 🔄 In Progress` section to:
```markdown
- Writing Purchase plan (`docs/superpowers/plans/2026-04-16-mms-purchase.md`)
```

Move `Master Data module` from `## ⏳ Not Started` to the completed section.

Update the `## Implementation Plans` table — change the Master Data row status to `**DONE**`.

- [ ] **Step 5: Commit**

```bash
git add PROGRESS.md
git commit -m "chore: Master Data module complete — 7 pages, shared infrastructure"
```

---

## What Comes Next

After Master Data is complete, the next plans (in order) are:

1. **`2026-04-16-mms-purchase.md`** — Full Purchase module (POs, Approvals, Shipments, Landed Costs, Warehouses with 7 tabs, Returns, Dead Stock)
2. **`2026-04-16-mms-sales.md`** — Full Sales module (Create SO, Sale Orders, Returns)
3. **`2026-04-16-mms-csv-import.md`** — CSV import tool (5 entity types)

Each plan will be written before execution begins.
