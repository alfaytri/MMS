'use client'

import { Fragment, useMemo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
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
  /** Opt-in pagination: render `pageSize` rows at a time with prev/next. The
   *  grand total still reflects ALL rows; per-group subtotals are hidden while
   *  paginated (a group can span pages). Omit for the classic all-rows table. */
  pageSize?: number
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function ReportGroupedTable<T>({
  columns, rows, groupBy, isLoading, emptyText = 'No data for the selected filters.', grandTotalLabel = 'Grand total', pageSize,
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

  // ── Pagination (opt-in via pageSize) ────────────────────────────────────
  // Rows in the order they render (grouped bands first, else flat) so paging
  // matches the eye. The grand total below still sums ALL rows; per-group
  // subtotals are hidden while paginated since a group can span pages.
  const orderedRows = useMemo(() => (groups ? groups.flatMap((g) => g.rows) : rows), [groups, rows])
  const paginated = !!pageSize && pageSize > 0 && orderedRows.length > pageSize
  const pageCount = paginated ? Math.ceil(orderedRows.length / pageSize) : 1
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [orderedRows.length, pageSize])
  const safePage = Math.min(page, pageCount - 1)
  const start = paginated ? safePage * pageSize : 0
  const end = paginated ? start + pageSize : orderedRows.length
  const pageRows = paginated ? orderedRows.slice(start, end) : orderedRows
  const fullCountByLabel = useMemo(
    () => new Map((groups ?? []).map((g) => [g.label, g.rows.length])),
    [groups],
  )
  const pageGroups = useMemo(() => {
    if (!groupBy) return null
    const map = new Map<string, T[]>()
    for (const r of pageRows) {
      const k = groupBy(r) || '—'
      const arr = map.get(k) ?? []
      arr.push(r)
      map.set(k, arr)
    }
    return [...map.entries()].map(([label, gr]) => ({ label, rows: gr }))
  }, [pageRows, groupBy])

  function cell(row: T, col: ReportColumn<T>) {
    if (col.render) return col.render(row)
    return formatReportValue(col.accessor(row), col.format)
  }

  /** One data <tr>. Extracted so flat, grouped and nested paths render identically. */
  function dataRow(row: T, key: string, index = 0) {
    return (
      <tr key={key} className={cn('hover:bg-accent/40 transition-colors', STAGGER_IN)} style={staggerDelay(index)}>
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
    )
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
    <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
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
          ) : pageGroups ? (
            pageGroups.map((g) => (
              <Fragment key={g.label}>
                <tr className="bg-muted/30">
                  <td colSpan={colCount} className="px-3 py-1.5 2xl:px-4 2xl:py-2 text-[11px] 2xl:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label} <span className="font-normal normal-case opacity-60">· {fullCountByLabel.get(g.label) ?? g.rows.length}</span>
                  </td>
                </tr>
                {g.rows.map((row, ri) => dataRow(row, `${g.label}-${ri}`, ri))}
                {!paginated && totalCols.size > 0 && <TotalsRow label={`Subtotal — ${g.label}`} groupRows={g.rows} variant="subtotal" />}
              </Fragment>
            ))
          ) : (
            pageRows.map((row, ri) => dataRow(row, String(ri), ri))
          )}
        </tbody>
        {!isLoading && rows.length > 0 && totalCols.size > 0 && (
          <tfoot>
            <TotalsRow label={grandTotalLabel} groupRows={rows} variant="grand" />
          </tfoot>
        )}
      </table>
      </div>
      {paginated && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {start + 1}–{Math.min(end, orderedRows.length)} of {orderedRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-md border px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Prev
            </button>
            <span className="px-1 tabular-nums">Page {safePage + 1} / {pageCount}</span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-md border px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
