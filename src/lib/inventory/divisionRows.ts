export interface DivisionRowInput {
  editableIds: string[]
  lockedIds: string[]
}
export interface DivisionRow {
  id: string
  checked: boolean
  locked: boolean
}

/** Build render rows for a division checkbox grid. `locked` rows are inherited
 *  (checked + disabled); editable rows reflect this node's own assignment. */
export function computeDivisionRows(divisionIds: string[], input: DivisionRowInput): DivisionRow[] {
  const locked = new Set(input.lockedIds)
  const editable = new Set(input.editableIds)
  return divisionIds.map((id) => ({
    id,
    checked: locked.has(id) || editable.has(id),
    locked: locked.has(id),
  }))
}

/** The ids to persist (checked and not inherited-locked). */
export function editableSelection(rows: DivisionRow[]): string[] {
  return rows.filter((r) => r.checked && !r.locked).map((r) => r.id)
}
