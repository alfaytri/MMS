/**
 * Invoice-domain types for the unified invoice hub (`public.invoices`).
 *
 * The hub mirrors the per-business-line detail tables and is keyed on
 * (detail_table, detail_id). The business-line "kind" is NOT stored on the hub;
 * it is derived from `detail_table` by `kindForDetailTable`.
 *
 * The list of invoice types itself (`InvoiceType`, `kindForDetailTable` and every other
 * per-type table) lives in `./registry`, the single source of truth - see its header for
 * how to add a type. They are re-exported here so existing importers keep working.
 *
 * Kept free of server-only imports so client components (the All-Invoices
 * page) can use it.
 */

export { kindForDetailTable } from './registry'
export type { InvoiceType } from './registry'

/**
 * One row of `public.invoices` as the dispatch orchestrator and the
 * All-Invoices page read it.
 *
 * Hand-written on purpose: the hub's newer columns (detail_table, detail_id,
 * dispatch_status, ...) are not in the generated `database.types.ts`, which has
 * known drift and is deliberately not regenerated for this. Reach the table
 * through a loose client handle (see `looseFrom` in `src/hooks/useShipments.ts`)
 * and cast the result to this type. Nullability mirrors the table, except
 * `total_amount` / `paid_amount`: those hub columns are nullable (default 0) but
 * typed `number` because the sync trigger and backfill always write a value
 * (so_invoices amounts are COALESCEd to 0; tl_/contract_invoices amounts are NOT NULL).
 */
export interface HubInvoice {
  id: string
  /** Detail table this row mirrors (one of `KNOWN_DETAIL_TABLES` in `./registry`); null only for legacy rows with no detail key. */
  detail_table: string | null
  /** Primary key of the mirrored detail row; null exactly when `detail_table` is null. */
  detail_id: string | null
  /** Human-readable invoice number. */
  invoice_id: string
  customer_name: string | null
  customer_phone: string | null
  total_amount: number
  paid_amount: number
  /** `invoice_payment_status` enum: unpaid | partially_paid | paid | overdue | void. */
  payment_status: string
  /** CHECK-constrained: pending | sent | failed | skipped. */
  dispatch_status: string
  dibsy_payment_id: string | null
  dibsy_checkout_url: string | null
  pdf_url: string | null
  sent_at: string | null
  created_at: string | null
}
