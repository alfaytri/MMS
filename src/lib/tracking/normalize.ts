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
