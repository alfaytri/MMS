/**
 * Maps a Supabase/PostgREST/thrown error to a user-facing message.
 *
 * The common, recognizable failure classes collapse to a clean, non-technical
 * sentence an operator can act on:
 *   - permission / RLS            (42501, "row-level security", "permission denied")
 *   - still-referenced record     (23503, "violates foreign key constraint")
 *   - duplicate value             (23505, "duplicate key value", "already exists")
 *   - missing required field      (23502, "null value in column")
 *   - value not allowed           (23514, "violates check constraint")
 *   - business rule from our RPCs (P0001 RAISE EXCEPTION — already human-written)
 *   - network / connectivity      ("failed to fetch", …)
 *
 * Anything unmapped is preserved verbatim (code + message + details + hint) so
 * the long tail stays debuggable in the toast — and the central react-query
 * error handler reports those unmapped faults to Sentry (see isUnexpectedDbError).
 * This supersedes the earlier "surface every raw DB message" rule for the common
 * classes above; the raw detail is no longer lost, it moves to Sentry/console.
 */

type DbErrorLike = { code?: string; message?: string; details?: string; hint?: string }

function asDbError(error: unknown): DbErrorLike {
  if (error && typeof error === 'object') return error as DbErrorLike
  if (typeof error === 'string') return { message: error }
  return {}
}

const EXPECTED_CODES = ['42501', '23503', '23505', '23502', '23514', 'P0001']
const EXPECTED_MESSAGE_RE =
  /row-level security policy|permission denied|violates foreign key constraint|duplicate key value|already exists|null value in column|violates not-null constraint|violates check constraint/i
const NETWORK_RE = /failed to fetch|networkerror|network error|load failed|the user aborted a request/i

/**
 * True when an error is an unexpected fault (a real bug), rather than an
 * expected, user-caused condition (permission block, FK/unique/check violation,
 * a business rule raised by our RPCs, or a network blip). The central
 * react-query handler reports every error to Sentry but uses this to set the
 * level — unexpected → 'error', expected → 'warning' — so genuine bugs stand
 * out from routine validation.
 */
export function isUnexpectedDbError(error: unknown): boolean {
  const e = asDbError(error)
  if (e.code && EXPECTED_CODES.includes(e.code)) return false
  const msg = e.message ?? ''
  if (EXPECTED_MESSAGE_RE.test(msg)) return false
  if (NETWORK_RE.test(msg)) return false
  return true
}

export function humanizeDbError(error: unknown, action?: string): string {
  const e = asDbError(error)
  const code = e.code
  const msg = e.message ?? ''

  // Permission / RLS
  if (code === '42501' || /row-level security policy|permission denied/i.test(msg)) {
    return action ? `You don't have permission to ${action}.` : "You don't have permission to do this."
  }
  // Foreign-key violation — the row is still referenced elsewhere
  if (code === '23503' || /violates foreign key constraint/i.test(msg)) {
    return action
      ? `Can't ${action} — it's still linked to other records. Remove or reassign those first.`
      : "This can't be removed or changed because other records still use it. Remove or reassign those first."
  }
  // Unique violation — duplicate value
  if (code === '23505' || /duplicate key value|already exists/i.test(msg)) {
    return 'That already exists — please use a different value.'
  }
  // Not-null — a required field is empty
  if (code === '23502' || /null value in column|violates not-null constraint/i.test(msg)) {
    return 'Please fill in all the required fields and try again.'
  }
  // Check constraint — value out of the allowed set/range
  if (code === '23514' || /violates check constraint/i.test(msg)) {
    return "That value isn't allowed — please review your input and try again."
  }
  // A few RPC business-rule messages leak UUIDs / column jargon at the operator.
  // Map the common stock shortfalls to something actionable. Matched on the
  // message text so it also catches wrapped strings (e.g. a mutation that threw
  // "Complete delivery failed: P0001 Insufficient stock …"). Sentry still gets
  // the raw message via the central react-query handler (QueryProvider).
  const availMatch = msg.match(/insufficient available stock.*?available:\s*(\d+),\s*requested:\s*(\d+)/i)
  if (availMatch) {
    return `Not enough stock — only ${availMatch[1]} available but ${availMatch[2]} requested. Adjust the quantity or restock, then try again.`
  }
  const missMatch = msg.match(/insufficient stock:\s*requested\s*\d+,\s*missing\s*(\d+)/i)
  if (missMatch) {
    const n = missMatch[1]
    return `Not enough stock — short by ${n} unit${n === '1' ? '' : 's'}. Adjust the quantity or restock, then try again.`
  }
  if (/insufficient (damaged )?stock/i.test(msg)) {
    return 'Not enough stock to complete this — check the available quantity and try again.'
  }

  // Business rule raised by one of our RPCs (RAISE EXCEPTION) — already written
  // for humans; show it as-is.
  if (code === 'P0001' && msg) return msg
  // Network / connectivity
  if (NETWORK_RE.test(msg)) {
    return 'Network problem — please check your connection and try again.'
  }

  // A plain thrown Error carrying a human message (e.g. a mutation hook that
  // already composed a friendly string) — show it.
  if (msg && !code) return msg

  // Unknown/unmapped DB error: keep the raw detail so it stays debuggable in the
  // toast (the central handler also reports these to Sentry). The code prefix
  // makes a copy-paste to support useful.
  const parts = [
    code ? `[${code}]` : null,
    msg || 'Something went wrong',
    e.details ? `details: ${e.details}` : null,
    e.hint ? `hint: ${e.hint}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}
