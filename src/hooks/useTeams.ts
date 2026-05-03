// src/hooks/useTeams.ts
import { useQuery } from '@tanstack/react-query'
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
