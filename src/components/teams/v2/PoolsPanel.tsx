'use client'

import { useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Search, Truck, Satellite, GripVertical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useEmployees, useVehicles, type Employee, type Vehicle, type EmployeeStatus } from '@/hooks/useTeams'
import type { DragData } from '../useDnDHandlers'

type Tab = 'employees' | 'vehicles'
type EmpFilter = 'unassigned' | 'on-task' | 'vacation' | 'archived' | 'all'

const EMP_FILTERS: { key: EmpFilter; label: string; status: EmployeeStatus | null }[] = [
  { key: 'unassigned', label: 'Unassigned', status: 'unassigned' },
  { key: 'on-task',    label: 'On Task',    status: 'on-task'    },
  { key: 'vacation',   label: 'Vacation',   status: 'vacation'   },
  { key: 'archived',   label: 'Archive',    status: 'archived'   },
  { key: 'all',        label: 'All',        status: null         },
]

export function PoolsPanel() {
  const [tab, setTab] = useState<Tab>('employees')
  const [empFilter, setEmpFilter] = useState<EmpFilter>('unassigned')
  const [q, setQ] = useState('')

  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()

  // Counts per filter (for badges) — match the original EmployeePool logic
  function countFor(key: EmpFilter): number {
    if (key === 'all')        return employees.filter(e => e.status !== 'active' || !e.team_id).length
    if (key === 'unassigned') return employees.filter(e => e.status === 'unassigned').length
    return employees.filter(e => e.status === key).length
  }

  // Visible employees for the active filter + search
  const ql = q.toLowerCase()
  const visibleEmployees = employees.filter(e => {
    if (empFilter === 'all') {
      if (e.status === 'active' && e.team_id) return false
    } else if (empFilter === 'unassigned') {
      if (e.status !== 'unassigned') return false
      if (e.team_id) return false
    } else {
      if (e.status !== empFilter) return false
    }
    if (ql) return e.name?.toLowerCase().includes(ql) || e.phone?.toLowerCase().includes(ql)
    return true
  })

  const unVehicles = vehicles.filter(v => !v.team_id)
  const visibleVehicles = unVehicles.filter(v =>
    !ql || v.plate?.toLowerCase().includes(ql) || v.type?.toLowerCase().includes(ql) || v.name?.toLowerCase().includes(ql),
  )

  return (
    <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-border/60 flex-col bg-background">
      <div className="px-4 h-12 flex items-center border-b border-border/60">
        <p className="text-sm font-semibold">Pools</p>
      </div>

      <div className="flex items-center gap-4 px-4 h-10 border-b border-border/60 text-sm">
        <button
          onClick={() => setTab('employees')}
          className={cn(
            'h-full -mb-px border-b-2 transition-colors',
            tab === 'employees'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          type="button"
        >
          Employees
        </button>
        <button
          onClick={() => setTab('vehicles')}
          className={cn(
            'h-full -mb-px border-b-2 transition-colors',
            tab === 'vehicles'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          type="button"
        >
          Vehicles ({unVehicles.length})
        </button>
      </div>

      {tab === 'employees' && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border/60">
          {EMP_FILTERS.map(f => (
            <EmpFilterPill
              key={f.key}
              label={f.label}
              count={countFor(f.key)}
              active={empFilter === f.key}
              status={f.status}
              onClick={() => setEmpFilter(f.key)}
            />
          ))}
        </div>
      )}

      <div className="px-3 py-2 border-b border-border/60">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`Search ${tab}…`}
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {tab === 'employees' && (
          <>
            {visibleEmployees.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {ql ? 'No matches' : 'Nothing here'}
              </p>
            )}
            {visibleEmployees.map(emp => <PoolEmployeeRow key={emp.id} employee={emp} />)}
          </>
        )}
        {tab === 'vehicles' && (
          <>
            {visibleVehicles.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {ql ? 'No matches' : 'All vehicles assigned'}
              </p>
            )}
            {visibleVehicles.map(v => <PoolVehicleRow key={v.id} vehicle={v} />)}
          </>
        )}
      </div>
    </aside>
  )
}

function EmpFilterPill({ label, count, active, status, onClick }: {
  label:  string
  count:  number
  active: boolean
  status: EmployeeStatus | null
  onClick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `status-pill-${label}`,
    data: status ? { zone: 'status-tab', status } : undefined,
    disabled: !status,
  })
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      type="button"
      className={cn(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
        isOver && !active && 'ring-2 ring-primary border-primary',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] leading-4',
          active ? 'bg-primary-foreground/20' : 'bg-muted-foreground/15',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function PoolEmployeeRow({ employee }: { employee: Employee }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-emp-${employee.id}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: employee.team_id ?? null } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-2.5 px-4 h-11 cursor-grab hover:bg-muted/40 transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      {employee.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={employee.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
        : <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">{initials}</div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{employee.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {employee.phone ?? employee.status}
        </p>
      </div>
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  )
}

function PoolVehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-veh-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: null } satisfies DragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-2.5 px-4 h-11 cursor-grab hover:bg-muted/40 transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm truncate">{vehicle.plate}</p>
        <p className="text-[10px] text-muted-foreground truncate">{vehicle.name ?? vehicle.type ?? 'Vehicle'}</p>
      </div>
      {vehicle.traccar_device_id && <Satellite className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  )
}
