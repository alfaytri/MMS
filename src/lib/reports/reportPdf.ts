import { createClient } from '@/lib/supabase/client'
import {
  type ReportColumn, formatReportValue, sumColumn, columnAlign,
} from '@/lib/reports/reportColumns'
import type { ReportPdfPayload, ReportPdfRow } from '@/lib/reports/reportHtml'

/**
 * Export a report to PDF. Formats the same grouped rows / subtotals / grand total
 * as the Excel export (one definition drives both), then POSTs the display-ready
 * payload to /api/reports/pdf and downloads the returned file. Throws on failure
 * so callers can toast the message.
 */
export async function exportReportToPdf<T>(opts: {
  filename: string
  title: string
  subtitle?: string
  columns: ReportColumn<T>[]
  rows: T[]
  groupBy?: (row: T) => string
  grandTotalLabel?: string
}): Promise<void> {
  const { columns, rows } = opts
  const totalCols = columns.filter((c) => c.total)
  const dataCells = (row: T): string[] => columns.map((c) => formatReportValue(c.accessor(row), c.format))
  const totalsCells = (label: string, groupRows: T[]): string[] =>
    columns.map((c, i) => (i === 0 ? label : c.total ? formatReportValue(sumColumn(groupRows, c), c.format) : ''))

  const pdfRows: ReportPdfRow[] = []
  if (rows.length > 0 && opts.groupBy) {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const k = opts.groupBy(row) || '—'
      const arr = map.get(k) ?? []
      arr.push(row)
      map.set(k, arr)
    }
    for (const [label, groupRows] of map) {
      pdfRows.push({ kind: 'group', cells: [`${label}  (${groupRows.length})`] })
      for (const row of groupRows) pdfRows.push({ kind: 'data', cells: dataCells(row) })
      if (totalCols.length > 0) pdfRows.push({ kind: 'subtotal', cells: totalsCells(`Subtotal — ${label}`, groupRows) })
    }
  } else {
    for (const row of rows) pdfRows.push({ kind: 'data', cells: dataCells(row) })
  }
  if (rows.length > 0 && totalCols.length > 0) {
    pdfRows.push({ kind: 'grand', cells: totalsCells(opts.grandTotalLabel ?? 'Grand total', rows) })
  }

  const payload: ReportPdfPayload = {
    title: opts.title,
    subtitle: opts.subtitle,
    generatedAt: new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
    columns: columns.map((c) => ({ header: c.header, align: columnAlign(c) })),
    rows: pdfRows,
    emptyText: rows.length === 0 ? 'No data for the selected filters.' : undefined,
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/reports/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = await res.json().then((j) => j?.error).catch(() => null)
    throw new Error(msg ?? `PDF export failed (${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const clean = opts.filename.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'report'
  a.download = clean.endsWith('.pdf') ? clean : `${clean}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
