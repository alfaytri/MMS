import ExcelJS from 'exceljs'
import type { ReportFormat } from '@/lib/reports/reportColumns'
import type { ReportExcelCell, ReportExcelPayload } from '@/lib/reports/reportExcelTypes'

// ── Shared palette (matches the styled warehouse export so the whole app's
// Excel output reads as one document). ARGB (alpha first).
const STYLE = {
  ink:          'FF0F172A', // slate-900
  headerFill:   'FF0F172A', // slate-900 — header band
  groupFill:    'FFE2E8F0', // slate-200 — group band
  subtotalFill: 'FFF1F5F9', // slate-100 — subtotal band
  grandFill:    'FF334155', // slate-700 — grand-total band (white text)
  subtitle:     'FF475569', // slate-600
  meta:         'FF94A3B8', // slate-400
  gridline:     'FFE2E8F0', // slate-200
  zebra:        'FFF8FAFC', // slate-50
  white:        'FFFFFFFF',
} as const

const FONT = 'Calibri'

const NUM_FMT: Record<'number' | 'currency' | 'percent', string> = {
  number:   '#,##0.##',
  currency: '#,##0.00',
  percent:  '0.00"%"',
}

function isNumericFmt(f?: ReportFormat): boolean {
  return f === 'number' || f === 'currency' || f === 'percent'
}

function numFmtFor(f?: ReportFormat): string | undefined {
  return f && f !== 'text' ? NUM_FMT[f] : undefined
}

function sumCol(rows: ReportExcelCell[][], ci: number): number {
  return rows.reduce((acc, row) => {
    const v = row[ci]
    return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  }, 0)
}

/**
 * Build a designed, single-sheet .xlsx from a display-ready payload: title band,
 * applied-filters subtitle, generated-at meta, a frozen slate header, bordered +
 * zebra data rows, per-group bands with subtotals, and a stand-out grand-total
 * band — numerics right-aligned with formats. Runs in the Node route (ExcelJS
 * never touches the browser bundle). Returns the raw workbook bytes.
 */
export async function buildReportWorkbookBuffer(payload: ReportExcelPayload): Promise<Buffer> {
  const columns = payload.columns
  const colCount = Math.max(columns.length, 1)
  const totalIdx = columns.map((c, i) => (c.total ? i : -1)).filter((i) => i >= 0)
  const flatRows: ReportExcelCell[][] = payload.groups ? payload.groups.flatMap((g) => g.rows) : (payload.rows ?? [])
  const hasData = flatRows.length > 0

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
  t.value = payload.title
  t.font = { name: FONT, bold: true, size: 16, color: { argb: STYLE.ink } }
  t.alignment = { vertical: 'middle' }
  ws.getRow(r).height = 24
  r++
  // Subtitle (applied filters)
  if (payload.subtitle) {
    ws.mergeCells(r, 1, r, colCount)
    const s = ws.getCell(r, 1)
    s.value = payload.subtitle
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
    c.alignment = { vertical: 'middle', horizontal: isNumericFmt(col.format) ? 'right' : 'left' }
    c.border = allBorders
  })
  header.height = 20
  r++

  const writeDataRow = (cells: ReportExcelCell[], zebra: boolean) => {
    const dr = ws.getRow(r)
    columns.forEach((col, ci) => {
      const c = dr.getCell(ci + 1)
      const v = cells[ci] ?? null
      c.value = v
      const fmt = numFmtFor(col.format)
      if (fmt && typeof v === 'number') c.numFmt = fmt
      c.font = { name: FONT, size: 10, color: { argb: STYLE.ink } }
      c.alignment = { vertical: 'middle', horizontal: isNumericFmt(col.format) ? 'right' : 'left' }
      c.border = allBorders
      if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.zebra } }
    })
    r++
  }

  const writeTotalsRow = (label: string, rowsForSum: ReportExcelCell[][], variant: 'subtotal' | 'grand') => {
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
    for (const ci of totalIdx) {
      const c = tr.getCell(ci + 1)
      c.value = sumCol(rowsForSum, ci)
      const fmt = numFmtFor(columns[ci].format)
      if (fmt) c.numFmt = fmt
      c.alignment = { vertical: 'middle', horizontal: 'right' }
    }
    tr.height = variant === 'grand' ? 20 : 18
    r++
  }

  if (!hasData) {
    ws.mergeCells(r, 1, r, colCount)
    const e = ws.getCell(r, 1)
    e.value = 'No data for the selected filters.'
    e.font = { name: FONT, italic: true, size: 10, color: { argb: STYLE.meta } }
    e.alignment = { horizontal: 'center' }
    r++
  } else if (payload.groups) {
    for (const g of payload.groups) {
      // group band
      ws.mergeCells(r, 1, r, colCount)
      const gb = ws.getCell(r, 1)
      gb.value = `${g.label}  (${g.rows.length})`
      gb.font = { name: FONT, bold: true, size: 11, color: { argb: STYLE.ink } }
      gb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLE.groupFill } }
      gb.alignment = { vertical: 'middle' }
      ws.getRow(r).height = 18
      r++
      g.rows.forEach((row, ri) => writeDataRow(row, ri % 2 === 1))
      if (totalIdx.length > 0) writeTotalsRow(`Subtotal — ${g.label}`, g.rows, 'subtotal')
    }
  } else {
    (payload.rows ?? []).forEach((row, ri) => writeDataRow(row, ri % 2 === 1))
  }

  if (hasData && totalIdx.length > 0) {
    writeTotalsRow(payload.grandTotalLabel ?? 'Grand total', flatRows, 'grand')
  }

  // Column widths
  columns.forEach((col, i) => {
    let w = col.header.length
    for (const row of flatRows) {
      const v = row[i]
      const len = v === null || v === undefined
        ? 0
        : (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }).length : String(v).length)
      w = Math.max(w, len)
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 48)
  })

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }]
  const lastCol = ws.getColumn(colCount).letter
  ws.autoFilter = { from: `A${headerRowIdx}`, to: `${lastCol}${headerRowIdx}` }

  const out: unknown = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)
}
