'use client'

import { useDroppable } from '@dnd-kit/core'
import { Crown, Clock, Pencil, UserMinus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRemoveTeamLeader } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull } from '@/hooks/useTeams'

export function LeaderSlot({ team }: { team: TeamFull }) {
  const removeLeader = useRemoveTeamLeader()
  const { openEmployeeDialog, openLogPanel } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `leader-slot-${team.id}`,
    data: { zone: 'team-leader', teamId: team.id },
  })
  const leader = team.leader

  if (!leader) {
    return (
      <div ref={setNodeRef} className={cn(
        'h-10 rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}>
        <Crown className="h-3 w-3 mr-1" /> Drop leader
      </div>
    )
  }

  const initials = leader.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = (leader as unknown as { avatar_url?: string | null }).avatar_url ?? null

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-center gap-2 h-10 px-2 rounded border bg-amber-50 dark:bg-amber-950/20 text-sm',
        isOver && 'ring-2 ring-primary bg-primary/5'
      )}
    >
      <Crown className="h-3 w-3 text-amber-500 shrink-0" />
      {avatarUrl
        ? <img src={avatarUrl} alt={leader.name ?? ''} className="h-6 w-6 rounded-full object-cover" />
        : (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
            {initials}
          </div>
        )
      }
      <span className="flex-1 truncate text-xs">{leader.name}</span>
      <div className="hidden group-hover:flex items-center gap-1">
        <button
          onClick={() => openLogPanel(leader.id, 'employee')}
          className="p-0.5 hover:text-primary"
          type="button"
        >
          <Clock className="h-3 w-3" />
        </button>
        <button
          onClick={() => openEmployeeDialog(leader)}
          className="p-0.5 hover:text-primary"
          type="button"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => removeLeader.mutate({ teamId: team.id })}
          className="p-0.5 hover:text-destructive"
          type="button"
        >
          <UserMinus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
