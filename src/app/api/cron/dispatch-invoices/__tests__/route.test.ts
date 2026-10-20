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

/** `dryRun: true` is shorthand for `?dryRun=1`; `query` is a raw query string (e.g. '?dryRun=true') for spelling tests. */
function call(
  handler: typeof GET,
  opts: { headers?: Record<string, string>; dryRun?: boolean; query?: string } = {},
) {
  const method = handler === GET ? 'GET' : 'POST'
  const query = opts.query ?? (opts.dryRun ? '?dryRun=1' : '')
  return handler(new Request(`${URL_BASE}${query}`, { method, headers: opts.headers }))
}

const dispatchedIds = () => vi.mocked(dispatchInvoice).mock.calls.map(([id]) => id)

/** Open or close the env half of the gate (INVOICE_DISPATCH_ENABLED); `undefined` removes the variable. */
function setEnvGate(value: string | undefined) {
  if (value === undefined) delete process.env.INVOICE_DISPATCH_ENABLED
  else process.env.INVOICE_DISPATCH_ENABLED = value
}

const ORIG_SECRET = process.env.CRON_SECRET
const ORIG_ENV_GATE = process.env.INVOICE_DISPATCH_ENABLED

beforeEach(() => {
  vi.resetAllMocks()
  process.env.CRON_SECRET = SECRET
  // The env half of the gate is open by default so the "enabled" tests below still dispatch;
  // the tests that exercise it turn it off themselves.
  setEnvGate('true')
  vi.mocked(dispatchInvoice).mockResolvedValue({ status: 'sent' })
})

afterEach(() => {
  if (ORIG_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIG_SECRET
  setEnvGate(ORIG_ENV_GATE)
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

  describe('safety gates (default OFF; the config row AND the env var must both be open)', () => {
    // These cases run with INVOICE_DISPATCH_ENABLED='true' (see beforeEach), so each one isolates the config half.
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

    // The env half: a variable nothing inside the app (no database row) can change. The config row says
    // `enabled: true` in every case below, so the env var is the only thing between the cron and a send.
    // Only the exact string 'true' opens it - every near miss keeps the cron off.
    const envOffCases: Array<[string, string | undefined]> = [
      ['unset', undefined],
      ['"false"', 'false'],
      ['"1"', '1'],
      ['"TRUE" (wrong case)', 'TRUE'],
      ['"true " (trailing space)', 'true '],
    ]

    it.each(envOffCases)(
      'stays off with the config enabled but INVOICE_DISPATCH_ENABLED %s - reports the backlog, dispatches nothing',
      async (_label, envValue) => {
        setEnvGate(envValue)
        useAdmin({ config: { enabled: true }, hub: [tlRow(), contractRow()] })

        const res = await call(POST, { headers: AUTH })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, skipped: 'disabled', pending_count: 2 })
        expect(dispatchInvoice).not.toHaveBeenCalled()
      },
    )
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

    it('only picks up pending rows of the dispatchable invoice types (service, sales, contract)', async () => {
      useAdmin({
        config: { enabled: true },
        hub: [
          tlRow({ id: 'hub-tl-pending' }),
          contractRow({ id: 'hub-ct-pending' }),
          // Sales is dispatchable: it is picked up like the others, and dispatchInvoice itself holds back a still-draft one.
          salesRow({ id: 'hub-so-pending' }),
          hubRow({ id: 'hub-legacy', detail_table: null, detail_id: null }), // legacy row, no detail key
          hubRow({ id: 'hub-unlisted', detail_table: 'supplier_bills', detail_id: 'bill-1' }), // a table the cron does not dispatch
          tlRow({ id: 'hub-tl-sent', dispatch_status: 'sent' }),
          tlRow({ id: 'hub-tl-failed', dispatch_status: 'failed' }),
          contractRow({ id: 'hub-ct-skipped', dispatch_status: 'skipped' }),
          salesRow({ id: 'hub-so-sent', dispatch_status: 'sent' }),
          salesRow({ id: 'hub-so-failed', dispatch_status: 'failed' }),
          // A recorded skip (void / paid / no balance) is terminal: that row is never picked up again.
          salesRow({ id: 'hub-so-skipped', dispatch_status: 'skipped' }),
        ],
      })

      const body = await (await call(POST, { headers: AUTH })).json()
      expect(body).toMatchObject({ ok: true, processed: 3 })
      expect([...dispatchedIds()].sort()).toEqual(['hub-ct-pending', 'hub-so-pending', 'hub-tl-pending'])
    })

    it('hands a pending sales row to dispatchInvoice like any other type; a still-draft invoice comes back skipped', async () => {
      useAdmin({ config: { enabled: true }, hub: [salesRow()] })
      vi.mocked(dispatchInvoice).mockResolvedValue({ status: 'skipped' }) // what dispatchInvoice answers for a draft

      const body = await (await call(POST, { headers: AUTH })).json()

      expect(dispatchInvoice).toHaveBeenCalledTimes(1)
      expect(dispatchInvoice).toHaveBeenCalledWith('hub-so-1')
      expect(body).toMatchObject({ ok: true, processed: 1, sent: 0, skipped: 1, failed: 0 })
      expect(body.details).toEqual([
        { id: 'hub-so-1', invoice_id: 'INV-00042', detail_table: 'so_invoices', status: 'skipped' },
      ])
    })

    it('picks a draft sales row up again on every run: a draft skip leaves it pending, and the cron itself writes nothing to the hub', async () => {
      // The fake hub table has no update(): a write from the route would throw. The rows are shared by both runs.
      useAdmin({ config: { enabled: true }, hub: [salesRow()] })
      vi.mocked(dispatchInvoice).mockResolvedValue({ status: 'skipped' })

      for (const run of [1, 2, 3]) {
        const body = await (await call(POST, { headers: AUTH })).json()
        expect(body).toMatchObject({ ok: true, processed: 1, skipped: 1 })
        expect(dispatchInvoice).toHaveBeenCalledTimes(run)
      }
      expect(dispatchedIds()).toEqual(['hub-so-1', 'hub-so-1', 'hub-so-1'])
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

  describe('?dryRun', () => {
    it.each([true, false])(
      'lists the pending rows and dispatches nothing (config enabled: %s)',
      async (enabled) => {
        // Sales is dispatchable now, so its pending row is part of the backlog (created last, so it lists last).
        useAdmin({ config: { enabled }, hub: [tlRow(), contractRow(), salesRow({ created_at: '2026-10-20T10:00:00Z' })] })

        const res = await call(POST, { headers: AUTH, dryRun: true })
        expect(res.status).toBe(200)
        // Exact shape: the gate flags (env is open here, so `enabled` follows the config), then only
        // id / detail_table / invoice_id / customer_name per row (no phone, no pay link).
        expect(await res.json()).toEqual({
          ok: true,
          mode: 'dryRun',
          enabled,
          config_enabled: enabled,
          env_enabled: true,
          pending_count: 3,
          pending: [
            { id: 'hub-tl-1', detail_table: 'tl_invoices', invoice_id: 'SINV_2026_10_0001', customer_name: 'Acme Trading' },
            { id: 'hub-ct-1', detail_table: 'contract_invoices', invoice_id: 'CINV_2026_10_0001', customer_name: 'Beta Facilities' },
            { id: 'hub-so-1', detail_table: 'so_invoices', invoice_id: 'INV-00042', customer_name: 'Acme Trading' },
          ],
        })
        expect(dispatchInvoice).not.toHaveBeenCalled()
      },
    )

    // `enabled` is the AND of the two halves, and the body names each half so an operator can see which gate is closed.
    type GateFlags = { enabled: boolean; config_enabled: boolean; env_enabled: boolean }
    const gateCases: Array<[string, boolean, string | undefined, GateFlags]> = [
      ['config on, env on', true, 'true', { enabled: true, config_enabled: true, env_enabled: true }],
      ['config on, env unset', true, undefined, { enabled: false, config_enabled: true, env_enabled: false }],
      ['config on, env "false"', true, 'false', { enabled: false, config_enabled: true, env_enabled: false }],
      ['config off, env on', false, 'true', { enabled: false, config_enabled: false, env_enabled: true }],
      ['config off, env unset', false, undefined, { enabled: false, config_enabled: false, env_enabled: false }],
    ]

    it.each(gateCases)('reports which gate is closed (%s)', async (_label, configEnabled, envValue, expected) => {
      setEnvGate(envValue)
      useAdmin({ config: { enabled: configEnabled }, hub: [tlRow()] })

      const res = await call(POST, { headers: AUTH, dryRun: true })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ mode: 'dryRun', ...expected })
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })

    // S-1: a `dryRun` param that is present is a dry run, whatever its value, so a mistyped value can never
    // turn into a real send. Both gates are open (config enabled + env 'true') and two rows are pending, so a
    // misread spelling would show up as dispatched rows.
    it.each([
      ['?dryRun=true'],
      ['?dryRun'],
      ['?dryRun='],
      ['?dryRun=0'],
      ['?dryRun=false'],
      ['?limit=5&dryRun=yes'],
    ])('treats %s as a dry run: lists the backlog, dispatches nothing even with both gates open', async (query) => {
      useAdmin({ config: { enabled: true }, hub: [tlRow(), contractRow()] })

      const res = await call(POST, { headers: AUTH, query })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, mode: 'dryRun', enabled: true, pending_count: 2 })
      expect(dispatchInvoice).not.toHaveBeenCalled()
    })

    it('only the ABSENCE of dryRun dispatches: an unrelated query string still sends', async () => {
      useAdmin({ config: { enabled: true }, hub: [tlRow(), contractRow()] })

      const res = await call(POST, { headers: AUTH, query: '?source=scheduler' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, enabled: true, processed: 2, sent: 2 })
      expect(dispatchedIds()).toEqual(['hub-tl-1', 'hub-ct-1'])
    })

    it('is still behind the secret', async () => {
      useAdmin({ config: { enabled: true }, hub: [tlRow()] })

      const res = await call(POST, { dryRun: true })
      expect(res.status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
    })
  })
})
