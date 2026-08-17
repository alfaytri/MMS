import { createClient } from '@/lib/supabase/client'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import type { ReportExcelCell, ReportExcelPayload } from '@/lib/reports/reportExcelTypes'

function isNumeric<T>(col: ReportColumn<T>): boolean {
  return col.format === 'number' || col.format === 'currency' || col.format === 'percent'
}

/** Resolve one column's accessor for a row into an Excel cell (numbers kept
 *  numeric so the sheet gets real numbers + formats). Mirrors the old
 *  in-browser writer exactly. */
function cellValue<T>(col: ReportColumn<T>, row: T): ReportExcelCell {
  const v = col.accessor(row)
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && isNumeric(col)) return Number.isFinite(v) ? v : null
  return typeof v === 'number' ? v : String(v)
}

function stampName(filename: string): string {
  const clean = filename.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'report'
  return clean.endsWith('.xlsx') ? clean : `${clean}.xlsx`
}

/**
 * Export a report to a designed, single-sheet .xlsx.
 *
 * The heavy workbook generation (ExcelJS) runs SERVER-SIDE at
 * POST /api/reports/excel — the client resolves the columns + rows into a
 * display-ready payload (numbers preserved) and POSTs it, then downloads the
 * returned file. This mirrors the PDF export and keeps ExcelJS (a ~1 MB
 * CommonJS lib that does not chunk reliably in the browser — its lazy chunk
 * 404s in this Next build) off the client entirely. Throws on failure so
 * callers can toast the message. Same public signature as before, so callers
 * (ReportExportMenu, dialogs) need no change.
 */
export async function exportReportToExcel<T>(opts: {
  filename: string
  title: string
  subtitle?: string
  columns: ReportColumn<T>[]
  rows: T[]
  groupBy?: (row: T) => string
  grandTotalLabel?: string
}): Promise<void> {
  const { columns, rows } = opts
  const toCells = (row: T): ReportExcelCell[] => columns.map((c) => cellValue(c, row))

  const payload: ReportExcelPayload = {
    filename: opts.filename,
    title: opts.title,
    subtitle: opts.subtitle,
    columns: columns.map((c) => ({ header: c.header, format: c.format, total: c.total })),
    grandTotalLabel: opts.grandTotalLabel,
  }

  if (opts.groupBy) {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const k = opts.groupBy(row) || '—'
      const arr = map.get(k) ?? []
      if (!map.has(k)) map.set(k, arr)
      arr.push(row)
    }
    payload.groups = Array.from(map, ([label, groupRows]) => ({ label, rows: groupRows.map(toCells) }))
  } else {
    payload.rows = rows.map(toCells)
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/reports/excel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = await res.json().then((j) => j?.error).catch(() => null)
    throw new Error(msg ?? `Excel export failed (${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = stampName(opts.filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
