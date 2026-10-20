import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DibsyPayment } from '@/lib/dibsy'

// Everything with a side effect is replaced: the admin client refuses to load in a jsdom window (and
// would hit a real database), getDibsyPayment is a real HTTP call, and the signature check needs the
// real secret. dibsyStatusToSubscriptionStatus is pure, so it stays real.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/dibsy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dibsy')>()
  return { ...actual, getDibsyPayment: vi.fn() }
})
vi.mock('@/lib/webhooks/verify', () => ({ verifyHmacSignature: vi.fn() }))

import { POST } from '../webhook/route'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDibsyPayment } from '@/lib/dibsy'
import { verifyHmacSignature } from '@/lib/webhooks/verify'

// ─── In-memory stand-in for the Supabase admin client ───────────────────────────
// A small STATEFUL database: it implements just the query-builder calls the webhook uses (select with
// column projection, insert, update, eq / neq / in / ilike, order, limit, maybeSingle, awaitable) and
// really APPLIES the filters and the writes. So a missing or wrong guard shows up as wrong final state
// (a double-counted amount, an overwritten row, a second ledger payment), not as a call-shape mismatch,
// and a table the route has no business touching throws.
//
// `syncTrigger` emulates public.sync_invoice_hub() (migration 20261154): every UPDATE of a detail
// table (tl_ / contract_ / so_invoices) re-mirrors that row's total_amount, paid_amount and
// payment_status onto its hub row - the detail row is canonical - with the detail's 'partial' spelled
// 'partially_paid' on the hub. It is on by default because that is the real database; the tests that
// matter run with it both ON and OFF.
//
// The AR payments ledger is emulated too (see "The AR payments ledger" below): an INSERT into
// `payments` runs the triggers the real table has, so a sales invoice's paid state moves because the
// LEDGER moved - never because the route wrote the invoice row.

type Row = Record<string, unknown>
type DbError = { message: string; code?: string }
type Result = { data: unknown; error: DbError | null }
type Op = 'select' | 'insert' | 'update'

interface World {
  tables: Record<string, Row[]>
  /**
   * Every INSERT / UPDATE the route issued, in order: the row (as sent) or the patch, and how many rows it
   * matched (an insert always creates one). A write a DB trigger makes (the AR recompute, the hub mirror)
   * is NOT a route write and is not listed.
   */
  writes: Array<{ op: 'insert' | 'update'; table: string; patch: Row; matched: number }>
  /** One-shot failures: the first query on `table` with `op` fails with `message` (and `code`), then the entry is spent. */
  failures: Array<{ table: string; op: Op; message: string; code?: string }>
  syncTrigger: boolean
  /** Runs at the start of every query, before it is applied - lets a test change state between the route's read and its write. */
  onExec?: (table: string, op: Op) => void
}

const DETAIL_TABLES = ['tl_invoices', 'contract_invoices', 'so_invoices']

function mirrorToHub(world: World, table: string, detail: Row) {
  if (!DETAIL_TABLES.includes(table)) return
  const hub = world.tables.invoices.find((h) => h.detail_table === table && h.detail_id === detail.id)
  if (!hub) return
  hub.total_amount = detail.total_amount
  hub.paid_amount = detail.paid_amount
  hub.payment_status = detail.payment_status === 'partial' ? 'partially_paid' : detail.payment_status
}

// ─── The AR payments ledger ─────────────────────────────────────────────────────
// What the dev DB's `payments` table does on INSERT, read from the live trigger functions (not guessed):
//   BEFORE INSERT, in the alphabetical order Postgres fires them:
//     sync_payment_method_id        `method` must be a payment_methods.slug, else the INSERT is refused
//     trg_payments_cap_invoice_paid an EXPLICIT invoice_id may not take the invoice past its total (+0.01);
//                                   a row that only names source_type/source_id is not checked - it links later
//     trg_payments_sync_invoice_id  source_type 'invoice' fills invoice_id from source_id
//   payments_payment_id_key         UNIQUE (payment_id): the only thing that serialises the max+1 CPAY numbering
//   AFTER INSERT:
//     trg_invoice_recompute_paid    so_invoices.paid_amount = SUM(ledger), payment_status from it (whatever the
//                                   payment's own status - and it does not look at 'void'); the AFTER UPDATE
//                                   sync_invoice_hub then mirrors the invoice onto the hub row (`syncTrigger`).
// (trg_payments_redirect_to_invoice - source_type 'sale_order' re-pointed at the SO's invoice - is not emulated:
// the route never writes that shape.)

/** `payment_methods` on the dev DB: the fresh-DB bootstrap seeds exactly these two. There is NO 'card'. */
const PAYMENT_METHODS: Row[] = [
  { id: 'pm-cash', slug: 'cash' },
  { id: 'pm-pos', slug: 'pos' },
]

const incomingLive = (p: Row) => p.deleted_at == null && p.direction === 'incoming'

function beforeInsertPayment(world: World, row: Row): DbError | null {
  if (row.method_id == null && row.method != null) {
    const method = world.tables.payment_methods.find((m) => m.slug === row.method)
    if (!method) return { code: 'P0001', message: `payment method slug ${String(row.method)} has no matching payment_methods row` }
    row.method_id = method.id
  }
  if (row.direction === 'incoming' && row.invoice_id != null && row.deleted_at == null) {
    const invoice = world.tables.so_invoices.find((i) => i.id === row.invoice_id)
    if (invoice) {
      const prior = world.tables.payments
        .filter((p) => p.invoice_id === row.invoice_id && incomingLive(p))
        .reduce((sum, p) => sum + Number(p.amount), 0)
      if (prior + Number(row.amount) > Number(invoice.total_amount) + 0.01) {
        return { code: 'P0001', message: `Payment over-allocation: amount ${String(row.amount)} + prior paid ${prior} exceeds invoice total ${String(invoice.total_amount)}` }
      }
    }
  }
  if (row.source_type === 'invoice' && row.source_id != null) row.invoice_id = row.source_id
  return null
}

function afterInsertPayment(world: World, row: Row) {
  const invoiceId = row.source_type === 'invoice' ? row.source_id : row.invoice_id
  if (invoiceId == null) return
  const invoice = world.tables.so_invoices.find((i) => i.id === invoiceId)
  if (!invoice) return
  const paid = world.tables.payments
    .filter((p) => ((p.source_type === 'invoice' && p.source_id === invoiceId) || p.invoice_id === invoiceId) && incomingLive(p))
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const total = Number(invoice.total_amount ?? 0)
  invoice.paid_amount = paid
  invoice.payment_status = total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid'
  if (world.syncTrigger) mirrorToHub(world, 'so_invoices', invoice)
}

class FakeQuery implements PromiseLike<Result> {
  private op: Op = 'select'
  private patch: Row = {}
  private selected = false
  private columns: string[] | null = null
  private filters: Array<(row: Row) => boolean> = []
  private one = false
  private orderBy: { column: string; ascending: boolean } | null = null
  private max: number | null = null

  constructor(private world: World, private table: string) {}

  select(columns?: string) {
    this.selected = true
    this.columns = columns && columns.trim() !== '*' ? columns.split(',').map((c) => c.trim()) : null
    return this
  }
  insert(row: Row) {
    this.op = 'insert'
    this.patch = row
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => (r[column] ?? null) === value)
    return this
  }
  // SQL `col <> value` is NULL (not true) for a NULL column, so a NULL row never matches neq.
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== undefined && r[column] !== null && r[column] !== value)
    return this
  }
  in(column: string, values: readonly unknown[]) {
    this.filters.push((r) => values.includes(r[column]))
    return this
  }
  // SQL ILIKE: case-insensitive, % = any run of characters, _ = any one character.
  ilike(column: string, pattern: string) {
    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
    this.filters.push((r) => typeof r[column] === 'string' && regex.test(r[column] as string))
    return this
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: options.ascending !== false }
    return this
  }
  limit(count: number) {
    this.max = count
    return this
  }
  maybeSingle() {
    this.one = true
    return this
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }

  private exec(): Result {
    this.world.onExec?.(this.table, this.op)
    const failure = this.world.failures.findIndex((f) => f.table === this.table && f.op === this.op)
    if (failure !== -1) {
      const [spent] = this.world.failures.splice(failure, 1)
      return { data: null, error: { message: spent.message, ...(spent.code ? { code: spent.code } : {}) } }
    }

    const rows = this.world.tables[this.table]
    if (!rows) throw new Error(`fake admin: unexpected table "${this.table}"`)
    const cols = this.columns
    const project = (r: Row): Row => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r })

    if (this.op === 'insert') {
      if (this.table !== 'payments') throw new Error(`fake admin: unexpected insert into "${this.table}"`)
      const row: Row = { id: `payments-${rows.length + 1}`, ...this.patch }
      const refused = beforeInsertPayment(this.world, row)
      if (refused) return { data: null, error: refused }
      if (row.payment_id != null && rows.some((r) => r.payment_id === row.payment_id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "payments_payment_id_key"' } }
      }
      rows.push(row)
      this.world.writes.push({ op: 'insert', table: this.table, patch: { ...this.patch }, matched: 1 })
      afterInsertPayment(this.world, row)
      return { data: this.selected ? [project(row)] : null, error: null }
    }

    const matched = rows.filter((r) => this.filters.every((f) => f(r)))

    if (this.op === 'update') {
      for (const row of matched) {
        Object.assign(row, this.patch)
        if (this.world.syncTrigger) mirrorToHub(this.world, this.table, row)
      }
      this.world.writes.push({ op: 'update', table: this.table, patch: { ...this.patch }, matched: matched.length })
      return { data: this.selected ? matched.map(project) : null, error: null }
    }

    const ordered = this.orderBy
      ? [...matched].sort((a, b) => {
          const { column, ascending } = this.orderBy!
          const x = String(a[column] ?? '')
          const y = String(b[column] ?? '')
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1)
        })
      : matched
    const projected = (this.max === null ? ordered : ordered.slice(0, this.max)).map(project)
    return { data: this.one ? (projected[0] ?? null) : projected, error: null }
  }
}

function makeWorld(tables: Record<string, Row[]> = {}, opts: { syncTrigger?: boolean } = {}) {
  const world: World = {
    tables: {
      invoices: [],
      tl_invoices: [],
      contract_invoices: [],
      so_invoices: [],
      payments: [],
      payment_methods: PAYMENT_METHODS.map((m) => ({ ...m })),
      tl_payment_batch_items: [],
      tl_payment_batches: [],
      customer_subscriptions: [],
      subscription_packages: [],
      ...tables,
    },
    writes: [],
    failures: [],
    syncTrigger: opts.syncTrigger ?? true,
  }
  const rpc = vi.fn()
  const from = vi.fn((table: string) => new FakeQuery(world, table))
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>)
  return { world, rpc }
}

/** Deep copy of the whole database, for "nothing changed" assertions. */
const snapshot = (world: World) => JSON.parse(JSON.stringify(world.tables)) as World['tables']
const writtenTables = (world: World) => world.writes.map((w) => w.table).sort()

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const OLD = '2026-10-20T00:00:00.000Z'

/** A hub row for a tl_invoices detail by default; total 100, nothing paid. */
const hubRow = (o: Row = {}): Row => ({
  id: 'hub-1',
  detail_table: 'tl_invoices',
  detail_id: 'tl-1',
  invoice_id: 'SINV/2026/10/0001',
  total_amount: 100,
  paid_amount: 0,
  payment_status: 'unpaid',
  dispatch_status: 'sent',
  dibsy_payment_id: 'pt_1',
  dibsy_checkout_url: 'https://checkout.dibsy.test/pt_1',
  updated_at: OLD,
  ...o,
})
const tlRow = (o: Row = {}): Row => ({
  id: 'tl-1', invoice_number: 'SINV/2026/10/0001', total_amount: 100, paid_amount: 0, payment_status: 'unpaid', updated_at: OLD, ...o,
})
const contractRow = (o: Row = {}): Row => ({
  id: 'ct-1', invoice_number: 'CINV/2026/10/0001', total_amount: 100, paid_amount: 0, payment_status: 'unpaid', updated_at: OLD, ...o,
})
// so_invoices has NO updated_at column - the fixture mirrors that so a stray write of it would show up.
const soRow = (o: Row = {}): Row => ({
  id: 'so-1', invoice_id: 'INV-00001', customer_id: 'cust-1', sale_order_id: 'sale-1',
  total_amount: 100, paid_amount: 0, payment_status: 'unpaid', ...o,
})

interface Detail {
  table: string
  id: string
  row: (o?: Row) => Row
  /** How this table spells "partially paid". */
  partial: string
  hasUpdatedAt: boolean
  /** The tables the route itself writes to settle one of these: a sales invoice is settled through the AR ledger (`payments`), the others by writing the detail row. */
  routeWrites: readonly string[]
}

/** The three detail tables a hub row can mirror. */
const DETAILS: readonly Detail[] = [
  { table: 'tl_invoices', id: 'tl-1', row: tlRow, partial: 'partial', hasUpdatedAt: true, routeWrites: ['tl_invoices', 'invoices'] },
  { table: 'contract_invoices', id: 'ct-1', row: contractRow, partial: 'partial', hasUpdatedAt: true, routeWrites: ['contract_invoices', 'invoices'] },
  { table: 'so_invoices', id: 'so-1', row: soRow, partial: 'partially_paid', hasUpdatedAt: false, routeWrites: ['payments', 'invoices'] },
]

/** The world for one hub row + its detail row. */
const worldFor = (d: Detail, hub: Row = {}, detail: Row = {}, opts?: { syncTrigger?: boolean }) =>
  makeWorld(
    { invoices: [hubRow({ detail_table: d.table, detail_id: d.id, ...hub })], [d.table]: [d.row(detail)] },
    opts,
  )

const WEBHOOK_URL = 'http://localhost/api/payments/dibsy/webhook'

function deliver(body: string = JSON.stringify({ resource: 'payment', id: 'pt_1' })) {
  return POST(new Request(WEBHOOK_URL, { method: 'POST', headers: { 'dibsy-signature': 'sig' }, body }))
}

/** What Dibsy's API returns when the webhook fetches the payment. */
function dibsyReturns(metadata: Record<string, string> | undefined, o: Partial<DibsyPayment> = {}) {
  vi.mocked(getDibsyPayment).mockResolvedValue({
    id: 'pt_1',
    status: 'paid',
    checkoutUrl: 'https://checkout.dibsy.test/pt_1',
    amount: { value: '100.00', currency: 'QAR' },
    metadata,
    ...o,
  })
}
/** A card payment minted by lib/invoices/dispatch for hub row `hub-1`. */
const hubPayment = (o: Partial<DibsyPayment> = {}) => dibsyReturns({ hub_invoice_id: 'hub-1' }, o)
const amountOf = (value: string) => ({ amount: { value, currency: 'QAR' } })

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(verifyHmacSignature).mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('dibsy webhook', () => {
  describe('hub settlement (metadata.hub_invoice_id)', () => {
    describe.each(DETAILS)('for a $table detail row', (d) => {
      it.each([[true], [false]])(
        'a paid payment settles the hub (100/100, paid) and syncs the detail row (sync trigger %s)',
        async (syncTrigger) => {
          const { world } = worldFor(d, {}, {}, { syncTrigger })
          hubPayment()

          const res = await deliver()

          expect(res.status).toBe(200)
          expect(await res.json()).toEqual({ ok: true })
          expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
          expect(world.tables[d.table][0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
          // Only the hub and the one place that settles this detail type were written - nothing else. A sales
          // invoice is settled by a ledger payment (the AR triggers then move the invoice); tl_ / contract_
          // invoices by a write of the detail row.
          expect(writtenTables(world)).toEqual([...d.routeWrites].sort())
        },
      )

      it('writes updated_at on the detail row only where the table has that column', async () => {
        const { world } = worldFor(d)
        hubPayment()

        await deliver()

        const detail = world.tables[d.table][0]
        if (d.hasUpdatedAt) {
          expect(detail.updated_at).not.toBe(OLD)
        } else {
          expect(detail).not.toHaveProperty('updated_at')
        }
      })

      it.each([[true], [false]])(
        'a payment short of the total leaves the hub partially_paid and the detail in its own spelling (sync trigger %s)',
        async (syncTrigger) => {
          const { world } = worldFor(d, {}, {}, { syncTrigger })
          hubPayment(amountOf('60.00'))

          await deliver()

          expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
          expect(world.tables[d.table][0]).toMatchObject({ paid_amount: 60, payment_status: d.partial })
        },
      )

      it('a re-delivered webhook changes nothing - no write at all, no double count', async () => {
        const { world } = worldFor(d)
        hubPayment()
        await deliver()
        const writesAfterFirst = world.writes.length
        const before = snapshot(world)

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(world.writes).toHaveLength(writesAfterFirst)
        expect(snapshot(world)).toEqual(before)
        expect(world.tables.invoices[0].paid_amount).toBe(100)
        expect(world.tables[d.table][0].paid_amount).toBe(100)
      })
    })

    it('two concurrent deliveries settle once: the guarded detail UPDATE is won by exactly one', async () => {
      const { world } = worldFor(DETAILS[0])
      hubPayment()

      const [a, b] = await Promise.all([deliver(), deliver()])

      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      expect(world.writes.filter((w) => w.table === 'tl_invoices').map((w) => w.matched).sort()).toEqual([0, 1])
    })

    it('two concurrent deliveries do not double-count a partial payment either (absolute write, not +=)', async () => {
      const { world } = worldFor(DETAILS[0])
      hubPayment(amountOf('60.00'))

      await Promise.all([deliver(), deliver()])

      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partial' })
    })

    it('adds the payment to what was already paid, once', async () => {
      const { world } = worldFor(DETAILS[0], { paid_amount: 40, payment_status: 'partially_paid' }, { paid_amount: 40, payment_status: 'partial' })
      hubPayment(amountOf('60.00'))

      await deliver()

      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
    })

    it.each([[true], [false]])(
      'a partial payment on top of an earlier partial accumulates on hub and detail (20 + 30 of 100 -> 50) (sync trigger %s)',
      async (syncTrigger) => {
        const { world } = worldFor(DETAILS[0], { paid_amount: 20, payment_status: 'partially_paid' }, { paid_amount: 20, payment_status: 'partial' }, { syncTrigger })
        hubPayment(amountOf('30.00'))
        await deliver()
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 50, payment_status: 'partially_paid' })
        expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 50, payment_status: 'partial' })
      },
    )

    it('records an overpayment as paid, with the actual money received', async () => {
      // The link was minted for 100; QAR 40 was then recorded by hand, and the customer still paid the link.
      const { world } = worldFor(DETAILS[0], { paid_amount: 40, payment_status: 'partially_paid' }, { paid_amount: 40, payment_status: 'partial' })
      hubPayment(amountOf('100.00'))

      await deliver()

      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 140, payment_status: 'paid' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 140, payment_status: 'paid' })
      // ...and finance is told about the 40 that needs refunding or crediting.
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('overpaid by 40 QAR'))
    })

    it('does not raise the overpayment warning for an exact payment', async () => {
      worldFor(DETAILS[0])
      hubPayment()

      await deliver()

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('settles from the ACTUAL amount, not the invoice total (a superseded link paid after the total grew)', async () => {
      // Link minted for 100; the invoice then grew to 150 and the link was cleared and re-minted, but the old
      // link is still payable. The customer paid the old 100: that is 100 received, 50 still owed.
      const { world } = worldFor(DETAILS[0], { total_amount: 150 }, { total_amount: 150 })
      hubPayment(amountOf('100.00'))

      await deliver()

      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'partially_paid' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'partial' })
    })

    it('rounds to the fils so float noise cannot leave a fully paid invoice partially_paid', async () => {
      // 0.7 + 0.1 is 0.7999999999999999 in floating point - a fil short of 0.8 without the rounding.
      const { world } = worldFor(DETAILS[0], { total_amount: 0.8, paid_amount: 0.7, payment_status: 'partially_paid' }, { total_amount: 0.8, paid_amount: 0.7, payment_status: 'partial' })
      hubPayment(amountOf('0.10'))

      await deliver()

      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0.8, payment_status: 'paid' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 0.8, payment_status: 'paid' })
    })

    it('does not overwrite a row someone else fully settled after it was read (both writes are guarded)', async () => {
      // The webhook reads an open invoice; before it writes, the office records the full amount in cash.
      // First settlement wins: the later absolute write (120, an overpayment) must not rewrite the hub or the
      // detail row - the guarded UPDATEs match nothing.
      const { world } = worldFor(DETAILS[0], {}, {}, { syncTrigger: false })
      hubPayment(amountOf('120.00'))
      world.onExec = (table, op) => {
        if (table === 'tl_invoices' && op === 'update') {
          Object.assign(world.tables.tl_invoices[0], { paid_amount: 100, payment_status: 'paid' })
          Object.assign(world.tables.invoices[0], { paid_amount: 100, payment_status: 'paid' })
        }
      }

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
    })

    it('does not resurrect a detail row that was voided after it was read (both writes are guarded)', async () => {
      // Sales invoices no longer go through this generic write (they settle through the AR ledger - see the
      // sales describe below), but the guard is generic: it must hold for any detail table that has a 'void'.
      const { world } = worldFor(DETAILS[0])
      hubPayment()
      // The invoice is cancelled between the webhook reading the hub row and writing it.
      world.onExec = (table, op) => {
        if (table === 'tl_invoices' && op === 'update') {
          world.tables.invoices[0].payment_status = 'void'
          world.tables.tl_invoices[0].payment_status = 'void'
        }
      }

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'void' })
      expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'void' })
    })

    it('acks a hub row that is already paid without writing anything (the idempotency gate)', async () => {
      const { world } = worldFor(DETAILS[0], { paid_amount: 100, payment_status: 'paid' }, { paid_amount: 100, payment_status: 'paid' })
      hubPayment()
      const before = snapshot(world)

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(world.writes).toHaveLength(0)
      expect(snapshot(world)).toEqual(before)
    })

    it('acks a void hub row without writing anything, and flags the money for follow-up', async () => {
      const { world } = worldFor(DETAILS[2], { payment_status: 'void' }, { payment_status: 'void' })
      hubPayment()
      const before = snapshot(world)

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.writes).toHaveLength(0)
      expect(snapshot(world)).toEqual(before)
      expect(errorSpy).toHaveBeenCalled()
    })

    it.each(['failed', 'expired', 'open', 'pending', 'refunded'])(
      'acks a %s payment without touching anything',
      async (status) => {
        const { world } = worldFor(DETAILS[0])
        hubPayment({ status })
        const before = snapshot(world)

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(world.writes).toHaveLength(0)
        expect(snapshot(world)).toEqual(before)
      },
    )

    it.each([
      ['a missing amount', undefined],
      ['an empty amount', { value: '', currency: 'QAR' }],
      ['a non-numeric amount', { value: 'abc', currency: 'QAR' }],
      ['a zero amount', { value: '0.00', currency: 'QAR' }],
      ['a negative amount', { value: '-5.00', currency: 'QAR' }],
    ])('never settles on %s: acks, writes nothing, logs an error', async (_label, amount) => {
      const { world } = worldFor(DETAILS[0])
      hubPayment({ amount: amount as unknown as DibsyPayment['amount'] })
      const before = snapshot(world)

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.writes).toHaveLength(0)
      expect(snapshot(world)).toEqual(before)
      expect(errorSpy).toHaveBeenCalled()
    })

    it('acks a hub id that matches no row, writes nothing, and logs an error (money with nowhere to go)', async () => {
      const { world } = makeWorld({ invoices: [hubRow({ id: 'some-other-hub' })], tl_invoices: [tlRow()] })
      hubPayment()

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(world.writes).toHaveLength(0)
      expect(errorSpy).toHaveBeenCalled()
    })

    it('settles the hub even when its detail row is gone (orphan hub row), without failing the webhook', async () => {
      const { world } = makeWorld({ invoices: [hubRow()], tl_invoices: [] })
      hubPayment()

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      expect(world.writes.find((w) => w.table === 'tl_invoices')?.matched).toBe(0)
    })

    it.each([
      ['a detail table with no registered sync', { detail_table: 'future_invoices', detail_id: 'f-1' }],
      ['no detail key at all (a legacy hub row)', { detail_table: null, detail_id: null }],
    ])('settles the hub and touches no detail table for %s', async (_label, key) => {
      const { world } = makeWorld({ invoices: [hubRow(key)] })
      hubPayment()

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      expect(writtenTables(world)).toEqual(['invoices'])
    })

    describe('sales invoices (so_invoices): a paid link is a card receipt in the AR payments ledger', () => {
      // so_invoices.paid_amount / payment_status are DERIVED from the payments ledger: every insert, edit or delete
      // of a payment recomputes them, so a status write on the invoice row would be overwritten by the next payment
      // event on that invoice. The webhook records the card payment as a ledger row and the database's own triggers
      // move the invoice and, through sync_invoice_hub, the hub row.

      // 01:30 on the 21st in Qatar (UTC+3) is still the 20th in UTC: the receipt must carry the Qatar date.
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-20T22:30:00.000Z'))
      })
      afterEach(() => {
        vi.useRealTimers()
      })

      const salesWorld = (o: { hub?: Row; invoice?: Row; payments?: Row[]; syncTrigger?: boolean } = {}) =>
        makeWorld(
          {
            invoices: [hubRow({ detail_table: 'so_invoices', detail_id: 'so-1', ...o.hub })],
            so_invoices: [soRow(o.invoice)],
            payments: o.payments ?? [],
          },
          { syncTrigger: o.syncTrigger },
        )

      /** A receipt as the ledger stores an invoice payment: CPAY id, source_type 'invoice', linked. Defaults: QAR 40 cash on so-1. */
      const ledgerPayment = (o: Row = {}): Row => ({
        id: 'pay-earlier', payment_id: 'CPAY-00007', source_type: 'invoice', source_id: 'so-1', invoice_id: 'so-1',
        customer_id: 'cust-1', direction: 'incoming', amount: 40, amount_qar: 40, currency: 'QAR', exchange_rate: 1,
        method: 'cash', method_id: 'pm-cash', status: 'completed', date: '2026-10-15', reference: null, deleted_at: null,
        ...o,
      })
      /** The same, but on another invoice - it must not move so-1. */
      const elsewhere = (o: Row = {}) => ledgerPayment({ source_id: 'inv-other', invoice_id: 'inv-other', ...o })
      const inserts = (world: World) => world.writes.filter((w) => w.op === 'insert' && w.table === 'payments')
      const collision = { table: 'payments', op: 'insert', code: '23505', message: 'duplicate key value violates unique constraint "payments_payment_id_key"' } as const

      it('records exactly ONE ledger payment, in the shape the AR model stores a card receipt', async () => {
        const { world } = salesWorld()
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(inserts(world)).toHaveLength(1)
        // Exactly what was sent - an extra or missing column fails here. Notably: no invoice_id (that would
        // arm the AR over-allocation cap and could refuse money that was already received), no `sale_order`
        // source (the database would re-point it at the invoice anyway), the Dibsy id as the reference, the
        // QAR date (see beforeEach), and a method that exists in payment_methods.
        expect(inserts(world)[0].patch).toEqual({
          payment_id: 'CPAY-00001',
          source_type: 'invoice',
          source_id: 'so-1',
          customer_id: 'cust-1',
          direction: 'incoming',
          amount: 100,
          amount_qar: 100,
          currency: 'QAR',
          exchange_rate: 1,
          method: 'pos',
          status: 'completed',
          date: '2026-10-21',
          reference: 'pt_1',
          notes: expect.stringContaining('Dibsy'),
        })
      })

      it('moves the invoice and the hub through the ledger: the route never writes so_invoices and calls no attach / AR rpc', async () => {
        const { world, rpc } = salesWorld()
        hubPayment()

        await deliver()

        // The database links the receipt to the invoice (source_type 'invoice' -> invoice_id), recomputes the
        // invoice from the ledger, and mirrors it onto the hub.
        expect(world.tables.payments[0]).toMatchObject({ source_type: 'invoice', source_id: 'so-1', invoice_id: 'so-1' })
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        // The old direct write is gone: nothing the route did touched so_invoices, and only the ledger and the hub were written.
        expect(world.writes.filter((w) => w.table === 'so_invoices')).toEqual([])
        expect(writtenTables(world)).toEqual(['invoices', 'payments'])
        // attach_payment_to_invoice would be refused for an already-linked receipt, and is not needed.
        expect(rpc).not.toHaveBeenCalled()
      })

      it('numbers the receipt after the highest CPAY- id in the ledger, ignoring other series and other references', async () => {
        const { world } = salesWorld({
          payments: [
            elsewhere({ id: 'p41', payment_id: 'CPAY-00041', reference: 'pt_other' }),
            elsewhere({ id: 'p07', payment_id: 'CPAY-00007' }),
            elsewhere({ id: 'p99', payment_id: 'SPAY-00099', direction: 'outgoing' }),
          ],
        })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(inserts(world)[0].patch.payment_id).toBe('CPAY-00042')
        expect(world.tables.payments).toHaveLength(4)
      })

      it('adds the card receipt to what finance already recorded in the ledger (40 cash + 60 card = paid)', async () => {
        const { world } = salesWorld({
          hub: { paid_amount: 40, payment_status: 'partially_paid' },
          invoice: { paid_amount: 40, payment_status: 'partially_paid' },
          payments: [ledgerPayment()],
        })
        hubPayment(amountOf('60.00'))

        await deliver()

        expect(world.tables.payments).toHaveLength(2)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(warnSpy).not.toHaveBeenCalled()
      })

      it('a part payment, then a second Dibsy payment, are two receipts that together settle the invoice', async () => {
        const { world } = salesWorld()
        hubPayment(amountOf('60.00'))
        await deliver()
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })

        hubPayment({ id: 'pt_2', ...amountOf('40.00') })
        const res = await deliver(JSON.stringify({ resource: 'payment', id: 'pt_2' }))

        expect(res.status).toBe(200)
        expect(world.tables.payments.map((p) => [p.payment_id, p.reference, p.amount])).toEqual([
          ['CPAY-00001', 'pt_1', 60],
          ['CPAY-00002', 'pt_2', 40],
        ])
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('records an overpayment in full - the AR cap does not turn received money away - and tells finance', async () => {
        // Link minted for 100; 40 was then recorded in cash, and the customer still paid the link.
        const { world } = salesWorld({
          hub: { paid_amount: 40, payment_status: 'partially_paid' },
          invoice: { paid_amount: 40, payment_status: 'partially_paid' },
          payments: [ledgerPayment()],
        })
        hubPayment(amountOf('100.00'))

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.tables.payments).toHaveLength(2)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 140, payment_status: 'paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 140, payment_status: 'paid' })
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('overpaid by 40 QAR'))
      })

      // ─── Idempotency: Dibsy re-delivers, and a 500 makes it do so on purpose ──────────────────────────────
      it.each([[true], [false]])(
        'a re-delivered PARTIAL payment records nothing again: one ledger row, no write at all, no double count (sync trigger %s)',
        async (syncTrigger) => {
          const { world } = salesWorld({ syncTrigger })
          hubPayment(amountOf('60.00'))
          await deliver()
          const writesAfterFirst = world.writes.length
          const before = snapshot(world)

          const res = await deliver()

          expect(res.status).toBe(200)
          expect(await res.json()).toEqual({ ok: true })
          expect(world.tables.payments).toHaveLength(1)
          expect(world.writes).toHaveLength(writesAfterFirst)
          expect(snapshot(world)).toEqual(before)
          // The hub is NOT 120 / paid: the second 60 was never added...
          expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
          expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
          // ...and finance is not told about an "overpayment" of 20 that never happened.
          expect(warnSpy).not.toHaveBeenCalled()
        },
      )

      it('a payment already in the ledger under this Dibsy id is never recorded again, even while the hub row is still open', async () => {
        // The reference check is what stands between a re-delivery and a second receipt; the hub's own
        // "already paid" gate cannot help here (the hub row is open).
        const { world } = salesWorld({
          invoice: { paid_amount: 100, payment_status: 'paid' },
          payments: [ledgerPayment({ id: 'pay-pt1', payment_id: 'CPAY-00001', amount: 100, reference: 'pt_1' })],
        })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(inserts(world)).toHaveLength(0)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('counts a soft-deleted receipt as already recorded: a re-delivery never resurrects what finance deleted', async () => {
        const { world } = salesWorld({
          payments: [ledgerPayment({ id: 'pay-pt1', payment_id: 'CPAY-00001', amount: 100, reference: 'pt_1', deleted_at: '2026-10-19T08:00:00.000Z' })],
        })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(inserts(world)).toHaveLength(0)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
      })

      it('a retry after the hub write failed finds the receipt by its Dibsy id, records nothing again, and brings the hub up to the invoice', async () => {
        const { world } = salesWorld({ syncTrigger: false }) // the hub write is then what settles the hub
        world.failures.push({ table: 'invoices', op: 'update', message: 'boom' })
        hubPayment()

        const first = await deliver()

        expect(first.status).toBe(500)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })

        const retry = await deliver()

        expect(retry.status).toBe(200)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        // No sync trigger mirrored the invoice, so the retry's catch-up is what settles the hub - with the
        // INVOICE's numbers (100), not the hub's plus this payment's.
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('the same catch-up for a PART payment: the retry brings the hub to the invoice\'s 60, not to 60 + 60', async () => {
        const { world } = salesWorld({ syncTrigger: false })
        world.failures.push({ table: 'invoices', op: 'update', message: 'boom' })
        hubPayment(amountOf('60.00'))
        await deliver()

        const retry = await deliver()

        expect(retry.status).toBe(200)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
      })

      it('the catch-up only ever moves the hub UP to the invoice: a hub that is already ahead is left alone', async () => {
        const { world } = salesWorld({
          syncTrigger: false,
          hub: { paid_amount: 60, payment_status: 'partially_paid' },
          invoice: { paid_amount: 40, payment_status: 'partially_paid' },
          payments: [ledgerPayment({ id: 'pay-pt1', payment_id: 'CPAY-00001', amount: 40, reference: 'pt_1' })],
        })
        hubPayment(amountOf('40.00'))

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.writes).toHaveLength(0)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
      })

      it('the catch-up is guarded like every hub write: it never overwrites a hub row that was settled or voided after it was read', async () => {
        const { world } = salesWorld({
          syncTrigger: false,
          invoice: { paid_amount: 100, payment_status: 'paid' },
          payments: [ledgerPayment({ id: 'pay-pt1', payment_id: 'CPAY-00001', amount: 100, reference: 'pt_1' })],
        })
        hubPayment()
        world.onExec = (table, op) => {
          // The invoice is voided on the hub between the webhook reading the hub row and catching it up.
          if (table === 'invoices' && op === 'update') world.tables.invoices[0].payment_status = 'void'
        }

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'void' })
      })

      it('a DB error during the catch-up is a 500 (Dibsy retries)', async () => {
        const { world } = salesWorld({
          syncTrigger: false,
          invoice: { paid_amount: 100, payment_status: 'paid' },
          payments: [ledgerPayment({ id: 'pay-pt1', payment_id: 'CPAY-00001', amount: 100, reference: 'pt_1' })],
        })
        world.failures.push({ table: 'invoices', op: 'update', message: 'boom' })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
      })

      it('a hub write error after the receipt was recorded is a 500; with the sync trigger the hub is already settled, so the retry is a clean ack', async () => {
        const { world } = salesWorld()
        world.failures.push({ table: 'invoices', op: 'update', message: 'boom' })
        hubPayment()

        const first = await deliver()

        expect(first.status).toBe(500)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })

        const retry = await deliver()

        expect(retry.status).toBe(200)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('two concurrent deliveries of the same payment record it once: the loser of the CPAY race finds the winner by its Dibsy id', async () => {
        const { world } = salesWorld()
        hubPayment()
        let attempts = 0
        world.onExec = (table, op) => {
          if (table === 'payments' && op === 'insert') attempts++
        }

        const [a, b] = await Promise.all([deliver(), deliver()])

        expect(a.status).toBe(200)
        expect(b.status).toBe(200)
        expect(world.tables.payments).toHaveLength(1)
        // Both tried to insert; UNIQUE (payment_id) refused the second, and its retry found the first's receipt.
        expect(attempts).toBe(2)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('finds a concurrent delivery of the same payment that commits just before the duplicate check: the check runs last, right before the insert', async () => {
        const { world } = salesWorld()
        hubPayment()
        let selects = 0
        world.onExec = (table, op) => {
          // The webhook reads the ledger twice before inserting - the CPAY numbering, then the duplicate check.
          // A concurrent delivery of this very payment commits its receipt right before the SECOND read, i.e.
          // after the numbering was read: only a duplicate check that runs after the numbering can see it.
          if (table === 'payments' && op === 'select' && ++selects === 2) {
            world.tables.payments.push(ledgerPayment({ id: 'pay-concurrent', payment_id: 'CPAY-00001', amount: 100, reference: 'pt_1' }))
          }
        }

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(inserts(world)).toHaveLength(0)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.payments[0].id).toBe('pay-concurrent')
      })

      // ─── The max+1 CPAY numbering is racy by design (no sequence exists): the UNIQUE key is the backstop ──
      it('retries with a fresh number when a concurrent writer took the CPAY id first', async () => {
        const { world } = salesWorld()
        hubPayment()
        let raced = false
        world.onExec = (table, op) => {
          if (table === 'payments' && op === 'insert' && !raced) {
            raced = true
            // Someone else's receipt lands with the number this one was about to use.
            world.tables.payments.push(elsewhere({ id: 'pay-race', payment_id: 'CPAY-00001', reference: 'pt_other' }))
          }
        }

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.tables.payments.map((p) => p.payment_id).sort()).toEqual(['CPAY-00001', 'CPAY-00002'])
        expect(world.tables.payments.find((p) => p.reference === 'pt_1')?.payment_id).toBe('CPAY-00002')
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('survives two number collisions in a row (the third attempt records it)', async () => {
        const { world } = salesWorld()
        world.failures.push({ ...collision }, { ...collision })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(inserts(world)).toHaveLength(1)
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('gives up after three collisions with a 500 and nothing settled; the next delivery then records it once', async () => {
        const { world } = salesWorld()
        world.failures.push({ ...collision }, { ...collision }, { ...collision })
        hubPayment()

        const first = await deliver()

        expect(first.status).toBe(500)
        expect(world.tables.payments).toHaveLength(0)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
        expect(errorSpy).toHaveBeenCalled()

        const retry = await deliver()

        expect(retry.status).toBe(200)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      // ─── Things that must not be paid into, or recorded wrongly ───────────────────────────────────────────
      it('never pays into a voided sales invoice, even when the hub row has not caught up: acks, records nothing, flags the money', async () => {
        const { world } = salesWorld({ invoice: { payment_status: 'void' } }) // the hub row still says unpaid
        hubPayment()
        const before = snapshot(world)

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.writes).toHaveLength(0)
        expect(snapshot(world)).toEqual(before)
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('void'))
      })

      it.each([['USD'], [undefined]])(
        'never records a non-QAR payment (%s) as QAR: acks, records nothing, flags the money',
        async (currency) => {
          const { world } = salesWorld()
          hubPayment({ amount: { value: '100.00', currency } as unknown as DibsyPayment['amount'] })
          const before = snapshot(world)

          const res = await deliver()

          expect(res.status).toBe(200)
          expect(world.writes).toHaveLength(0)
          expect(snapshot(world)).toEqual(before)
          expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('QAR'))
        },
      )

      it('an orphan hub row (the sales invoice is gone) settles the hub only: no receipt can be linked, so none is invented', async () => {
        const { world } = makeWorld({ invoices: [hubRow({ detail_table: 'so_invoices', detail_id: 'so-1' })], so_invoices: [] })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.tables.payments).toHaveLength(0)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(warnSpy).toHaveBeenCalled()
      })

      it('a sales invoice with no customer is still recorded (customer_id stays empty)', async () => {
        const { world } = salesWorld({ invoice: { customer_id: null } })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(inserts(world)[0].patch.customer_id).toBeNull()
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      // ─── Failures: a 500 makes Dibsy retry, so nothing may be half-applied ───────────────────────────────────
      it('a DB error reading the sales invoice is a 500 and writes nothing', async () => {
        const { world } = salesWorld()
        world.failures.push({ table: 'so_invoices', op: 'select', message: 'boom' })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
        expect(world.writes).toHaveLength(0)
      })

      it('a DB error reading the CPAY numbering is a 500 and writes nothing', async () => {
        const { world } = salesWorld()
        world.failures.push({ table: 'payments', op: 'select', message: 'boom' }) // the first ledger read
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
        expect(world.writes).toHaveLength(0)
      })

      it('a DB error checking the ledger for this Dibsy id is a 500 and writes nothing', async () => {
        const { world } = salesWorld()
        let selects = 0
        world.onExec = (table, op) => {
          // The first ledger read is the CPAY numbering; the second is the duplicate check, right before the insert.
          if (table === 'payments' && op === 'select' && ++selects === 2) {
            world.failures.push({ table: 'payments', op: 'select', message: 'boom' })
          }
        }
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
        expect(world.writes).toHaveLength(0)
      })

      it('a payment ledger id that cannot be read as a number is a 500 - never a "CPAY-NaN" row', async () => {
        const { world } = salesWorld({ payments: [elsewhere({ id: 'p-bad', payment_id: 'CPAY-LEGACY' })] })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
        expect(world.writes).toHaveLength(0)
        expect(errorSpy).toHaveBeenCalled()
      })

      it('a DB error inserting the receipt is a 500 with the hub untouched, and the retry then records it exactly once', async () => {
        const { world } = salesWorld()
        world.failures.push({ table: 'payments', op: 'insert', message: 'boom' })
        hubPayment()

        const first = await deliver()

        expect(first.status).toBe(500)
        expect(world.tables.payments).toHaveLength(0)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })

        const retry = await deliver()

        expect(retry.status).toBe(200)
        expect(world.tables.payments).toHaveLength(1)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('a ledger refusal (a payment method the database does not know) is a 500, not a silent skip', async () => {
        // The fake enforces what the real sync_payment_method_id trigger does. Emptying payment_methods stands in for
        // an admin having renamed or removed the card method: the insert is refused and the webhook must say so.
        const { world } = salesWorld()
        world.tables.payment_methods.length = 0
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
        expect(world.tables.payments).toHaveLength(0)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
        expect(errorSpy).toHaveBeenCalled()
      })
    })

    it('leaves the unrelated rows alone', async () => {
      const { world } = makeWorld({
        invoices: [hubRow(), hubRow({ id: 'hub-2', detail_id: 'tl-2' })],
        tl_invoices: [tlRow(), tlRow({ id: 'tl-2', invoice_number: 'SINV/2026/10/0002' })],
        contract_invoices: [contractRow()],
      })
      hubPayment()

      await deliver()

      expect(world.tables.invoices[1]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
      expect(world.tables.tl_invoices[1]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
      expect(world.tables.contract_invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
    })

    describe('failures are retry-safe (a 500 makes Dibsy re-deliver; the retry must converge, never double-count)', () => {
      it('a hub read error is a 500 and writes nothing', async () => {
        const { world } = worldFor(DETAILS[0])
        world.failures.push({ table: 'invoices', op: 'select', message: 'boom' })
        hubPayment()

        const res = await deliver()

        expect(res.status).toBe(500)
        expect(world.writes).toHaveLength(0)
      })

      it('a detail write error is a 500 with the hub untouched, and the retry then settles exactly once', async () => {
        const { world } = worldFor(DETAILS[0])
        world.failures.push({ table: 'tl_invoices', op: 'update', message: 'boom' })
        hubPayment()

        const first = await deliver()

        expect(first.status).toBe(500)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })
        expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })

        const retry = await deliver()

        expect(retry.status).toBe(200)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it.each([[true], [false]])(
        'a hub write error after the detail was synced is a 500, and the retry ends consistent at 100 (sync trigger %s)',
        async (syncTrigger) => {
          const { world } = worldFor(DETAILS[0], {}, {}, { syncTrigger })
          world.failures.push({ table: 'invoices', op: 'update', message: 'boom' })
          hubPayment()

          const first = await deliver()

          expect(first.status).toBe(500)
          expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })

          const retry = await deliver()

          expect(retry.status).toBe(200)
          expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
          expect(world.tables.tl_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
        },
      )
    })
  })

  describe('legacy branches still route as before', () => {
    it('tl_invoice_id: a paid payment marks the unpaid tl_invoice paid, and a replay changes nothing', async () => {
      const { world } = makeWorld({ tl_invoices: [tlRow()] })
      dibsyReturns({ tl_invoice_id: 'tl-1' })

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(world.tables.tl_invoices[0].payment_status).toBe('paid')
      expect(world.tables.tl_invoices[0].updated_at).not.toBe(OLD)

      const afterFirst = snapshot(world)
      await deliver()
      expect(snapshot(world)).toEqual(afterFirst)
    })

    it('tl_invoice_id: a payment that has not been paid does not mark the invoice', async () => {
      const { world } = makeWorld({ tl_invoices: [tlRow()] })
      dibsyReturns({ tl_invoice_id: 'tl-1' }, { status: 'failed' })

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.tl_invoices[0].payment_status).toBe('unpaid')
    })

    it('tl_invoice_id: a DB error is a 500', async () => {
      const { world } = makeWorld({ tl_invoices: [tlRow()] })
      world.failures.push({ table: 'tl_invoices', op: 'update', message: 'boom' })
      dibsyReturns({ tl_invoice_id: 'tl-1' })

      const res = await deliver()

      expect(res.status).toBe(500)
    })

    it('batch_id: marks every invoice in the batch and the batch itself paid', async () => {
      const { world } = makeWorld({
        tl_payment_batch_items: [
          { batch_id: 'b-1', tl_invoice_id: 'tl-1' },
          { batch_id: 'b-1', tl_invoice_id: 'tl-2' },
          { batch_id: 'b-2', tl_invoice_id: 'tl-3' },
        ],
        tl_payment_batches: [{ id: 'b-1', payment_status: 'unpaid' }],
        tl_invoices: [tlRow(), tlRow({ id: 'tl-2' }), tlRow({ id: 'tl-3' })],
      })
      dibsyReturns({ batch_id: 'b-1' })

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.tl_invoices.map((r) => r.payment_status)).toEqual(['paid', 'paid', 'unpaid'])
      expect(world.tables.tl_payment_batches[0].payment_status).toBe('paid')
    })

    it('customer_batch_invoice_ids: pays every listed invoice in full, and a replay changes nothing', async () => {
      const inv = (id: string, total: number, o: Row = {}): Row => ({
        id, total_amount: total, paid_amount: 0, payment_status: 'unpaid', manually_paid: false, ...o,
      })
      const { world } = makeWorld({ invoices: [inv('inv-1', 100), inv('inv-2', 250), inv('inv-3', 70)] })
      dibsyReturns({ customer_batch_invoice_ids: JSON.stringify(['inv-1', 'inv-2']) }, amountOf('350.00'))

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid', manually_paid: true })
      expect(world.tables.invoices[1]).toMatchObject({ paid_amount: 250, payment_status: 'paid', manually_paid: true })
      expect(world.tables.invoices[2]).toMatchObject({ paid_amount: 0, payment_status: 'unpaid' })

      const afterFirst = snapshot(world)
      await deliver()
      expect(snapshot(world)).toEqual(afterFirst)
    })

    it('customer_batch_invoice_ids: malformed JSON is a 400', async () => {
      makeWorld({ invoices: [] })
      dibsyReturns({ customer_batch_invoice_ids: '{not json' })

      const res = await deliver()

      expect(res.status).toBe(400)
    })

    describe('invoice_id (single legacy invoice)', () => {
      const legacy = (o: Row = {}): Row => ({
        id: 'inv-1', total_amount: 100, paid_amount: 0, payment_status: 'unpaid', manually_paid: false, ...o,
      })

      it('a full payment marks the invoice paid', async () => {
        const { world } = makeWorld({ invoices: [legacy()] })
        dibsyReturns({ invoice_id: 'inv-1' })

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid', manually_paid: true })
      })

      it('a part payment leaves it partially_paid', async () => {
        const { world } = makeWorld({ invoices: [legacy()] })
        dibsyReturns({ invoice_id: 'inv-1' }, amountOf('60.00'))

        await deliver()

        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 60, payment_status: 'partially_paid' })
      })

      it('X-2: a re-delivered webhook does not add the payment to a paid invoice a second time', async () => {
        const { world } = makeWorld({ invoices: [legacy()] })
        dibsyReturns({ invoice_id: 'inv-1' })

        await deliver()
        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
      })

      it('an unknown invoice id is acked and ignored', async () => {
        const { world } = makeWorld({ invoices: [legacy({ id: 'other' })] })
        dibsyReturns({ invoice_id: 'inv-1' })

        const res = await deliver()

        expect(res.status).toBe(200)
        expect(world.writes).toHaveLength(0)
      })
    })

    it('subscription_id: a paid payment activates the subscription for the package duration', async () => {
      const { world } = makeWorld({
        customer_subscriptions: [{ id: 'sub-1', status: 'pending_payment', package_id: 'pkg-1' }],
        subscription_packages: [{ id: 'pkg-1', duration_months: 6 }],
      })
      dibsyReturns({ subscription_id: 'sub-1' })

      const res = await deliver()

      expect(res.status).toBe(200)
      const sub = world.tables.customer_subscriptions[0]
      expect(sub.status).toBe('active')
      expect(typeof sub.start_date).toBe('string')
      expect(typeof sub.end_date).toBe('string')
      expect(sub.end_date).not.toBe(sub.start_date)
    })

    it('metadata the router does not know is acked and ignored', async () => {
      const { world } = makeWorld({ invoices: [hubRow()], tl_invoices: [tlRow()] })
      dibsyReturns({ something_else: 'x' })
      const before = snapshot(world)

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(snapshot(world)).toEqual(before)
    })

    it('a payment with no metadata at all is acked and ignored', async () => {
      const { world } = makeWorld({ invoices: [hubRow()] })
      dibsyReturns(undefined)

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.writes).toHaveLength(0)
    })
  })

  describe('request handling (unchanged)', () => {
    it('401s a bad signature before fetching anything', async () => {
      vi.mocked(verifyHmacSignature).mockReturnValue(false)
      makeWorld()

      const res = await deliver()

      expect(res.status).toBe(401)
      expect(getDibsyPayment).not.toHaveBeenCalled()
      expect(createAdminClient).not.toHaveBeenCalled()
    })

    it('400s a body that is not JSON', async () => {
      const res = await deliver('not json')

      expect(res.status).toBe(400)
      expect(getDibsyPayment).not.toHaveBeenCalled()
    })

    it('400s a body with no payment id', async () => {
      const res = await deliver(JSON.stringify({ resource: 'payment' }))

      expect(res.status).toBe(400)
      expect(getDibsyPayment).not.toHaveBeenCalled()
    })

    it('502s when the payment cannot be fetched from Dibsy', async () => {
      vi.mocked(getDibsyPayment).mockRejectedValue(new Error('Dibsy API error 500'))
      makeWorld()

      const res = await deliver()

      expect(res.status).toBe(502)
    })
  })
})
