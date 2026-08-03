// ─── Inventory Excel Import — template generation, parsing, validation ─────────
//
// Pure utility module (no React) used by:
//   - src/hooks/useInventoryImport.ts
//   - src/components/services/inventory/InventoryImportDialog.tsx
//
// Hierarchy modeled by a row:
//   Category 1 > Category 2 > … > Category N > Item > Brand (variant).
//
// Two rows with the same category path + Item Name but different Brand are
// two brand-variants of the *same* item.
//
// Phase D.14 changes vs. the 2026-07-08 shipment:
//   1. Category is expressed as N separate columns (`Category 1`, `Category 2`,
//      `Category N`) so operators can build a tree of any depth. Trailing
//      empty columns are ignored per row.
//   2. Every pickable field is an in-Excel dropdown sourced from live DB data
//      (`Type`, `Unit`, and the composite `Warehouse — Sub-container` label).
//      Category columns use `errorStyle: 'information'` — the dropdown lists
//      existing categories for reuse but users may type new names; the import
//      pipeline auto-creates them.
//   3. The composite `Warehouse — Sub-container` label round-trips back to the
//      picked warehouse_id + sub_container_id at parse time. Division is
//      derived from the sub-container.
//   4. Writer path uses `exceljs` (SheetJS Community can't emit data-validation
//      dropdowns on write). Reader path still uses `xlsx` — it's fine for
//      reads, keeps the reader-side bundle warm, and avoids the exceljs
//      streaming reader's quirks with heterogeneous cell types.

import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportRow = {
  rowIndex: number // 1-based spreadsheet row number (header = row 1)
  type: string
  categorySegments: string[]  // ordered, non-empty; length is the tree depth for this row
  itemName: string
  itemNameAr: string
  unit: string
  brand: string
  costPrice: number
  sellingPrice: number
  /** Optional catalog photo URL (public https). Stored as-is on the
   *  item row; no image processing on the import path. */
  imageUrl: string
  /** Composite label operator picked; parsed to ids in `subContainer` below. */
  warehouseSubLabel: string
  /** Resolved from `warehouseSubLabel` at parse time (null if unresolved). */
  subContainer: {
    warehouse_id:       string
    warehouse_name:     string
    sub_container_id:   string
    sub_container_name: string
    division_id:        string | null
    division_name:      string | null
  } | null
}

export type ValidatedRow = ImportRow & {
  valid: boolean
  errors: string[]
}

export type ImportPreview = {
  rows: ValidatedRow[]
  totalValid: number
  totalErrors: number
  newCategories: number
  newItems: number
  newVariants: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const VALID_TYPES = ['products', 'spare-parts', 'consumables', 'tools'] as const
export type ImportType = (typeof VALID_TYPES)[number]

export const VALID_UNITS = ['Piece', 'Kg', 'Litre', 'Set', 'Box', 'Metre', 'Roll', 'Pair', 'Other'] as const
export type ImportUnit = (typeof VALID_UNITS)[number]

/** Default number of category columns the template ships with. Operators can
 *  add more columns manually and name them `Category 4`, `Category 5`, …
 *  — the parser matches by header regex, not by ordinal. */
export const DEFAULT_CATEGORY_COLUMNS = 3

/** Non-category headers the template emits. Order = column order after the
 *  category block. */
export const FIXED_HEADERS = [
  'Type',
  'Item Name',
  'Item Name (AR)',
  'Unit',
  'Brand',
  'Cost Price',
  'Selling Price',
  'Image URL',
  'Warehouse — Sub-container',
] as const

/** Excel formulae for data-validation `list` type must not include commas
 *  inside quoted values because Excel's parser splits on comma. If an option
 *  contains a comma, fall back to a range reference on the reference sheet. */
const EXCEL_LIST_INLINE_LIMIT = 250 // Excel hard limit ~255; keep some headroom

// ─── Template shape / data harvesting ───────────────────────────────────────

export type SubContainerOption = {
  warehouse_id:       string
  warehouse_name:     string
  sub_container_id:   string
  sub_container_name: string
  division_id:        string | null
  division_name:      string | null
}

export type ExistingCategoryOption = {
  /** Depth is 1-based: root categories = 1, their children = 2, etc. */
  depth:     number
  type:      string
  name:      string
  full_path: string // for the reference sheet
}

export function formatSubContainerLabel(row: {
  warehouse_name:     string
  sub_container_name: string
  division_name:      string | null
}): string {
  const suffix = row.division_name ? ` (${row.division_name})` : ''
  return `${row.warehouse_name} — ${row.sub_container_name}${suffix}`
}

// ─── Template generation (writer) ───────────────────────────────────────────

export type GenerateTemplateOptions = {
  subContainers:      SubContainerOption[]
  existingCategories: ExistingCategoryOption[]
  categoryColumns?:   number // default DEFAULT_CATEGORY_COLUMNS
}

export async function downloadTemplate(opts: GenerateTemplateOptions): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MMS'
  wb.created = new Date(0) // deterministic — avoids "modified" churn on identical downloads

  const categoryColumns = Math.max(1, opts.categoryColumns ?? DEFAULT_CATEGORY_COLUMNS)

  // ─── Sheet 1: Import ─────────────────────────────────────────────────
  const importSheet = wb.addWorksheet('Import', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const categoryHeaders = Array.from({ length: categoryColumns }, (_, i) => `Category ${i + 1}`)
  const allHeaders: string[] = [...categoryHeaders, ...FIXED_HEADERS]
  importSheet.addRow(allHeaders)

  // Column widths
  const widths: number[] = [
    ...categoryHeaders.map(() => 20),
    14, // Type
    26, // Item Name
    20, // Item Name (AR)
    10, // Unit
    16, // Brand
    12, // Cost Price
    14, // Selling Price
    50, // Image URL
    40, // Warehouse — Sub-container
  ]
  importSheet.columns = widths.map((w) => ({ width: w }))

  // Header row styling
  const headerRow = importSheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: 'middle' }
  headerRow.height = 22

  // RTL alignment for the Arabic column
  const arColIndex = categoryColumns + FIXED_HEADERS.indexOf('Item Name (AR)') + 1
  importSheet.getColumn(arColIndex).alignment = { readingOrder: 'rtl' }

  // ─── Example rows (3 — same shape as the pre-D.14 sample) ────────────
  const sampleSub = opts.subContainers[0]
  const sampleLabel = sampleSub ? formatSubContainerLabel(sampleSub) : ''
  const examples: Array<Record<string, string | number>> = [
    { c1: 'Electrical', c2: 'Switches', c3: '',      type: 'products',    name: 'Toggle Switch 10A',      nameAr: '',              unit: 'Piece', brand: 'ABB',       cost: 15, sell: 25, imageUrl: '', label: sampleLabel },
    { c1: 'Electrical', c2: 'Switches', c3: '',      type: 'products',    name: 'Toggle Switch 10A',      nameAr: '',              unit: 'Piece', brand: 'Schneider', cost: 18, sell: 28, imageUrl: '', label: sampleLabel },
    { c1: 'Filters',    c2: '',         c3: '',      type: 'spare-parts', name: 'Water Filter Cartridge', nameAr: 'فلتر مياه',      unit: 'Piece', brand: 'Daikin',    cost: 8,  sell: 14, imageUrl: '', label: sampleLabel },
  ]
  for (const ex of examples) {
    const cats: string[] = []
    for (let i = 0; i < categoryColumns; i++) {
      const key = `c${i + 1}` as keyof typeof ex
      cats.push(String((ex as Record<string, string | number>)[key] ?? ''))
    }
    importSheet.addRow([
      ...cats,
      ex.type,
      ex.name,
      ex.nameAr,
      ex.unit,
      ex.brand,
      ex.cost,
      ex.sell,
      ex.imageUrl,
      ex.label,
    ])
  }

  // ─── Data validations ────────────────────────────────────────────────
  const lastValidationRow = 1000 // apply to first ~1000 data rows

  // Category columns — advisory (errorStyle: 'information') dropdown of
  // existing categories at that depth, but free text still accepted.
  for (let d = 1; d <= categoryColumns; d++) {
    const depthNames = Array.from(
      new Set(
        opts.existingCategories
          .filter((c) => c.depth === d)
          .map((c) => c.name),
      ),
    ).sort()
    applyListValidation(importSheet, d, 2, lastValidationRow, depthNames, 'information')
  }

  // Type column — strict enum
  applyListValidation(importSheet, categoryColumns + 1, 2, lastValidationRow, [...VALID_TYPES], 'stop')

  // Unit column — strict enum
  const unitColIndex = categoryColumns + 1 + FIXED_HEADERS.indexOf('Unit')
  applyListValidation(importSheet, unitColIndex + 1, 2, lastValidationRow, [...VALID_UNITS], 'stop')

  // Warehouse — Sub-container column — strict composite
  const subColIndex = categoryColumns + 1 + FIXED_HEADERS.indexOf('Warehouse — Sub-container')
  const subLabels = opts.subContainers.map(formatSubContainerLabel)
  applyListValidation(importSheet, subColIndex + 1, 2, lastValidationRow, subLabels, 'stop')

  // ─── Sheet 2: Reference — Warehouses & Sub-containers ────────────────
  const refWh = wb.addWorksheet('Reference — Warehouses & Sub-containers')
  refWh.addRow(['Label (use in Import)', 'Warehouse', 'Sub-container', 'Division'])
  refWh.getRow(1).font = { bold: true }
  refWh.columns = [
    { width: 46 },
    { width: 26 },
    { width: 26 },
    { width: 22 },
  ]
  for (const sc of opts.subContainers) {
    refWh.addRow([
      formatSubContainerLabel(sc),
      sc.warehouse_name,
      sc.sub_container_name,
      sc.division_name ?? '—',
    ])
  }

  // ─── Sheet 3: Reference — Types ──────────────────────────────────────
  const refTypes = wb.addWorksheet('Reference — Types')
  refTypes.addRow(['Type', 'Meaning'])
  refTypes.getRow(1).font = { bold: true }
  refTypes.columns = [{ width: 16 }, { width: 40 }]
  refTypes.addRow(['products',    'Finished goods sold as-is (e.g. Split AC unit).'])
  refTypes.addRow(['spare-parts', 'Replacement parts kept for repairs or resale.'])
  refTypes.addRow(['consumables', 'Items used up (filters, cleaning chemicals, screws).'])
  refTypes.addRow(['tools',       'Serial-tracked tools assigned to teams/technicians.'])

  // ─── Sheet 4: Reference — Categories (informational) ─────────────────
  const refCats = wb.addWorksheet('Reference — Existing Categories')
  refCats.addRow(['Depth', 'Type', 'Full Path'])
  refCats.getRow(1).font = { bold: true }
  refCats.columns = [{ width: 8 }, { width: 14 }, { width: 60 }]
  for (const c of opts.existingCategories) {
    refCats.addRow([c.depth, c.type, c.full_path])
  }

  // ─── Emit ────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'inventory_import_template.xlsx')
}

function applyListValidation(
  sheet: ExcelJS.Worksheet,
  col: number,
  rowStart: number,
  rowEnd: number,
  options: string[],
  errorStyle: 'stop' | 'warning' | 'information',
) {
  if (options.length === 0) return
  // Excel's inline-formula limit is ~255 characters. If the joined list
  // exceeds that, fall back silently (no validation) — the reference sheets
  // are still there for operator lookup.
  const joined = options.map((o) => o.replace(/"/g, '""')).join(',')
  if (joined.length > EXCEL_LIST_INLINE_LIMIT) return
  const formula = `"${joined}"`
  // exceljs's stable public API is per-cell `.dataValidation = { ... }`.
  // Setting it on each cell in the target range works reliably; the
  // range-level `dataValidations.add()` overload is undocumented and
  // silently no-ops on some builds.
  const config: ExcelJS.DataValidation = {
    type:            'list',
    allowBlank:      true,
    formulae:        [formula],
    showErrorMessage: errorStyle !== 'information',
    errorStyle,
    ...(errorStyle === 'stop'
      ? { errorTitle: 'Invalid value', error: 'Pick a value from the dropdown.' }
      : {}),
    showInputMessage: false,
  }
  for (let r = rowStart; r <= rowEnd; r++) {
    sheet.getCell(r, col).dataValidation = config
  }
}

function colToLetter(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? '').trim() === '')
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const trimmed = String(value ?? '').trim()
  if (trimmed === '') return NaN
  return Number(trimmed)
}

export type ParseContext = {
  subContainerLabelToOption: Map<string, SubContainerOption>
}

export function buildParseContext(subContainers: SubContainerOption[]): ParseContext {
  const map = new Map<string, SubContainerOption>()
  for (const sc of subContainers) {
    map.set(formatSubContainerLabel(sc), sc)
  }
  return { subContainerLabelToOption: map }
}

/**
 * Reads an uploaded .xlsx file, discovers every `Category N` column
 * dynamically, and maps every non-empty data row to an ImportRow. Composite
 * sub-container labels are resolved to ids via the ParseContext.
 */
export function parseExcelFile(file: File, ctx: ParseContext): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('Failed to read the file.'))

    reader.onload = (event) => {
      try {
        const data = event.target?.result
        if (!data) {
          reject(new Error('The file is empty.'))
          return
        }

        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets['Import'] ?? workbook.Sheets[workbook.SheetNames[0] ?? '']
        if (!sheet) {
          reject(new Error('The workbook has no readable sheet.'))
          return
        }

        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
        })

        if (aoa.length === 0) {
          reject(new Error('The file is empty or has no header row.'))
          return
        }

        const headerRow = (aoa[0] ?? []).map(normalizeHeader)

        // Discover category column indexes by regex; sort by the numeric suffix.
        const categoryColIndexes: { idx: number; depth: number }[] = []
        for (let i = 0; i < headerRow.length; i++) {
          const m = /^category\s+(\d+)$/i.exec(headerRow[i])
          if (m) categoryColIndexes.push({ idx: i, depth: Number(m[1]) })
        }
        categoryColIndexes.sort((a, b) => a.depth - b.depth)
        if (categoryColIndexes.length === 0) {
          reject(new Error('No "Category N" column found in the header. Use the downloaded template.'))
          return
        }

        // Find fixed columns by header name.
        const findCol = (label: string): number => headerRow.indexOf(label.toLowerCase())
        const idxType    = findCol('type')
        const idxName    = findCol('item name')
        const idxNameAr  = findCol('item name (ar)')
        const idxUnit    = findCol('unit')
        const idxBrand   = findCol('brand')
        const idxCost    = findCol('cost price')
        const idxSell    = findCol('selling price')
        const idxImage   = findCol('image url')
        const idxSub     = findCol('warehouse — sub-container')

        const missing: string[] = []
        if (idxType   < 0) missing.push('Type')
        if (idxName   < 0) missing.push('Item Name')
        if (idxUnit   < 0) missing.push('Unit')
        if (idxBrand  < 0) missing.push('Brand')
        if (idxCost   < 0) missing.push('Cost Price')
        if (idxSell   < 0) missing.push('Selling Price')
        if (idxSub    < 0) missing.push('Warehouse — Sub-container')
        if (missing.length > 0) {
          reject(new Error(`Missing header column(s): ${missing.join(', ')}. Use the downloaded template.`))
          return
        }

        const rows: ImportRow[] = []
        for (let i = 1; i < aoa.length; i++) {
          const row = aoa[i]
          if (!row || isRowEmpty(row)) continue

          const categorySegments = categoryColIndexes
            .map(({ idx }) => toText(row[idx]))
            .filter((s) => s.length > 0)

          const warehouseSubLabel = toText(row[idxSub])
          const subContainer = ctx.subContainerLabelToOption.get(warehouseSubLabel) ?? null

          rows.push({
            rowIndex: i + 1,
            type: toText(row[idxType]).toLowerCase(),
            categorySegments,
            itemName:  toText(row[idxName]),
            itemNameAr: idxNameAr >= 0 ? toText(row[idxNameAr]) : '',
            unit:      toText(row[idxUnit]),
            brand:     toText(row[idxBrand]),
            costPrice:    toNumber(row[idxCost]),
            sellingPrice: toNumber(row[idxSell]),
            imageUrl:     idxImage >= 0 ? toText(row[idxImage]) : '',
            warehouseSubLabel,
            subContainer,
          })
        }

        resolve(rows)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse the Excel file.'))
      }
    }

    reader.readAsArrayBuffer(file)
  })
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateRows(rows: ImportRow[]): ValidatedRow[] {
  return rows.map((row) => {
    const errors: string[] = []

    if (!row.type) {
      errors.push('Type is required.')
    } else if (!(VALID_TYPES as readonly string[]).includes(row.type)) {
      errors.push(`Type must be one of: ${VALID_TYPES.join(', ')}.`)
    }

    if (row.categorySegments.length === 0) {
      errors.push('At least Category 1 must be set.')
    } else if (row.categorySegments.some((s) => s.includes('>') || /^[\s/]|[\s/]$/.test(s))) {
      errors.push('Category names cannot contain ">" or leading/trailing spaces or slashes.')
    }

    if (!row.itemName) {
      errors.push('Item Name is required.')
    }

    if (!row.unit) {
      errors.push('Unit is required.')
    } else {
      const matched = VALID_UNITS.find((u) => u.toLowerCase() === row.unit.toLowerCase())
      if (!matched) {
        errors.push(`Unit must be one of: ${VALID_UNITS.join(', ')}.`)
      } else {
        row.unit = matched
      }
    }

    if (!row.brand) {
      errors.push('Brand is required.')
    }

    if (Number.isNaN(row.costPrice)) {
      errors.push('Cost Price must be a number.')
    } else if (row.costPrice < 0) {
      errors.push('Cost Price must be ≥ 0.')
    }

    if (Number.isNaN(row.sellingPrice)) {
      errors.push('Selling Price must be a number.')
    } else if (row.sellingPrice < 0) {
      errors.push('Selling Price must be ≥ 0.')
    }

    // Image URL — optional. If present, must be an https:// URL that
    // parses. Anything else (e.g. a bare filename, a local path, http://)
    // gets flagged so operators catch bad staging before import.
    if (row.imageUrl) {
      try {
        const u = new URL(row.imageUrl)
        if (u.protocol !== 'https:') {
          errors.push('Image URL must start with https://')
        }
      } catch {
        errors.push('Image URL is not a valid URL.')
      }
    }

    if (!row.warehouseSubLabel) {
      errors.push('Warehouse — Sub-container is required.')
    } else if (!row.subContainer) {
      errors.push(`Unknown "Warehouse — Sub-container" label. Pick from the dropdown.`)
    }

    return {
      ...row,
      valid: errors.length === 0,
      errors,
    }
  })
}

// ─── Preview / diff against existing data ──────────────────────────────────

/**
 * Splits the row's category segments into every cumulative ancestor path,
 * type-scoped and lowercased: type "products", segments ["A", "B", "C"]
 * -> ["products::a", "products::a > b", "products::a > b > c"].
 *
 * Type-scoping is required because the app maintains independent category
 * trees per inventory type (products, spare-parts, consumables, tools).
 */
export function getCategoryPathSegments(type: string, segments: string[]): string[] {
  const typeLower = type.toLowerCase()
  const paths: string[] = []
  for (let i = 0; i < segments.length; i++) {
    paths.push(`${typeLower}::${segments.slice(0, i + 1).join(' > ').toLowerCase()}`)
  }
  return paths
}

/** Case-insensitive, type-scoped key identifying an item within a category. */
export function buildItemKey(type: string, segments: string[], itemName: string): string {
  return `${type.toLowerCase()}::${segments.map((s) => s.trim().toLowerCase()).join(' > ')}|${itemName.trim().toLowerCase()}`
}

/** Case-insensitive, type-scoped key identifying a brand-variant of an item. */
export function buildVariantKey(type: string, segments: string[], itemName: string, brand: string): string {
  return `${buildItemKey(type, segments, itemName)}|${brand.trim().toLowerCase()}`
}

/**
 * Computes how many new categories/items/variants an import would create,
 * by diffing the valid rows against sets of existing keys (all lowercase).
 *
 * Expected key formats (build with the helpers above so callers stay in sync):
 *   - existingCategoryPaths: type-scoped path, e.g. "products::electrical > switches"
 *   - existingItems:         buildItemKey(type, segments, itemName)
 *   - existingVariants:      buildVariantKey(type, segments, itemName, brand)
 */
export function buildPreview(
  validated: ValidatedRow[],
  existingCategoryPaths: Set<string>,
  existingItems: Set<string>,
  existingVariants: Set<string>,
): ImportPreview {
  const newCategoryPaths = new Set<string>()
  const newItemKeys = new Set<string>()
  const newVariantKeys = new Set<string>()

  for (const row of validated) {
    if (!row.valid) continue

    for (const path of getCategoryPathSegments(row.type, row.categorySegments)) {
      if (!existingCategoryPaths.has(path)) {
        newCategoryPaths.add(path)
      }
    }

    const itemKey = buildItemKey(row.type, row.categorySegments, row.itemName)
    if (!existingItems.has(itemKey)) {
      newItemKeys.add(itemKey)
    }

    const variantKey = buildVariantKey(row.type, row.categorySegments, row.itemName, row.brand)
    if (!existingVariants.has(variantKey)) {
      newVariantKeys.add(variantKey)
    }
  }

  return {
    rows: validated,
    totalValid:  validated.filter((r) => r.valid).length,
    totalErrors: validated.filter((r) => !r.valid).length,
    newCategories: newCategoryPaths.size,
    newItems:      newItemKeys.size,
    newVariants:   newVariantKeys.size,
  }
}
