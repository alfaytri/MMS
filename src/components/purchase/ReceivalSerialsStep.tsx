'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import { PackageCheck, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlaceholderUnitRow } from '@/components/services/inventory/PlaceholderUnitRow'
import {
  usePlaceholderUnitsByReceival, useAutoGenerateToolSerials,
  type PlaceholderUnitForReceival,
} from '@/hooks/useInventory'

type Props = {
  receivalId: string
  receivalNumber: string
  onDone: () => void
}

export function ReceivalSerialsStep({ receivalId, receivalNumber, onDone }: Props) {
  const { data: pendingUnits = [], isLoading, refetch } = usePlaceholderUnitsByReceival(receivalId)
  const autoGenerate = useAutoGenerateToolSerials()

  // Group by item
  const grouped = useMemo(() => {
    const map = new Map<string, { itemId: string; itemName: string; itemSku: string | null; units: PlaceholderUnitForReceival[] }>()
    for (const u of pendingUnits) {
      const key = u.item_id
      const existing = map.get(key)
      if (existing) existing.units.push(u)
      else map.set(key, { itemId: u.item_id, itemName: u.item_name, itemSku: u.item_sku, units: [u] })
    }
    return Array.from(map.values())
  }, [pendingUnits])

  const totalPending = pendingUnits.length

  function handleAutoGenerate(itemId: string) {
    autoGenerate.mutate({ item_id: itemId }, {
      onSuccess: (res) => { toast.success(`Generated ${res.updated_count} serial${res.updated_count === 1 ? '' : 's'}`); void refetch() },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
        <div className="rounded-lg border bg-success/[0.04] px-4 py-3 flex items-start gap-3">
          <PackageCheck className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Receival {receivalNumber} recorded</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {totalPending > 0
                ? `${totalPending} tool unit${totalPending === 1 ? '' : 's'} across ${grouped.length} item${grouped.length === 1 ? '' : 's'} need${totalPending === 1 ? 's' : ''} a serial. Enter now, auto-generate, or finish later from Master Data → Tools.`
                : 'Stock updated. No tool units to serialize.'}
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-lg border border-dashed py-6 text-center text-[11px] text-muted-foreground">
            Loading pending units…
          </div>
        )}

        {!isLoading && grouped.length === 0 && (
          <div className="rounded-lg border border-dashed py-6 text-center text-[11px] text-muted-foreground">
            No pending serials for this receival.
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.itemId} className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <p className="text-[12px] font-semibold truncate">{group.itemName}</p>
                {group.itemSku && (
                  <span className="text-[10px] text-muted-foreground font-mono">· {group.itemSku}</span>
                )}
                <span className="text-[10px] text-amber-700 dark:text-amber-400">
                  · {group.units.length} pending
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                onClick={() => handleAutoGenerate(group.itemId)}
                disabled={autoGenerate.isPending}
              >
                {autoGenerate.isPending
                  ? 'Generating…'
                  : `Auto-generate ${group.units.length} serial${group.units.length === 1 ? '' : 's'}`}
              </Button>
            </div>
            <div className="rounded border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left text-[10px] font-semibold py-1.5 px-2">SERIAL #</th>
                    <th className="text-left text-[10px] font-semibold py-1.5 px-2">BRAND</th>
                    <th className="text-left text-[10px] font-semibold py-1.5 px-2">CONDITION</th>
                    <th className="text-left text-[10px] font-semibold py-1.5 px-2">STATUS</th>
                    <th className="text-left text-[10px] font-semibold py-1.5 px-2">EXPIRY</th>
                    <th className="text-right text-[10px] font-semibold py-1.5 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.units.map((unit) => (
                    <PlaceholderUnitRow
                      key={unit.id}
                      unit={unit}
                      siblingUnits={group.units}
                      onConfirmed={() => void refetch()}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-shrink-0 border-t bg-background rounded-b-lg m-0 px-5 py-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {totalPending > 0
            ? 'You can safely close — remaining units stay pending under Master Data → Tools.'
            : ''}
        </p>
        <Button size="sm" className="text-[11px] h-8" onClick={onDone}>
          {totalPending > 0 ? 'Done' : 'Close'}
        </Button>
      </div>
    </>
  )
}
