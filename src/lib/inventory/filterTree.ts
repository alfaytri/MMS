import type { InventoryTreeNode } from '@/hooks/useInventoryTree'

/**
 * Recursively filter an inventory category tree by a name search (English or
 * Arabic, case-insensitive).
 *
 * A node is kept when its own name matches — in which case its full subtree is
 * preserved — OR when any descendant matches, in which case only the matching
 * descendants are kept. An empty search returns the tree unchanged.
 *
 * Shared by ItemsListView and ToolsAssetsView (previously duplicated verbatim
 * in both).
 */
export function filterTree(nodes: InventoryTreeNode[], search: string): InventoryTreeNode[] {
  if (!search) return nodes
  const lower = search.toLowerCase()
  return nodes.reduce<InventoryTreeNode[]>((acc, node) => {
    const nameMatch =
      node.name_en.toLowerCase().includes(lower) ||
      (node.name_ar ?? '').toLowerCase().includes(lower)
    const filteredChildren = filterTree(node.children, search)
    if (nameMatch || filteredChildren.length > 0) {
      acc.push({ ...node, children: nameMatch ? node.children : filteredChildren })
    }
    return acc
  }, [])
}
