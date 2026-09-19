'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { queryKeys } from '@/lib/queryKeys'
import {
  useCloseMilestone,
  useProjectMilestones,
  useProjectMilestoneCodes,
  useUpsertProjectMilestone,
  useSetMilestoneCodes,
  type ProjectMilestone,
} from '@/hooks/useProjectMilestones'
import { useMilestoneCodes } from '@/hooks/useMilestoneCodes'

function formatAmount(value: number): string {
  return `QR ${value.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  /** The project's id — MEP reshape keys milestones by (project_id, discipline_id). */
  projectId: string
  /**
   * The discipline bucket's pool sub-container id. Milestones no longer live
   * here, but `close_project_milestone` (kept as-is — legacy pool-model RPC)
   * still carries it for cache-invalidation bookkeeping only (never sent to
   * the RPC itself).
   */
  subContainerId: string
  disciplineId: string
  canManage: boolean
}

/**
 * Milestone list + manage row for one discipline bucket, rendered inside
 * `DisciplineCard` (ProjectDetail.tsx). Milestones are an OPTIONAL cost
 * tag on consumption (locked Decision 7 — consuming with no milestone stays
 * valid); this component adds, code-bundles, and closes them. The optional
 * picker that consumes this list lives in `NewConsumptionDialog`.
 *
 * Rendered unconditionally per bucket (viewers see the read-only milestone
 * list); `canManage` gates only the add-form and the per-milestone Close
 * action, mirroring how the stock item list itself is visible to everyone
 * while add-discipline/close-project are gated in the parent.
 */
export function MilestoneManager({ projectId, subContainerId, disciplineId, canManage }: Props) {
  const qc = useQueryClient()
  const { data: milestones = [], isLoading, isError, error } = useProjectMilestones(projectId, disciplineId)
  const { data: codeOptions = [] } = useMilestoneCodes(disciplineId)
  const upsertMilestone = useUpsertProjectMilestone()
  const setMilestoneCodes = useSetMilestoneCodes()
  const closeMilestone = useCloseMilestone()

  const [showAddForm, setShowAddForm] = useState(false)
  const [milestoneNo, setMilestoneNo] = useState('')
  const [milestoneName, setMilestoneName] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [milestoneAmount, setMilestoneAmount] = useState('')
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([])
  const [closeTarget, setCloseTarget] = useState<ProjectMilestone | null>(null)

  // Friendly next-number suggestion (max over the currently-visible active
  // list + 1) — a convenience default only; unlike the legacy `label`, this
  // schema has no uniqueness constraint forcing an exact max-over-all count,
  // so the user can always edit it.
  const nextMilestoneNo = useMemo(
    () => milestones.reduce((max, m) => Math.max(max, m.milestone_no ?? 0), 0) + 1,
    [milestones],
  )

  function openAddForm() {
    setMilestoneNo(String(nextMilestoneNo))
    setMilestoneName('')
    setMilestoneDescription('')
    setMilestoneAmount('')
    setSelectedCodeIds([])
    setShowAddForm(true)
  }

  function toggleCode(id: string, checked: boolean) {
    setSelectedCodeIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((c) => c !== id)))
  }

  const isSaving = upsertMilestone.isPending || setMilestoneCodes.isPending
  const parsedNo = parseInt(milestoneNo, 10)
  const canSave = milestoneName.trim() !== '' && Number.isInteger(parsedNo) && parsedNo > 0

  async function handleSaveMilestone() {
    if (!canSave || isSaving) return
    const id = crypto.randomUUID()
    try {
      await upsertMilestone.mutateAsync({
        id,
        project_id: projectId,
        discipline_id: disciplineId,
        milestone_no: parsedNo,
        name: milestoneName.trim(),
        description: milestoneDescription.trim() || null,
        amount: milestoneAmount.trim() ? Number(milestoneAmount) : null,
      })
      if (selectedCodeIds.length > 0) {
        await setMilestoneCodes.mutateAsync({
          milestone_id: id,
          code_ids: selectedCodeIds,
          project_id: projectId,
          discipline_id: disciplineId,
        })
        // FIX (review round 1, F2): `setMilestoneCodes`'s own onSuccess only
        // invalidates the 'project-milestone-codes' bucket for a PRE-EXISTING
        // milestone id. This is a brand-new milestone — the freshly-mounted
        // `MilestoneRow` for it calls `useProjectMilestoneCodes(id)` for the
        // first time right as (or just before) this write lands, so it can
        // cache an empty result before the codes finish writing. Invalidate
        // this milestone's specific key directly so the chips actually show.
        qc.invalidateQueries({ queryKey: ['project-milestone-codes', id] })
      }
      toast.success(`Milestone ${milestoneName.trim()} added`)
      setShowAddForm(false)
    } catch (e) {
      toast.error(humanizeDbError(e))
    }
  }

  async function handleConfirmClose() {
    if (!closeTarget) return
    try {
      await closeMilestone.mutateAsync({ milestone_id: closeTarget.id, sub_container_id: subContainerId })
      // `close_project_milestone` is the legacy pool-model RPC (kept as-is);
      // its own onSuccess only invalidates the old `bySub` cache key. This
      // component now reads via the new `byProjectDiscipline` key (Batch A's
      // MEP reshape), so invalidate that bucket directly too or the closed
      // milestone would linger on screen until an unrelated refetch.
      qc.invalidateQueries({ queryKey: queryKeys.projectMilestones.byProjectDiscipline(projectId, disciplineId) })
      toast.success(`Milestone ${closeTarget.name} closed`)
      setCloseTarget(null)
    } catch (e) {
      toast.error(humanizeDbError(e))
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
            <MilestoneRow
              key={m.id}
              milestone={m}
              canManage={canManage}
              disabled={closeMilestone.isPending}
              onRequestClose={setCloseTarget}
            />
          ))}
        </div>
      )}

      {canManage && (
        showAddForm ? (
          <div className="rounded-md border border-dashed p-3 space-y-2.5">
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">No. *</label>
                <Input
                  type="number"
                  min={1}
                  className="h-9 text-xs"
                  value={milestoneNo}
                  onChange={(e) => setMilestoneNo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Name *</label>
                <Input
                  className="h-9 text-xs"
                  placeholder="e.g. First Fix"
                  value={milestoneName}
                  onChange={(e) => setMilestoneName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Description</label>
              <Textarea
                rows={2}
                className="text-xs resize-none"
                placeholder="Optional"
                value={milestoneDescription}
                onChange={(e) => setMilestoneDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Amount (QR)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-xs w-32"
                placeholder="Optional"
                value={milestoneAmount}
                onChange={(e) => setMilestoneAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Bundle codes</label>
              {codeOptions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground border rounded-md px-2.5 py-2">
                  No milestone codes for this discipline yet.
                </p>
              ) : (
                <div className="rounded-md border divide-y max-h-32 overflow-y-auto">
                  {codeOptions.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-accent/30"
                    >
                      <Checkbox
                        checked={selectedCodeIds.includes(c.id)}
                        onCheckedChange={(checked) => toggleCode(c.id, checked === true)}
                      />
                      <span className="truncate">{c.code}{c.grp ? ` — ${c.grp}` : ''}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="h-11 sm:h-7 flex-1 sm:flex-none"
                disabled={!canSave || isSaving}
                onClick={handleSaveMilestone}
              >
                {isSaving ? 'Saving…' : 'Save milestone'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 sm:h-7 flex-1 sm:flex-none"
                disabled={isSaving}
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            className="gap-1.5 min-h-11 sm:min-h-0 w-full sm:w-auto"
            onClick={openAddForm}
          >
            <Plus className="h-3.5 w-3.5" />
            Add milestone
          </Button>
        )
      )}

      <AlertDialog open={!!closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close milestone {closeTarget?.name}?</AlertDialogTitle>
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

// One milestone row + its bundled-code chips. Extracted so `useProjectMilestoneCodes`
// (one query per milestone) is called once per component instance rather than
// inside a .map() loop, which would break the Rules of Hooks.
function MilestoneRow({
  milestone, canManage, disabled, onRequestClose,
}: {
  milestone: ProjectMilestone
  canManage: boolean
  disabled: boolean
  onRequestClose: (m: ProjectMilestone) => void
}) {
  const { data: codes = [] } = useProjectMilestoneCodes(milestone.id)

  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-baseline gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">#{milestone.milestone_no}</span>
          <span className="truncate text-xs font-medium">{milestone.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {milestone.amount != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatAmount(Number(milestone.amount))}
            </span>
          )}
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 sm:h-7 sm:w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={() => onRequestClose(milestone)}
              aria-label={`Close milestone ${milestone.name}`}
            >
              <Lock className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {milestone.description && (
        <p className="text-[10px] text-muted-foreground break-words">{milestone.description}</p>
      )}
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {codes.map((c) => (
            <Badge key={c.id} variant="outline" className="text-[9px] h-4 px-1.5 font-normal">
              {c.code}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
