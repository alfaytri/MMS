import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DETAIL_TABLE_FOR_TYPE } from '@/lib/invoices/registry'
import { kindForDetailTable, type HubInvoice, type InvoiceType } from '@/lib/invoices/types'

/**
 * Read side of the unified invoice hub (`public.invoices`) for the All-Invoices
 * page: one list across every invoice type (service, sales, contract).
 *
 * Reads with the signed-in user's browser client. Since migration 20261154 the hub
 * is SELECT-only for `authenticated` (writes are service-role only), which is all
 * this needs.
 *
 * The hub's newer columns (detail_table, dispatch_status, ...) are not in the
 * generated `database.types.ts` (known drift, deliberately not regenerated - see
 * `src/lib/invoices/types.ts`), so the table is reached through a loose handle and
 * rows are cast to `AllInvoiceRow`.
 *
 * One page of the newest `ALL_INVOICES_LIMIT` rows; the filters run server-side, so
 * an older invoice is found by narrowing (search / type / status), not by paging.
 *
 * A query error is thrown as the raw PostgREST error object (not re-wrapped), so the
 * central react-query handler keeps its code / details / hint for Sentry and the page
 * can run it through `humanizeDbError`.
 */

export type AllInvoicesFilters = {
  /** Business line; becomes a `detail_table` filter (see DETAIL_TABLE_FOR_TYPE). */
  type?: InvoiceType
  /** `invoice_payment_status` enum value: unpaid | partially_paid | paid | overdue | void. */
  status?: string
  /** Free text, matched against the invoice number and the customer name. */
  q?: string
}

/** The hub columns the list reads. */
export type AllInvoiceRow = Pick<
  HubInvoice,
  | 'id' | 'invoice_id' | 'detail_table' | 'detail_id' | 'customer_name'
  | 'total_amount' | 'paid_amount' | 'payment_status' | 'dispatch_status'
  | 'dibsy_checkout_url' | 'pdf_url' | 'sent_at' | 'created_at'
>
// Keep in step with AllInvoiceRow above.
const LIST_COLUMNS =
  'id, invoice_id, detail_table, detail_id, customer_name, total_amount, paid_amount, ' +
  'payment_status, dispatch_status, dibsy_checkout_url, pdf_url, sent_at, created_at'

/** Newest-first page size: the transactional-list cap from docs/supabase-budget.md. */
export const ALL_INVOICES_LIMIT = 200

/**
 * Reverse of `kindForDetailTable`: the hub `detail_table` each invoice type lives
 * in. Derived from the invoice-type registry (`@/lib/invoices/registry`), so a new
 * type needs no edit here; re-exported for the callers that already import it from
 * this hook.
 */
export { DETAIL_TABLE_FOR_TYPE }

/**
 * Business line of a hub row, or null for a legacy row with no detail key (or a
 * table nothing maps yet). `kindForDetailTable` throws on those, which must not
 * take the whole list down.
 */
export function invoiceKind(detailTable: string | null): InvoiceType | null {
  if (!detailTable) return null
  try {
    return kindForDetailTable(detailTable)
  } catch {
    return null
  }
}

/**
 * Outstanding balance, rounded to the fils (the same rounding dispatch uses) and
 * clamped at 0. An overpaid hub row stores paid_amount > total_amount, which must
 * never read as a negative balance.
 */
export function remainingAmount(total: number, paid: number): number {
  return Math.max(0, Math.round((total - paid) * 100) / 100)
}

/**
 * `url` if it is plainly http(s), else null. Hub URLs are rendered as links, and the
 * source tables are not fully locked down yet, so treat them as untrusted: a
 * `javascript:` / `data:` / relative value must never become an href.
 */
export function httpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

/**
 * The pay link to show for a row, or null. Only while money is still owed: a paid or
 * void invoice (or one with nothing left to pay) must not show a forwardable checkout
 * link, even though the hub keeps the URL.
 */
export function payLinkFor(
  row: Pick<AllInvoiceRow, 'dibsy_checkout_url' | 'payment_status' | 'total_amount' | 'paid_amount'>,
): string | null {
  if (row.payment_status === 'paid' || row.payment_status === 'void') return null
  if (remainingAmount(row.total_amount, row.paid_amount) <= 0) return null
  return httpUrl(row.dibsy_checkout_url)
}

type LooseError = { code?: string; message: string; details?: string; hint?: string }
type LooseResult = { data: unknown; error: LooseError | null }
interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns?: string): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  or(filters: string): LooseQuery
  order(column: string, options?: { ascending?: boolean }): LooseQuery
  limit(count: number): LooseQuery
}
function hubTable(): LooseQuery {
  return (createClient() as unknown as { from(table: string): LooseQuery }).from('invoices')
}

/**
 * `%term%` as a PostgREST double-quoted `ilike` value, built from raw user input.
 * Two escape layers: `\` `%` `_` get a backslash so the term matches literally
 * instead of as LIKE wildcards; then `\` and `"` get one so the quoted value
 * survives the `or=(...)` parser (a bare comma, paren or quote would 400 the request).
 */
function ilikeContains(term: string): string {
  const literal = term.replace(/[\\%_]/g, '\\$&')
  const quoted = literal.replace(/[\\"]/g, '\\$&')
  return `"%${quoted}%"`
}

// The amount columns are nullable in the table (default 0), so a row may carry null.
type RawRow = Omit<AllInvoiceRow, 'total_amount' | 'paid_amount'> & {
  total_amount: number | null
  paid_amount: number | null
}

export function useAllInvoices({ type, status, q }: AllInvoicesFilters = {}) {
  // Trimmed up front, so typing a stray space is not a new query.
  const term = q?.trim() || undefined

  return useQuery({
    queryKey: ['all-invoices', { type, status, q: term }],
    queryFn: async (): Promise<AllInvoiceRow[]> => {
      // Customer invoices only: the hub table is shared with the supplier_bills (AP) view.
      let query = hubTable().select(LIST_COLUMNS).eq('direction', 'ar')
      if (type) query = query.eq('detail_table', DETAIL_TABLE_FOR_TYPE[type])
      if (status) query = query.eq('payment_status', status)
      if (term) {
        const pattern = ilikeContains(term)
        query = query.or(`invoice_id.ilike.${pattern},customer_name.ilike.${pattern}`)
      }

      // id breaks created_at ties, so which rows make the cap is deterministic.
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id')
        .limit(ALL_INVOICES_LIMIT)
      if (error) throw error

      return ((data as RawRow[] | null) ?? []).map((row) => ({
        ...row,
        total_amount: Number(row.total_amount ?? 0),
        paid_amount: Number(row.paid_amount ?? 0),
      }))
    },
    // Keep the previous rows on screen while a new filter / search loads, instead of
    // flashing the skeleton on every keystroke.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
