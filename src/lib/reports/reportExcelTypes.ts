import type { ReportFormat } from '@/lib/reports/reportColumns'

/** A resolved Excel cell — numbers stay numbers so the sheet carries real
 *  numeric cells with formats, not stringified values. */
export type ReportExcelCell = string | number | null

export type ReportExcelColumnMeta = {
  header: string
  format?: ReportFormat
  /** Summed into subtotal / grand-total rows. */
  total?: boolean
}

export type ReportExcelGroup = {
  label: string
  rows: ReportExcelCell[][]
}

/**
 * Display-ready Excel payload the client POSTs to POST /api/reports/excel. The
 * client resolves its `ReportColumn` accessors into plain cell arrays (aligned
 * to `columns`), so the server never needs the row generics. Exactly one of
 * `rows` (flat) or `groups` (banded, per group) carries the data.
 */
export type ReportExcelPayload = {
  filename: string
  title: string
  subtitle?: string
  columns: ReportExcelColumnMeta[]
  rows?: ReportExcelCell[][]
  groups?: ReportExcelGroup[]
  grandTotalLabel?: string
}
