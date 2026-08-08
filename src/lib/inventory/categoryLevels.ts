export type CategoryNode = {
  id: string
  name_en: string
  parent_id: string | null
}

export type Level = {
  options: CategoryNode[]
  selectedId: string | null
}

/**
 * Returns the ids from the tree root down to `id`, inclusive: [rootId, ..., id].
 * Returns [] when `id` is null/undefined or not present in `flat`.
 *
 * Pure: does not mutate `flat` or any of its nodes. Assumes a valid tree
 * (no cycles) — does not defend against them.
 */
export function ancestorPath(flat: CategoryNode[], id: string): string[] {
  if (id == null) return []

  const byId = new Map<string, CategoryNode>()
  for (const node of flat) {
    byId.set(node.id, node)
  }

  if (!byId.has(id)) return []

  const path: string[] = []
  let currentId: string | null = id
  while (currentId !== null) {
    const node = byId.get(currentId)
    if (!node) break
    path.unshift(node.id)
    currentId = node.parent_id
  }

  return path
}

/**
 * Builds one Level per depth for an arbitrary-depth, side-by-side parent
 * picker: level 0 = root options, each subsequent level = the children of
 * the previously selected option. Stops as soon as the selected node has no
 * children (it's a leaf); if the selection path ends but the last selected
 * node still has children, one more "empty" level is appended listing those
 * children with no selection.
 *
 * Pure: does not mutate `flat` or any of its nodes; no I/O.
 */
export function buildLevels(flat: CategoryNode[], selectedId: string | null): Level[] {
  const path = selectedId ? ancestorPath(flat, selectedId) : []

  const roots = flat.filter((n) => n.parent_id === null)
  const levels: Level[] = [{ options: roots, selectedId: path[0] ?? null }]

  let i = 0
  while (path[i] !== undefined) {
    const children = flat.filter((n) => n.parent_id === path[i])
    if (children.length === 0) break

    levels.push({ options: children, selectedId: path[i + 1] ?? null })

    if (path[i + 1] === undefined) break
    i++
  }

  return levels
}
