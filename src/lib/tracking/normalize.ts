import { createHash } from 'crypto'

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

export type Raw17trackEvent = { a: string; b: string; c: string; z: string }

import { map17trackTag } from './statusMap'

export function mapRawEvents(rawEvents: Raw17trackEvent[]) {
  return rawEvents
    .map(e => {
      const normalizedTimestamp = normalizeTimestamp(e.a)
      const location = e.b ?? ''
      const description = e.c ?? ''
      const status = map17trackTag(e.z)
      if (!status) return null
      const hash = computeEventHash(normalizedTimestamp, location, description)
      // `date` mirrors normalizedTimestamp so existing display code (ev.date) works
      return { hash, normalizedTimestamp, date: normalizedTimestamp, location, notes: description, status }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
}
