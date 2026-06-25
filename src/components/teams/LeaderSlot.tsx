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
        'h-20 rounded-md border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary border-2 bg-primary/5',
      )}>
        <Crown className="h-3.5 w-3.5 mr-1.5" /> Drop leader here
      </div>
    )
  }

  const initials = leader.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = leader.avatar_url ?? null

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-center gap-3 h-20 px-3 rounded-md border border-amber-200 bg-amber-50/60 text-sm transition-colors',
        isOver && 'ring-2 ring-primary border-primary',
      )}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={leader.name ?? ''} className="h-10 w-10 rounded-full object-cover" />
        : (
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
        )
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Crown className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="font-medium truncate">{leader.name}</span>
        </div>
        {leader.phone && (
          <p className="text-xs text-muted-foreground truncate">{leader.phone}</p>
        )}
      </div>
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button onClick={() => openLogPanel(leader.id, 'employee')} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => openEmployeeDialog(leader)} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => removeLeader.mutate({ teamId: team.id })} className="p-1.5 hover:text-destructive text-muted-foreground" type="button">
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
