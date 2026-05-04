'use client'

import { useDroppable } from '@dnd-kit/core'
import { UserX, Palmtree, Briefcase, Archive, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmployeeStatus } from '@/hooks/useTeams'

export interface StatusTabDef {
  key: EmployeeStatus | 'all'
  label: string
  icon: React.ElementType
  status: EmployeeStatus | null
}

export const STATUS_TABS: StatusTabDef[] = [
  { key: 'unassigned', label: 'Unassigned', icon: UserX,     status: 'unassigned' },
  { key: 'vacation',   label: 'Vacation',   icon: Palmtree,  status: 'vacation'   },
  { key: 'on-task',    label: 'On Task',    icon: Briefcase, status: 'on-task'    },
  { key: 'archived',   label: 'Archive',    icon: Archive,   status: 'archived'   },
  { key: 'all',        label: 'All',        icon: Users,     status: null         },
]

export function StatusTabItem({ tab, isActive, count, onClick }: {
  tab: StatusTabDef
  isActive: boolean
  count: number
  onClick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `status-tab-${tab.key}`,
    data: tab.status ? { zone: 'status-tab', status: tab.status } : undefined,
    disabled: !tab.status,
  })
  const Icon = tab.icon

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      type="button"
      className={cn(
        'flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded text-xs transition-colors',
        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        isOver && !isActive && 'bg-primary/10 ring-1 ring-primary'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:block truncate">{tab.label}</span>
      <span
        className={cn(
          'text-[10px] rounded-full px-1',
          isActive ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
        )}
      >
        {count}
      </span>
    </button>
  )
}
