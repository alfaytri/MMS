import type { ActivityLogEntry, Employee, Vehicle, TeamFull } from '@/hooks/useTeams'

type LogWithActor = ActivityLogEntry & {
  actor: { id: string; full_name: string } | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SKIP_KEYS = new Set(['id', 'created_at', 'updated_at'])

function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v)
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (isUuid(v)) return null
  return String(v)
}

function pick(data: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!data) return null
  for (const k of keys) {
    const s = asString(data[k])
    if (s) return s
  }
  return null
}

function changedFields(
  before: Record<string, unknown> | null | undefined,
  after:  Record<string, unknown> | null | undefined,
): string[] {
  if (!after) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(after)) {
    if (SKIP_KEYS.has(k) || k.endsWith('_id') || k.endsWith('_at')) continue
    const prev = before?.[k]
    if (prev !== v) out.push(k.replace(/_/g, ' '))
  }
  return out
}

export interface ActivityResolvers {
  teams:     TeamFull[]
  employees: Employee[]
  vehicles:  Vehicle[]
}

export type Segment =
  | { kind: 'plain';    text: string }
  | { kind: 'actor';    text: string }
  | { kind: 'employee'; text: string }
  | { kind: 'team';     text: string }
  | { kind: 'vehicle';  text: string }

function plain(text: string): Segment { return { kind: 'plain', text } }
function actor(text: string): Segment { return { kind: 'actor', text } }

/**
 * Returns inline segments for an activity entry. UUIDs are always resolved
 * against the resolver maps before falling back to whatever name field is in
 * before_data / after_data. Never returns raw UUIDs.
 */
export function formatActivity(log: LogWithActor, r: ActivityResolvers): Segment[] {
  function employeeName(id: string | null | undefined): string | null {
    if (!id) return null
    const e = r.employees.find(x => x.id === id)
    return e?.name ?? null
  }
  function teamName(id: string | null | undefined): string | null {
    if (!id) return null
    const t = r.teams.find(x => x.id === id)
    return t ? (t.name_en ?? t.name ?? null) : null
  }
  function vehicleName(id: string | null | undefined): string | null {
    if (!id) return null
    const v = r.vehicles.find(x => x.id === id)
    return v ? (v.plate ?? v.name ?? null) : null
  }

  const actorName = log.actor?.full_name ?? 'System'

  function primary(): Segment {
    if (log.entity_type === 'employee') {
      const n = employeeName(log.entity_id)
        ?? pick(log.after_data, ['name', 'name_en', 'full_name'])
        ?? pick(log.before_data, ['name', 'name_en', 'full_name'])
        ?? 'employee'
      return { kind: 'employee', text: n }
    }
    if (log.entity_type === 'team') {
      const n = teamName(log.entity_id)
        ?? pick(log.after_data, ['name_en', 'name'])
        ?? pick(log.before_data, ['name_en', 'name'])
        ?? 'team'
      return { kind: 'team', text: n }
    }
    if (log.entity_type === 'vehicle') {
      const n = vehicleName(log.entity_id)
        ?? pick(log.after_data, ['plate', 'name'])
        ?? pick(log.before_data, ['plate', 'name'])
        ?? 'vehicle'
      return { kind: 'vehicle', text: n }
    }
    const n = pick(log.after_data, ['name_en', 'name', 'plate'])
      ?? pick(log.before_data, ['name_en', 'name', 'plate'])
      ?? (log.entity_type ?? 'item')
    return { kind: 'plain', text: n }
  }

  // Resolve team_id from before/after data into a team segment
  function teamFromData(): Segment | null {
    const teamId = (log.after_data?.team_id ?? log.before_data?.team_id) as string | undefined
    const name   = teamId ? teamName(teamId) : null
    if (!name) return null
    return { kind: 'team', text: name }
  }

  const changes  = changedFields(log.before_data, log.after_data)
  const changesS = changes.length ? ` (${changes.slice(0, 3).join(', ')}${changes.length > 3 ? `, +${changes.length - 3}` : ''})` : ''

  const ent = primary()

  switch (log.action) {
    case 'team-created':       return [actor(actorName), plain(' created team '), ent]
    case 'team-edited':        return [actor(actorName), plain(' updated '), ent, plain(changesS)]
    case 'team-archived':      return [actor(actorName), plain(' archived team '), ent]

    case 'employee-created':   return [actor(actorName), plain(' added employee '), ent]
    case 'employee-edited':    return [actor(actorName), plain(' updated '), ent, plain(changesS)]
    case 'employee-assigned': {
      const team = teamFromData()
      return team
        ? [actor(actorName), plain(' assigned '), ent, plain(' to '), team]
        : [actor(actorName), plain(' assigned '), ent, plain(' to a team')]
    }
    case 'employee-removed': {
      const team = teamFromData()
      return team
        ? [actor(actorName), plain(' removed '), ent, plain(' from '), team]
        : [actor(actorName), plain(' removed '), ent, plain(' from team')]
    }
    case 'employee-disabled':  return [actor(actorName), plain(' disabled '),   ent]
    case 'employee-enabled':   return [actor(actorName), plain(' re-enabled '), ent]
    case 'employee-archived':  return [actor(actorName), plain(' archived '),   ent]
    case 'employee-status-changed': {
      const status = pick(log.after_data, ['status']) ?? 'a new status'
      return [actor(actorName), plain(' set '), ent, plain(` status to ${status}`)]
    }

    case 'vehicle-created':    return [actor(actorName), plain(' added vehicle '), ent]
    case 'vehicle-edited':     return [actor(actorName), plain(' updated vehicle '), ent, plain(changesS)]
    case 'vehicle-assigned': {
      const team = teamFromData()
      return team
        ? [actor(actorName), plain(' assigned '), ent, plain(' to '), team]
        : [actor(actorName), plain(' assigned '), ent, plain(' to a team')]
    }
    case 'vehicle-removed': {
      const team = teamFromData()
      return team
        ? [actor(actorName), plain(' unassigned '), ent, plain(' from '), team]
        : [actor(actorName), plain(' unassigned '), ent]
    }
    case 'vehicle-archived':   return [actor(actorName), plain(' archived vehicle '), ent]

    case 'tool-assigned': {
      const team = teamFromData()
      return team
        ? [actor(actorName), plain(' assigned a tool to '), team]
        : [actor(actorName), plain(' assigned a tool')]
    }
    case 'tool-removed': {
      const team = teamFromData()
      return team
        ? [actor(actorName), plain(' removed a tool from '), team]
        : [actor(actorName), plain(' removed a tool')]
    }

    default: {
      const humanAction = log.action.replace(/-/g, ' ')
      return [actor(actorName), plain(` ${humanAction} `), ent]
    }
  }
}
