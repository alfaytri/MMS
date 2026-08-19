'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ClipboardCheck, Layers, Play, UserRound, Users2, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useTeamsWithToolCounts } from '@/hooks/useToolAssignments'
import {
  useOpenCheckSession, useInitiateCheckSession, useFinalizeCheckSession, useCheckProgress,
} from '@/hooks/useToolChecks'
import { ToolCheckTeamPanel } from './ToolCheckTeamPanel'
import { ToolCheckReport } from './ToolCheckReport'

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function ToolCheckPage() {
  const { activeDivisionId, availableDivisions } = useActiveDivision()
  const divisionName = useMemo(
    () => availableDivisions.find((d) => d.id === activeDivisionId)?.name ?? null,
    [availableDivisions, activeDivisionId],
  )

  const { data: openSession, isLoading: sessionLoading } = useOpenCheckSession(activeDivisionId)
  const initiate = useInitiateCheckSession()
  const finalize = useFinalizeCheckSession()

  const [activeTeam, setActiveTeam] = useState<{ id: string; name: string } | null>(null)
  const [finalizedId, setFinalizedId] = useState<string | null>(null)

  // Checks are per-division — require exactly one division in the top-bar view.
  if (!activeDivisionId) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6 text-muted-foreground" />}
        title="Pick one division"
        description="Select a single division in the top bar to run its monthly tool check."
      />
    )
  }

  if (finalizedId) {
    return <ToolCheckReport sessionId={finalizedId} divisionName={divisionName} onNew={() => setFinalizedId(null)} />
  }

  if (sessionLoading) return <Skeleton className="h-40 w-full" />

  if (!openSession) {
    return (
      <div className="rounded-lg border p-8 text-center space-y-3">
        <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">Monthly check — {divisionName}</div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Start a check to go team-by-team and record each tool’s condition. You can export a report when you finish.
          </p>
        </div>
        <Button
          className="gap-1.5"
          disabled={initiate.isPending}
          onClick={async () => {
            try { await initiate.mutateAsync({ divisionId: activeDivisionId }) }
            catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to start check') }
          }}
        >
          <Play className="h-4 w-4" /> {initiate.isPending ? 'Starting…' : 'Initiate check'}
        </Button>
      </div>
    )
  }

  if (activeTeam) {
    return <ToolCheckTeamPanel team={activeTeam} sessionId={openSession.id} onBack={() => setActiveTeam(null)} />
  }

  return (
    <SessionView
      sessionId={openSession.id}
      divisionId={activeDivisionId}
      divisionName={divisionName}
      onOpenTeam={setActiveTeam}
      onFinalize={async () => {
        try {
          await finalize.mutateAsync({ sessionId: openSession.id })
          setFinalizedId(openSession.id)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to finalize check')
        }
      }}
      finalizing={finalize.isPending}
    />
  )
}

function SessionView({
  sessionId, divisionId, divisionName, onOpenTeam, onFinalize, finalizing,
}: {
  sessionId: string
  divisionId: string
  divisionName: string | null
  onOpenTeam: (t: { id: string; name: string }) => void
  onFinalize: () => void
  finalizing: boolean
}) {
  const { data: progress } = useCheckProgress(sessionId)
  const { data: teams = [], isLoading } = useTeamsWithToolCounts([divisionId])
  const sortedTeams = useMemo(() => [...teams].sort((a, b) => COLLATOR.compare(a.team_name, b.team_name)), [teams])

  const checked = progress?.checked ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">Checking {divisionName}</div>
          <div className="text-[11px] text-muted-foreground min-h-4">
            {total > 0 ? `${checked} of ${total} in-service tools checked` : 'No in-service tools in this division'}
          </div>
          <div className="mt-1.5 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button className="gap-1.5 shrink-0" disabled={finalizing} onClick={onFinalize}>
          <CheckCircle2 className="h-4 w-4" /> {finalizing ? 'Finishing…' : 'Finish check'}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : sortedTeams.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-6 w-6 text-muted-foreground" />}
          title="No teams to check"
          description="This division has no custody teams. Create one in Master Data → Custody Locations."
        />
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {sortedTeams.map((t) => (
            <button
              key={t.team_id}
              type="button"
              onClick={() => onOpenTeam({ id: t.team_id, name: t.team_name })}
              className="text-left rounded-lg border bg-card shadow-sm p-4 min-h-[7rem] min-w-0 flex flex-col gap-1 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Users2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">{t.team_name}</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-sm">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="tabular-nums">{t.held_count}</span>
                <span className="text-muted-foreground">tool{t.held_count === 1 ? '' : 's'}</span>
              </div>
              {t.responsible_person_name && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                  <UserRound className="h-3 w-3 shrink-0" />
                  <span className="truncate">{t.responsible_person_name}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
