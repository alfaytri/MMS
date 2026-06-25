import type { ActivityLogEntry } from '@/hooks/useTeams'

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

export function formatActivity(log: LogWithActor): string {
  const actor    = log.actor?.full_name ?? 'System'
  const name     = pick(log.after_data, ['name_en', 'name', 'full_name', 'plate']) ?? 'Unknown'
  const prevName = pick(log.before_data, ['name_en', 'name', 'full_name', 'plate']) ?? name
  const team     = pick(log.after_data, ['team_name']) ?? pick(log.before_data, ['team_name']) ?? 'team'

  const changes  = changedFields(log.before_data, log.after_data)
  const changesS = changes.length ? ` (${changes.slice(0, 3).join(', ')}${changes.length > 3 ? `, +${changes.length - 3}` : ''})` : ''

  switch (log.action) {
    case 'team-created':       return `${actor} created team ${name}`
    case 'team-edited':        return `${actor} updated ${name}${changesS}`
    case 'team-archived':      return `${actor} archived ${name}`

    case 'employee-created':   return `${actor} added employee ${name}`
    case 'employee-edited':    return `${actor} updated ${name}${changesS}`
    case 'employee-assigned':  return `${actor} assigned ${name} to ${team}`
    case 'employee-removed':   return `${actor} removed ${name} from ${team}`
    case 'employee-disabled':  return `${actor} disabled ${name}`
    case 'employee-enabled':   return `${actor} re-enabled ${name}`
    case 'employee-archived':  return `${actor} archived ${name}`

    case 'vehicle-created':    return `${actor} added vehicle ${name}`
    case 'vehicle-edited':     return `${actor} updated vehicle ${name}${changesS}`
    case 'vehicle-assigned':   return `${actor} assigned ${name} to ${team}`
    case 'vehicle-removed':    return `${actor} unassigned ${name} from ${team}`
    case 'vehicle-archived':   return `${actor} archived vehicle ${prevName}`

    case 'tool-assigned':      return `${actor} assigned a tool to ${team}`
    case 'tool-removed':       return `${actor} removed a tool from ${team}`

    default: {
      const humanAction = log.action.replace(/-/g, ' ')
      const entity      = log.entity_type ?? ''
      return `${actor} ${humanAction}${entity ? ` (${entity})` : ''}`
    }
  }
}
