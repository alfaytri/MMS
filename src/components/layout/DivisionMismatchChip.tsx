'use client'

import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

/**
 * Renders a subtle "Viewing X — not your active division" chip when an edit /
 * detail page shows a record whose division differs from the user's active
 * choice. Silent if:
 *   - the user hasn't set an active division ("All"),
 *   - the record has no division_id (unassigned),
 *   - or the record's division matches active.
 *
 * Pass the record's division_id (from purchase_orders / sale_orders / etc.).
 */
export function DivisionMismatchChip({ recordDivisionId }: { recordDivisionId: string | null | undefined }) {
  const { activeDivisionId, availableDivisions, isReady } = useActiveDivision()

  const recordName = useMemo(() => {
    if (!recordDivisionId) return null
    return availableDivisions.find((d) => d.id === recordDivisionId)?.name ?? null
  }, [recordDivisionId, availableDivisions])

  if (!isReady) return null
  if (!activeDivisionId) return null
  if (!recordDivisionId) return null
  if (recordDivisionId === activeDivisionId) return null

  return (
    <Badge
      variant="outline"
      className="gap-1 h-6 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800/60"
      title="This record belongs to a division that isn't your currently-selected active division."
    >
      <Info className="h-3 w-3" />
      <span className="text-[11px] font-normal">
        Viewing {recordName ?? 'other division'} · not your active
      </span>
    </Badge>
  )
}
