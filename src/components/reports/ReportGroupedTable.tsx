'use client'

import { Fragment, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  type ReportColumn, formatReportValue, sumColumn, columnAlign,
} from '@/lib/reports/reportColumns'

type Props<T> = {
  columns: ReportColumn<T>[]
  rows: T[]
  /** Group rows under labelled bands with a per-group subtotal. Omit for a flat table. */
  groupBy?: (row: T) => string
  isLoading?: boolean
  emptyText?: string
  /** First-cell label on the grand-total footer. */
  grandTotalLabel?: string
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function ReportGroupedTable<T>({
  columns, rows, groupBy, isLoading, emptyText = 'No data for the selected filters.', grandTotalLabel = 'Grand total',
}: Props<T>) {
  const groups = useMemo(() => {
    if (!groupBy) return null
    const map = new Map<string, T[]>()
    for (const r of rows) {
      const k = groupBy(r) || '—'
      const arr = map.get(k) ?? []
      arr.push(r)
      map.set(k, arr)
    }
    return [...map.entries()].map(([label, gr]) => ({ label, rows: gr }))
  }, [rows, groupBy])

  const totalCols = useMemo(() => new Set(columns.filter((c) => c.total).map((c) => c.header)), [columns])
  const colCount = columns.length

  function cell(row: T, col: ReportColumn<T>) {
    if (col.render) return col.render(row)
    return formatReportValue(col.accessor(row), col.format)
  }

  function TotalsRow({ label, groupRows, variant }: { label: string; groupRows: T[]; variant: 'subtotal' | 'grand' }) {
    return (
      <tr
        className={cn(
          variant === 'grand'
            ? 'border-t-2 border-foreground/20 bg-primary/5 font-semibold'
            : 'border-t bg-muted/40 font-medium',
        )}
      >
        {columns.map((col, i) => {
          const isTotal = totalCols.has(col.header)
          return (
            <td
              key={col.header}
              className={cn(
                'px-3 py-1.5 2xl:px-4 2xl:py-2 tabular-nums whitespace-nowrap',
                alignClass[columnAlign(col)],
              )}
            >
              {i === 0
                ? label
                : isTotal
                  ? formatReportValue(sumColumn(groupRows, col), col.format)
                  : null}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs 2xl:text-sm">
        <thead>
          <tr className="border-b bg-muted/60">
            {columns.map((col) => (
              <th
                key={col.header}
                className={cn(
                  'px-3 py-2 2xl:px-4 2xl:py-3 font-semibold text-muted-foreground whitespace-nowrap',
                  alignClass[columnAlign(col)],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {columns.map((col) => (
                  <td key={col.header} className="px-3 py-2 2xl:px-4">
                    <div className="h-3 w-full max-w-[8rem] animate-pulse rounded bg-muted" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-3 py-10 text-center text-sm text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : groups ? (
            groups.map((g) => (
              <Fragment key={g.label}>
                <tr className="bg-muted/30">
                  <td colSpan={colCount} className="px-3 py-1.5 2xl:px-4 2xl:py-2 text-[11px] 2xl:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label} <span className="font-normal normal-case opacity-60">· {g.rows.length}</span>
                  </td>
                </tr>
                {g.rows.map((row, ri) => (
                  <tr key={`${g.label}-${ri}`} className="hover:bg-accent/40 transition-colors">
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className={cn(
                          'px-3 py-1.5 2xl:px-4 2xl:py-2 align-top',
                          col.wrap
                            ? 'whitespace-normal break-words min-w-[9rem] max-w-[26rem]'
                            : 'whitespace-nowrap',
                          col.format && col.format !== 'text' ? 'tabular-nums' : '',
                          alignClass[columnAlign(col)],
                        )}
                      >
                        {cell(row, col)}
                      </td>
                    ))}
                  </tr>
                ))}
                {totalCols.size > 0 && <TotalsRow label={`Subtotal — ${g.label}`} groupRows={g.rows} variant="subtotal" />}
              </Fragment>
            ))
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-accent/40 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={cn(
                      'px-3 py-1.5 2xl:px-4 2xl:py-2 align-top',
                      col.wrap
                        ? 'whitespace-normal break-words min-w-[9rem] max-w-[26rem]'
                        : 'whitespace-nowrap',
                      col.format && col.format !== 'text' ? 'tabular-nums' : '',
                      alignClass[columnAlign(col)],
                    )}
                  >
                    {cell(row, col)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {!isLoading && rows.length > 0 && totalCols.size > 0 && (
          <tfoot>
            <TotalsRow label={grandTotalLabel} groupRows={rows} variant="grand" />
          </tfoot>
        )}
      </table>
    </div>
  )
}
