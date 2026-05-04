'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull, Employee } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

const MAX_VISIBLE = 8

export function MembersGrid({ team }: { team: TeamFull }) {
  const { employeeToolCounts } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `members-grid-${team.id}`,
    data: { zone: 'team-members', teamId: team.id },
  })
  const members  = team.members.filter(m => m.id !== team.leader_id)
  const visible  = members.slice(0, MAX_VISIBLE)
  const overflow = members.length - MAX_VISIBLE

  if (members.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[2.5rem] rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground p-2 transition-colors',
          isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
        )}
      >
        Drop employees here
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-wrap gap-1 p-1 min-h-[2.5rem] rounded border-2 border-transparent transition-colors',
        isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}
    >
      {visible.map(emp => (
        <MemberAvatar
          key={emp.id}
          employee={emp}
          teamId={team.id}
          hasTools={employeeToolCounts.has(emp.id)}
        />
      ))}
      {overflow > 0 && (
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium">
          +{overflow}
        </div>
      )}
    </div>
  )
}

function MemberAvatar({ employee, teamId, hasTools }: {
  employee: Employee
  teamId: string
  hasTools: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${employee.id}-team-${teamId}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: teamId } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = (employee as unknown as { avatar_url?: string | null }).avatar_url ?? null

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('relative cursor-grab', isDragging && 'opacity-50')}
      title={employee.name ?? ''}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={employee.name ?? ''} className="h-6 w-6 rounded-full object-cover" />
        : (
          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-semibold">
            {initials}
          </div>
        )
      }
      {hasTools && (
        <Wrench className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-orange-500" />
      )}
    </div>
  )
}
