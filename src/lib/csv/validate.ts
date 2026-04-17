import type { EntityType, EntityConfig } from './config'
import { ENTITY_CONFIGS } from './config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedRow = {
  _rowIndex: number
  _valid: boolean
  _errors: Record<string, string>
  [key: string]: unknown
}

// ─── Core validation ──────────────────────────────────────────────────────────

export function validateRows(entityType: EntityType, rawRows: Record<string, string>[]): ParsedRow[] {
  const config = ENTITY_CONFIGS[entityType]
  return rawRows.map((raw, i) => validateRow(raw, i, config))
}

function validateRow(raw: Record<string, string>, index: number, config: EntityConfig): ParsedRow {
  const errors: Record<string, string> = {}
  const parsed: Record<string, unknown> = {}

  for (const col of config.columns) {
    const rawVal = (raw[col.key] ?? '').trim()

    if (col.required && !rawVal) {
      errors[col.key] = `${col.label} is required`
      parsed[col.key] = rawVal
      continue
    }

    if (col.type === 'number') {
      if (rawVal === '') {
        parsed[col.key] = null
      } else {
        const num = Number(rawVal)
        if (isNaN(num)) {
          errors[col.key] = `${col.label} must be a number`
          parsed[col.key] = rawVal
        } else if (num < 0) {
          errors[col.key] = `${col.label} must be ≥ 0`
          parsed[col.key] = rawVal
        } else {
          parsed[col.key] = num
        }
      }
    } else if (col.type === 'boolean') {
      parsed[col.key] = rawVal.toLowerCase() === 'true' || rawVal === '1' || rawVal.toLowerCase() === 'yes'
    } else {
      parsed[col.key] = rawVal || null
    }
  }

  // Entity-specific defaults
  if (config === ENTITY_CONFIGS.inventory_items) {
    if (!errors['unit'] && parsed['unit'] === null) {
      parsed['unit'] = 'pcs'
    }
  }

  if (config === ENTITY_CONFIGS.purchase_orders || config === ENTITY_CONFIGS.sale_orders) {
    if (!errors['unit'] && parsed['unit'] === null) {
      parsed['unit'] = 'pcs'
    }
    if (!errors['currency'] && parsed['currency'] === null) {
      parsed['currency'] = 'QAR'
    }
  }

  return {
    ...parsed,
    _rowIndex: index + 2,
    _valid: Object.keys(errors).length === 0,
    _errors: errors,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function countValid(rows: ParsedRow[]): number {
  return rows.filter((r) => r._valid).length
}

export function countErrors(rows: ParsedRow[]): number {
  return rows.filter((r) => !r._valid).length
}

export function exportErrorRows(rows: ParsedRow[], entityType: EntityType): void {
  const config = ENTITY_CONFIGS[entityType]
  const errorRows = rows.filter((r) => !r._valid)
  if (errorRows.length === 0) return

  const headers = ['row', ...config.columns.map((c) => c.key), 'errors']
  const lines = errorRows.map((r) => {
    const vals = config.columns.map((c) => {
      const v = String(r[c.key] ?? '')
      return v.includes(',') ? `"${v}"` : v
    })
    const errStr = Object.entries(r._errors).map(([k, v]) => `${k}: ${v}`).join('; ')
    return [r._rowIndex, ...vals, `"${errStr}"`].join(',')
  })

  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `errors_${entityType}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
