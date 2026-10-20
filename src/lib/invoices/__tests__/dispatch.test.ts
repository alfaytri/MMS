import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// Everything with a side effect outside this module is replaced: the admin client
// refuses to load in a jsdom window, the registry drags in puppeteer, and Dibsy / the
// WhatsApp template send are real pay links and real WhatsApps.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/dibsy', () => ({ createDibsyPayment: vi.fn() }))
vi.mock('@/lib/invoices/pdf-registry', () => ({ pdfRendererFor: vi.fn() }))
vi.mock('@/lib/notifications/sendWatiTemplate', () => ({ sendWatiTemplate: vi.fn() }))

import { dispatchInvoice } from '../dispatch'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'
import { pdfRendererFor } from '@/lib/invoices/pdf-registry'
import {
  sendWatiTemplate,
  type SendWatiTemplateArgs,
  type SendWatiTemplateResult,
} from '@/lib/notifications/sendWatiTemplate'

// ─── In-memory stand-in for the Supabase admin client ───────────────────────────
// Just enough of the query builder (select with column projection / insert / update /
// eq / neq / is / maybeSingle / single, awaitable) over plain arrays, so the tests
// assert on the resulting hub row instead of on the shape of the calls. Projection is
// real, like PostgREST's: a column the dispatcher forgets to select comes back undefined.
//
// The chat tables are here only to prove the dispatcher never writes them itself: the
// WhatsApp goes out through sendWatiTemplate, and that helper owns the Contact Centre log.

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
  private columns: string[] | null = null
  private shape: 'many' | 'maybe' | 'single' = 'many'

  constructor(private db: FakeDb, private table: string) {}

  select(columns?: string) {
    this.returning = true
    this.columns = columns && columns.trim() !== '*' ? columns.split(',').map((c) => c.trim()) : null
    return this
  }
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

  private project(row: Row): Row {
    const cols = this.columns
    return cols ? Object.fromEntries(cols.map((c) => [c, row[c]])) : { ...row }
  }

  private result(list: Row[] | null): Result {
    if (list === null) return { data: null, error: null }
    const copies = list.map((r) => this.project(r))
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
const CUSTOMER_NAME = 'Test Customer'
const CRON_SECRET = 'cron-secret'

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
    customer_name: CUSTOMER_NAME,
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

  /** The arguments of the ONE WhatsApp the dispatcher handed to sendWatiTemplate (fails if there was not exactly one). */
  function whatsApp(): SendWatiTemplateArgs {
    expect(sendWatiTemplate).toHaveBeenCalledTimes(1)
    return vi.mocked(sendWatiTemplate).mock.calls[0][0]
  }

  /** One named WATI template parameter of the WhatsApp. */
  const watiParam = (name: string) => whatsApp().params.find((p) => p.name === name)?.value

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    vi.mocked(createAdminClient).mockReturnValue(db as never)
    vi.mocked(createDibsyPayment).mockResolvedValue(PAYMENT)
    renderPdf = vi.fn<(detailId: string) => Promise<string>>().mockResolvedValue(PDF_URL)
    vi.mocked(pdfRendererFor).mockReturnValue(renderPdf)
    // mockReset (not just clear): a leftover once-value must never leak into the next test.
    vi.mocked(sendWatiTemplate).mockReset()
    vi.mocked(sendWatiTemplate).mockResolvedValue({ ok: true, watiMsgId: 'wamid.HBgM' })
    // Tripwire: the dispatcher must never call WATI (or anything) over HTTP itself any more.
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockRejectedValue(new Error('dispatch.ts must not call fetch directly - the WhatsApp goes through sendWatiTemplate'))
    vi.stubGlobal('fetch', fetchMock)

    // The direct-WATI credentials are gone from the dispatcher: prove it does not need them.
    delete process.env.WATI_API_URL
    delete process.env.WATI_API_TOKEN
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
    process.env.CRON_SECRET = CRON_SECRET
    // The dev redirect is off unless a test turns it on - even if the developer's shell has it set.
    delete process.env.INVOICE_DISPATCH_TEST_NUMBER

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env = { ...ORIG_ENV }
  })

  // ── The five behaviours the brief requires ──────────────────────────────────

  it('(a) pending + positive balance + phone: mints the pay link, WhatsApps the customer via the order_invoice template, marks the row sent', async () => {
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

    // WhatsApp: exactly once, through the shared order_invoice send (the same one the manual invoice send uses):
    // digits-only phone, the PDF, the six named params, the live /pay/{hubId} link, and the cron secret (no user session).
    expect(whatsApp()).toStrictEqual({
      slug: 'order_invoice',
      phone: '97455512345',
      pdfUrl: PDF_URL,
      attachmentName: 'SINV_2026_10_0001.pdf',
      cronSecret: CRON_SECRET,
      params: [
        { name: 'invoice_number', value: 'SINV_2026_10_0001' },
        { name: 'customer_name', value: CUSTOMER_NAME },
        { name: 'total', value: '100.00' },
        { name: 'paid', value: '30.00' },
        { name: 'pending', value: '70.00' },
        { name: 'pay_link', value: `https://app.test/pay/${HUB_ID}` },
      ],
      renderedText: expect.any(String),
    })

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

    // Nothing but sendWatiTemplate talks to WATI, and it alone writes the Contact Centre log (no second, duplicate log).
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.tables.chat_conversations).toHaveLength(0)
    expect(db.tables.chat_messages).toHaveLength(0)
  })

  it('(b) a second call is a no-op: one link, one message, one render', async () => {
    seedHub()

    const first = await dispatchInvoice(HUB_ID)
    const second = await dispatchInvoice(HUB_ID)

    expect(first.status).toBe('sent')
    expect(second).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(sendWatiTemplate).toHaveBeenCalledTimes(1)
    expect(renderPdf).toHaveBeenCalledTimes(1)
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
    expect(sendWatiTemplate).not.toHaveBeenCalled()
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
    expect(sendWatiTemplate).not.toHaveBeenCalled()
  })

  it('(d) no customer phone: still mints the link and counts as sent, but sends no WhatsApp', async () => {
    const hub = seedHub({ customer_phone: null })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(sendWatiTemplate).not.toHaveBeenCalled()
    expect(hub).toMatchObject({ dispatch_status: 'sent', dibsy_checkout_url: PAYMENT.checkoutUrl })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no customer_phone'), HUB_ID)
  })

  it('(d) a phone with no digits in it is treated as no phone', async () => {
    seedHub({ customer_phone: ' - ' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('sent')
    expect(sendWatiTemplate).not.toHaveBeenCalled()
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
    expect(sendWatiTemplate).not.toHaveBeenCalled()
    expect(db.tables.chat_messages).toHaveLength(0)
  })

  // ── Skip gates beyond a zero balance ────────────────────────────────────────

  it.each(['void', 'paid'])('skips a %s invoice even when the amounts still say money is owed', async (paymentStatus) => {
    const hub = seedHub({ payment_status: paymentStatus }) // 100 total, 30 paid

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'skipped' })
    expect(hub.dispatch_status).toBe('skipped')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(sendWatiTemplate).not.toHaveBeenCalled()
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
      expect(sendWatiTemplate).not.toHaveBeenCalled()
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
      expect(sendWatiTemplate).not.toHaveBeenCalled()
    })
  })

  // ── The PDF step ────────────────────────────────────────────────────────────

  it('renders the PDF with the renderer for the invoice kind, stores its url on the hub row and attaches it to the WhatsApp', async () => {
    const hub = seedHub()

    await dispatchInvoice(HUB_ID)

    expect(pdfRendererFor).toHaveBeenCalledWith('service')
    expect(renderPdf).toHaveBeenCalledTimes(1)
    expect(renderPdf).toHaveBeenCalledWith(DETAIL_ID)
    expect(hub.pdf_url).toBe(PDF_URL)
    // The row was loaded BEFORE the render, so this is the freshly rendered url, not the stale null.
    expect(whatsApp().pdfUrl).toBe(PDF_URL)
  })

  it('keeps an existing PDF instead of rendering again, and attaches that one', async () => {
    const hub = seedHub({ pdf_url: 'https://cdn.test/already.pdf' })

    expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
    expect(renderPdf).not.toHaveBeenCalled()
    expect(hub.pdf_url).toBe('https://cdn.test/already.pdf')
    expect(whatsApp().pdfUrl).toBe('https://cdn.test/already.pdf')
  })

  it('never hands the send an empty PDF url: no PDF means null, not an empty string', async () => {
    seedHub()
    renderPdf.mockResolvedValue('')

    expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
    expect(whatsApp().pdfUrl).toBeNull()
  })

  it('fails without creating a link or sending anything when the PDF cannot be rendered', async () => {
    const hub = seedHub()
    renderPdf.mockRejectedValue(new Error('TL invoice not found: gone'))

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'failed', error: 'TL invoice not found: gone' })
    expect(hub.dispatch_status).toBe('failed')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(sendWatiTemplate).not.toHaveBeenCalled()
  })

  // ── The Dibsy link ──────────────────────────────────────────────────────────

  it('reuses a Dibsy link that is already on the hub row instead of creating a second one', async () => {
    const hub = seedHub({ dibsy_payment_id: 'dibsy_old', dibsy_checkout_url: 'https://checkout.dibsy.test/pay/old' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent', checkoutUrl: 'https://checkout.dibsy.test/pay/old' })
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(hub.dibsy_payment_id).toBe('dibsy_old')
    // The customer is sent the live portal link, which redirects to the stored checkout.
    expect(watiParam('pay_link')).toBe(`https://app.test/pay/${HUB_ID}`)
  })

  it('creates a fresh link for the new remaining balance once the trigger has cleared a stale one', async () => {
    // Amount edited 100 -> 150 after the first dispatch: the sync trigger nulls the link and re-pends the row.
    seedHub({ total_amount: 150, paid_amount: 30, dibsy_payment_id: null, dibsy_checkout_url: null })

    await dispatchInvoice(HUB_ID)

    expect(createDibsyPayment).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createDibsyPayment).mock.calls[0][0].amount).toEqual({ value: '120.00', currency: 'QAR' })
    expect(watiParam('pending')).toBe('120.00')
  })

  it('fails, storing and sending nothing, when Dibsy returns no checkout url', async () => {
    const hub = seedHub()
    vi.mocked(createDibsyPayment).mockResolvedValue({ ...PAYMENT, checkoutUrl: '' })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('checkout')
    expect(hub).toMatchObject({ dispatch_status: 'failed', dibsy_checkout_url: null, dibsy_payment_id: null })
    expect(sendWatiTemplate).not.toHaveBeenCalled()
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
    expect(sendWatiTemplate).toHaveBeenCalledTimes(1)
  })

  it('fails, sending nothing, when the row changes under it and no link can be found (the hub row vanished mid-dispatch)', async () => {
    seedHub()
    vi.mocked(createDibsyPayment).mockImplementation(async () => {
      db.tables.invoices.length = 0 // the hub row was deleted while the Dibsy payment was being created
      return PAYMENT
    })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('the row changed during dispatch')
    expect(sendWatiTemplate).not.toHaveBeenCalled()
  })

  it('has the link and the PDF stored on the hub row BEFORE the WhatsApp goes out (the pay page redirects to the stored link)', async () => {
    const hub = seedHub()
    let rowWhenSent: Row | null = null
    vi.mocked(sendWatiTemplate).mockImplementation(async () => {
      rowWhenSent = { ...hub }
      return { ok: true, watiMsgId: 'wamid.HBgM' }
    })

    await dispatchInvoice(HUB_ID)

    expect(rowWhenSent).toMatchObject({
      dibsy_payment_id: 'dibsy_pay_1',
      dibsy_checkout_url: PAYMENT.checkoutUrl,
      pdf_url: PDF_URL,
      dispatch_status: 'pending', // not yet stamped sent: a send that fails afterwards is retried
    })
  })

  // ── The WhatsApp step: the order_invoice template via sendWatiTemplate ───────

  describe('the order_invoice WhatsApp (sendWatiTemplate)', () => {
    it('is sent through the shared helper only: no direct WATI call, no WATI credentials, no chat write of its own', async () => {
      seedHub()
      expect(process.env.WATI_API_URL).toBeUndefined()
      expect(process.env.WATI_API_TOKEN).toBeUndefined()

      expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')

      expect(whatsApp().slug).toBe('order_invoice') // the template the admin assigns - never a template name hardcoded here
      expect(fetchMock).not.toHaveBeenCalled()
      expect(db.tables.chat_conversations).toHaveLength(0)
      expect(db.tables.chat_messages).toHaveLength(0)
    })

    it('uses the cron secret, not a user session', async () => {
      seedHub()

      await dispatchInvoice(HUB_ID)

      expect(whatsApp().cronSecret).toBe(CRON_SECRET)
      expect(whatsApp()).not.toHaveProperty('userToken')
    })

    it('passes a null cron secret when CRON_SECRET is not set (the send then fails visibly instead of the dispatcher guessing)', async () => {
      delete process.env.CRON_SECRET
      seedHub()

      await dispatchInvoice(HUB_ID)

      expect(whatsApp().cronSecret).toBeNull()
    })

    it('carries the live /pay/{hubId} link - not the fixed-amount Dibsy checkout - in the param and in the message', async () => {
      seedHub()

      await dispatchInvoice(HUB_ID)

      const payLink = `https://app.test/pay/${HUB_ID}`
      expect(watiParam('pay_link')).toBe(payLink)
      expect(whatsApp().renderedText).toContain(payLink)
      expect(JSON.stringify(whatsApp())).not.toContain('checkout.dibsy.test')
    })

    it('builds the pay link on the same app url as the Dibsy redirect, with a trailing slash stripped', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.test/'
      seedHub()

      await dispatchInvoice(HUB_ID)

      expect(watiParam('pay_link')).toBe(`https://app.test/pay/${HUB_ID}`)
      expect(vi.mocked(createDibsyPayment).mock.calls[0][0].redirectUrl).toBe(`https://app.test/pay/${HUB_ID}`)
    })

    it('falls back to the production app url for the pay link when NEXT_PUBLIC_APP_URL is unset', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL
      seedHub()

      await dispatchInvoice(HUB_ID)

      expect(watiParam('pay_link')).toBe(`https://mms.alfaytri.com/pay/${HUB_ID}`)
      expect(vi.mocked(createDibsyPayment).mock.calls[0][0].redirectUrl).toBe(`https://mms.alfaytri.com/pay/${HUB_ID}`)
    })

    it('formats the money like the manual invoice send: en-QA, always 2 decimals, thousands separated, remaining = total - paid', async () => {
      seedHub({ total_amount: 1234.5, paid_amount: 200 })

      await dispatchInvoice(HUB_ID)

      expect(watiParam('total')).toBe('1,234.50')
      expect(watiParam('paid')).toBe('200.00')
      expect(watiParam('pending')).toBe('1,034.50')
    })

    it('shows an unpaid invoice as paid 0.00 and the whole total as pending', async () => {
      seedHub({ total_amount: 100, paid_amount: null, payment_status: 'unpaid' })

      await dispatchInvoice(HUB_ID)

      expect(watiParam('paid')).toBe('0.00')
      expect(watiParam('pending')).toBe('100.00')
    })

    it('the human-readable message mirrors the manual invoice send: invoice, customer, total / paid / pending, pay link', async () => {
      seedHub()

      await dispatchInvoice(HUB_ID)

      expect(whatsApp().renderedText).toBe(
        [
          'فاتورة رقم SINV_2026_10_0001',
          `عزيزنا ${CUSTOMER_NAME}`,
          'إجمالي الفاتورة: 100.00 ر.ق',
          'المدفوع: 30.00 ر.ق',
          'المتبقي: 70.00 ر.ق',
          `للدفع إلكترونياً: https://app.test/pay/${HUB_ID}`,
        ].join('\n'),
      )
    })

    it.each([
      ['no name on the invoice', null],
      ['a blank name', '   '],
    ])('%s: the name param is "-" and the message has no greeting line', async (_label, name) => {
      seedHub({ customer_name: name })

      await dispatchInvoice(HUB_ID)

      expect(watiParam('customer_name')).toBe('-')
      expect(whatsApp().renderedText).not.toContain('عزيزنا')
    })

    it('trims the customer name', async () => {
      seedHub({ customer_name: '  Sara Customer  ' })

      await dispatchInvoice(HUB_ID)

      expect(watiParam('customer_name')).toBe('Sara Customer')
      expect(whatsApp().renderedText).toContain('عزيزنا Sara Customer\n')
    })

    it.each([
      ['SINV_2026_10_0001', 'SINV_2026_10_0001.pdf'],
      ['INV-00001', 'INV-00001.pdf'],
      ['INV/2026 10#7', 'INV_2026_10_7.pdf'],
    ])('names the attachment from the invoice number, sanitised: %s -> %s', async (invoiceId, expected) => {
      seedHub({ invoice_id: invoiceId })

      await dispatchInvoice(HUB_ID)

      expect(whatsApp().attachmentName).toBe(expected)
      expect(watiParam('invoice_number')).toBe(invoiceId) // the param keeps the real number
    })

    it('hands the helper the digits of the customer phone, whatever its formatting', async () => {
      seedHub({ customer_phone: '+974 5551-2345' })

      await dispatchInvoice(HUB_ID)

      expect(whatsApp().phone).toBe('97455512345')
    })
  })

  // ── How the helper's answer maps to the dispatch outcome ─────────────────────

  describe('the WhatsApp outcome', () => {
    type Skipped = Extract<SendWatiTemplateResult, { skipped: string }>['skipped']
    const unusable: Array<[Skipped, string]> = [
      ['unassigned', 'not assigned'],
      ['config-missing', 'not configured'],
      ['inactive', 'inactive'],
    ]

    it.each(unusable)(
      "{ skipped: '%s' } fails the dispatch with a clear error (never counted as sent); once the admin fixes it, the retry sends with the same link",
      async (reason, phrase) => {
        const hub = seedHub()
        vi.mocked(sendWatiTemplate).mockResolvedValueOnce({ skipped: reason })

        const failed = await dispatchInvoice(HUB_ID)

        expect(failed.status).toBe('failed')
        expect(failed.error).toContain('order_invoice')
        expect(failed.error).toContain(phrase)
        expect(failed.error).toContain('Services → Notifications')
        expect(hub).toMatchObject({
          dispatch_status: 'failed',
          dispatch_error: failed.error,
          sent_at: null,
          dibsy_payment_id: 'dibsy_pay_1',
          dibsy_checkout_url: PAYMENT.checkoutUrl,
        })

        const retried = await dispatchInvoice(HUB_ID)

        expect(retried).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
        expect(createDibsyPayment).toHaveBeenCalledTimes(1) // same link, not a second one
        expect(renderPdf).toHaveBeenCalledTimes(1) // same PDF, not a second render
        expect(sendWatiTemplate).toHaveBeenCalledTimes(2)
        expect(vi.mocked(sendWatiTemplate).mock.calls[1][0].pdfUrl).toBe(PDF_URL) // the stored PDF is attached on the retry
        expect(hub).toMatchObject({ dispatch_status: 'sent', dispatch_error: null })
      },
    )

    it('names the problem for an unassigned template exactly where the admin fixes it', async () => {
      seedHub()
      vi.mocked(sendWatiTemplate).mockResolvedValueOnce({ skipped: 'unassigned' })

      const failed = await dispatchInvoice(HUB_ID)

      expect(failed.error).toBe('order_invoice WATI template not assigned (Services → Notifications)')
    })

    it('an unrecognised skip reason fails closed rather than counting as sent', async () => {
      const hub = seedHub()
      vi.mocked(sendWatiTemplate).mockResolvedValueOnce({ skipped: 'something-new' } as never)

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('something-new')
      expect(hub.dispatch_status).toBe('failed')
    })

    it.each([
      ['an edge-function HTTP error', 'HTTP 502: bad gateway'],
      ['a WATI-level rejection', 'Template not found'],
    ])('a failed send (%s) leaves the row failed with the link stored; the retry reuses the link and re-sends', async (_label, error) => {
      const hub = seedHub()
      vi.mocked(sendWatiTemplate).mockResolvedValueOnce({ ok: false, error })

      const failed = await dispatchInvoice(HUB_ID)

      expect(failed.status).toBe('failed')
      expect(failed.error).toContain('WATI')
      expect(failed.error).toContain(error)
      expect(hub).toMatchObject({
        dispatch_status: 'failed',
        dispatch_error: failed.error,
        sent_at: null,
        dibsy_payment_id: 'dibsy_pay_1',
        dibsy_checkout_url: PAYMENT.checkoutUrl,
      })

      const retried = await dispatchInvoice(HUB_ID)

      expect(retried).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
      expect(createDibsyPayment).toHaveBeenCalledTimes(1) // same link, not a second one
      expect(sendWatiTemplate).toHaveBeenCalledTimes(2)
      expect(hub).toMatchObject({ dispatch_status: 'sent', dispatch_error: null })
    })

    it('a send that throws is recorded as failed, never thrown out of dispatchInvoice', async () => {
      const hub = seedHub()
      vi.mocked(sendWatiTemplate).mockRejectedValueOnce(new Error('supabaseUrl is required.'))

      const result = await dispatchInvoice(HUB_ID)

      expect(result).toEqual({ status: 'failed', error: 'supabaseUrl is required.' })
      expect(hub).toMatchObject({ dispatch_status: 'failed', dispatch_error: 'supabaseUrl is required.', sent_at: null })
    })

    it("a helper-side { skipped: 'no-phone' } (cannot happen once the dispatcher has a phone) is handled like the no-phone path: no send, no failure", async () => {
      const hub = seedHub()
      vi.mocked(sendWatiTemplate).mockResolvedValueOnce({ skipped: 'no-phone' })

      const result = await dispatchInvoice(HUB_ID)

      expect(result).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
      expect(hub).toMatchObject({ dispatch_status: 'sent', dispatch_error: null })
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no usable phone'), HUB_ID)
    })

    it('never downgrades a row that an overlapping dispatch already marked sent (WhatsApp failure path)', async () => {
      const hub = seedHub()
      vi.mocked(sendWatiTemplate).mockImplementation(async () => {
        hub.dispatch_status = 'sent' // the other dispatch finished while this one was sending
        return { ok: false, error: 'HTTP 500: boom' }
      })

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(hub.dispatch_status).toBe('sent')
    })
  })

  // ── The dev test-number redirect (INVOICE_DISPATCH_TEST_NUMBER) ──────────────────
  // With the variable set, every WhatsApp goes to that number instead of the customer's, so a dev
  // live-send test can never reach a real customer. It changes WHERE a message goes, never WHETHER one is sent.

  describe('dev test-number redirect (INVOICE_DISPATCH_TEST_NUMBER)', () => {
    const TEST_NUMBER = '+974 7770 0001' // formatted on purpose: only its digits are used
    const TEST_DIGITS = '97477700001'
    const CUSTOMER_DIGITS = '97455512345' // hubRow's customer_phone is '+97455512345'

    it('WhatsApps the test number (digits only) instead of the customer', async () => {
      process.env.INVOICE_DISPATCH_TEST_NUMBER = TEST_NUMBER
      const hub = seedHub()

      const result = await dispatchInvoice(HUB_ID)

      expect(result).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
      expect(whatsApp().phone).toBe(TEST_DIGITS) // and not the customer's number
      expect(whatsApp().slug).toBe('order_invoice') // same template, same params: only the destination moves
      expect(hub.dispatch_status).toBe('sent')
    })

    it("hands nothing of the customer's number to the send, so nothing is logged under it and nothing reaches them", async () => {
      process.env.INVOICE_DISPATCH_TEST_NUMBER = TEST_NUMBER
      seedHub()

      await dispatchInvoice(HUB_ID)

      // sendWatiTemplate logs the message in Contact Centre under the number it is given. The customer never
      // received this one, so their number must not appear anywhere in what the dispatcher hands over...
      expect(JSON.stringify(vi.mocked(sendWatiTemplate).mock.calls)).not.toContain(CUSTOMER_DIGITS)
      // ...and the dispatcher logs nothing under it either.
      expect(db.tables.chat_conversations).toHaveLength(0)
      expect(db.tables.chat_messages).toHaveLength(0)
    })

    it('warns that a dev redirect happened and names the hub invoice, without writing either number to the log', async () => {
      process.env.INVOICE_DISPATCH_TEST_NUMBER = TEST_NUMBER
      seedHub()

      await dispatchInvoice(HUB_ID)

      const warned = vi.mocked(console.warn).mock.calls.map((args) => args.join(' ')).join('\n')
      expect(warned).toMatch(/redirect/i)
      expect(warned).toMatch(/overrid/i)
      expect(warned).toContain(HUB_ID)
      expect(warned).not.toContain(CUSTOMER_DIGITS)
      expect(warned).not.toContain(TEST_DIGITS)
    })

    it.each([
      ['unset', undefined],
      ['empty', ''],
    ])('is off when the variable is %s: the customer is messaged and nothing is warned', async (_label, value) => {
      if (value === undefined) delete process.env.INVOICE_DISPATCH_TEST_NUMBER
      else process.env.INVOICE_DISPATCH_TEST_NUMBER = value
      seedHub()

      await dispatchInvoice(HUB_ID)

      expect(whatsApp().phone).toBe(CUSTOMER_DIGITS)
      expect(console.warn).not.toHaveBeenCalled()
    })

    it.each(['not a number', '+', '   '])(
      'fails closed when the variable is set to %j (no digits): nothing is sent, and it never falls back to the customer',
      async (value) => {
        process.env.INVOICE_DISPATCH_TEST_NUMBER = value
        const hub = seedHub()

        const result = await dispatchInvoice(HUB_ID)

        expect(result.status).toBe('failed')
        expect(result.error).toContain('INVOICE_DISPATCH_TEST_NUMBER')
        expect(hub.dispatch_status).toBe('failed')
        expect(sendWatiTemplate).not.toHaveBeenCalled()
        expect(db.tables.chat_messages).toHaveLength(0)
      },
    )

    it('only redirects a message that would have been sent: a row with no customer phone still sends nothing', async () => {
      process.env.INVOICE_DISPATCH_TEST_NUMBER = TEST_NUMBER
      const hub = seedHub({ customer_phone: null })

      const result = await dispatchInvoice(HUB_ID)

      expect(result).toEqual({ status: 'sent', checkoutUrl: PAYMENT.checkoutUrl })
      expect(sendWatiTemplate).not.toHaveBeenCalled()
      expect(hub.dispatch_status).toBe('sent')
    })

    it('a failed send to the test number is still a failure (the redirect never turns a failure into a success)', async () => {
      process.env.INVOICE_DISPATCH_TEST_NUMBER = TEST_NUMBER
      const hub = seedHub()
      vi.mocked(sendWatiTemplate).mockResolvedValueOnce({ ok: false, error: 'HTTP 403: forbidden' })

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(hub).toMatchObject({ dispatch_status: 'failed', sent_at: null })
    })
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
    expect(sendWatiTemplate).not.toHaveBeenCalled()
  })

  it('returns failed, writing nothing, when the hub row does not exist', async () => {
    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('not found')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(sendWatiTemplate).not.toHaveBeenCalled()
  })

  it('reports a failed hub READ as a read error, not as a missing row', async () => {
    const hub = seedHub()
    const realFrom = db.from.bind(db)
    db.from = (table: string) => {
      const q = realFrom(table) as unknown as { select: (columns?: string) => unknown; then: unknown }
      if (table === 'invoices') {
        const realSelect = q.select.bind(q)
        q.select = (columns?: string) => {
          const chain = realSelect(columns)
          q.then = (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: { message: 'connection refused' } }).then(res)
          return chain
        }
      }
      return q as never
    }

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('could not load hub invoice')
    expect(result.error).toContain('connection refused')
    expect(hub.dispatch_status).toBe('failed')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(sendWatiTemplate).not.toHaveBeenCalled()
  })

  describe('only ever writes its own hub row', () => {
    const OTHER_ID = '33333333-3333-4333-8333-333333333333'
    const cases: Array<[string, Row, () => void]> = [
      ['sent', {}, () => {}],
      ['skipped', { payment_status: 'paid' }, () => {}],
      ['failed', {}, () => void vi.mocked(createDibsyPayment).mockRejectedValue(new Error('Dibsy API error 500: boom'))],
    ]

    it.each(cases)('a dispatch that ends %s leaves another pending invoice exactly as it was', async (outcome, overrides, arrange) => {
      seedHub(overrides)
      const other = hubRow({ id: OTHER_ID, detail_id: 'other-detail', invoice_id: 'SINV_OTHER' })
      db.tables.invoices.push(other)
      const before = { ...other }
      arrange()

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe(outcome)
      expect(other).toEqual(before) // no status, link, pdf or error written to a row that was not dispatched
    })
  })

  it('fails, sending nothing, for a row with no detail key (not a hub-managed customer invoice)', async () => {
    const hub = seedHub({ detail_table: null, detail_id: null })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('no detail_table/detail_id')
    expect(hub.dispatch_status).toBe('failed')
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(sendWatiTemplate).not.toHaveBeenCalled()
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

  // ── Hardening tests proposed in review (each kills a mutant the first 37 tests let through) ──

  it.each([
    ['one dirham, QAR 0.01', 100.01, 100, '0.01'],
    ['half a riyal', 100.5, 100, '0.50'],
    ['float noise in the remainder (2.3 - 2)', 2.3, 2, '0.30'],
  ])('(c) still dispatches a tiny positive balance: %s', async (_label, total, paid, expected) => {
    seedHub({ total_amount: total, paid_amount: paid })

    const result = await dispatchInvoice(HUB_ID)

    expect(result.status).toBe('sent')
    expect(vi.mocked(createDibsyPayment).mock.calls[0][0].amount).toEqual({ value: expected, currency: 'QAR' })
    expect(watiParam('pending')).toBe(expected)
  })

  it('(b) a row sent before the hub existed (backfill shape: sent, no sent_at, no link) is left alone', async () => {
    const hub = seedHub({ dispatch_status: 'sent', sent_at: null, dibsy_payment_id: null, dibsy_checkout_url: null, pdf_url: null })

    const result = await dispatchInvoice(HUB_ID)

    expect(result).toEqual({ status: 'sent' })
    expect(createDibsyPayment).not.toHaveBeenCalled()
    expect(sendWatiTemplate).not.toHaveBeenCalled()
    expect(renderPdf).not.toHaveBeenCalled()
    expect(hub.sent_at).toBeNull()
  })

  it.each(['sent', 'partially_paid', 'overdue', null])('dispatches a sales invoice whose status is %s (only draft is held back)', async (status) => {
    seedHub({ detail_table: 'so_invoices', detail_id: 'so-invoice-1', invoice_id: 'INV-00001' })
    db.tables.so_invoices.push({ id: 'so-invoice-1', status })

    expect((await dispatchInvoice(HUB_ID)).status).toBe('sent')
  })

  describe('a hub write that fails mid-flight', () => {
    /** The in-memory fake never errors on its own: make hub UPDATEs matching `when` resolve with a DB error. */
    function failHubUpdate(when: (values: Row) => boolean, message = 'connection reset') {
      const realFrom = db.from.bind(db)
      db.from = (table: string) => {
        const q = realFrom(table) as unknown as { update: (v: Row) => unknown; then: unknown }
        if (table === 'invoices') {
          const realUpdate = q.update.bind(q)
          q.update = (values: Row) => {
            const chain = realUpdate(values)
            if (when(values)) q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message } }).then(res)
            return chain
          }
        }
        return q as never
      }
    }

    it('PDF-url write fails: failed before any pay link or message exists', async () => {
      const hub = seedHub()
      failHubUpdate((v) => 'pdf_url' in v)

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('could not update hub invoice')
      expect(hub.dispatch_status).toBe('failed')
      expect(createDibsyPayment).not.toHaveBeenCalled()
      expect(sendWatiTemplate).not.toHaveBeenCalled()
    })

    it('link-store write fails: failed, and the customer is not sent a link the row does not know about', async () => {
      const hub = seedHub()
      failHubUpdate((v) => 'dibsy_checkout_url' in v)

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('could not store the Dibsy link')
      expect(result.error).toContain('connection reset') // the real DB error, not the generic lost-race message
      expect(hub).toMatchObject({ dispatch_status: 'failed', dibsy_checkout_url: null })
      expect(sendWatiTemplate).not.toHaveBeenCalled()
    })

    it('final sent-write fails after WhatsApp went out: reported failed and recorded, never claimed sent', async () => {
      const hub = seedHub()
      failHubUpdate((v) => v.dispatch_status === 'sent')

      const result = await dispatchInvoice(HUB_ID)

      expect(result.status).toBe('failed')
      expect(hub).toMatchObject({ dispatch_status: 'failed', sent_at: null })
      expect(String(hub.dispatch_error)).toContain('could not update hub invoice')
      expect(sendWatiTemplate).toHaveBeenCalledTimes(1) // at-least-once, as documented: the retry will message again
    })
  })
})
