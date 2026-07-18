'use client'

import { useState, useEffect } from 'react'
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
import { EmptyState } from './EmptyState'
import { cn } from '@/lib/utils'

export interface ManualPaginationProps {
  pageIndex: number
  pageCount: number
  total: number
  onPageChange: (pageIndex: number) => void
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  globalFilter?: string
  pageSize?: number
  onRowClick?: (row: TData) => void
  rowClassName?: (row: TData) => string | undefined
  manualPagination?: ManualPaginationProps
  emptyState?: {
    title?: string
    description?: string
    icon?: React.ReactNode
    action?: React.ReactNode
  }
  mobileCardRender?: (row: TData) => React.ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  globalFilter = '',
  pageSize = 20,
  onRowClick,
  rowClassName,
  manualPagination,
  emptyState,
  mobileCardRender,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const isManual = !!manualPagination

  const table = useReactTable({
    data,
    columns,
    manualPagination: isManual,
    pageCount: isManual ? manualPagination!.pageCount : undefined,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      ...(isManual && { pagination: { pageIndex: manualPagination!.pageIndex, pageSize } }),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    ...(isManual && {
      onPaginationChange: (updater) => {
        const current = { pageIndex: manualPagination!.pageIndex, pageSize }
        const next = typeof updater === 'function' ? updater(current) : updater
        if (next.pageIndex !== current.pageIndex) {
          manualPagination!.onPageChange(next.pageIndex)
        }
      },
    }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  useEffect(() => {
    table.setPageSize(pageSize)
  }, [pageSize, table])

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border hidden md:block">
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
        <div className="md:hidden space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted/40 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const rows = table.getRowModel().rows
  const isEmpty = rows.length === 0

  return (
    <div>
      {/* Mobile: card list or horizontal-scroll fallback */}
      <div className="md:hidden">
        {isEmpty ? (
          <EmptyState
            title={emptyState?.title}
            description={emptyState?.description}
            icon={emptyState?.icon}
            action={emptyState?.action}
          />
        ) : mobileCardRender ? (
          <div className="space-y-2">
            {rows.map((row) => {
              const cls = cn(
                'w-full text-left bg-card border rounded-md p-3 min-h-11',
                onRowClick && 'hover:bg-accent active:bg-accent transition-colors',
                !onRowClick && 'cursor-default',
                rowClassName?.(row.original),
              )
              return onRowClick ? (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onRowClick(row.original)}
                  className={cls}
                >
                  {mobileCardRender(row.original)}
                </button>
              ) : (
                <div key={row.id} className={cls}>
                  {mobileCardRender(row.original)}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto relative rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header, i) => (
                      <TableHead
                        key={header.id}
                        className={cn(i === 0 && 'sticky left-0 bg-background z-10')}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(onRowClick ? 'cursor-pointer' : '', rowClassName?.(row.original))}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <TableCell
                        key={cell.id}
                        className={cn(i === 0 && 'sticky left-0 bg-background z-10')}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 h-full w-4 bg-gradient-to-l from-background to-transparent"
            />
          </div>
        )}
      </div>

      {/* Desktop: standard table */}
      <div className="rounded-md border hidden md:block">
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
            {isEmpty ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState
                    title={emptyState?.title}
                    description={emptyState?.description}
                    icon={emptyState?.icon}
                    action={emptyState?.action}
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick ? 'cursor-pointer' : '', rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <DataTablePagination table={table} total={manualPagination?.total} />
      )}
    </div>
  )
}
