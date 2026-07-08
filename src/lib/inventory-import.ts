// ─── Inventory Excel Import — template generation, parsing, validation ─────────
//
// Pure utility module (no React) used by:
//   - src/hooks/useInventoryImport.ts
//   - src/components/services/inventory/InventoryImportDialog.tsx
//
// Hierarchy modeled by a row: Category Path > Item Name > Brand (variant).
// Two rows with the same Category Path + Item Name but different Brand are
// two brand-variants of the *same* item (see EXAMPLE_ROWS below).

import * as XLSX from 'xlsx'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportRow = {
  rowIndex: number // 1-based spreadsheet row number (header = row 1)
  type: string
  categoryPath: string
  itemName: string
  itemNameAr: string
  unit: string
  brand: string
  costPrice: number
  sellingPrice: number
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

export const TEMPLATE_HEADERS = [
  'Type',
  'Category Path',
  'Item Name',
  'Item Name (AR)',
  'Unit',
  'Brand',
  'Cost Price',
  'Selling Price',
]

const EXAMPLE_ROWS: (string | number)[][] = [
  ['products', 'Electrical > Switches', 'Toggle Switch 10A', '', 'Piece', 'ABB', 15, 25],
  ['products', 'Electrical > Switches', 'Toggle Switch 10A', '', 'Piece', 'Schneider', 18, 28],
  ['spare-parts', 'Filters', 'Water Filter Cartridge', 'فلتر مياه', 'Piece', 'Daikin', 8, 14],
]

// ─── Template generation ────────────────────────────────────────────────────

export function downloadTemplate(): void {
  const aoa: (string | number)[][] = [TEMPLATE_HEADERS, ...EXAMPLE_ROWS]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  sheet['!cols'] = [
    { wch: 14 }, // Type
    { wch: 28 }, // Category Path
    { wch: 28 }, // Item Name
    { wch: 20 }, // Item Name (AR)
    { wch: 10 }, // Unit
    { wch: 16 }, // Brand
    { wch: 12 }, // Cost Price
    { wch: 14 }, // Selling Price
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory Import')
  XLSX.writeFile(workbook, 'inventory_import_template.xlsx')
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

/**
 * Reads an uploaded .xlsx file (SheetJS), validates the header row against
 * TEMPLATE_HEADERS, and maps every non-empty data row to an ImportRow.
 */
export function parseExcelFile(file: File): Promise<ImportRow[]> {
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
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          reject(new Error('The workbook has no sheets.'))
          return
        }

        const sheet = workbook.Sheets[sheetName]
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
        })

        if (aoa.length === 0) {
          reject(new Error('The file is empty or has no header row.'))
          return
        }

        const headerRow = aoa[0] ?? []
        const actualHeaders = headerRow.map(normalizeHeader)
        const expectedHeaders = TEMPLATE_HEADERS.map(normalizeHeader)

        const headersMatch =
          actualHeaders.length >= expectedHeaders.length &&
          expectedHeaders.every((expected, i) => actualHeaders[i] === expected)

        if (!headersMatch) {
          reject(
            new Error(
              `Invalid template. Expected headers: ${TEMPLATE_HEADERS.join(', ')}. Please download and use the provided template.`
            )
          )
          return
        }

        const rows: ImportRow[] = []
        for (let i = 1; i < aoa.length; i++) {
          const row = aoa[i]
          if (!row || isRowEmpty(row)) continue

          rows.push({
            rowIndex: i + 1, // spreadsheet row number (header is row 1)
            type: toText(row[0]).toLowerCase(),
            categoryPath: toText(row[1]),
            itemName: toText(row[2]),
            itemNameAr: toText(row[3]),
            unit: toText(row[4]),
            brand: toText(row[5]),
            costPrice: toNumber(row[6]),
            sellingPrice: toNumber(row[7]),
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

    if (!row.categoryPath) {
      errors.push('Category Path is required.')
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

    return {
      ...row,
      valid: errors.length === 0,
      errors,
    }
  })
}

// ─── Preview / diff against existing data ──────────────────────────────────

/**
 * Splits a "A > B > C" category path into every cumulative ancestor path,
 * type-scoped and lowercased: type "products", path "A > B > C"
 * -> ["products::a", "products::a > b", "products::a > b > c"].
 *
 * Type-scoping is required because the app maintains independent category
 * trees per inventory type (products, spare-parts, consumables, tools).
 */
export function getCategoryPathSegments(type: string, categoryPath: string): string[] {
  const segments = categoryPath
    .split('>')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const typeLower = type.toLowerCase()
  const paths: string[] = []
  for (let i = 0; i < segments.length; i++) {
    paths.push(`${typeLower}::${segments.slice(0, i + 1).join(' > ').toLowerCase()}`)
  }
  return paths
}

/** Case-insensitive, type-scoped key identifying an item within a category path. */
export function buildItemKey(type: string, categoryPath: string, itemName: string): string {
  return `${type.toLowerCase()}::${categoryPath.trim().toLowerCase()}|${itemName.trim().toLowerCase()}`
}

/** Case-insensitive, type-scoped key identifying a brand-variant of an item. */
export function buildVariantKey(type: string, categoryPath: string, itemName: string, brand: string): string {
  return `${buildItemKey(type, categoryPath, itemName)}|${brand.trim().toLowerCase()}`
}

/**
 * Computes how many new categories/items/variants an import would create,
 * by diffing the valid rows against sets of existing keys (all lowercase).
 *
 * Expected key formats (build with the helpers above so callers stay in sync):
 *   - existingCategoryPaths: type-scoped path, e.g. "products::electrical > switches"
 *   - existingItems:         buildItemKey(type, categoryPath, itemName)
 *   - existingVariants:      buildVariantKey(type, categoryPath, itemName, brand)
 */
export function buildPreview(
  validated: ValidatedRow[],
  existingCategoryPaths: Set<string>,
  existingItems: Set<string>,
  existingVariants: Set<string>
): ImportPreview {
  const newCategoryPaths = new Set<string>()
  const newItemKeys = new Set<string>()
  const newVariantKeys = new Set<string>()

  for (const row of validated) {
    if (!row.valid) continue

    for (const path of getCategoryPathSegments(row.type, row.categoryPath)) {
      if (!existingCategoryPaths.has(path)) {
        newCategoryPaths.add(path)
      }
    }

    const itemKey = buildItemKey(row.type, row.categoryPath, row.itemName)
    if (!existingItems.has(itemKey)) {
      newItemKeys.add(itemKey)
    }

    const variantKey = buildVariantKey(row.type, row.categoryPath, row.itemName, row.brand)
    if (!existingVariants.has(variantKey)) {
      newVariantKeys.add(variantKey)
    }
  }

  return {
    rows: validated,
    totalValid: validated.filter((r) => r.valid).length,
    totalErrors: validated.filter((r) => !r.valid).length,
    newCategories: newCategoryPaths.size,
    newItems: newItemKeys.size,
    newVariants: newVariantKeys.size,
  }
}
