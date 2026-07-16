import * as XLSX from 'xlsx'

export type ExcelColumn<T> = {
  header: string
  accessor: (row: T) => string | number | null | undefined
  format?: 'number' | 'currency' | 'percent' | 'text'
}

/**
 * Client-side export of an array of rows to an .xlsx file.
 * Triggers a browser download; no server round-trip.
 */
export function exportToExcel<T>(opts: {
  filename: string
  sheetName: string
  columns: ExcelColumn<T>[]
  rows: T[]
}) {
  const { filename, sheetName, columns, rows } = opts

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

  const numFmt: Record<NonNullable<ExcelColumn<T>['format']>, string> = {
    number:   '#,##0.##',
    currency: '#,##0.00',
    percent:  '0.00"%"',
    text:     '@',
  }
  columns.forEach((col, colIdx) => {
    if (!col.format) return
    for (let r = 1; r <= rows.length; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: colIdx })
      const cell = ws[cellRef]
      if (cell) cell.z = numFmt[col.format]
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))

  const stamped = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, stamped)
}
