'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface ResponsiveTableColumn<T> {
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  hideBelow?: 'sm' | 'md' | 'lg'
}

export interface ResponsiveTableProps<T> {
  data: T[]
  columns: ResponsiveTableColumn<T>[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  mobileCardRender?: (row: T) => React.ReactNode
  isLoading?: boolean
  emptyState?: React.ReactNode
  className?: string
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

export function ResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  onRowClick,
  mobileCardRender,
  isLoading = false,
  emptyState,
  className,
}: ResponsiveTableProps<T>) {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading" className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="min-h-[80px] flex items-center justify-center text-muted-foreground text-sm">
        {emptyState ?? 'No results.'}
      </div>
    )
  }

  return (
    <div className={cn('w-full', className)}>
      {mobileCardRender ? (
        <div className="md:hidden space-y-2" data-mobile-cards>
          {data.map((row) => (
            <button
              key={getRowKey(row)}
              type="button"
              onClick={() => onRowClick?.(row)}
              disabled={!onRowClick}
              className={cn(
                'w-full text-left bg-card border rounded-md p-3 min-h-11',
                onRowClick && 'hover:bg-accent active:bg-accent transition-colors',
                !onRowClick && 'cursor-default',
              )}
            >
              {mobileCardRender(row)}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="md:hidden overflow-x-auto relative"
          data-mobile-fallback
        >
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c, i) => (
                  <TableHead
                    key={i}
                    className={cn(alignClass(c.align), i === 0 && 'sticky left-0 bg-background z-10')}
                  >
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {columns.map((c, i) => (
                    <TableCell
                      key={i}
                      className={cn(alignClass(c.align), i === 0 && 'sticky left-0 bg-background z-10')}
                    >
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-background to-transparent"
          />
        </div>
      )}

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) => (
                <TableHead key={i} className={alignClass(c.align)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {columns.map((c, i) => (
                  <TableCell key={i} className={alignClass(c.align)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
