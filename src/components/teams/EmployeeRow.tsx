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
      {...attributes}
      className={cn(
        'group flex items-center gap-2.5 px-2 py-2 rounded hover:bg-muted/50',
        isDragging && 'opacity-50'
      )}
    >
      {/* Drag handle only — keeps inner buttons clickable */}
      <div {...listeners} className="cursor-grab shrink-0 touch-none">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      {employee.avatar_url
        ? (
          <img
            src={employee.avatar_url}
            alt={employee.name ?? ''}
            className="h-8 w-8 rounded-full object-cover shrink-0"
          />
        )
        : (
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
        )
      }
      <span className="flex-1 truncate text-sm">{employee.name}</span>
      {toolCount > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />{toolCount}
        </span>
      )}
      <Badge
        className={cn(
          'text-xs px-1.5 hidden sm:inline-flex',
          STATUS_COLORS[employee.status ?? 'unassigned']
        )}
      >
        {employee.status}
      </Badge>
      <div className="hidden group-hover:flex items-center gap-1">
        <button
          onClick={() => openLogPanel(employee.id, 'employee')}
          className="p-1 hover:text-primary"
          type="button"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => openEmployeeDialog(employee)}
          className="p-1 hover:text-primary"
          type="button"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
