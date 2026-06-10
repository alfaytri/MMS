import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The four message sources that the purge feature operates on.
 * These are a subset of the full `message_source` DB enum — only the sources
 * that can accumulate media worth purging are included.
 */
export type PurgeSource = 'whatsapp_api' | 'whatsapp_whapi' | '3cx_call' | 'manual'

/**
 * Filter criteria for a purge operation.
 *
 * `date_from` and `date_to` are inclusive ISO date strings ('YYYY-MM-DD').
 * They are expanded to full-day UTC timestamps internally by `buildPurgeQuery`.
 */
export interface PurgeFilter {
  /** Only include messages from conversations belonging to this customer. */
  customer_id?: string | null
  /** Inclusive start date — 'YYYY-MM-DD'. */
  date_from: string
  /** Inclusive end date — 'YYYY-MM-DD'. */
  date_to: string
  /** Restrict to these message sources. Omit or pass empty array for all sources. */
  sources?: PurgeSource[]
  /** When true, restrict to messages that have at least one attachment. */
  media_only?: boolean
}

// ---------------------------------------------------------------------------
// Row shape returned by the query
// ---------------------------------------------------------------------------

export interface PurgeMessageRow {
  id: string
  attachments: Json | null
  conversation_id: string
  source: Database['public']['Enums']['message_source']
  created_at: string | null
}

// ---------------------------------------------------------------------------
// buildPurgeQuery
// ---------------------------------------------------------------------------

/**
 * Build a PostgREST query for messages that match the given `PurgeFilter`.
 *
 * The function returns the query builder so callers can chain `.limit()`,
 * `.range()`, or `.returns<T>()` before awaiting.
 *
 * ### Customer filtering
 * PostgREST does not support type-safe cross-table subselects in the JS
 * client.  If `customer_id` is set you **must** also pass the pre-fetched
 * `conversationIds` for that customer; the function will then apply an
 * `.in('conversation_id', conversationIds)` filter.  If `conversationIds` is
 * omitted when `customer_id` is set, the customer filter is silently skipped
 * (this keeps the function usable in contexts where the caller intentionally
 * defers that step).
 *
 * @param supabase      An authenticated SupabaseClient<Database> instance.
 * @param filter        The purge filter criteria.
 * @param conversationIds  Pre-fetched conversation IDs for `filter.customer_id`.
 */
export function buildPurgeQuery(
  supabase: SupabaseClient<Database>,
  filter: PurgeFilter,
  conversationIds?: string[],
) {
  // Expand calendar dates to full-day UTC ranges.
  const tsFrom = `${filter.date_from}T00:00:00.000Z`
  const tsTo   = `${filter.date_to}T23:59:59.999Z`

  let query = supabase
    .from('chat_messages')
    .select('id, attachments, conversation_id, source, created_at', { count: 'exact' })
    // Date range (inclusive on both ends)
    .gte('created_at', tsFrom)
    .lte('created_at', tsTo)
    // Never re-purge messages that are already soft-deleted
    .is('deleted_at', null)

  // Customer scope — requires pre-fetched conversation IDs
  if (filter.customer_id && conversationIds && conversationIds.length > 0) {
    query = query.in('conversation_id', conversationIds)
  }

  // Source filter
  if (filter.sources && filter.sources.length > 0) {
    query = query.in('source', filter.sources)
  }

  // Media-only — only messages that have a non-null, non-empty attachments array
  if (filter.media_only) {
    query = query.not('attachments', 'is', null)
  }

  return query
}

// ---------------------------------------------------------------------------
// sumAttachmentBytes
// ---------------------------------------------------------------------------

/**
 * Attachment shape stored in `chat_messages.attachments` JSONB.
 * Only the fields relevant to size calculation are defined here.
 */
interface AttachmentLike {
  size_bytes?: number | null
  [key: string]: unknown
}

/**
 * Sum the `size_bytes` field across all attachments from a set of message rows.
 *
 * Rows with null/malformed `attachments` are skipped gracefully.
 *
 * @param rows  Message rows as returned by `buildPurgeQuery`.
 * @returns     Total bytes (0 when no size information is available).
 */
export function sumAttachmentBytes(rows: Pick<PurgeMessageRow, 'attachments'>[]): number {
  let total = 0

  for (const row of rows) {
    if (!Array.isArray(row.attachments)) continue

    for (const attachment of row.attachments as AttachmentLike[]) {
      if (
        attachment !== null &&
        typeof attachment === 'object' &&
        typeof attachment.size_bytes === 'number' &&
        Number.isFinite(attachment.size_bytes)
      ) {
        total += attachment.size_bytes
      }
    }
  }

  return total
}
