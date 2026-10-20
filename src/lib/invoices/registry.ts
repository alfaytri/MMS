/**
 * Invoice-type registry: the SINGLE SOURCE OF TRUTH for the invoice types the unified invoice
 * hub (`public.invoices`, keyed on (detail_table, detail_id)) knows about, and for every
 * per-type fact the rest of the app reads. Client-safe on purpose (no server-only imports):
 * the All-Invoices page reaches it through `./types` and `useAllInvoices`.
 *
 * TO ADD A NEW INVOICE TYPE
 *   1. Add ONE entry to INVOICE_TYPE_REGISTRY below. `InvoiceType`, `kindForDetailTable`, the
 *      All-Invoices type filter (DETAIL_TABLE_FOR_TYPE), the Dibsy webhook's settle map
 *      (HUB_DETAIL_TABLES) and the dispatch cron's allow-list (DISPATCHABLE_DETAIL_TABLES) all
 *      derive from it. Never re-declare any of them elsewhere.
 *   2. Fill the two `Record<InvoiceType, ...>` that cannot live here (`tsc` fails until you do):
 *        - GENERATORS in pdf-registry.ts       (server-only: it imports the PDF generators)
 *        - KIND_LABEL in the All-Invoices page (the display label)
 *   3. NOT derived, and invisible to TypeScript:
 *        - the SQL. In a new migration add the new detail table's branch to `sync_invoice_hub()`
 *          and its sync / delete-orphan triggers. (A forgotten branch RAISEs `no hub mapping for
 *          table` and rolls the detail write back, so it fails loudly.)
 *        - a send gate in dispatch.ts, if the new type can exist in a not-ready state (today
 *          only the sales draft check, keyed on `so_invoices`).
 *
 * `__tests__/type-registry-consistency.test.ts` fails if any of the registries above drift apart.
 */

/** What the app needs to know about one invoice type. */
export interface InvoiceTypeSpec {
  /** The per-business-line detail table a hub row mirrors: the hub row's `detail_table`. */
  readonly detailTable: string
  /**
   * What that detail table calls "partially paid" - the Dibsy webhook writes it onto the detail
   * row. tl_/contract_invoices keep a text status CHECKed to unpaid | partial | paid; so_invoices
   * uses the hub's `invoice_payment_status` enum value `partially_paid`.
   */
  readonly partialStatus: string
  /** Whether the detail table has an `updated_at` column the webhook may write (so_invoices has none). */
  readonly hasUpdatedAt: boolean
  /**
   * Whether the dispatch cron picks this type's `pending` hub rows up. `false` = never
   * auto-dispatched (the webhook still settles it).
   */
  readonly dispatchable: boolean
}

export const INVOICE_TYPE_REGISTRY = {
  service: {
    detailTable: 'tl_invoices',
    partialStatus: 'partial',
    hasUpdatedAt: true,
    dispatchable: true,
  },
  sales: {
    detailTable: 'so_invoices',
    partialStatus: 'partially_paid',
    hasUpdatedAt: false,
    // Auto-dispatched once ISSUED: a sales invoice is created as a draft and rewritten on every edit, so
    // dispatchInvoice holds a draft back WITHOUT recording a skip - the hub row stays `pending` and the cron
    // re-checks it each run, sending the first time it is no longer a draft (see the draft gate in dispatch.ts).
    // OPEN before this goes to real customers: the Dibsy webhook settles a card payment with a direct write that
    // bypasses the AR payments ledger - see the TODO (so_invoices) in the webhook route.
    dispatchable: true,
  },
  contract: {
    detailTable: 'contract_invoices',
    partialStatus: 'partial',
    hasUpdatedAt: true,
    dispatchable: true,
  },
} as const satisfies Record<string, InvoiceTypeSpec>

/** Business line an invoice belongs to: a key of INVOICE_TYPE_REGISTRY. Derived from the hub row's `detail_table`. */
export type InvoiceType = keyof typeof INVOICE_TYPE_REGISTRY

/** Every invoice type, in registry order. */
export const ALL_INVOICE_TYPES: readonly InvoiceType[] = Object.keys(INVOICE_TYPE_REGISTRY) as InvoiceType[]

/** The canonical list of detail tables the hub mirrors. */
export const KNOWN_DETAIL_TABLES: readonly string[] = ALL_INVOICE_TYPES.map(
  (type) => INVOICE_TYPE_REGISTRY[type].detailTable,
)

/** The hub `detail_table` each invoice type lives in: the reverse of `kindForDetailTable`. */
export const DETAIL_TABLE_FOR_TYPE: Readonly<Record<InvoiceType, string>> = Object.fromEntries(
  ALL_INVOICE_TYPES.map((type) => [type, INVOICE_TYPE_REGISTRY[type].detailTable]),
) as Record<InvoiceType, string>

// A Map, not an object: a plain-object lookup would hand back inherited members
// (`constructor`, `toString`, ...) for a table name that is not registered.
const KIND_BY_DETAIL_TABLE: ReadonlyMap<string, InvoiceType> = new Map(
  ALL_INVOICE_TYPES.map((type) => [INVOICE_TYPE_REGISTRY[type].detailTable, type] as const),
)

/** Maps a hub row's `detail_table` to its business-line kind; throws on a table the hub does not mirror. */
export function kindForDetailTable(detailTable: string): InvoiceType {
  const kind = KIND_BY_DETAIL_TABLE.get(detailTable)
  if (kind === undefined) throw new Error('unknown detail_table: ' + detailTable)
  return kind
}

/** How the Dibsy webhook settles one detail table. */
export interface HubDetailTableMeta {
  readonly partialStatus: string
  readonly hasUpdatedAt: boolean
}

/** The Dibsy webhook's per-detail-table settle metadata, keyed by `detail_table`. One entry per known table. */
export const HUB_DETAIL_TABLES: Readonly<Record<string, HubDetailTableMeta>> = Object.fromEntries(
  ALL_INVOICE_TYPES.map((type): [string, HubDetailTableMeta] => {
    const { detailTable, partialStatus, hasUpdatedAt } = INVOICE_TYPE_REGISTRY[type]
    return [detailTable, { partialStatus, hasUpdatedAt }]
  }),
)

/** The detail tables the dispatch cron picks `pending` hub rows up from: the `dispatchable` subset of the known tables. */
export const DISPATCHABLE_DETAIL_TABLES: readonly string[] = ALL_INVOICE_TYPES.filter(
  (type) => INVOICE_TYPE_REGISTRY[type].dispatchable,
).map((type) => INVOICE_TYPE_REGISTRY[type].detailTable)
