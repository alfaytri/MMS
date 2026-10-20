// src/app/api/notifications/send-invoice/__tests__/route.test.ts
//
// POST /api/notifications/send-invoice is the IMMEDIATE order_invoice WhatsApp a TL (service) invoice
// gets the moment it is created (TlInvoiceDialog). The Unified Invoice Hub dispatch cron sends the SAME
// template for every hub row (public.invoices) that is still `pending`, so once the cron is enabled the
// customer would be messaged twice. The hand-off under test: after a SUCCESSFUL send the route marks the
// invoice's hub row (detail_table = 'tl_invoices', detail_id = the TL invoice id) `sent`, so the cron
// skips it. A skipped or failed send must leave the row `pending`, so the cron can still deliver it.
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { NextRequest } from 'next/server'

// Everything with a side effect is replaced: the Supabase client (a stateful in-memory fake, below), the
// WhatsApp helper, Dibsy and the PDF renderer (headless Chromium).
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/notifications/sendWatiTemplate', () => ({ sendWatiTemplate: vi.fn() }))
vi.mock('@/lib/dibsy', () => ({ createDibsyPayment: vi.fn() }))
vi.mock('@/lib/orders/generate-tl-invoice-pdf', () => ({ generateTlInvoicePdf: vi.fn() }))

import { POST } from '../route'
import { createClient } from '@supabase/supabase-js'
import { sendWatiTemplate } from '@/lib/notifications/sendWatiTemplate'
import { createDibsyPayment } from '@/lib/dibsy'
import { generateTlInvoicePdf } from '@/lib/orders/generate-tl-invoice-pdf'

// ─── In-memory stand-in for the Supabase service-role client ────────────────────
// A small STATEFUL database: it implements just the query-builder calls the route uses (select with
// column projection, update, eq / neq, maybeSingle, awaitable) and really APPLIES the filters and the
// writes. So a missing or wrong filter shows up as wrong final state (the wrong hub row stamped, a sent
// row rewritten), not as a call-shape mismatch, and a table the route has no business touching throws.
// neq follows SQL: `col <> v` is not true for a NULL column.

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

interface World {
  tables: Record<string, Row[]>
  /** Every UPDATE that was applied, in order: the table, the patch, and how many rows it matched. */
  writes: Array<{ table: string; patch: Row; matched: number }>
  /** The user the bearer token resolves to; null makes getUser answer "invalid token". */
  user: { id: string } | null
  /** Make every UPDATE of `table` fail - the way supabase-js does (an `error` result) or by rejecting. */
  failUpdate?: { table: string; how: 'error' | 'reject'; message: string }
  /** Make hub UPDATEs take this long (a real timer), so a write the route does not await is still in flight when it responds. */
  hubWriteDelayMs?: number
}

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'update' = 'select'
  private patch: Row = {}
  private columns: string[] | null = null
  private filters: Array<(row: Row) => boolean> = []
  private one = false

  constructor(private world: World, private table: string) {}

  select(columns?: string) {
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
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== undefined && r[column] !== null && r[column] !== value)
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
    const delay = this.op === 'update' && this.table === 'invoices' ? (this.world.hubWriteDelayMs ?? 0) : 0
    const settled =
      delay > 0
        ? new Promise<Result>((resolve, reject) =>
            setTimeout(() => {
              try {
                resolve(this.exec())
              } catch (e) {
                reject(e)
              }
            }, delay),
          )
        : new Promise<Result>((resolve) => resolve(this.exec()))
    return settled.then(onfulfilled, onrejected)
  }

  private exec(): Result {
    const rows = this.world.tables[this.table]
    if (!rows) throw new Error(`fake supabase: unexpected table "${this.table}"`)
    const matched = rows.filter((r) => this.filters.every((f) => f(r)))

    if (this.op === 'update') {
      const fail = this.world.failUpdate
      if (fail?.table === this.table) {
        if (fail.how === 'reject') throw new Error(fail.message)
        return { data: null, error: { message: fail.message } }
      }
      for (const row of matched) Object.assign(row, this.patch)
      this.world.writes.push({ table: this.table, patch: { ...this.patch }, matched: matched.length })
      return { data: null, error: null }
    }

    const cols = this.columns
    const projected = matched.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r }))
    return { data: this.one ? (projected[0] ?? null) : projected, error: null }
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const TOKEN = 'user-jwt'
const APP_URL = 'https://mms.example.test'

/** A TL invoice with QAR 400.00 still owed and everything the send needs already in place (PDF + pay link). */
function tlInvoice(overrides: Row = {}): Row {
  return {
    id: 'tl-1',
    invoice_number: 'SINV_2026_10_0001',
    order_id: 'ORD-0001',
    customer_name: 'Acme Trading',
    customer_phone: '+97455512345',
    total_amount: 500,
    paid_amount: 100,
    pdf_url: 'https://pdf.test/tl-1.pdf',
    dibsy_checkout_url: 'https://checkout.dibsy.test/pay/tl-1',
    ...overrides,
  }
}

/** The hub row the sync trigger mirrors for a TL invoice: `pending` until something sends it. */
function hubRow(overrides: Row = {}): Row {
  return {
    id: 'hub-tl-1',
    detail_table: 'tl_invoices',
    detail_id: 'tl-1',
    dispatch_status: 'pending',
    sent_at: null,
    ...overrides,
  }
}

/** The hub row under test plus two decoys: another TL invoice, and another invoice TYPE with the same detail id. */
const defaultHub = () => [
  hubRow(),
  hubRow({ id: 'hub-tl-2', detail_id: 'tl-2' }),
  hubRow({ id: 'hub-ct-1', detail_table: 'contract_invoices', detail_id: 'tl-1' }),
]

function makeWorld(init: { tl?: Row[]; hub?: Row[] } = {}): World {
  const world: World = {
    tables: { tl_invoices: init.tl ?? [tlInvoice()], invoices: init.hub ?? defaultHub() },
    writes: [],
    user: { id: 'user-1' },
  }
  const client = {
    auth: {
      getUser: vi.fn(async () =>
        world.user
          ? { data: { user: world.user }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
      ),
    },
    from: (table: string) => new FakeQuery(world, table),
  }
  vi.mocked(createClient).mockReturnValue(client as never)
  return world
}

const hub = (world: World, id = 'hub-tl-1') => world.tables.invoices.find((r) => r.id === id)!
const hubWrites = (world: World) => world.writes.filter((w) => w.table === 'invoices')

function post(body: unknown = { invoiceId: 'tl-1' }, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return POST(
    new NextRequest('http://localhost/api/notifications/send-invoice', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

const SENT = { ok: true as const, watiMsgId: 'wati-1' }
const whatsapp = () => vi.mocked(sendWatiTemplate)

/** Pin the clock (Date only - the route awaits no timers) so the stamped send time is exact. */
function setClock(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

const ORIG_APP_URL = process.env.NEXT_PUBLIC_APP_URL
let warn: MockInstance<typeof console.warn>

/** Everything console.warn was given, flattened to one string (the route logs a tag, the invoice id and the cause). */
const logged = () =>
  warn.mock.calls
    .flat()
    .map((a) => (a instanceof Error ? a.message : String(a)))
    .join(' ')

beforeEach(() => {
  vi.resetAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = APP_URL
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  whatsapp().mockResolvedValue(SENT)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (ORIG_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = ORIG_APP_URL
})

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/notifications/send-invoice', () => {
  describe('after a SUCCESSFUL send it marks the TL invoice\'s hub row sent (so the cron skips it)', () => {
    it('stamps dispatch_status=sent and sent_at (the send time), and the response is still the helper\'s result', async () => {
      setClock('2026-10-21T09:30:00.000Z')
      const world = makeWorld()

      const res = await post()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(SENT)
      expect(hub(world)).toMatchObject({ dispatch_status: 'sent', sent_at: '2026-10-21T09:30:00.000Z' })
    })

    it('issues exactly one hub write and touches no other row (another TL invoice, or another type sharing the detail id)', async () => {
      const world = makeWorld()

      await post()

      expect(hubWrites(world)).toEqual([
        { table: 'invoices', patch: { dispatch_status: 'sent', sent_at: expect.any(String) }, matched: 1 },
      ])
      expect(hub(world, 'hub-tl-2')).toMatchObject({ dispatch_status: 'pending', sent_at: null })
      expect(hub(world, 'hub-ct-1')).toMatchObject({ dispatch_status: 'pending', sent_at: null })
    })

    it('never rewrites a hub row that is already sent: sent_at keeps the time of the first send', async () => {
      setClock('2026-10-21T09:30:00.000Z')
      const world = makeWorld({ hub: [hubRow({ dispatch_status: 'sent', sent_at: '2026-10-21T08:00:00.000Z' })] })

      await post()

      expect(hub(world)).toMatchObject({ dispatch_status: 'sent', sent_at: '2026-10-21T08:00:00.000Z' })
    })

    it('a second send of the same invoice leaves the time of the first send alone', async () => {
      setClock('2026-10-21T09:30:00.000Z')
      const world = makeWorld()

      await post()
      setClock('2026-10-21T09:45:00.000Z')
      await post()

      expect(whatsapp()).toHaveBeenCalledTimes(2)
      expect(hub(world)).toMatchObject({ dispatch_status: 'sent', sent_at: '2026-10-21T09:30:00.000Z' })
    })

    it.each(['failed', 'skipped'])(
      'marks a hub row the cron had left %s: the customer has now actually been messaged',
      async (status) => {
        const world = makeWorld({ hub: [hubRow({ dispatch_status: status })] })

        await post()

        expect(hub(world).dispatch_status).toBe('sent')
      },
    )

    it('has applied the hub write by the time it responds: the write is awaited, not fired and forgotten', async () => {
      const world = makeWorld()
      world.hubWriteDelayMs = 25

      await post()

      expect(hub(world).dispatch_status).toBe('sent')
    })

    it('marks the hub only AFTER the WhatsApp has gone out, never before (a send that then fails must stay pending)', async () => {
      const world = makeWorld()
      let statusWhileSending: unknown
      whatsapp().mockImplementation(async () => {
        statusWhileSending = hub(world).dispatch_status
        return SENT
      })

      await post()

      expect(statusWhileSending).toBe('pending')
      expect(hub(world).dispatch_status).toBe('sent')
    })
  })

  describe('best-effort: telling the hub never fails the invoice send', () => {
    it('a hub update that comes back with an error is logged with the DB message; the response is unchanged', async () => {
      const world = makeWorld()
      world.failUpdate = { table: 'invoices', how: 'error', message: 'permission denied for table invoices' }

      const res = await post()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(SENT)
      expect(logged()).toContain('[send-invoice]')
      expect(logged()).toContain('tl-1')
      expect(logged()).toContain('permission denied for table invoices')
    })

    it('a hub update that throws is logged; the response is unchanged', async () => {
      const world = makeWorld()
      world.failUpdate = { table: 'invoices', how: 'reject', message: 'fetch failed' }

      const res = await post()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(SENT)
      expect(logged()).toContain('[send-invoice]')
      expect(logged()).toContain('fetch failed')
    })
  })

  describe('no hub write unless the send actually succeeded (the cron must still be able to deliver it)', () => {
    it.each(['unassigned', 'config-missing', 'inactive', 'no-phone'] as const)(
      'a skipped send (%s) leaves the hub row pending',
      async (reason) => {
        const world = makeWorld()
        whatsapp().mockResolvedValue({ skipped: reason })

        const res = await post()

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ skipped: reason })
        expect(hubWrites(world)).toEqual([])
        expect(hub(world)).toMatchObject({ dispatch_status: 'pending', sent_at: null })
      },
    )

    it('a failed send ({ ok: false }) leaves the hub row pending', async () => {
      const world = makeWorld()
      whatsapp().mockResolvedValue({ ok: false, error: 'HTTP 403: forbidden' })

      const res = await post()

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: false, error: 'HTTP 403: forbidden' })
      expect(hubWrites(world)).toEqual([])
      expect(hub(world)).toMatchObject({ dispatch_status: 'pending', sent_at: null })
    })

    it('an invoice with no customer phone never reaches the helper and never touches the hub', async () => {
      const world = makeWorld({ tl: [tlInvoice({ customer_phone: null })] })

      const res = await post()

      expect(await res.json()).toEqual({ skipped: 'no-phone' })
      expect(whatsapp()).not.toHaveBeenCalled()
      expect(hubWrites(world)).toEqual([])
      expect(hub(world).dispatch_status).toBe('pending')
    })

    it.each([
      ['no bearer token', { token: null, body: { invoiceId: 'tl-1' }, status: 401, noUser: false }],
      ['a token that resolves to no user', { token: TOKEN, body: { invoiceId: 'tl-1' }, status: 401, noUser: true }],
      ['no invoiceId', { token: TOKEN, body: {}, status: 400, noUser: false }],
      ['an unknown invoice', { token: TOKEN, body: { invoiceId: 'nope' }, status: 404, noUser: false }],
    ])('%s: the existing status, nothing sent, hub untouched', async (_label, c) => {
      const world = makeWorld()
      if (c.noUser) world.user = null

      const res = await post(c.body, c.token)

      expect(res.status).toBe(c.status)
      expect(whatsapp()).not.toHaveBeenCalled()
      expect(hubWrites(world)).toEqual([])
      expect(hub(world).dispatch_status).toBe('pending')
    })
  })

  describe('the rest of the route is unchanged', () => {
    it('sends the order_invoice template with the invoice figures, the PDF and the live pay link', async () => {
      makeWorld()

      await post()

      expect(whatsapp()).toHaveBeenCalledTimes(1)
      expect(whatsapp()).toHaveBeenCalledWith({
        slug: 'order_invoice',
        phone: '+97455512345',
        pdfUrl: 'https://pdf.test/tl-1.pdf',
        attachmentName: 'SINV_2026_10_0001.pdf',
        userToken: TOKEN,
        renderedText: expect.stringContaining(`${APP_URL}/pay/tl-1`),
        params: [
          { name: 'invoice_number', value: 'SINV_2026_10_0001' },
          { name: 'customer_name', value: 'Acme Trading' },
          { name: 'total', value: '500.00' },
          { name: 'paid', value: '100.00' },
          { name: 'pending', value: '400.00' },
          { name: 'pay_link', value: `${APP_URL}/pay/tl-1` },
        ],
      })
    })

    it('creates a Dibsy link for the owed balance when the invoice has none, stores it on the TL invoice, then marks the hub last', async () => {
      const world = makeWorld({ tl: [tlInvoice({ dibsy_checkout_url: null })] })
      vi.mocked(createDibsyPayment).mockResolvedValue({
        id: 'dibsy-1',
        status: 'open',
        checkoutUrl: 'https://checkout.dibsy.test/pay/new',
        amount: { value: '400.00', currency: 'QAR' },
      })

      await post()

      expect(createDibsyPayment).toHaveBeenCalledTimes(1)
      expect(createDibsyPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: { value: '400.00', currency: 'QAR' },
          redirectUrl: `${APP_URL}/pay/tl-1`,
        }),
      )
      expect(world.tables.tl_invoices[0]).toMatchObject({
        dibsy_payment_id: 'dibsy-1',
        dibsy_checkout_url: 'https://checkout.dibsy.test/pay/new',
      })
      expect(world.writes.map((w) => w.table)).toEqual(['tl_invoices', 'invoices'])
      expect(hub(world).dispatch_status).toBe('sent')
    })

    it('renders the PDF when the invoice has none and attaches it to the send', async () => {
      makeWorld({ tl: [tlInvoice({ pdf_url: null })] })
      vi.mocked(generateTlInvoicePdf).mockResolvedValue({
        url: 'https://pdf.test/rendered.pdf',
        storageKey: 'tl/rendered.pdf',
        invoiceId: 'tl-1',
        bytes: 1024,
        regenerated: true,
      })

      await post()

      expect(generateTlInvoicePdf).toHaveBeenCalledWith('tl-1', expect.anything())
      expect(whatsapp()).toHaveBeenCalledWith(expect.objectContaining({ pdfUrl: 'https://pdf.test/rendered.pdf' }))
    })

    it('a fully paid invoice: no pay link is created or sent, and the successful send still marks the hub', async () => {
      const world = makeWorld({ tl: [tlInvoice({ paid_amount: 500, dibsy_checkout_url: null })] })

      await post()

      expect(createDibsyPayment).not.toHaveBeenCalled()
      expect(whatsapp()).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.arrayContaining([
            { name: 'pending', value: '0.00' },
            { name: 'pay_link', value: '-' },
          ]),
        }),
      )
      expect(hub(world).dispatch_status).toBe('sent')
    })
  })
})
