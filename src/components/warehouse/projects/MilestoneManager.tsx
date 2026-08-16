'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Flag, Lock, Plus } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  useAddMilestone,
  useCloseMilestone,
  useProjectMilestones,
  type ProjectMilestone,
} from '@/hooks/useProjectMilestones'

interface Props {
  subContainerId: string
  canManage: boolean
}

/**
 * Milestone list + manage row for one discipline bucket, rendered inside
 * `DisciplineBucketCard` (ProjectDetail.tsx). Milestones are an OPTIONAL cost
 * tag on consumption (locked Decision 7 — consuming with no milestone stays
 * valid); this component only adds/closes them. The optional picker that
 * consumes this list lives in `NewConsumptionDialog`.
 *
 * Rendered unconditionally per bucket (viewers see the read-only milestone
 * list); `canManage` gates only the add-row and the per-milestone Close
 * action, mirroring how the stock item list itself is visible to everyone
 * while add-discipline/close-project are gated in the parent.
 */
export function MilestoneManager({ subContainerId, canManage }: Props) {
  const { data: milestones = [], isLoading, isError, error } = useProjectMilestones(subContainerId)
  const addMilestone = useAddMilestone()
  const closeMilestone = useCloseMilestone()

  const [isAdding, setIsAdding] = useState(false)
  const [closeTarget, setCloseTarget] = useState<ProjectMilestone | null>(null)

  // Auto-number milestones as "Milestone 1", "Milestone 2", … — one click, no
  // typing. Next number = the highest existing "Milestone <n>" for this bucket
  // + 1, computed over BOTH active and closed rows: UNIQUE(sub_container_id,
  // label) covers inactive rows too, so numbering off the visible (active-only)
  // list would collide the moment the latest milestone is closed and a new one
  // is added. pm_read RLS is division-scoped only (no is_active filter), so the
  // client can read closed rows for this max.
  async function handleAdd() {
    if (isAdding || addMilestone.isPending) return
    setIsAdding(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_milestones')
        .select('label')
        .eq('sub_container_id', subContainerId)
        .limit(500)
      if (error) {
        throw new Error(
          [error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ')
            || 'Failed to read existing milestones',
        )
      }
      let maxN = 0
      for (const row of data ?? []) {
        const match = /^Milestone (\d+)$/.exec((row.label ?? '').trim())
        if (match) maxN = Math.max(maxN, Number(match[1]))
      }
      const label = `Milestone ${maxN + 1}`
      await addMilestone.mutateAsync({ sub_container_id: subContainerId, label })
      toast.success(`${label} added`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleConfirmClose() {
    if (!closeTarget) return
    try {
      await closeMilestone.mutateAsync({ milestone_id: closeTarget.id, sub_container_id: subContainerId })
      toast.success(`Milestone ${closeTarget.label} closed`)
      setCloseTarget(null)
    } catch (e) {
      toast.error((e as Error).message)
      setCloseTarget(null)
    }
  }

  return (
    <div className="border-t px-4 py-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground">Milestones</span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-7 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
          {String((error as { message?: string } | null)?.message ?? 'Failed to load milestones — try again shortly.')}
        </div>
      ) : milestones.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No milestones yet.</p>
      ) : (
        <div className="space-y-1">
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5"
            >
              <span className="truncate text-xs font-medium">{m.label}</span>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 sm:h-7 sm:w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={closeMilestone.isPending}
                  onClick={() => setCloseTarget(m)}
                  aria-label={`Close milestone ${m.label}`}
                >
                  <Lock className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <Button
          type="button"
          size="sm"
          className="gap-1.5 min-h-11 sm:min-h-0 w-full sm:w-auto"
          disabled={isAdding || addMilestone.isPending}
          onClick={handleAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          {isAdding || addMilestone.isPending ? 'Adding…' : 'Add milestone'}
        </Button>
      )}

      <AlertDialog open={!!closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close milestone {closeTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides it from the consumption picker but keeps its spend history in reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeMilestone.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={closeMilestone.isPending}
              onClick={handleConfirmClose}
            >
              {closeMilestone.isPending ? 'Closing…' : 'Close Milestone'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
