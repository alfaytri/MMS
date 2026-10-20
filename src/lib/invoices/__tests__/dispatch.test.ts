import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// Everything with a side effect outside this module is replaced: the admin client
// refuses to load in a jsdom window, the registry drags in puppeteer, and Dibsy /
// WATI are real pay links and real WhatsApps.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/dibsy', () => ({ createDibsyPayment: vi.fn() }))
vi.mock('@/lib/invoices/pdf-registry', () => ({ pdfRendererFor: vi.fn() }))

import { dispatchInvoice } from '../dispatch'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'
import { pdfRendererFor } from '@/lib/invoices/pdf-registry'

// ─── In-memory stand-in for the Supabase admin client ───────────────────────────
// Just enough of the query builder (select / insert / update / eq / neq / is /
// maybeSingle / single, awaitable) over plain arrays, so the tests assert on the
// resulting hub row instead of on the shape of the calls.

type Row = Record<string, unknown>
type Filter = { kind: 'eq' | 'neq' | 'is'; col: string; val: unknown }
type Result = { data: unknown; error: { message: string } | null }

class FakeDb {
  tables: Record<string, Row[]> = {
    invoices: [],
    so_invoices: [],
    chat_conversations: [],
    chat_messages: [],
  }
  private seq = 0

  from(table: string): FakeQuery {
    return new FakeQuery(this, table)
  }

  nextId(table: string): string {
    this.seq += 1
    return `${table}-${this.seq}`
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' = 'select'
  private values: Row = {}
  private filters: Filter[] = []
  private returning = false
  private shape: 'many' | 'maybe' | 'single' = 'many'

  constructor(private db: FakeDb, private table: string) {}

  select(_columns?: string) { this.returning = true; return this }
  insert(values: Row) { this.op = 'insert'; this.values = values; return this }
  update(values: Row) { this.op = 'update'; this.values = values; return this }
  eq(col: string, val: unknown) { this.filters.push({ kind: 'eq', col, val }); return this }
  neq(col: string, val: unknown) { this.filters.push({ kind: 'neq', col, val }); return this }
  is(col: string, val: null) { this.filters.push({ kind: 'is', col, val }); return this }
  maybeSingle() { this.shape = 'maybe'; return this }
  single() { this.shape = 'single'; return this }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ kind, col, val }) => {
      const actual = row[col] ?? null
      if (kind === 'eq') return actual === val
      if (kind === 'is') return actual === val
      return actual !== null && actual !== val // SQL: NULL <> x is not true
    })
  }

  private result(list: Row[] | null): Result {
    if (list === null) return { data: null, error: null }
    const copies = list.map((r) => ({ ...r }))
    if (this.shape === 'many') return { data: copies, error: null }
    if (this.shape === 'maybe') {
      return copies.length > 1
        ? { data: null, error: { message: 'multiple rows returned' } }
        : { data: copies[0] ?? null, error: null }
    }
    return copies.length === 1
      ? { data: copies[0], error: null }
      : { data: null, error: { message: 'expected exactly one row' } }
  }

  private exec(): Result {
    const rows = this.db.tables[this.table]
    if (!rows) return { data: null, error: { message: `unknown table ${this.table}` } }

    if (this.op === 'insert') {
      const row: Row = { id: this.db.nextId(this.table), ...this.values }
      rows.push(row)
      return this.result(this.returning ? [row] : null)
    }

    const matched = rows.filter((r) => this.matches(r))
    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.values)
      return this.result(this.returning ? matched : null)
    }
    return this.result(matched)
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const HUB_ID = '11111111-1111-4111-8111-111111111111'
const DETAIL_ID = '22222222-2222-4222-8222-222222222222'
const PDF_URL = 'https://cdn.test/tl-invoice-pdfs/SINV_2026_10_0001.pdf'

const PAYMENT = {
  id: 'dibsy_pay_1',
  status: 'open',
  checkoutUrl: 'https://checkout.dibsy.test/pay/1',
  amount: { value: '70.00', currency: 'QAR' },
}

/** A `tl_invoices`-backed hub row that is pending, owes 70 of 100, and has a phone. */
function hubRow(overrides: Row = {}): Row {
  return {
    id: HUB_ID,
    detail_table: 'tl_invoices',
    detail_id: DETAIL_ID,
    invoice_id: 'SINV_2026_10_0001',
    customer_phone: '+97455512345',
    total_amount: 100,
    paid_amount: 30,
    payment_status: 'partially_paid',
    dispatch_status: 'pending',
    dispatch_error: null,
    dibsy_payment_id: null,
    dibsy_checkout_url: null,
    pdf_url: null,
    sent_at: null,
    ...overrides,
  }
}

const watiOk = (id = 'wamid.HBgM') => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ result: true, message: { whatsappMessageId: id } }),
})

const ORIG_ENV = { ...process.env }

describe('dispatchInvoice', () => {
  let db: FakeDb
  let fetchMock: Mock<(url: string, init: RequestInit) => Promise<unknown>>
  let renderPdf: Mock<(detailId: string) => Promise<string>>

  /** Put a hub row in the fake table and hand back the live object, so the test can inspect it after the call. */
  function seedHub(overrides: Row = {}): Row {
    const row = hubRow(overrides)
    db.tables.invoices.push(row)
    return row
  }

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    vi.mocked(createAdminClient).mockReturnValue(db as never)
    vi.mocked(createDibsyPayment).mockResolvedValue(PAYMENT)
    renderPdf = vi.fn<(detailId: string) => Promise<string>>().mockResolvedValue(PDF_URL)
    vi.mocked(pdfRendererFor).mockReturnValue(renderPdf)
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockResolvedValue(watiOk())
    vi.stubGlobal('fetch', fetchMock)

    process.env.WATI_API_URL = 'https://wati.test/' // trailing slash is stripped, as in create-tl-invoice
    process.env.WATI_API_TOKEN = 'wati-token'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env = { ...ORIG_ENV }
  })

  // ── The five behaviours the brief requires ──────────────────────────────────

  it('(a) pending + positive balance + phone: mints the pay link, WhatsApps the customer, marks the row sent', async () => {
    const hub = seedHub()

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })

    // Dibsy: exactly once, for the REMAINING balance (100 - 30), settling back to this hub row.
    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(createDibsyPayment).toHaveBeenCalledWith({
      amount: { value: '70.00', currency: 'QAR' },
      description: 'Invoice SINV_2026_10_0001',
      redirectUrl: `https://app.test/pay/${HUB_ID}`,
      webhookUrl: 'https://app.test/api/payments/dibsy/webhook',
      metadata: { hub_invoice_id: HUB_ID },
    })

    // WATI: exactly once, digits-only phone, the payment template, named params.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://wati.test/api/v2/sendTemplateMessage?whatsappNumber=97455512345')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer wati-token')
    const body = JSON.parse(init.body as string)
    expect(body.template_name).toBe('mms_tl_invoice_payment')
    expect(body.broadcast_name).toMatch(/^mms_tl_invoice_payment_SINV_2026_10_0001_\d+$/)
    expect(body.parameters).toEqual([
      { name: 'bookingnumber', value: 'SINV_2026_10_0001' },
      { name: 'total_amount', value: '100.00 QAR' },
      { name: 'due_amount', value: '70.00 QAR' },
      { name: 'url', value: HUB_ID },
    ])

    // The hub row carries everything the All-Invoices page and the webhook need.
    expect(hub).toMatchObject({
      dispatch_status: 'sent',
      dispatch_error: null,
      dibsy_payment_id: 'dibsy_pay_1',
      dibsy_checkout_url: PAYMENT.checkoutUrl,
      pdf_url: PDF_URL,
    })
    expect(typeof hub.sent_at).toBe('string')
    expect(Number.isNaN(Date.parse(hub.sent_at as string))).toBe(false)

    // Contact Centre sees what went out.
    expect(db.tables.chat_conversations).toHaveLength(1)
    expect(db.tables.chat_conversations[0]).toMatchObject({ wati_phone: '+97455512345' })
    expect(db.tables.chat_messages).toHaveLength(1)
    expect(db.tables.chat_messages[0]).toMatchObject({
      conversation_id: db.tables.chat_conversations[0].id,
      from_type: 'agent',
      source: 'whatsapp_api',
      agent_name: 'System',
      delivery_status: 'sent',
      external_id: 'wati_wamid.HBgM',
    })
    expect(String(db.tables.chat_messages[0].text)).toContain(PAYMENT.checkoutUrl)
  })

  it('(b) a second call is a no-op: one link, one message, one render', async () => {
    seedHub()

    const first = await dispatchInvoice(HUB_ID)
    const second = await dispatchInvoice(HUB_ID)

    expect(first.status).toBe('sent')
    expect(second).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(renderPdf).toHaveBeenCalledTimes(1)
    expect(db.tables.chat_messages).toHaveLength(1)
  })

  it('(b) a row that is already sent is returned untouched, even if its balance has since moved', async () => {
    const hub = seedHub({
      dispatch_status: 'sent',
      sent_at: '2026-10-19T10:00:00.000Z',
      dibsy_payment_id: 'dibsy_old',
      dibsy_checkout_url: 'https://checkout.dibsy.test/pay/old',
    })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: 'https://checkout.dibsy.test/pay/old' })
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(renderPdf).not.toHaveBeenCalled()
    expect(hub.sent_at).toBe('2026-10-19T10:00:00.000Z')
  })

  it.each([
    ['fully paid', 100, 100],
    ['over-paid', 100, 120],
    ['zero-total', 0, 0],
    ['sub-fils remainder', 100.004, 100],
    ['null amounts', null, null],
  ])('(c) skips a %s invoice: no Dibsy link, no PDF, no WhatsApp', async (_label, total, paid) => {
    const hub = seedHub({ total_amount: total, paid_amount: paid, payment_status: 'unpaid' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'skipped' })
    expect(hub.dispatch_status).toBe('skipped')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(renderPdf).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('(d) no customer phone: still mints the link and counts as sent, but sends no WhatsApp', async () => {
    const hub = seedHub({ customer_phone: null })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.tables.chat_messages).toHaveLength(0)
    expect(hub).toMatchObject({ dispatch_status: 'sent', dibsy_checkout_url: PAYMENT.checkoutUrl })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no customer_phone'), HUB_ID)
  })

  it('(d) a phone with no digits in it is treated as no phone', async () => {
    seedHub({ customer_phone: ' - ' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('sent')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('(e) Dibsy throws: row is failed with the message, nothing is sent', async () => {
    const hub = seedHub()
    vi.mocked(createDibsyPayment).mockRejectedValue(new Error('Dibsy API error 502: bad gateway'))

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'failed', error: 'Dibsy API error 502: bad gateway' })
    expect(hub).toMatchObject({
      dispatch_status: 'failed',
      dispatch_error: 'Dibsy API error 502: bad gateway',
      sent_at: null,
      dibsy_checkout_url: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.tables.chat_messages).toHaveLength(0)
  })

  // ── Skip gates beyond a zero balance ────────────────────────────────────────

  it.each(['void', 'paid'])('skips a %s invoice even when the amounts still say money is owed', async (paymentStatus) => {
    const hub = seedHub({ payment_status: paymentStatus }) // 100 total, 30 paid

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'skipped' })
    expect(hub.dispatch_status).toBe('skipped')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still dispatches an overdue invoice', async () => {
    seedHub({ payment_status: 'overdue' })

    expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
  })

  it('a successful dispatch clears the error left by an earlier failed attempt', async () => {
    const hub = seedHub({ dispatch_status: 'failed', dispatch_error: 'Dibsy API error 502' })

    expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
    expect(hub).toMatchObject({ dispatch_status: 'sent', dispatch_error: null })
  })

  it('a skip clears the error left by an earlier failed attempt', async () => {
    const hub = seedHub({ dispatch_status: 'failed', dispatch_error: 'Dibsy API error 502', payment_status: 'paid' })

    expect((await dispatchInvoice(HUB_ID)).status).toBe('skipped')
    expect(hub).toMatchObject({ dispatch_status: 'skipped', dispatch_error: null })
  })

  describe('sales invoices (so_invoices)', () => {
    const SO = { detail_table: 'so_invoices', detail_id: 'so-invoice-1', invoice_id: 'INV-00001' }

    it('skips while the sales invoice is still a draft', async () => {
      const hub = seedHub(SO)
      db.tables.so_invoices.push({ id: 'so-invoice-1', status: 'draft' })

      const result = await dispatchInvoice(HUB_ID)

      expect(result).toEqual({ status: 'skipped' })
      expect(hub.dispatch_status).toBe('skipped')
      expect(createDibsyPayment).not.toHaveBeenCalled()
      expect(renderPdf).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('dispatches once the sales invoice is no longer a draft, rendering it with the sales renderer', async () => {
      const hub = seedHub(SO)
      db.tables.so_invoices.push({ id: 'so-invoice-1', status: 'sent' })

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('sent')
      expect(pdfRendererFor).toHaveBeenCalledWith('sales')
      expect(renderPdf).toHaveBeenCalledWith('so-invoice-1')
      expect(hub.dispatch_status).toBe('sent')
    })

    it('re-evaluates a row that was skipped as a draft (skipped is not terminal)', async () => {
      const hub = seedHub({ ...SO, dispatch_status: 'skipped' })
      db.tables.so_invoices.push({ id: 'so-invoice-1', status: 'sent' })

      expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
      expect(hub.dispatch_status).toBe('sent')
    })

    it('fails closed, sending nothing, when the sales invoice row no longer exists', async () => {
      const hub = seedHub(SO)

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('not found')
      expect(hub.dispatch_status).toBe('failed')
      expect(createDibsyPayment).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  // ── The PDF step ────────────────────────────────────────────────────────────

  it('renders the PDF with the renderer for the invoice kind and stores its url on the hub row', async () => {
    const hub = seedHub()

    await dispatchInvoice(HUB_ID)

    expect(pdfRendererFor).toHaveBeenCalledWith('service')
    expect(renderPdf).toHaveBeenCalledTimes(1)
    expect(renderPdf).toHaveBeenCalledWith(DETAIL_ID)
    expect(hub.pdf_url).toBe(PDF_URL)
  })

  it('keeps an existing PDF instead of rendering again', async () => {
    const hub = seedHub({ pdf_url: 'https://cdn.test/already.pdf' })

    expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
    expect(renderPdf).not.toHaveBeenCalled()
    expect(hub.pdf_url).toBe('https://cdn.test/already.pdf')
  })

  it('fails without creating a link or sending anything when the PDF cannot be rendered', async () => {
    const hub = seedHub()
    renderPdf.mockRejectedValue(new Error('TL invoice not found: gone'))

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'failed', error: 'TL invoice not found: gone' })
    expect(hub.dispatch_status).toBe('failed')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── The Dibsy link ──────────────────────────────────────────────────────────

  it('reuses a Dibsy link that is already on the hub row instead of creating a second one', async () => {
    const hub = seedHub({ dibsy_payment_id: 'dibsy_old', dibsy_checkout_url: 'https://checkout.dibsy.test/pay/old' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: 'https://checkout.dibsy.test/pay/old' })
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(hub.dibsy_payment_id).toBe('dibsy_old')
    expect(String(db.tables.chat_messages[0].text)).toContain('https://checkout.dibsy.test/pay/old')
  })

  it('creates a fresh link for the new remaining balance once the trigger has cleared a stale one', async () => {
    // Amount edited 100 -> 150 after the first dispatch: the sync trigger nulls the link and re-pends the row.
    seedHub({ total_amount: 150, paid_amount: 30, dibsy_payment_id: null, dibsy_checkout_url: null })

    await dispatchInvoice(HUB_ID)

    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createDibsyPayment).mock.calls[0][0].amount).toEqual({ value: '120.00', currency: 'QAR' })
  })

  it('fails, storing and sending nothing, when Dibsy returns no checkout url', async () => {
    const hub = seedHub()
    vi.mocked(createDibsyPayment).mockResolvedValue({ ...PAYMENT, checkoutUrl: '' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('checkout')
    expect(hub).toMatchObject({ dispatch_status: 'failed', dibsy_checkout_url: null, dibsy_payment_id: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('converges on the link an overlapping dispatch stored first, and never overwrites it', async () => {
    const hub = seedHub()
    vi.mocked(createDibsyPayment).mockImplementation(async () => {
      // Another dispatch of the same row stores its link while ours is still being created.
      hub.dibsy_payment_id = 'dibsy_winner'
      hub.dibsy_checkout_url = 'https://checkout.dibsy.test/pay/winner'
      return PAYMENT
    })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: 'https://checkout.dibsy.test/pay/winner' })
    expect(hub.dibsy_payment_id).toBe('dibsy_winner')
    expect(hub.dibsy_checkout_url).toBe('https://checkout.dibsy.test/pay/winner')
    expect(String(db.tables.chat_messages[0].text)).toContain('https://checkout.dibsy.test/pay/winner')
  })

  // ── The WhatsApp step ───────────────────────────────────────────────────────

  it.each([
    ['an HTTP error', { ok: false, status: 500, text: async () => 'upstream exploded' }],
    ['result:false in a 200', { ok: true, status: 200, text: async () => JSON.stringify({ result: false, info: 'Template not found' }) }],
  ])('a WATI failure (%s) leaves the row failed with the link stored; the retry reuses the link and re-sends', async (_label, failure) => {
    const hub = seedHub()
    fetchMock.mockResolvedValueOnce(failure)

    const failed = await dispatchInvoice(HUB_ID)

    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('WATI')
    expect(hub).toMatchObject({
      dispatch_status: 'failed',
      sent_at: null,
      dibsy_payment_id: 'dibsy_pay_1',
      dibsy_checkout_url: PAYMENT.checkoutUrl,
    })
    expect(db.tables.chat_messages).toHaveLength(0)

    const retried = await dispatchInvoice(HUB_ID)

    expect(retried).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
    expect(createDibsyPayment).toHaveBeenCalledTimes(1) // same link, not a second one
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(hub).toMatchObject({ dispatch_status: 'sent', dispatch_error: null })
    expect(db.tables.chat_messages).toHaveLength(1)
  })

  it('fails with a clear message, not a malformed-url error, when WATI is not configured', async () => {
    const hub = seedHub()
    delete process.env.WATI_API_TOKEN

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('WATI_API')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hub.dispatch_status).toBe('failed')
  })

  it('a chat-log failure after a delivered message does not turn the dispatch into a failure', async () => {
    const hub = seedHub()
    const realFrom = db.from.bind(db)
    db.from = (table: string) => {
      if (table === 'chat_conversations') throw new Error('chat store is down')
      return realFrom(table)
    }

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('sent') // retrying would send the customer a duplicate
    expect(hub.dispatch_status).toBe('sent')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // ── Guards ──────────────────────────────────────────────────────────────────

  it('never downgrades a row that an overlapping dispatch already marked sent (failure path)', async () => {
    const hub = seedHub()
    vi.mocked(createDibsyPayment).mockImplementation(async () => {
      hub.dispatch_status = 'sent' // the other dispatch finished while this one was calling Dibsy
      throw new Error('Dibsy API error 500: boom')
    })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(hub.dispatch_status).toBe('sent')
  })

  it('never downgrades a row that an overlapping dispatch already marked sent (skip path)', async () => {
    const hub = seedHub({ detail_table: 'so_invoices', detail_id: 'so-invoice-1' })
    db.tables.so_invoices.push({ id: 'so-invoice-1', status: 'draft' })
    const realFrom = db.from.bind(db)
    db.from = (table: string) => {
      if (table === 'so_invoices') hub.dispatch_status = 'sent' // the other dispatch finishes during the draft lookup
      return realFrom(table)
    }

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('skipped')
    expect(hub.dispatch_status).toBe('sent')
  })

  it('rejects a detail table with no registered renderer before any side effect, even when a pdf already exists', async () => {
    const hub = seedHub({ detail_table: 'supplier_bills', pdf_url: 'https://cdn.test/bill.pdf' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('unknown detail_table')
    expect(hub.dispatch_status).toBe('failed')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns failed, writing nothing, when the hub row does not exist', async () => {
    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('not found')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails, sending nothing, for a row with no detail key (not a hub-managed customer invoice)', async () => {
    const hub = seedHub({ detail_table: null, detail_id: null })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(hub.dispatch_status).toBe('failed')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns failed instead of throwing when the admin client cannot be created', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    })

    await expect(dispatchInvoice(HUB_ID)).resolves.toEqual({
      status: 'failed',
      error: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    })
  })
})
