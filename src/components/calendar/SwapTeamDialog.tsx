'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getVisitTypeConfig } from './VisitBlock'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'

export interface TeamEligibility {
  team: TeamFull
  eligible: boolean
  reason?: string
  visitCount: number
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function timesOverlap(
  start1: string, end1: string,
  start2: string, end2: string,
): boolean {
  const s1 = timeToMinutes(start1), e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2), e2 = timeToMinutes(end2)
  return s1 < e2 && e1 > s2
}

/**
 * Pure function — filters and scores teams for eligibility to receive a visit swap.
 *
 * @param teams         All teams in the division (QC teams are automatically excluded).
 * @param targetVisit   The visit being reassigned.
 * @param allDayVisits  All visits on the same day, used for conflict detection.
 * @param teamSkills    Map<teamId, serviceId[]> — from useTeamSkills().
 *                      If targetVisit.service_id is null, the skill check is skipped.
 */
export function filterEligibleTeams(
  teams: TeamFull[],
  targetVisit: CalendarVisit,
  allDayVisits: CalendarVisit[],
  teamSkills: Map<string, string[]>,
): TeamEligibility[] {
  return teams
    .filter(t => t.id !== targetVisit.team_id && !t.is_qc)
    .map(team => {
      const teamVisits = allDayVisits.filter(
        v => v.team_id === team.id && v.id !== targetVisit.id,
      )
      const visitCount = teamVisits.length

      // Skill check — skipped when the visit has no service requirement
      if (targetVisit.service_id) {
        const skills = teamSkills.get(team.id) ?? []
        if (!skills.includes(targetVisit.service_id)) {
          return { team, eligible: false, visitCount, reason: 'Missing skill' }
        }
      }

      // Time-overlap check
      if (targetVisit.start_time && targetVisit.end_time) {
        const conflict = teamVisits.find(
          v =>
            v.start_time &&
            v.end_time &&
            timesOverlap(
              targetVisit.start_time!,
              targetVisit.end_time!,
              v.start_time,
              v.end_time,
            ),
        )
        if (conflict) {
          return {
            team,
            eligible: false,
            visitCount,
            reason: `Time conflict ${conflict.start_time}–${conflict.end_time}`,
          }
        }
      }

      return { team, eligible: true, visitCount }
    })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SwapTeamDialogProps {
  visit: CalendarVisit
  /** The visit_assignment row id used by the swap_visit_team RPC. */
  assignmentId: string
  teams: TeamFull[]
  allDayVisits: CalendarVisit[]
  teamSkills: Map<string, string[]>
  onClose: () => void
}

export function SwapTeamDialog({
  visit,
  assignmentId,
  teams,
  allDayVisits,
  teamSkills,
  onClose,
}: SwapTeamDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [peekId, setPeekId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const cfg = getVisitTypeConfig(visit.visit_type)
  const eligible = filterEligibleTeams(teams, visit, allDayVisits, teamSkills)
  const eligibleTeams = eligible.filter(e => e.eligible)
  const ineligibleTeams = eligible.filter(e => !e.eligible)

  async function confirmSwap() {
    if (!selectedId) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
      const { data, error } = await supabase.rpc('swap_visit_team', {
        p_assignment_id: assignmentId,
        p_new_team_id: selectedId,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Swap failed')
      toast.success('Team reassigned successfully')
      queryClient.invalidateQueries({ queryKey: ['calendar-visits'] })
      queryClient.invalidateQueries({ queryKey: ['week-capacity'] })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to swap team')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-md rounded-none md:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Swap Team</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {cfg.label} · {visit.customer_name ?? '—'} · {visit.start_time}–{visit.end_time}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1 py-2">
          {eligibleTeams.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No eligible teams available
            </p>
          )}

          {eligibleTeams.map(({ team, visitCount }) => (
            <button
              key={team.id}
              onClick={() => setSelectedId(team.id)}
              className={cn(
                'w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors',
                selectedId === team.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
            >
              <span className="font-medium">{team.name_en ?? team.name}</span>
              <span className="text-xs text-muted-foreground">
                {visitCount} visit{visitCount !== 1 ? 's' : ''} today
              </span>
            </button>
          ))}

          {ineligibleTeams.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground pt-2 px-1">
                Ineligible
              </p>
              {ineligibleTeams.map(({ team, reason, visitCount }) => (
                <div key={team.id}>
                  <button
                    onClick={() =>
                      setPeekId(peekId === team.id ? null : team.id)
                    }
                    className="w-full hidden md:flex items-center justify-between rounded-md border px-3 py-2 text-sm opacity-40 cursor-default hover:opacity-60 transition-opacity"
                  >
                    <span>{team.name_en ?? team.name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 font-normal"
                      >
                        {reason}
                      </Badge>
                      <span className="text-muted-foreground">
                        {visitCount} visit{visitCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                  {peekId === team.id && reason && (
                    <p className="hidden md:block text-xs text-muted-foreground px-3 pb-1">
                      Busy: {reason}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!selectedId || saving}
            onClick={confirmSwap}
          >
            {saving ? 'Swapping…' : 'Confirm Swap'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
