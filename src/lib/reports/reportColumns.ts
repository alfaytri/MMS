import type { ReactNode } from 'react'
import type { ExcelColumn } from '@/lib/utils/exportToExcel'

/** Number/date formats a report column can carry (mirrors ExcelColumn). */
export type ReportFormat = 'number' | 'currency' | 'percent' | 'text'

/**
 * A report column drives BOTH the on-screen grouped table and the Excel/PDF
 * export from one definition. It extends {@link ExcelColumn} (header, accessor,
 * format, total) with on-screen-only concerns (`render` for links/badges,
 * `align`).
 */
export type ReportColumn<T> = ExcelColumn<T> & {
  /** Custom on-screen cell (drill-down links, badges). Falls back to the formatted accessor. Never affects export. */
  render?: (row: T) => ReactNode
  /** Override the auto alignment (numeric → right, else left). */
  align?: 'left' | 'right' | 'center'
  /**
   * Let this column's cells wrap onto multiple lines instead of forcing a
   * single line. Use for long free-text columns (product / customer / supplier
   * names, warehouse, category). Leave off for dates, doc numbers, SKUs and
   * numeric columns so they never break mid-token. On-screen only — export is unaffected.
   */
  wrap?: boolean
}

const QAR = new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 2,
})

/** Human display of a raw accessor value per its format. `—` for null/blank/non-finite. */
export function formatReportValue(
  v: string | number | null | undefined,
  format?: ReportFormat,
): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—'
    if (format === 'currency') return QAR.format(v)
    if (format === 'percent') return `${v.toFixed(2)}%`
    if (format === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return String(v)
}

/** Sum a total-flagged column over a set of rows (non-numeric/null contribute 0). */
export function sumColumn<T>(rows: T[], col: ReportColumn<T>): number {
  return rows.reduce((acc, r) => {
    const v = col.accessor(r)
    return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  }, 0)
}

/** Resolve the effective alignment of a column. */
export function columnAlign<T>(col: ReportColumn<T>): 'left' | 'right' | 'center' {
  if (col.align) return col.align
  return col.format === 'currency' || col.format === 'number' || col.format === 'percent' ? 'right' : 'left'
}
