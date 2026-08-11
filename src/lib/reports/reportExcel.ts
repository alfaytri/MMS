import { type ReportColumn, sumColumn } from '@/lib/reports/reportColumns'

// ── Shared palette (matches the styled warehouse export so the whole app's
// Excel output reads as one document). ARGB (alpha first).
const STYLE = {
  ink:        'FF0F172A', // slate-900
  headerFill: 'FF0F172A', // slate-900 — header band
  groupFill:  'FFE2E8F0', // slate-200 — group band
  subtotalFill: 'FFF1F5F9', // slate-100 — subtotal band
  grandFill:  'FF334155', // slate-700 — grand-total band (white text)
  subtitle:   'FF475569', // slate-600
  meta:       'FF94A3B8', // slate-400
  gridline:   'FFE2E8F0', // slate-200
  zebra:      'FFF8FAFC', // slate-50
  white:      'FFFFFFFF',
} as const

const FONT = 'Calibri'

const NUM_FMT: Record<'number' | 'currency' | 'percent', string> = {
  number:   '#,##0.##',
  currency: '#,##0.00',
  percent:  '0.00"%"',
}

function isNumeric<T>(col: ReportColumn<T>): boolean {
  return col.format === 'number' || col.format === 'currency' || col.format === 'percent'
}

function numFmt<T>(col: ReportColumn<T>): string | undefined {
  return col.format && col.format !== 'text' ? NUM_FMT[col.format] : undefined
}

function cellValue<T>(col: ReportColumn<T>, row: T): string | number | null {
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
 * Export a report to a designed, single-sheet .xlsx: title band, applied-filters
 * subtitle, generated-at meta, a frozen slate header, bordered + zebra data
 * rows, per-group bands with subtotals, and a stand-out grand-total band —
 * numerics right-aligned with formats. ExcelJS is dynamically imported so its
 * ~1 MB footprint only loads on export.
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
  const ExcelJS = (await import('exceljs')).default
  const { columns, rows } = opts
  const colCount = Math.max(columns.length, 1)
  const totalCols = columns.filter((c) => c.total)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'MMS'
  wb.created = new Date()
  const ws = wb.addWorksheet('Report')

  const thin = { style: 'thin' as const, color: { argb: STYLE.gridline } }
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin }
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  let r = 1
  // Title
  ws.mergeCells(r, 1, r, colCount)
  const t = ws.getCell(r, 1)
  t.value = opts.title
  t.font = { name: FONT, bold: true, size: 16, color: { argb: STYLE.ink } }
  t.alignment = { vertical: 'middle' }
  ws.getRow(r).height = 24
  r++
  // Subtitle (applied filters)
  if (opts.subtitle) {
    ws.mergeCells(r, 1, r, colCount)
    const s = ws.getCell(r, 1)
    s.value = opts.subtitle
    s.font = { name: FONT, size: 11, color: { argb: STYLE.subtitle } }
    r++
  }
  // Meta
  ws.mergeCells(r, 1, r, colCount)
  const m = ws.getCell(r, 1)
  m.value = `Generated ${generatedAt}`
  m.font = { name: FONT, italic: true, size: 9, color: { argb: STYLE.meta } }
  r++
  r++ // spacer

  // Header
  const headerRowIdx = r
  const header = ws.getRow(headerRowIdx)
  columns.forEach((col, i) => {
    const c = header.getCell(i + 1)
    c.value = col.header
    c.font = { name: FONT, bold: true, size: 11, color: { argb: STYLE.white } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.headerFill } }
    c.alignment = { vertical: 'middle', horizontal: isNumeric(col) ? 'right' : 'left' }
    c.border = allBorders
  })
  header.height = 20
  r++

  const writeDataRow = (row: T, zebra: boolean) => {
    const dr = ws.getRow(r)
    columns.forEach((col, ci) => {
      const c = dr.getCell(ci + 1)
      const v = cellValue(col, row)
      c.value = v
      const fmt = numFmt(col)
      if (fmt && typeof v === 'number') c.numFmt = fmt
      c.font = { name: FONT, size: 10, color: { argb: STYLE.ink } }
      c.alignment = { vertical: 'middle', horizontal: isNumeric(col) ? 'right' : 'left' }
      c.border = allBorders
      if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.zebra } }
    })
    r++
  }

  const writeTotalsRow = (label: string, groupRows: T[], variant: 'subtotal' | 'grand') => {
    const fill = variant === 'grand' ? STYLE.grandFill : STYLE.subtotalFill
    const textColor = variant === 'grand' ? STYLE.white : STYLE.ink
    const tr = ws.getRow(r)
    for (let ci = 0; ci < colCount; ci++) {
      const c = tr.getCell(ci + 1)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      c.border = { ...allBorders, top: { style: 'medium', color: { argb: STYLE.subtitle } } }
      c.font = { name: FONT, bold: true, size: variant === 'grand' ? 11 : 10, color: { argb: textColor } }
    }
    tr.getCell(1).value = label
    tr.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
    for (const col of totalCols) {
      const ci = columns.indexOf(col)
      const c = tr.getCell(ci + 1)
      c.value = sumColumn(groupRows, col)
      const fmt = numFmt(col)
      if (fmt) c.numFmt = fmt
      c.alignment = { vertical: 'middle', horizontal: 'right' }
    }
    tr.height = variant === 'grand' ? 20 : 18
    r++
  }

  if (rows.length === 0) {
    ws.mergeCells(r, 1, r, colCount)
    const e = ws.getCell(r, 1)
    e.value = 'No data for the selected filters.'
    e.font = { name: FONT, italic: true, size: 10, color: { argb: STYLE.meta } }
    e.alignment = { horizontal: 'center' }
    r++
  } else if (opts.groupBy) {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const k = opts.groupBy(row) || '—'
      const arr = map.get(k) ?? []
      arr.push(row)
      map.set(k, arr)
    }
    for (const [label, groupRows] of map) {
      // group band
      ws.mergeCells(r, 1, r, colCount)
      const gb = ws.getCell(r, 1)
      gb.value = `${label}  (${groupRows.length})`
      gb.font = { name: FONT, bold: true, size: 11, color: { argb: STYLE.ink } }
      gb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.groupFill } }
      gb.alignment = { vertical: 'middle' }
      ws.getRow(r).height = 18
      r++
      groupRows.forEach((row, ri) => writeDataRow(row, ri % 2 === 1))
      if (totalCols.length > 0) writeTotalsRow(`Subtotal — ${label}`, groupRows, 'subtotal')
    }
  } else {
    rows.forEach((row, ri) => writeDataRow(row, ri % 2 === 1))
  }

  if (rows.length > 0 && totalCols.length > 0) {
    writeTotalsRow(opts.grandTotalLabel ?? 'Grand total', rows, 'grand')
  }

  // Column widths
  columns.forEach((col, i) => {
    let w = col.header.length
    for (const row of rows) {
      const v = cellValue(col, row)
      const len = v === null ? 0 : (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }).length : String(v).length)
      w = Math.max(w, len)
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 48)
  })

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }]
  const lastCol = ws.getColumn(colCount).letter
  ws.autoFilter = { from: `A${headerRowIdx}`, to: `${lastCol}${headerRowIdx}` }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = stampName(opts.filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
