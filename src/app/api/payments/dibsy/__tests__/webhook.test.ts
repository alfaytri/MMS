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
// column projection, update, eq / neq / in, maybeSingle, awaitable) and really APPLIES the filters and
// the writes. So a missing or wrong guard shows up as wrong final state (a double-counted amount, an
// overwritten row), not as a call-shape mismatch, and a table the route has no business touching throws.
//
// `syncTrigger` emulates public.sync_invoice_hub() (migration 20261154): every UPDATE of a detail
// table (tl_ / contract_ / so_invoices) re-mirrors that row's total_amount, paid_amount and
// payment_status onto its hub row - the detail row is canonical - with the detail's 'partial' spelled
// 'partially_paid' on the hub. It is on by default because that is the real database; the tests that
// matter run with it both ON and OFF.

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }
type Op = 'select' | 'update'

interface World {
  tables: Record<string, Row[]>
  /** Every UPDATE the route issued, in order: the patch and how many rows it matched. */
  writes: Array<{ table: string; patch: Row; matched: number }>
  /** One-shot failures: the first query on `table` with `op` fails with `message`, then the entry is spent. */
  failures: Array<{ table: string; op: Op; message: string }>
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

class FakeQuery implements PromiseLike<Result> {
  private op: Op = 'select'
  private patch: Row = {}
  private selected = false
  private columns: string[] | null = null
  private filters: Array<(row: Row) => boolean> = []
  private one = false

  constructor(private world: World, private table: string) {}

  select(columns?: string) {
    this.selected = true
    this.columns = columns && columns.trim() !== '*' ? columns.split(',').map((c) => c.trim()) : null
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
      return { data: null, error: { message: spent.message } }
    }

    const rows = this.world.tables[this.table]
    if (!rows) throw new Error(`fake admin: unexpected table "${this.table}"`)
    const matched = rows.filter((r) => this.filters.every((f) => f(r)))
    const cols = this.columns
    const project = (r: Row): Row => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r })

    if (this.op === 'update') {
      for (const row of matched) {
        Object.assign(row, this.patch)
        if (this.world.syncTrigger) mirrorToHub(this.world, this.table, row)
      }
      this.world.writes.push({ table: this.table, patch: { ...this.patch }, matched: matched.length })
      return { data: this.selected ? matched.map(project) : null, error: null }
    }

    const projected = matched.map(project)
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
  id: 'so-1', invoice_id: 'INV-00001', total_amount: 100, paid_amount: 0, payment_status: 'unpaid', ...o,
})

interface Detail {
  table: string
  id: string
  row: (o?: Row) => Row
  /** How this table spells "partially paid". */
  partial: string
  hasUpdatedAt: boolean
}

/** The three detail tables a hub row can mirror. */
const DETAILS: readonly Detail[] = [
  { table: 'tl_invoices', id: 'tl-1', row: tlRow, partial: 'partial', hasUpdatedAt: true },
  { table: 'contract_invoices', id: 'ct-1', row: contractRow, partial: 'partial', hasUpdatedAt: true },
  { table: 'so_invoices', id: 'so-1', row: soRow, partial: 'partially_paid', hasUpdatedAt: false },
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
          // Only the hub and that one detail table were written - nothing else (no AR / payments tables).
          expect(writtenTables(world)).toEqual([d.table, 'invoices'].sort())
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

    it('does not resurrect a row that was voided after it was read (both writes are guarded)', async () => {
      const { world } = worldFor(DETAILS[2])
      hubPayment()
      // The sales invoice is cancelled between the webhook reading the hub row and writing it.
      world.onExec = (table, op) => {
        if (table === 'so_invoices' && op === 'update') {
          world.tables.invoices[0].payment_status = 'void'
          world.tables.so_invoices[0].payment_status = 'void'
        }
      }

      const res = await deliver()

      expect(res.status).toBe(200)
      expect(world.tables.invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'void' })
      expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 0, payment_status: 'void' })
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

    it('does not invent an AR payment for a sales invoice: no rpc, no payments row (only the direct status sync)', async () => {
      // The AR ledger path (a payments row + attach_payment_to_invoice) needs a CPAY- id, a method and a
      // method_id the webhook has no source for. so_invoices is not dispatched in v1, so this path is a
      // defensive direct sync with a TODO - this test pins that it stays that until it is designed.
      const { world, rpc } = worldFor(DETAILS[2])
      hubPayment()

      await deliver()

      expect(rpc).not.toHaveBeenCalled()
      expect(world.tables).not.toHaveProperty('payments')
      expect(world.tables.so_invoices[0]).toMatchObject({ paid_amount: 100, payment_status: 'paid' })
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
