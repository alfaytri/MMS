'use client'

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Search, Truck, Satellite, GripVertical } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useEmployees, useVehicles, type Employee, type Vehicle } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import type { DragData } from '../useDnDHandlers'

type Tab = 'employees' | 'vehicles'

export function PoolsDrawer() {
  const { poolsDrawerOpen, setPoolsDrawerOpen } = useTeamsPage()
  const [tab, setTab] = useState<Tab>('employees')
  const [q, setQ] = useState('')

  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()

  const unEmployees = employees.filter(e => !e.team_id)
  const unVehicles  = vehicles.filter(v => !v.team_id)

  const ql = q.toLowerCase()
  const visibleEmployees = unEmployees.filter(e =>
    !ql || e.name?.toLowerCase().includes(ql) || e.phone?.toLowerCase().includes(ql),
  )
  const visibleVehicles = unVehicles.filter(v =>
    !ql || v.plate?.toLowerCase().includes(ql) || v.type?.toLowerCase().includes(ql) || v.name?.toLowerCase().includes(ql),
  )

  return (
    <Sheet open={poolsDrawerOpen} onOpenChange={setPoolsDrawerOpen} modal={false}>
      <SheetContent
        side="right"
        className="w-full sm:w-[380px] p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-4 h-12 flex flex-row items-center justify-between border-b border-border/60">
          <SheetTitle className="text-sm font-semibold">Pools</SheetTitle>
        </SheetHeader>

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
            Employees ({unEmployees.length})
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

        <div className="px-4 py-2 border-b border-border/60">
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
                  {ql ? 'No matches' : 'All employees assigned'}
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
      </SheetContent>
    </Sheet>
  )
}

function PoolEmployeeRow({ employee }: { employee: Employee }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-emp-${employee.id}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: null } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

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
        ? <img src={employee.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
        : <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">{initials}</div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{employee.name}</p>
        {employee.phone && <p className="text-[10px] text-muted-foreground truncate">{employee.phone}</p>}
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
