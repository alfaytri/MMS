// Shared relevance scoring for warehouse search bars + item pickers, so a query
// ranks the same everywhere: a hit in the item NAME (exact → prefix → word-start
// → substring) always outranks a hit in brand / origin / SKU / category. Lower
// score = better match; -1 means no match at all.

export type SearchRankFields = {
  name?: string | null
  brand?: string | null
  origin?: string | null
  sku?: string | null
  category?: string | null
}

export function searchRank(query: string, f: SearchRankFields): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const name = (f.name ?? '').toLowerCase()
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (name.split(/[\s\-—/|(),.]+/).some((w) => w.startsWith(q))) return 2
  if (name.includes(q)) return 3
  if ((f.brand ?? '').toLowerCase().includes(q) || (f.origin ?? '').toLowerCase().includes(q)) return 4
  if ((f.sku ?? '').toLowerCase().includes(q)) return 5
  if ((f.category ?? '').toLowerCase().includes(q)) return 6
  return -1
}
