'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Wrench, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTeamsPage } from './TeamsPageContext'
import { useUnassignEmployee } from '@/hooks/useTeams'
import type { TeamFull, Employee } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function MembersGrid({ team }: { team: TeamFull }) {
  const { employeeToolCounts } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `members-grid-${team.id}`,
    data: { zone: 'team-members', teamId: team.id },
  })
  const members = team.members.filter(m => m.id !== team.leader_id)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-dashed border-transparent p-2 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      {members.length === 0 && !isOver && (
        <p className="text-xs text-muted-foreground text-center py-6">
          No members. Drag employees here to add.
        </p>
      )}
      {(members.length > 0 || isOver) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {members.map(emp => (
            <MemberTile
              key={emp.id}
              employee={emp}
              teamId={team.id}
              hasTools={employeeToolCounts.has(emp.id)}
            />
          ))}
          <div className="flex flex-col items-center gap-1 opacity-50">
            <div className="h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground text-lg">+</div>
            <span className="text-[10px] text-muted-foreground">Drop here</span>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberTile({ employee, teamId, hasTools }: {
  employee: Employee
  teamId: string
  hasTools: boolean
}) {
  const removeFromTeam = useUnassignEmployee()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${employee.id}-team-${teamId}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: teamId } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = employee.avatar_url ?? null

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('group relative flex flex-col items-center gap-1 cursor-grab', isDragging && 'opacity-50')}
    >
      <div className="relative">
        {avatarUrl
          ? <img src={avatarUrl} alt={employee.name ?? ''} className="h-10 w-10 rounded-full object-cover" />
          : (
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          )
        }
        {hasTools && (
          <Wrench className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-orange-500 bg-background rounded-full p-0.5" />
        )}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => removeFromTeam.mutate({ employeeId: employee.id, fromTeamId: teamId })}
          className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-destructive flex items-center justify-center transition-opacity"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground truncate max-w-full">{employee.name?.split(' ')[0]}</span>
    </div>
  )
}
