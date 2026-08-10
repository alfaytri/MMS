import * as XLSX from 'xlsx'

export type ExcelColumn<T> = {
  header: string
  accessor: (row: T) => string | number | null | undefined
  format?: 'number' | 'currency' | 'percent' | 'text'
  /** Include this column in the styled workbook's totals row (sum). */
  total?: boolean
}

const NUM_FMT: Record<NonNullable<ExcelColumn<unknown>['format']>, string> = {
  number:   '#,##0.##',
  currency: '#,##0.00',
  percent:  '0.00"%"',
  text:     '@',
}

function buildWorksheet<T>(columns: ExcelColumn<T>[], rows: T[]): XLSX.WorkSheet {
  const aoa: (string | number | null)[][] = [
    columns.map((c) => c.header),
    ...rows.map((r) =>
      columns.map((c) => {
        const v = c.accessor(r)
        if (v === null || v === undefined) return null
        return v
      }),
    ),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  columns.forEach((col, colIdx) => {
    if (!col.format) return
    for (let r = 1; r <= rows.length; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: colIdx })
      const cell = ws[cellRef]
      if (cell) cell.z = NUM_FMT[col.format!]
    }
  })
  return ws
}

// Excel sheet names: ≤31 chars, none of \ / ? * [ ] :, and must be unique in
// the workbook. Sanitize + de-duplicate so a raw sub-container name can never
// crash the export.
function safeSheetName(name: string, used: Set<string>): string {
  const base = (name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let i = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function stampName(filename: string): string {
  const clean = filename.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'export'
  return clean.endsWith('.xlsx') ? clean : `${clean}.xlsx`
}

/**
 * Client-side export of an array of rows to a single-sheet .xlsx file.
 * Triggers a browser download; no server round-trip.
 */
export function exportToExcel<T>(opts: {
  filename: string
  sheetName: string
  columns: ExcelColumn<T>[]
  rows: T[]
}) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildWorksheet(opts.columns, opts.rows), safeSheetName(opts.sheetName, new Set()))
  XLSX.writeFile(wb, stampName(opts.filename))
}

// ─── Styled workbook (ExcelJS) ────────────────────────────────────────────────
// A palette shared by every styled sheet so the export reads as one document.
const STYLE = {
  ink:        'FF0F172A', // slate-900  — title + header text-on-fill is white
  headerFill: 'FF0F172A', // slate-900  — header band
  subtitle:   'FF475569', // slate-600
  meta:       'FF94A3B8', // slate-400  — generated-at line
  gridline:   'FFE2E8F0', // slate-200  — cell borders
  zebra:      'FFF8FAFC', // slate-50   — alternating data rows
  totalsFill: 'FFE2E8F0', // slate-200  — totals band
  white:      'FFFFFFFF',
} as const

const FONT = 'Calibri'

function numFmtFor(format?: ExcelColumn<unknown>['format']): string | undefined {
  if (!format || format === 'text') return undefined
  return NUM_FMT[format]
}

function isNumericFormat(format?: ExcelColumn<unknown>['format']): boolean {
  return format === 'number' || format === 'currency' || format === 'percent'
}

function displayLen(v: string | number | null | undefined, format?: ExcelColumn<unknown>['format']): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number' && isNumericFormat(format)) {
    // Approximate the on-screen width once thousands separators + decimals land.
    return v.toLocaleString('en-US', { minimumFractionDigits: format === 'number' ? 0 : 2, maximumFractionDigits: 2 }).length
  }
  return String(v).length
}

/**
 * Client-side export to a designed, multi-sheet .xlsx workbook — one sheet per
 * entry. Each sheet gets a title band, a styled/frozen header, bordered + zebra
 * data rows, right-aligned numerics with formats, an optional totals row, and
 * an autofilter. Used for the per-warehouse stock export (one sheet per
 * sub-container, workbook named after the warehouse).
 *
 * ExcelJS is dynamically imported so its ~1 MB footprint stays out of the main
 * bundle and only loads when someone actually exports.
 */
export async function exportSheetsToExcel<T>(opts: {
  filename: string
  /** Big title shown on every sheet (e.g. the warehouse name). Falls back to the sheet name. */
  title?: string
  sheets: Array<{
    name: string
    columns: ExcelColumn<T>[]
    rows: T[]
    /** Secondary line under the title (e.g. "Sub-container: Kitchen"). */
    subtitle?: string
  }>
}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MMS'
  wb.created = new Date()

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const used = new Set<string>()
  const sheets = opts.sheets.length > 0 ? opts.sheets : [{ name: 'Empty', columns: [] as ExcelColumn<T>[], rows: [] as T[], subtitle: undefined }]

  for (const sheet of sheets) {
    const { columns, rows } = sheet
    const colCount = Math.max(columns.length, 1)
    const ws = wb.addWorksheet(safeSheetName(sheet.name, used))

    const thin = { style: 'thin' as const, color: { argb: STYLE.gridline } }
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin }

    // ── Title band ──
    let r = 1
    ws.mergeCells(r, 1, r, colCount)
    const titleCell = ws.getCell(r, 1)
    titleCell.value = opts.title ?? sheet.name
    titleCell.font = { name: FONT, bold: true, size: 16, color: { argb: STYLE.ink } }
    titleCell.alignment = { vertical: 'middle' }
    ws.getRow(r).height = 24
    r++

    ws.mergeCells(r, 1, r, colCount)
    const subCell = ws.getCell(r, 1)
    subCell.value = sheet.subtitle ? `${sheet.subtitle} — Stock Report` : 'Stock Report'
    subCell.font = { name: FONT, size: 11, color: { argb: STYLE.subtitle } }
    r++

    ws.mergeCells(r, 1, r, colCount)
    const metaCell = ws.getCell(r, 1)
    metaCell.value = `Generated ${generatedAt}`
    metaCell.font = { name: FONT, italic: true, size: 9, color: { argb: STYLE.meta } }
    r++

    r++ // spacer row

    // ── Header row ──
    const headerRowIdx = r
    const headerRow = ws.getRow(headerRowIdx)
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { name: FONT, bold: true, size: 11, color: { argb: STYLE.white } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.headerFill } }
      cell.alignment = { vertical: 'middle', horizontal: isNumericFormat(col.format) ? 'right' : 'left' }
      cell.border = allBorders
    })
    headerRow.height = 20
    r++

    // ── Data rows ──
    const firstDataRow = r
    if (rows.length === 0) {
      ws.mergeCells(r, 1, r, colCount)
      const empty = ws.getCell(r, 1)
      empty.value = 'No stock in this sub-container.'
      empty.font = { name: FONT, italic: true, size: 10, color: { argb: STYLE.meta } }
      empty.alignment = { horizontal: 'center' }
      r++
    } else {
      rows.forEach((row, ri) => {
        const dataRow = ws.getRow(r)
        columns.forEach((col, ci) => {
          const cell = dataRow.getCell(ci + 1)
          const raw = col.accessor(row)
          if (raw === null || raw === undefined) {
            cell.value = null
          } else if (typeof raw === 'number' && isNumericFormat(col.format)) {
            cell.value = raw
            const fmt = numFmtFor(col.format)
            if (fmt) cell.numFmt = fmt
          } else {
            cell.value = raw
          }
          cell.font = { name: FONT, size: 10, color: { argb: STYLE.ink } }
          cell.alignment = { vertical: 'middle', horizontal: isNumericFormat(col.format) ? 'right' : 'left' }
          cell.border = allBorders
          if (ri % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.zebra } }
          }
        })
        r++
      })
    }
    const lastDataRow = r - 1

    // ── Totals row (only over flagged columns, and only when there are rows) ──
    const totalCols = columns.map((c, i) => ({ c, i })).filter((x) => x.c.total)
    if (rows.length > 0 && totalCols.length > 0) {
      const totalsRow = ws.getRow(r)
      // Label in the first column.
      const labelCell = totalsRow.getCell(1)
      labelCell.value = 'TOTAL'
      labelCell.font = { name: FONT, bold: true, size: 10, color: { argb: STYLE.ink } }
      labelCell.alignment = { vertical: 'middle', horizontal: 'left' }
      for (let ci = 0; ci < colCount; ci++) {
        const cell = totalsRow.getCell(ci + 1)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.totalsFill } }
        cell.border = { ...allBorders, top: { style: 'medium', color: { argb: STYLE.subtitle } } }
        if (!cell.font) cell.font = { name: FONT, bold: true, size: 10, color: { argb: STYLE.ink } }
      }
      for (const { c, i } of totalCols) {
        const letter = ws.getColumn(i + 1).letter
        const sum = rows.reduce((acc, row) => {
          const v = c.accessor(row)
          return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0)
        }, 0)
        const cell = totalsRow.getCell(i + 1)
        cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, result: sum }
        const fmt = numFmtFor(c.format)
        if (fmt) cell.numFmt = fmt
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: STYLE.ink } }
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }
      totalsRow.height = 18
      r++
    }

    // ── Column widths from header + content ──
    columns.forEach((col, i) => {
      let w = col.header.length
      for (const row of rows) w = Math.max(w, displayLen(col.accessor(row), col.format))
      ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 45)
    })

    // ── Freeze the title band + header; autofilter the data grid. ──
    ws.views = [{ state: 'frozen', ySplit: headerRowIdx }]
    if (columns.length > 0) {
      const lastColLetter = ws.getColumn(colCount).letter
      ws.autoFilter = { from: `A${headerRowIdx}`, to: `${lastColLetter}${Math.max(lastDataRow, headerRowIdx)}` }
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = stampName(opts.filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click's navigation isn't cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
