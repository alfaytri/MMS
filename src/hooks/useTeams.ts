// src/hooks/useTeams.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Base DB types
// ---------------------------------------------------------------------------

// Extend TeamRaw to include newly added columns not yet in generated types
export interface TeamRaw extends DBTable<'teams'> {
  name_en?: string | null
  name_ar?: string | null
  phone?: string | null
  division_id?: string | null
  is_emergency?: boolean | null
  is_qc?: boolean | null
  traccar_device_id?: string | null
  deleted_at?: string | null
}
export type TeamInsert = DBInsert<'teams'>
export type TeamUpdate = DBUpdate<'teams'>

// Extend Employee to include newly added columns not yet in generated types
export interface Employee extends DBTable<'employees'> {
  avatar_url?: string | null
  site_visit_order?: boolean | null
  site_visit_quotation?: boolean | null
  deleted_at?: string | null
}
export type EmployeeInsert = DBInsert<'employees'>
export type EmployeeUpdate = DBUpdate<'employees'>
export type EmployeeStatus = 'active' | 'unassigned' | 'vacation' | 'on-task' | 'archived'

// Extend Vehicle to include newly added columns not yet in generated types
export interface Vehicle extends DBTable<'vehicles'> {
  traccar_device_id?: string | null
  deleted_at?: string | null
}
export type VehicleInsert = DBInsert<'vehicles'>
export type VehicleUpdate = DBUpdate<'vehicles'>

export type Schedule = DBTable<'schedules'>
export type ScheduleInsert = DBInsert<'schedules'>
export type ScheduleUpdate = DBUpdate<'schedules'>

export type ScheduleAssignment = DBTable<'team_schedule_assignments'>

// tool_assignments and team_activity_log are not yet in generated types — manual interfaces
export interface ToolAssignment {
  id: string
  team_id: string | null
  employee_id: string | null
  tool_asset_item_id: string | null
  quantity: number | null
  assigned_at: string | null
  notes: string | null
  created_at: string | null
}

export interface ActivityLogEntry {
  id: string
  entity_id: string | null
  entity_type: string | null
  action: string
  payload: Record<string, unknown> | null
  actor_id: string | null
  created_at: string | null
}

// ---------------------------------------------------------------------------
// Composed types
// ---------------------------------------------------------------------------

export interface TeamFull extends TeamRaw {
  leader:   Employee | null
  members:  Employee[]
  vehicle:  Vehicle | null
  schedule: Schedule | null
}

export interface TeamsFilters {
  search?:     string
  divisionId?: string | null
}

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all teams joined with employees, vehicles, and schedules.
 * Uses Promise.allSettled for resilience — if vehicles/employees/schedules
 * fail the teams still load. Only a teams fetch failure throws.
 */
export function useTeams(filters?: TeamsFilters) {
  return useQuery({
    queryKey: ['teams', filters],
    queryFn: async () => {
      const supabase = createClient()

      const [teamsRes, employeesRes, vehiclesRes, schedulesRes] = await Promise.allSettled([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('teams') as any).select('*').is('deleted_at', null).order('name_en'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('employees') as any).select('*').is('deleted_at', null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('vehicles') as any).select('*').is('deleted_at', null),
        supabase.from('schedules').select('*').is('deleted_at', null),
      ])

      if (teamsRes.status === 'rejected' || teamsRes.value.error) {
        throw teamsRes.status === 'rejected' ? teamsRes.reason : teamsRes.value.error
      }

      const teams     = (teamsRes.value.data ?? []) as TeamRaw[]
      const employees = employeesRes.status === 'fulfilled' ? ((employeesRes.value.data ?? []) as Employee[]) : []
      const vehicles  = vehiclesRes.status === 'fulfilled'  ? ((vehiclesRes.value.data ?? []) as Vehicle[])   : []
      const schedules = schedulesRes.status === 'fulfilled' ? ((schedulesRes.value.data ?? []) as Schedule[]) : []

      const empById   = new Map(employees.map(e => [e.id, e]))
      const vehByTeam = new Map(vehicles.filter(v => v.team_id).map(v => [v.team_id!, v]))
      const schById   = new Map(schedules.map(s => [s.id, s]))

      let result: TeamFull[] = teams.map(t => ({
        ...t,
        leader:   t.leader_id ? (empById.get(t.leader_id) ?? null) : null,
        members:  employees.filter(e => e.team_id === t.id),
        vehicle:  vehByTeam.get(t.id) ?? null,
        schedule: t.schedule_id ? (schById.get(t.schedule_id) ?? null) : null,
      }))

      if (filters?.search) {
        const q = filters.search.toLowerCase()
        result = result.filter(t =>
          t.name_en?.toLowerCase().includes(q) ||
          t.name_ar?.toLowerCase().includes(q)
        )
      }
      if (filters?.divisionId) {
        result = result.filter(t => t.division_id === filters.divisionId)
      }

      return result
    },
    staleTime: 30 * 1000,
  })
}

/** Fetches all active employees, optionally filtered by status or search term. */
export function useEmployees(filters?: { search?: string; status?: EmployeeStatus }) {
  return useQuery({
    queryKey: ['employees', filters],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('employees') as any).select('*').is('deleted_at', null).order('name')
      if (filters?.status) query = query.eq('status', filters.status)
      const { data, error } = await query
      if (error) throw error
      let result = (data ?? []) as Employee[]
      if (filters?.search) {
        const q = filters.search.toLowerCase()
        result = result.filter(e =>
          e.name?.toLowerCase().includes(q) || e.phone?.toLowerCase().includes(q)
        )
      }
      return result
    },
    staleTime: 30 * 1000,
  })
}

/** Fetches all active vehicles. */
export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('vehicles') as any).select('*').is('deleted_at', null).order('plate')
      if (error) throw error
      return (data ?? []) as Vehicle[]
    },
    staleTime: 30 * 1000,
  })
}

/** Fetches all schedules. */
export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('schedules').select('*').is('deleted_at', null).order('name')
      if (error) throw error
      return (data ?? []) as Schedule[]
    },
    staleTime: 60 * 1000,
  })
}

/** Fetches schedule assignment history for a single team, newest first. */
export function useTeamScheduleAssignments(teamId: string | null) {
  return useQuery({
    queryKey: ['team-schedule-assignments', teamId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('team_schedule_assignments')
        .select('*, schedule:schedules(*)')
        .eq('team_id', teamId!)
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as (ScheduleAssignment & { schedule: Schedule })[]
    },
    enabled: !!teamId,
  })
}

/** Fetches tool assignments for a single team or employee — for use in detail views. */
export function useToolAssignments(entityType: 'team' | 'employee', entityId: string | null) {
  return useQuery({
    queryKey: ['tool-assignments', entityType, entityId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      const col = entityType === 'team' ? 'team_id' : 'employee_id'
      const { data, error } = await db.from('tool_assignments').select('*').eq(col, entityId!)
      if (error) throw error
      return (data ?? []) as ToolAssignment[]
    },
    enabled: !!entityId,
    staleTime: 30 * 1000,
  })
}

/**
 * Returns a Map<entityId, count> for ALL entities in a single query.
 * Use this in list views to avoid N+1 queries when rendering tool counts per row.
 */
export function useToolCountMap(entityType: 'team' | 'employee') {
  return useQuery({
    queryKey: ['tool-count-map', entityType],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      const col = entityType === 'team' ? 'team_id' : 'employee_id'
      const { data, error } = await db
        .from('tool_assignments')
        .select(col)
        .not(col, 'is', null)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of (data ?? []) as Record<string, string>[]) {
        const id = row[col]
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      return counts
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Fetches the team activity log, optionally filtered to a single entity.
 * Includes actor profile (id + full_name). Limited to 500 entries.
 */
export function useTeamActivityLog(entityId?: string | null) {
  return useQuery({
    queryKey: ['team-activity-log', entityId ?? 'all'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      let query = db
        .from('team_activity_log')
        .select('*, actor:profiles(id,full_name)')
        .order('created_at', { ascending: false })
        .limit(500)
      if (entityId) query = query.eq('entity_id', entityId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as (ActivityLogEntry & { actor: { id: string; full_name: string } | null })[]
    },
    staleTime: 10 * 1000,
  })
}

/**
 * Returns the real total count of activity log entries (no row limit).
 * Used by the TopBar badge to show an accurate number.
 */
export function useTeamActivityLogCount() {
  return useQuery({
    queryKey: ['team-activity-log-count'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      const { count, error } = await db
        .from('team_activity_log')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return (count ?? 0) as number
    },
    staleTime: 10 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Internal log helper
// ---------------------------------------------------------------------------

async function logActivity(params: {
  action: string
  entityType: string
  entityId: string
  beforeData?: Record<string, unknown>
  afterData?: Record<string, unknown>
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  await db.from('team_activity_log').insert({
    action:      params.action,
    entity_type: params.entityType,
    entity_id:   params.entityId,
    before_data: params.beforeData ?? null,
    after_data:  params.afterData ?? null,
  })
}

// ---------------------------------------------------------------------------
// Team mutations
// ---------------------------------------------------------------------------

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DBInsert<'teams'>) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('teams').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'team-created', entityType: 'team', entityId: data.id, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, before, ...patch }: DBUpdate<'teams'> & { id: string; before?: Record<string, unknown> }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('teams').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'team-edited', entityType: 'team', entityId: id, beforeData: before, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useArchiveTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('teams').update({ deleted_at: new Date().toISOString() } as any).eq('id', id)
      if (error) throw error
      await logActivity({ action: 'team-archived', entityType: 'team', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Employee mutations
// ---------------------------------------------------------------------------

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EmployeeInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('employees').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'employee-created', entityType: 'employee', entityId: data.id, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, before, ...patch }: EmployeeUpdate & { id: string; before?: Record<string, unknown> }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('employees').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'employee-edited', entityType: 'employee', entityId: id, beforeData: before, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useArchiveEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('employees')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ deleted_at: new Date().toISOString(), status: 'archived', team_id: null } as any)
        .eq('id', id)
      if (error) throw error
      await logActivity({ action: 'employee-archived', entityType: 'employee', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Vehicle mutations
// ---------------------------------------------------------------------------

export function useCreateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VehicleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('vehicles').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'vehicle-created', entityType: 'vehicle', entityId: data.id, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useUpdateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, before, ...patch }: VehicleUpdate & { id: string; before?: Record<string, unknown> }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('vehicles').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'vehicle-edited', entityType: 'vehicle', entityId: id, beforeData: before, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useArchiveVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('vehicles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ deleted_at: new Date().toISOString(), team_id: null } as any)
        .eq('id', id)
      if (error) throw error
      await logActivity({ action: 'vehicle-archived', entityType: 'vehicle', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Assignment mutations
// ---------------------------------------------------------------------------

export function useAssignEmployeeToTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ employeeId, teamId }: { employeeId: string; teamId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('employees').update({ team_id: teamId, status: 'active' } as any).eq('id', employeeId)
      if (error) throw error
      await logActivity({ action: 'employee-assigned', entityType: 'employee', entityId: employeeId, afterData: { team_id: teamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useUnassignEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ employeeId, fromTeamId }: { employeeId: string; fromTeamId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('employees').update({ team_id: null, status: 'unassigned' } as any).eq('id', employeeId)
      if (error) throw error
      await logActivity({ action: 'employee-removed', entityType: 'employee', entityId: employeeId, beforeData: { team_id: fromTeamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useSetTeamLeader() {
  const qc = useQueryClient()
  return useMutation({
    // logActivity is done inside RPC assign_team_leader
    mutationFn: async ({ teamId, employeeId }: { teamId: string; employeeId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      const { error } = await db.rpc('assign_team_leader', {
        p_team_id:     teamId,
        p_employee_id: employeeId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useRemoveTeamLeader() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ teamId }: { teamId: string }) => {
      const supabase = createClient()
      const { data: team, error: fetchError } = await supabase
        .from('teams').select('leader_id').eq('id', teamId).single()
      if (fetchError) throw fetchError
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('teams').update({ leader_id: null } as any).eq('id', teamId)
      if (error) throw error
      await logActivity({ action: 'leader-removed', entityType: 'team', entityId: teamId, beforeData: { leader_id: (team as any).leader_id } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useAssignVehicleToTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ vehicleId, teamId }: { vehicleId: string; teamId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('vehicles').update({ team_id: teamId } as any).eq('id', vehicleId)
      if (error) throw error
      await logActivity({ action: 'vehicle-assigned', entityType: 'vehicle', entityId: vehicleId, afterData: { team_id: teamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useUnassignVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ vehicleId, fromTeamId }: { vehicleId: string; fromTeamId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('vehicles').update({ team_id: null } as any).eq('id', vehicleId)
      if (error) throw error
      await logActivity({ action: 'vehicle-removed', entityType: 'vehicle', entityId: vehicleId, beforeData: { team_id: fromTeamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useSetEmployeeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ employeeId, status }: { employeeId: string; status: EmployeeStatus }) => {
      const supabase = createClient()
      const patch: Record<string, unknown> = { status }
      if (status === 'unassigned' || status === 'vacation' || status === 'archived') patch.team_id = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('employees').update(patch as any).eq('id', employeeId)
      if (error) throw error
      await logActivity({ action: 'employee-status-changed', entityType: 'employee', entityId: employeeId, afterData: { status } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Schedule mutations
// ---------------------------------------------------------------------------

export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ScheduleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('schedules').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'schedule-created', entityType: 'schedule', entityId: data.id, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: ScheduleUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('schedules').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'schedule-edited', entityType: 'schedule', entityId: id, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }) },
  })
}

/** Soft-deletes a schedule, cascades assignment deletion, and re-syncs affected teams. */
export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any

      // 1. Find all teams that have an assignment to this schedule
      const { data: affected } = await supabase
        .from('team_schedule_assignments')
        .select('team_id')
        .eq('schedule_id', id)

      // 2. Soft-delete the schedule
      const { error } = await supabase
        .from('schedules')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

      // 3. Delete all assignments referencing this schedule
      await supabase.from('team_schedule_assignments').delete().eq('schedule_id', id)

      // 4. Re-sync each affected team's active schedule pointer
      const teamIds = [...new Set(((affected ?? []) as { team_id: string }[]).map(r => r.team_id))]
      await Promise.all(
        teamIds.map((teamId: string) => supabase.rpc('sync_team_active_schedule', { p_team_id: teamId }))
      )

      await logActivity({ action: 'schedule-deleted', entityType: 'schedule', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-schedule-assignments'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useAttachSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { teamId: string; scheduleId: string; startDate: string; endDate?: string | null }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      const { data, error } = await supabase.from('team_schedule_assignments').insert({
        team_id:     input.teamId,
        schedule_id: input.scheduleId,
        start_date:  input.startDate,
        end_date:    input.endDate ?? null,
      }).select().single()
      if (error) throw error
      const { error: syncError } = await db.rpc('sync_team_active_schedule', { p_team_id: input.teamId })
      if (syncError) throw syncError
      await logActivity({ action: 'schedule-attached', entityType: 'team', entityId: input.teamId, afterData: data as Record<string, unknown> })
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-schedule-assignments', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}

export function useDetachSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ assignmentId, teamId }: { assignmentId: string; teamId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      const { error } = await supabase.from('team_schedule_assignments').delete().eq('id', assignmentId)
      if (error) throw error
      const { error: syncError } = await db.rpc('sync_team_active_schedule', { p_team_id: teamId })
      if (syncError) throw syncError
      await logActivity({ action: 'schedule-detached', entityType: 'team', entityId: teamId })
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-schedule-assignments', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
    },
  })
}
