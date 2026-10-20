import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Everything with a side effect is replaced. The admin client refuses to load in a
// jsdom window, and `dispatchInvoice` is a real Dibsy pay link + a real WhatsApp (it
// has its own suite in src/lib/invoices/__tests__/dispatch.test.ts) - here it is
// only a spy that returns a canned outcome per hub id.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/invoices/dispatch', () => ({ dispatchInvoice: vi.fn() }))

import { GET, POST } from '../route'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchInvoice } from '@/lib/invoices/dispatch'

// ─── In-memory stand-in for the Supabase admin client ───────────────────────────
// The route reads two tables: `app_settings` (the on/off switch) and the hub
// `invoices`. This implements just the query-builder calls it uses - select (with
// column projection), eq, not(col, 'is', null), in, order, maybeSingle, awaitable -
// and really APPLIES the filters, so a missing or wrong filter in the route shows
// up as a wrongly dispatched row instead of as a call-shape mismatch. Projection is
// real too: a column the route forgets to select comes back undefined.

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

class FakeQuery implements PromiseLike<Result> {
  private columns: string[] | null = null
  private filters: Array<(row: Row) => boolean> = []
  private sort: { column: string; ascending: boolean } | null = null
  private one = false

  constructor(private rows: Row[], private failWith?: string) {}

  select(columns?: string) {
    this.columns = columns && columns.trim() !== '*' ? columns.split(',').map((c) => c.trim()) : null
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => (r[column] ?? null) === value)
    return this
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) {
      throw new Error(`fake admin: unsupported not(${column}, ${operator}, ${String(value)})`)
    }
    this.filters.push((r) => (r[column] ?? null) !== null) // IS NOT NULL
    return this
  }
  in(column: string, values: readonly unknown[]) {
    this.filters.push((r) => values.includes(r[column]))
    return this
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.sort = { column, ascending: options?.ascending ?? true }
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
    if (this.failWith) return { data: null, error: { message: this.failWith } }
    let rows = this.rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.sort) {
      const { column, ascending } = this.sort
      rows = [...rows].sort(
        (a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (ascending ? 1 : -1),
      )
    }
    const cols = this.columns
    const projected = rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r }))
    return { data: this.one ? (projected[0] ?? null) : projected, error: null }
  }
}

interface World {
  /** `app_settings.value` of key `invoice_dispatch_config`. Omit the property for "no such row". */
  config?: unknown
  /** Make the config read fail with this message. */
  configError?: string
  /** Rows of the hub table `public.invoices`. */
  hub?: Row[]
  /** Make the hub read fail with this message. */
  hubError?: string
}

function useAdmin(world: World) {
  const from = vi.fn((table: string) => {
    if (table === 'app_settings') {
      const rows = 'config' in world ? [{ key: 'invoice_dispatch_config', value: world.config }] : []
      return new FakeQuery(rows, world.configError)
    }
    if (table === 'invoices') return new FakeQuery(world.hub ?? [], world.hubError)
    throw new Error(`fake admin: unexpected table "${table}"`)
  })
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>)
}

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const SECRET = 'test-cron-secret'
const AUTH = { 'x-cron-secret': SECRET }
const URL_BASE = 'http://localhost/api/cron/dispatch-invoices'

/** A pending hub row. `customer_phone` / `dibsy_checkout_url` are here so a leak into the output would show. */
function hubRow(overrides: Row = {}): Row {
  return {
    id: 'hub-1',
    detail_table: 'tl_invoices',
    detail_id: 'detail-1',
    invoice_id: 'SINV_2026_10_0001',
    customer_name: 'Acme Trading',
    customer_phone: '+97455512345',
    dibsy_checkout_url: 'https://checkout.dibsy.test/pay/secret-link',
    dispatch_status: 'pending',
    created_at: '2026-10-20T08:00:00Z',
    ...overrides,
  }
}
const tlRow = (o: Row = {}) => hubRow({ id: 'hub-tl-1', detail_id: 'tl-detail-1', ...o })
const contractRow = (o: Row = {}) =>
  hubRow({
    id: 'hub-ct-1',
    detail_table: 'contract_invoices',
    detail_id: 'ct-detail-1',
    invoice_id: 'CINV_2026_10_0001',
    customer_name: 'Beta Facilities',
    created_at: '2026-10-20T09:00:00Z',
    ...o,
  })
const salesRow = (o: Row = {}) =>
  hubRow({ id: 'hub-so-1', detail_table: 'so_invoices', detail_id: 'so-detail-1', invoice_id: 'INV-00042', ...o })

function call(handler: typeof GET, opts: { headers?: Record<string, string>; dryRun?: boolean } = {}) {
  const method = handler === GET ? 'GET' : 'POST'
  return handler(new Request(opts.dryRun ? `${URL_BASE}?dryRun=1` : URL_BASE, { method, headers: opts.headers }))
}

const dispatchedIds = () => vi.mocked(dispatchInvoice).mock.calls.map(([id]) => id)

const ORIG_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  vi.resetAllMocks()
  process.env.CRON_SECRET = SECRET
  vi.mocked(dispatchInvoice).mockResolvedValue({ status: 'sent' })
})

afterEach(() => {
  if (ORIG_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIG_SECRET
})

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('cron: dispatch-invoices', () => {
  describe('auth', () => {
    it.each([
      ['no secret header', {}],
      ['a wrong x-cron-secret', { 'x-cron-secret': 'nope' }],
      ['a wrong bearer token', { authorization: 'Bearer nope' }],
      ['the secret without the Bearer prefix', { authorization: SECRET }],
    ])('401s with %s - nothing is read or dispatched', async (_label, headers) => {
      useAdmin({ config: { enabled: true }, hub: [tlRow(), contractRow()] })

      for (const handler of [GET, POST]) {
        const res = await call(handler, { headers })
        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' })
      }
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })

    it.each([
      ['CRON_SECRET unset and no header', undefined, {}],
      ['CRON_SECRET unset and an empty header', undefined, { 'x-cron-secret': '' }],
      ['CRON_SECRET empty and an empty header', '', { 'x-cron-secret': '' }],
    ])('fails closed (401) when %s', async (_label, secret, headers) => {
      if (secret === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = secret
      useAdmin({ config: { enabled: true }, hub: [tlRow()] })

      const res = await call(POST, { headers })
      expect(res.status).toBe(401)
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })

    it.each([
      ['x-cron-secret', AUTH],
      ['a Bearer token', { authorization: `Bearer ${SECRET}` }],
    ])('accepts the secret as %s on both GET and POST', async (_label, headers) => {
      useAdmin({ config: { enabled: true }, hub: [] })

      for (const handler of [GET, POST]) {
        const res = await call(handler, { headers })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, processed: 0 })
      }
    })
  })

  describe('safety gate (default OFF)', () => {
    const offCases: Array<[string, Partial<World>]> = [
      ['there is no config row', {}],
      ['the config is empty', { config: {} }],
      ['enabled is false', { config: { enabled: false } }],
      ['enabled is the string "true"', { config: { enabled: 'true' } }],
      ['enabled is the number 1', { config: { enabled: 1 } }],
      ['the config value is JSON null', { config: null }],
      ['the config value is not an object', { config: true }],
    ]

    it.each(offCases)('stays off when %s - reports the backlog, dispatches nothing', async (_label, world) => {
      useAdmin({ ...world, hub: [tlRow(), contractRow()] })

      const res = await call(POST, { headers: AUTH })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, skipped: 'disabled', pending_count: 2 })
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })

    it('fails closed (500, nothing dispatched) when the config cannot be read', async () => {
      useAdmin({ configError: 'connection reset', hub: [tlRow(), contractRow()] })

      const res = await call(POST, { headers: AUTH })
      expect(res.status).toBe(500)
      expect(await res.json()).toMatchObject({ ok: false, error: expect.stringContaining('connection reset') })
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })
  })

  describe('enabled run', () => {
    it('dispatches each of two pending rows by hub id and reports processed: 2', async () => {
      useAdmin({ config: { enabled: true }, hub: [tlRow(), contractRow()] })

      const res = await call(POST, { headers: AUTH })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ ok: true, enabled: true, processed: 2, sent: 2, skipped: 0, failed: 0 })
      expect(typeof body.ranAt).toBe('string')
      expect(dispatchInvoice).toHaveBeenCalledTimes(2)
      expect(dispatchInvoice).toHaveBeenCalledWith('hub-tl-1')
      expect(dispatchInvoice).toHaveBeenCalledWith('hub-ct-1')
      // Only the documented keys - no phone number or pay link leaks into the response.
      expect(body.details).toEqual([
        { id: 'hub-tl-1', invoice_id: 'SINV_2026_10_0001', detail_table: 'tl_invoices', status: 'sent' },
        { id: 'hub-ct-1', invoice_id: 'CINV_2026_10_0001', detail_table: 'contract_invoices', status: 'sent' },
      ])
    })

    it('tallies each outcome returned by dispatchInvoice (sent / skipped / failed)', async () => {
      useAdmin({
        config: { enabled: true },
        hub: [
          tlRow({ id: 'hub-a', created_at: '2026-10-20T07:00:00Z' }),
          tlRow({ id: 'hub-b', created_at: '2026-10-20T08:00:00Z' }),
          contractRow({ id: 'hub-c', created_at: '2026-10-20T09:00:00Z' }),
          contractRow({ id: 'hub-d', created_at: '2026-10-20T10:00:00Z' }),
        ],
      })
      const outcomes = {
        'hub-a': { status: 'sent' as const, checkoutUrl: 'https://checkout.dibsy.test/pay/a' },
        'hub-b': { status: 'skipped' as const },
        'hub-c': { status: 'failed' as const, error: 'WATI send failed (HTTP 500)' },
        'hub-d': { status: 'sent' as const },
      }
      vi.mocked(dispatchInvoice).mockImplementation(async (id) => outcomes[id as keyof typeof outcomes])

      const body = await (await call(POST, { headers: AUTH })).json()
      expect(body).toMatchObject({ ok: true, processed: 4, sent: 2, skipped: 1, failed: 1 })
      expect(body.details.map((d: { id: string; status: string }) => [d.id, d.status])).toEqual([
        ['hub-a', 'sent'],
        ['hub-b', 'skipped'],
        ['hub-c', 'failed'],
        ['hub-d', 'sent'],
      ])
    })

    it('only picks up pending tl_invoices / contract_invoices rows', async () => {
      useAdmin({
        config: { enabled: true },
        hub: [
          tlRow({ id: 'hub-tl-pending' }),
          contractRow({ id: 'hub-ct-pending' }),
          salesRow({ id: 'hub-so-pending' }), // sales: a separate business rule gates it, not in v1
          hubRow({ id: 'hub-legacy', detail_table: null, detail_id: null }), // legacy row, no detail key
          tlRow({ id: 'hub-tl-sent', dispatch_status: 'sent' }),
          tlRow({ id: 'hub-tl-failed', dispatch_status: 'failed' }),
          contractRow({ id: 'hub-ct-skipped', dispatch_status: 'skipped' }),
        ],
      })

      const body = await (await call(POST, { headers: AUTH })).json()
      expect(body).toMatchObject({ ok: true, processed: 2 })
      expect([...dispatchedIds()].sort()).toEqual(['hub-ct-pending', 'hub-tl-pending'])
    })

    it('dispatches one row at a time, oldest first', async () => {
      useAdmin({
        config: { enabled: true },
        hub: [
          contractRow({ id: 'hub-newest', created_at: '2026-10-20T10:00:00Z' }),
          tlRow({ id: 'hub-oldest', created_at: '2026-10-20T07:00:00Z' }),
          tlRow({ id: 'hub-middle', created_at: '2026-10-20T08:30:00Z' }),
        ],
      })
      // A dispatch renders a PDF in headless Chromium and calls Dibsy + WATI, so two at once
      // would risk memory and provider limits. Track the overlap.
      let inFlight = 0
      let maxInFlight = 0
      vi.mocked(dispatchInvoice).mockImplementation(async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 0))
        inFlight -= 1
        return { status: 'sent' }
      })

      const res = await call(POST, { headers: AUTH })
      expect(res.status).toBe(200)
      expect(dispatchedIds()).toEqual(['hub-oldest', 'hub-middle', 'hub-newest'])
      expect(maxInFlight).toBe(1)
    })

    it('with nothing pending, processes nothing', async () => {
      useAdmin({ config: { enabled: true }, hub: [tlRow({ dispatch_status: 'sent' })] })

      const res = await call(POST, { headers: AUTH })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, details: [] })
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })

    it('500s (nothing dispatched) when the pending rows cannot be read', async () => {
      useAdmin({ config: { enabled: true }, hubError: 'relation "invoices" does not exist' })

      const res = await call(POST, { headers: AUTH })
      expect(res.status).toBe(500)
      expect(await res.json()).toMatchObject({ ok: false, error: expect.stringContaining('does not exist') })
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })
  })

  describe('?dryRun=1', () => {
    it.each([true, false])(
      'lists the pending rows and dispatches nothing (enabled: %s)',
      async (enabled) => {
        useAdmin({ config: { enabled }, hub: [tlRow(), contractRow(), salesRow()] })

        const res = await call(POST, { headers: AUTH, dryRun: true })
        expect(res.status).toBe(200)
        // Exact shape: only id / detail_table / invoice_id / customer_name per row (no phone, no pay link).
        expect(await res.json()).toEqual({
          ok: true,
          mode: 'dryRun',
          enabled,
          pending_count: 2,
          pending: [
            { id: 'hub-tl-1', detail_table: 'tl_invoices', invoice_id: 'SINV_2026_10_0001', customer_name: 'Acme Trading' },
            { id: 'hub-ct-1', detail_table: 'contract_invoices', invoice_id: 'CINV_2026_10_0001', customer_name: 'Beta Facilities' },
          ],
        })
        expect(dispatchInvoice).not.toHaveBeenCalled()
      },
    )

    it('is still behind the secret', async () => {
      useAdmin({ config: { enabled: true }, hub: [tlRow()] })

      const res = await call(POST, { dryRun: true })
      expect(res.status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
    })
  })
})
