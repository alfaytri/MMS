'use client'

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TeamFull } from '@/hooks/useTeams'
import { teamStatus, STATUS_CLASS } from './teamStatus'

interface Props {
  team:     TeamFull
  selected: boolean
  onSelect: () => void
}

export function TeamListRow({ team, selected, onSelect }: Props) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `list-row-${team.id}`,
    data: { zone: 'team-members', teamId: team.id },
  })

  const status      = teamStatus(team)
  const memberCount = team.members.filter(m => m.id !== team.leader_id).length
  const plate       = team.vehicles[0]?.plate ?? '—'
  const name        = team.name_en ?? team.name
  const dragIsValid = !!active

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative w-full h-11 px-3 flex items-center gap-2 text-left transition-colors border-l-2',
        selected ? 'bg-accent border-l-primary' : 'border-l-transparent hover:bg-muted/40',
        isOver && dragIsValid && 'ring-2 ring-primary/40 ring-inset bg-primary/5',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_CLASS[status])} aria-hidden />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-1 truncate text-sm">{name}</span>
        </TooltipTrigger>
        {team.name_ar && (
          <TooltipContent side="right" dir="rtl">{team.name_ar}</TooltipContent>
        )}
      </Tooltip>

      <span className="font-mono text-[11px] text-muted-foreground shrink-0">{plate}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-5 text-right">{memberCount}</span>
    </button>
  )
}
