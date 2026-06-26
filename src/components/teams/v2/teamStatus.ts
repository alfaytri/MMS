import type { TeamFull } from '@/hooks/useTeams'

export type TeamStatus = 'green' | 'amber' | 'red' | 'gray'

/**
 * Status dot color for the left-rail row.
 *
 * gray  = archived OR completely empty (no leader, no members, no vehicle)
 * red   = has members but no leader (blocking — team can't operate)
 * amber = missing at least one of {vehicle, members} but has a leader
 * green = leader + ≥1 member + ≥1 vehicle
 */
export function teamStatus(team: TeamFull): TeamStatus {
  // Teams are soft-deleted via deleted_at (timestamp). The teams list query
  // already filters these out, but treat as gray defensively if one appears.
  if (team.deleted_at) return 'gray'

  const hasLeader   = team.leader_id != null
  const memberCount = team.members.filter(m => m.id !== team.leader_id).length
  const hasVehicle  = team.vehicles.length > 0

  if (!hasLeader && memberCount === 0 && !hasVehicle) return 'gray'
  if (!hasLeader) return 'red'
  if (memberCount === 0 || !hasVehicle) return 'amber'
  return 'green'
}

export const STATUS_CLASS: Record<TeamStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
  gray:  'bg-muted-foreground/40',
}
