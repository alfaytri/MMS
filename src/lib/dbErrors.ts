/**
 * Maps a Supabase/PostgREST error to a user-facing message.
 *
 * Permission failures (code `42501`, or message text matching "row-level
 * security policy" / "permission denied") collapse to a clean
 * "You don't have permission …" sentence — that mapping is only safe to use
 * where the underlying RLS policy is confirmed to gate on a genuinely
 * missing permission, not a legitimate-user false block.
 *
 * Every other error is preserved verbatim (code + message + details + hint).
 * PostgrestError is a plain object, not an `Error` subclass, so
 * `instanceof Error` fallbacks would otherwise hide the DB's actual message
 * (column/constraint/FK details) behind a generic "Something went wrong" —
 * see feedback-surface-raw-db-errors. Only the permission case gets the
 * clean rewrite; nothing else is ever masked.
 */
export function humanizeDbError(error: unknown, action?: string): string {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const code = e?.code
  const msg = e?.message ?? ''
  if (code === '42501' || /row-level security policy|permission denied/i.test(msg)) {
    return action ? `You don't have permission to ${action}.` : "You don't have permission to do this."
  }
  const parts = [
    code ? `[${code}]` : null,
    e?.message ?? 'Something went wrong',
    e?.details ? `details: ${e.details}` : null,
    e?.hint ? `hint: ${e.hint}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}
