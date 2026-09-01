'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Check, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamToolUnitsV2, type TeamToolUnitV2 } from '@/hooks/useToolInspections'
import { useRecordCheck, type CheckVerdict } from '@/hooks/useToolChecks'
import { useToolUnitItemMeta } from '@/hooks/useToolUnitCategoryPaths'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { ToolLifecycleBadge } from '../ToolBadges'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Check one team's in-service tools one-by-one (Good/Bad), linked to the session. */
export function ToolCheckTeamPanel({
  team, sessionId, onBack,
}: {
  team: { id: string; name: string }
  sessionId: string
  onBack: () => void
}) {
  const { data: units = [], isLoading } = useTeamToolUnitsV2(team.id)
  const record = useRecordCheck()

  // Only in-service tools are physically checkable (maintenance ones are out for repair).
  const checkable = useMemo(
    () => units.filter((u) => u.status === 'assigned').sort((a, b) =>
      COLLATOR.compare(a.item_name ?? '', b.item_name ?? '') || COLLATOR.compare(a.serial_number ?? '', b.serial_number ?? '')),
    [units],
  )

  // Category breadcrumb above each tool name, resolved via the unit id.
  const unitMeta = useToolUnitItemMeta(checkable.map((u) => u.unit_id))

  async function check(u: TeamToolUnitV2, verdict: CheckVerdict) {
    try {
      await record.mutateAsync({ unitId: u.unit_id, verdict, sessionId })
      toast.success(`${u.item_name ?? 'Tool'}${u.serial_number ? ` (${u.serial_number})` : ''}: ${verdict === 'good' ? 'Good' : 'Bad'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record check')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" className="h-8 gap-1 shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Teams
        </Button>
        <div className="font-semibold text-sm truncate">{team.name}</div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : checkable.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No in-service tools to check for this team.
        </div>
      ) : (
        <ul className="rounded-lg border divide-y">
          {checkable.map((u, i) => {
            const checked = !u.inspection_due
            return (
              <li key={u.unit_id} className={cn('flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3', STAGGER_IN)} style={staggerDelay(i)}>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <ItemLabel
                    className="w-full"
                    meta={unitMeta.get(u.unit_id)}
                    name={<span className="font-medium text-sm truncate min-w-0 block" title={u.item_name ?? undefined}>{u.item_name ?? 'Tool'}</span>}
                  />
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{u.serial_number ?? '—'}</span>
                  <ToolLifecycleBadge type={u.lifecycle_type} />
                  <span className="text-xs text-muted-foreground">· {u.condition}</span>
                  {checked && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal border-emerald-500/40 text-emerald-700 bg-emerald-500/10">
                      <Check className="h-3 w-3 mr-0.5" /> Checked
                    </Badge>
                  )}
                </div>
                {!checked && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-11 sm:h-8 gap-1 text-xs text-emerald-700 hover:text-emerald-700" disabled={record.isPending} onClick={() => check(u, 'good')}>
                      <CheckCircle2 className="h-4 w-4" /> Good
                    </Button>
                    <Button size="sm" variant="ghost" className="h-11 sm:h-8 gap-1 text-xs text-destructive hover:text-destructive" disabled={record.isPending} onClick={() => check(u, 'bad')}>
                      <XCircle className="h-4 w-4" /> Bad
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Broken tools are sent for repair from the <strong>Teams</strong> tab (this check only records condition).
      </p>
    </div>
  )
}
