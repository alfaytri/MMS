'use client'

import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Wrench, Clock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTeamsPage } from './TeamsPageContext'
import type { Employee } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-green-100 text-green-700',
  unassigned: 'bg-gray-100 text-gray-700',
  vacation:   'bg-yellow-100 text-yellow-700',
  'on-task':  'bg-blue-100 text-blue-700',
  archived:   'bg-red-100 text-red-700',
}

export function EmployeeRow({ employee }: { employee: Employee }) {
  const { openEmployeeDialog, openLogPanel, employeeToolCounts } = useTeamsPage()
  const toolCount = employeeToolCounts.get(employee.id) ?? 0
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-employee-${employee.id}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: null } satisfies DragData,
  })
  const initials = employee.name
    ?.split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-grab text-sm',
        isDragging && 'opacity-50'
      )}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {employee.avatar_url
        ? (
          <img
            src={employee.avatar_url}
            alt={employee.name ?? ''}
            className="h-7 w-7 rounded-full object-cover shrink-0"
          />
        )
        : (
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold shrink-0">
            {initials}
          </div>
        )
      }
      <span className="flex-1 truncate text-xs">{employee.name}</span>
      {toolCount > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <Wrench className="h-3 w-3" />{toolCount}
        </span>
      )}
      <Badge
        className={cn(
          'text-[10px] px-1 hidden sm:inline-flex',
          STATUS_COLORS[employee.status ?? 'unassigned']
        )}
      >
        {employee.status}
      </Badge>
      <div className="hidden group-hover:flex items-center gap-1">
        <button
          onClick={() => openLogPanel(employee.id, 'employee')}
          className="p-0.5 hover:text-primary"
          type="button"
        >
          <Clock className="h-3 w-3" />
        </button>
        <button
          onClick={() => openEmployeeDialog(employee)}
          className="p-0.5 hover:text-primary"
          type="button"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
