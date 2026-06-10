import { parsePhoneNumberFromString } from 'libphonenumber-js'

export type NormalizeResult =
  | { ok: true; e164: string }
  | { ok: false }

export function normalizeForDial(raw: string): NormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false }

  const parsed = parsePhoneNumberFromString(trimmed, 'QA')
  if (!parsed || !parsed.isValid()) return { ok: false }

  return { ok: true, e164: parsed.format('E.164') }
}
