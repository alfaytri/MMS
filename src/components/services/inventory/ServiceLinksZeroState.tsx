import { ServiceNode } from './serviceInventoryHelpers'

interface Props {
  leafServices: ServiceNode[]
  breadcrumbMap: Map<string, string>
  hasSupplySet: Set<string>
}

export function ServiceLinksZeroState({
  leafServices,
  breadcrumbMap,
  hasSupplySet,
}: Props) {
  // Build per-category stats
  const catStats = new Map<string, { total: number; linked: number }>()

  for (const s of leafServices) {
    const breadcrumb = breadcrumbMap.get(s.id) ?? s.name_en
    const cat = breadcrumb.split(' › ')[0]
    if (!catStats.has(cat)) catStats.set(cat, { total: 0, linked: 0 })
    const entry = catStats.get(cat)!
    entry.total++
    if (hasSupplySet.has(s.id)) entry.linked++
  }

  const rows = Array.from(catStats.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  )

  const maxTotal = Math.max(
    ...rows.map(([, v]) => v.total),
    1,
  )

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12 gap-8">
      {/* Chart */}
      <div className="w-full max-w-md space-y-2">
        <p className="text-sm font-semibold text-foreground mb-3">
          Links by Category
        </p>
        {rows.map(([cat, { total, linked }]) => {
          const unlinked = total - linked
          const linkedPct = (linked / maxTotal) * 100
          const unlinkedPct = (unlinked / maxTotal) * 100
          return (
            <div key={cat} className="space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate max-w-[60%]">{cat}</span>
                <span>
                  {linked}/{total}
                </span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                {linked > 0 && (
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${linkedPct}%` }}
                  />
                )}
                {unlinked > 0 && (
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${unlinkedPct}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}

        {/* Legend */}
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Linked
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            No supply
          </span>
        </div>
      </div>

      {/* Prompt */}
      <p className="text-sm text-muted-foreground text-center">
        Select a service on the left to view or edit its linked items.
      </p>
    </div>
  )
}
