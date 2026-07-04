import { createHash } from 'crypto'
import type { Track17Event } from './client17track'
import { map17trackTag } from './statusMap'

export function normalizeTimestamp(raw: string): string {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? raw : d.toISOString()
}

export function computeEventHash(
  normalizedTimestamp: string,
  location: string,
  description: string
): string {
  return createHash('sha256')
    .update(`${normalizedTimestamp}|${location}|${description}`)
    .digest('hex')
}

// Keep old type alias for webhook compatibility
export type Raw17trackEvent = Track17Event

export function mapRawEvents(rawEvents: Track17Event[]) {
  return rawEvents.map(e => {
    const normalizedTimestamp = normalizeTimestamp(e.time_utc || e.time_iso)
    const location = e.location ?? ''
    const description = e.description ?? ''
    const tag = e.stage || e.sub_status?.split('_')[0] || ''
    const status = map17trackTag(tag)
    const hash = computeEventHash(normalizedTimestamp, location, description)
    return { hash, normalizedTimestamp, date: normalizedTimestamp, location, notes: description, status }
  })
}
