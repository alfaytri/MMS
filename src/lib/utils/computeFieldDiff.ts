export interface FieldDiff {
  field: string
  label: string
  from?: string
  to?: string
  /** Present when the value is an array — item-level added/removed lists. */
  arrayDiff?: {
    added:   string[]
    removed: string[]
  }
}

const IGNORED_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'deleted_at', 'auth_user_id',
])

function humanize(field: string): string {
  return field
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function stringify(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  return null
}

function arrayItemDiff(oldArr: unknown[], newArr: unknown[]) {
  const oldSet = new Set(oldArr.map(stringify))
  const newSet = new Set(newArr.map(stringify))
  const added:   string[] = []
  const removed: string[] = []
  for (const v of newSet) if (!oldSet.has(v)) added.push(v)
  for (const v of oldSet) if (!newSet.has(v)) removed.push(v)
  return { added, removed }
}

export function computeFieldDiff(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): FieldDiff[] {
  if (!oldData && newData) {
    return Object.entries(newData)
      .filter(([key]) => !IGNORED_FIELDS.has(key))
      .filter(([, val]) => val != null && val !== '')
      .map(([key, val]) => ({
        field: key,
        label: humanize(key),
        to: stringify(val),
      }))
  }

  if (oldData && !newData) {
    const name = oldData.name ?? oldData.full_name ?? oldData.action ?? oldData.id
    return [{ field: 'record', label: 'Record', from: stringify(name) }]
  }

  if (oldData && newData) {
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
    const diffs: FieldDiff[] = []
    for (const key of allKeys) {
      if (IGNORED_FIELDS.has(key)) continue
      const oldRaw = oldData[key]
      const newRaw = newData[key]
      const oldArr = asArray(oldRaw)
      const newArr = asArray(newRaw)
      if (oldArr && newArr) {
        const { added, removed } = arrayItemDiff(oldArr, newArr)
        if (added.length === 0 && removed.length === 0) continue
        diffs.push({ field: key, label: humanize(key), arrayDiff: { added, removed } })
        continue
      }
      const oldVal = stringify(oldRaw)
      const newVal = stringify(newRaw)
      if (oldVal !== newVal) {
        diffs.push({ field: key, label: humanize(key), from: oldVal, to: newVal })
      }
    }
    return diffs
  }

  return []
}
