import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Extension-contract guard for the unified invoice hub.
 *
 * Every per-type table in the app (InvoiceType, kind <-> detail table, the page filter, the webhook's
 * settle map, the dispatch cron's allow-list, the PDF registry) must agree on ONE set of known types.
 * Most of them derive from `../registry`; the PDF registry cannot (it is server-only) and is
 * compile-enforced. This suite is the second net: add a type to one place and not another and it FAILS here,
 * with a message naming the registry that is out of step - instead of the cron silently never dispatching the
 * type, or the webhook settling the hub row but not its detail row (the spec's drift anti-goal).
 *
 * The checks are plain functions over a `Registries` snapshot so the suite can also prove they BITE: the same
 * checks are run against deliberately broken copies and must report the break.
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────────
// The PDF generators pull in puppeteer / fonts, and the admin client refuses to load in a jsdom window. The
// two routes under the wiring tests need the admin client, the Dibsy payment fetch and the signature check
// replaced too. `h` is hoisted so the factories survive `vi.resetModules()` (the wiring tests re-import the
// routes, which re-runs the factories).
const h = vi.hoisted(() => ({
  /** What `createAdminClient()` returns. */
  admin: null as unknown,
  /** What `getDibsyPayment()` resolves. */
  payment: null as unknown,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/sales/generate-invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }))
vi.mock('@/lib/orders/generate-tl-invoice-pdf', () => ({ generateTlInvoicePdf: vi.fn() }))
vi.mock('@/lib/contracts/generate-contract-invoice-pdf', () => ({ generateContractInvoicePdf: vi.fn() }))
vi.mock('@/lib/invoices/dispatch', () => ({ dispatchInvoice: vi.fn() }))
vi.mock('@/lib/webhooks/verify', () => ({ verifyHmacSignature: () => true }))
vi.mock('@/lib/dibsy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dibsy')>()),
  getDibsyPayment: async () => h.payment,
}))

import {
  ALL_INVOICE_TYPES,
  DETAIL_TABLE_FOR_TYPE as REGISTRY_DETAIL_TABLE_FOR_TYPE,
  DISPATCHABLE_DETAIL_TABLES,
  HUB_DETAIL_TABLES,
  INVOICE_TYPE_REGISTRY,
  KNOWN_DETAIL_TABLES,
  kindForDetailTable as registryKindForDetailTable,
  type InvoiceType,
} from '../registry'
import { kindForDetailTable } from '../types'
import { pdfRendererFor } from '../pdf-registry'
import { DETAIL_TABLE_FOR_TYPE } from '@/hooks/useAllInvoices'

// ─── The drift checks ──────────────────────────────────────────────────────────

/** The registries exactly as the app consumes them, gathered so a broken copy can be checked the same way. */
interface Registries {
  /** Every invoice type, at runtime (the `InvoiceType` union is erased). */
  types: readonly string[]
  /** The canonical list of detail tables the hub mirrors. */
  knownDetailTables: readonly string[]
  /** The All-Invoices list's type -> detail_table filter. */
  detailTableForType: Readonly<Record<string, string>>
  /** detail_table -> type; throws for a table nothing maps. */
  kindForDetailTable: (detailTable: string) => string
  /** The Dibsy webhook's per-detail-table settle metadata. */
  hubDetailTables: Readonly<Record<string, unknown>>
  /** The dispatch cron's allow-list. */
  dispatchableDetailTables: readonly string[]
  /** The PDF registry; throws for a type with no generator. */
  pdfRendererFor: (type: string) => unknown
}

const REAL: Registries = {
  types: ALL_INVOICE_TYPES,
  knownDetailTables: KNOWN_DETAIL_TABLES,
  detailTableForType: DETAIL_TABLE_FOR_TYPE,
  kindForDetailTable,
  hubDetailTables: HUB_DETAIL_TABLES,
  dispatchableDetailTables: DISPATCHABLE_DETAIL_TABLES,
  pdfRendererFor: (type) => pdfRendererFor(type as InvoiceType),
}

const throws = (fn: () => unknown): boolean => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

/** The detail table `type` is filed under, or undefined (own keys only: never an inherited `constructor`). */
const tableOf = (r: Registries, type: string): string | undefined =>
  Object.hasOwn(r.detailTableForType, type) ? r.detailTableForType[type] : undefined

/** Every type has a detail table (a known one) and a PDF renderer; nothing is keyed on a non-type. */
function typeCoverageProblems(r: Registries): string[] {
  const problems: string[] = []
  for (const type of r.types) {
    const table = tableOf(r, type)
    if (table === undefined) {
      problems.push(`DETAIL_TABLE_FOR_TYPE has no entry for type "${type}"`)
    } else if (!r.knownDetailTables.includes(table)) {
      problems.push(`DETAIL_TABLE_FOR_TYPE["${type}"] is "${table}", which is not a known detail table`)
    }
    if (throws(() => r.pdfRendererFor(type))) {
      problems.push(`pdfRendererFor("${type}") throws - add a generator for "${type}" to GENERATORS in pdf-registry.ts`)
    }
  }
  for (const key of Object.keys(r.detailTableForType)) {
    if (!r.types.includes(key)) problems.push(`DETAIL_TABLE_FOR_TYPE has an entry for "${key}", which is not an invoice type`)
  }
  return problems
}

/** kindForDetailTable and DETAIL_TABLE_FOR_TYPE are exact inverses over the known tables; unknown tables throw. */
function roundTripProblems(r: Registries): string[] {
  const problems: string[] = []
  for (const type of r.types) {
    const table = tableOf(r, type)
    if (table === undefined) continue // reported by typeCoverageProblems
    let kind: string
    try {
      kind = r.kindForDetailTable(table)
    } catch {
      problems.push(`kindForDetailTable("${table}") throws, but "${table}" is the detail table of type "${type}"`)
      continue
    }
    if (kind !== type) problems.push(`kindForDetailTable("${table}") is "${kind}", but DETAIL_TABLE_FOR_TYPE says "${table}" belongs to "${type}"`)
  }
  for (const table of r.knownDetailTables) {
    try {
      const kind = r.kindForDetailTable(table)
      if (tableOf(r, kind) !== table) {
        problems.push(`kindForDetailTable("${table}") is "${kind}", but DETAIL_TABLE_FOR_TYPE["${kind}"] is "${tableOf(r, kind)}"`)
      }
    } catch {
      problems.push(`kindForDetailTable("${table}") throws for a known detail table`)
    }
  }
  if (new Set(r.knownDetailTables).size !== r.knownDetailTables.length) problems.push('two invoice types share one detail table')
  for (const unknown of ['__not_a_registered_detail_table__', '']) {
    if (!throws(() => r.kindForDetailTable(unknown))) problems.push(`kindForDetailTable("${unknown}") did not throw for an unknown table`)
  }
  return problems
}

/** The webhook can settle EXACTLY the known detail tables - a missing one settles the hub but not its detail (drift). */
function webhookProblems(r: Registries): string[] {
  const problems: string[] = []
  const settled = Object.keys(r.hubDetailTables)
  for (const table of r.knownDetailTables) {
    if (!settled.includes(table)) {
      problems.push(`HUB_DETAIL_TABLES has no entry for "${table}": a paid hub payment would settle the hub row but NOT its detail row (drift)`)
    }
  }
  for (const table of settled) {
    if (!r.knownDetailTables.includes(table)) problems.push(`HUB_DETAIL_TABLES has an entry for "${table}", which is not a known detail table`)
  }
  return problems
}

/** The cron dispatches a SUBSET of the known tables (sales may be left out), each fully wired: type, renderer, settle entry. */
function cronProblems(r: Registries): string[] {
  const problems: string[] = []
  if (new Set(r.dispatchableDetailTables).size !== r.dispatchableDetailTables.length) {
    problems.push('DISPATCHABLE_DETAIL_TABLES lists a table twice')
  }
  for (const table of r.dispatchableDetailTables) {
    if (!r.knownDetailTables.includes(table)) {
      problems.push(`the cron dispatches "${table}", which is not a known detail table`)
      continue
    }
    let type: string
    try {
      type = r.kindForDetailTable(table)
    } catch {
      problems.push(`the cron dispatches "${table}", which maps to no invoice type`)
      continue
    }
    if (throws(() => r.pdfRendererFor(type))) problems.push(`the cron dispatches "${table}" but type "${type}" has no PDF renderer`)
    if (!Object.hasOwn(r.hubDetailTables, table)) problems.push(`the cron dispatches "${table}" but the webhook cannot settle it (no HUB_DETAIL_TABLES entry)`)
  }
  return problems
}

// ─── The real registries agree ─────────────────────────────────────────────────

describe('invoice type registries agree on the set of known types', () => {
  it('every InvoiceType has a DETAIL_TABLE_FOR_TYPE entry and a PDF renderer that resolves', () => {
    expect(typeCoverageProblems(REAL)).toEqual([])
  })

  it('kindForDetailTable round-trips with DETAIL_TABLE_FOR_TYPE for every known table, and throws on an unknown one', () => {
    expect(roundTripProblems(REAL)).toEqual([])
  })

  it('the webhook settles exactly the known detail tables, so settlement can never skip a known type', () => {
    expect(webhookProblems(REAL)).toEqual([])
  })

  it('the cron dispatches only known tables that have a type, a renderer and a webhook settle entry', () => {
    expect(cronProblems(REAL)).toEqual([])
  })

  it('has at least one type, each with a distinct, non-empty detail table', () => {
    expect(ALL_INVOICE_TYPES.length).toBeGreaterThan(0)
    for (const type of ALL_INVOICE_TYPES) {
      const spec = INVOICE_TYPE_REGISTRY[type]
      expect(spec.detailTable).not.toBe('')
      expect(spec.partialStatus).not.toBe('')
    }
    expect([...KNOWN_DETAIL_TABLES].sort()).toEqual(Object.values(DETAIL_TABLE_FOR_TYPE).sort())
    expect(new Set(KNOWN_DETAIL_TABLES).size).toBe(ALL_INVOICE_TYPES.length)
  })

  it('hands the consumers the registry\'s own objects instead of copies', () => {
    // Identity, not equality: a copy that happens to match today would drift tomorrow.
    expect(DETAIL_TABLE_FOR_TYPE).toBe(REGISTRY_DETAIL_TABLE_FOR_TYPE)
    expect(kindForDetailTable).toBe(registryKindForDetailTable)
  })
})

// ─── kindForDetailTable stays strict ───────────────────────────────────────────

describe('kindForDetailTable', () => {
  // It is a table lookup now, not a switch: an inherited Object member must not be mistaken for a registered table.
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'throws for the inherited object member name %s',
    (name) => {
      expect(() => kindForDetailTable(name)).toThrow('unknown detail_table: ' + name)
    },
  )
})

// ─── The checks bite ───────────────────────────────────────────────────────────
// The checks above are code too, so prove they catch what they claim to. Every case starts from a small synthetic
// set of registries that is known to be consistent - independent of the real ones, so a real drift is reported
// once, by the tests above, and not again here - and breaks exactly one thing.

const TABLE_OF_TYPE: Readonly<Record<string, string>> = { alpha: 'alpha_invoices', beta: 'beta_invoices' }

/** Two types; `beta` is deliberately not dispatched, the way sales is not in v1. */
const HEALTHY: Registries = {
  types: ['alpha', 'beta'],
  knownDetailTables: ['alpha_invoices', 'beta_invoices'],
  detailTableForType: TABLE_OF_TYPE,
  kindForDetailTable: (table) => {
    const type = Object.keys(TABLE_OF_TYPE).find((t) => TABLE_OF_TYPE[t] === table)
    if (type === undefined) throw new Error('unknown detail_table: ' + table)
    return type
  },
  hubDetailTables: { alpha_invoices: {}, beta_invoices: {} },
  dispatchableDetailTables: ['alpha_invoices'],
  pdfRendererFor: (type) => {
    if (!Object.hasOwn(TABLE_OF_TYPE, type)) throw new Error('no PDF renderer for ' + type)
    return () => undefined
  },
}

const broken = (patch: Partial<Registries>): Registries => ({ ...HEALTHY, ...patch })
const without = <V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
/** A PDF registry that has no generator for `missing`. */
const lacksRenderer = (missing: string) => (type: string) => {
  if (type === missing) throw new Error('no PDF renderer for ' + type)
  return HEALTHY.pdfRendererFor(type)
}

const CHECKS = { typeCoverageProblems, roundTripProblems, webhookProblems, cronProblems }

interface Bite {
  name: string
  check: (r: Registries) => string[]
  registries: Registries
  /** A fragment the reported problems must contain. */
  mentions: string
}

const BITES: Bite[] = [
  {
    name: 'a type added to the list but registered nowhere else',
    check: typeCoverageProblems,
    registries: broken({ types: [...HEALTHY.types, 'gamma'] }),
    mentions: 'no entry for type "gamma"',
  },
  {
    name: 'a type with no PDF generator',
    check: typeCoverageProblems,
    registries: broken({ pdfRendererFor: lacksRenderer('beta') }),
    mentions: 'pdfRendererFor("beta") throws',
  },
  {
    name: 'a type missing from DETAIL_TABLE_FOR_TYPE',
    check: typeCoverageProblems,
    registries: broken({ detailTableForType: without(HEALTHY.detailTableForType, 'alpha') }),
    mentions: 'no entry for type "alpha"',
  },
  {
    name: 'a type keyed in DETAIL_TABLE_FOR_TYPE that is not an invoice type',
    check: typeCoverageProblems,
    registries: broken({ detailTableForType: { ...HEALTHY.detailTableForType, gamma: 'alpha_invoices' } }),
    mentions: '"gamma", which is not an invoice type',
  },
  {
    name: 'a type whose detail table is not a known detail table',
    check: typeCoverageProblems,
    registries: broken({ detailTableForType: { ...HEALTHY.detailTableForType, beta: 'nowhere_invoices' } }),
    mentions: '"nowhere_invoices", which is not a known detail table',
  },
  {
    name: 'kindForDetailTable mapping a type\'s own table to a different type',
    check: roundTripProblems,
    // beta_invoices is left out of the known list so that only the per-type direction can see this one.
    registries: broken({
      knownDetailTables: ['alpha_invoices'],
      kindForDetailTable: (t) => (t === 'beta_invoices' ? 'alpha' : HEALTHY.kindForDetailTable(t)),
    }),
    mentions: 'belongs to "beta"',
  },
  {
    name: 'kindForDetailTable resolving a known table to a type that does not own it',
    check: roundTripProblems,
    // orphan_invoices is no type's table, so only the per-known-table direction can see this one.
    registries: broken({
      knownDetailTables: [...HEALTHY.knownDetailTables, 'orphan_invoices'],
      kindForDetailTable: (t) => (t === 'orphan_invoices' ? 'alpha' : HEALTHY.kindForDetailTable(t)),
    }),
    mentions: 'DETAIL_TABLE_FOR_TYPE["alpha"] is "alpha_invoices"',
  },
  {
    name: 'kindForDetailTable accepting an unknown table instead of throwing',
    check: roundTripProblems,
    registries: broken({ kindForDetailTable: (t) => (HEALTHY.knownDetailTables.includes(t) ? HEALTHY.kindForDetailTable(t) : 'alpha') }),
    mentions: 'did not throw',
  },
  {
    name: 'two types sharing one detail table',
    check: roundTripProblems,
    registries: broken({ knownDetailTables: [...HEALTHY.knownDetailTables, 'alpha_invoices'] }),
    mentions: 'share one detail table',
  },
  {
    name: 'the webhook missing a known detail table',
    check: webhookProblems,
    registries: broken({ hubDetailTables: without(HEALTHY.hubDetailTables, 'beta_invoices') }),
    mentions: 'no entry for "beta_invoices"',
  },
  {
    name: 'the webhook still carrying a table that is no longer known',
    check: webhookProblems,
    registries: broken({ hubDetailTables: { ...HEALTHY.hubDetailTables, ghost_invoices: {} } }),
    mentions: 'ghost_invoices',
  },
  {
    name: 'the cron dispatching a table that is not known',
    check: cronProblems,
    registries: broken({ dispatchableDetailTables: [...HEALTHY.dispatchableDetailTables, 'ghost_invoices'] }),
    mentions: '"ghost_invoices", which is not a known detail table',
  },
  {
    name: 'the cron dispatching a known table that maps to no invoice type',
    check: cronProblems,
    registries: broken({
      kindForDetailTable: (t) => {
        if (t === 'alpha_invoices') throw new Error('unknown detail_table: ' + t)
        return HEALTHY.kindForDetailTable(t)
      },
    }),
    mentions: 'maps to no invoice type',
  },
  {
    name: 'the cron listing a table twice',
    check: cronProblems,
    registries: broken({ dispatchableDetailTables: ['alpha_invoices', 'alpha_invoices'] }),
    mentions: 'twice',
  },
  {
    name: 'the cron dispatching a table the webhook cannot settle',
    check: cronProblems,
    registries: broken({ hubDetailTables: without(HEALTHY.hubDetailTables, 'alpha_invoices') }),
    mentions: 'webhook cannot settle it',
  },
  {
    name: 'the cron dispatching a type with no PDF renderer',
    check: cronProblems,
    registries: broken({ pdfRendererFor: lacksRenderer('alpha') }),
    mentions: 'has no PDF renderer',
  },
]

describe('the drift checks bite', () => {
  it.each(Object.entries(CHECKS))(
    '%s accepts a consistent set of registries, including one that leaves a type out of the cron',
    (_name, check) => {
      expect(check(HEALTHY)).toEqual([])
    },
  )

  it.each(BITES)('reports $name', ({ check, registries, mentions }) => {
    const problems = check(registries)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(mentions)
  })
})

// ─── v1 values ─────────────────────────────────────────────────────────────────
// The refactor moved these tables into the registry; the values (and so the behaviour) must not have moved.
// Additive on purpose (toMatchObject / arrayContaining): a new type must not need an edit here.

describe('v1 values are unchanged', () => {
  it('maps the three v1 business lines to their detail tables', () => {
    expect(DETAIL_TABLE_FOR_TYPE).toMatchObject({ service: 'tl_invoices', sales: 'so_invoices', contract: 'contract_invoices' })
  })

  it('keeps the webhook settle metadata of the three v1 detail tables', () => {
    expect(HUB_DETAIL_TABLES.tl_invoices).toEqual({ partialStatus: 'partial', hasUpdatedAt: true })
    expect(HUB_DETAIL_TABLES.contract_invoices).toEqual({ partialStatus: 'partial', hasUpdatedAt: true })
    expect(HUB_DETAIL_TABLES.so_invoices).toEqual({ partialStatus: 'partially_paid', hasUpdatedAt: false })
  })

  it('keeps the cron dispatching tl_invoices and contract_invoices, and still not so_invoices', () => {
    expect([...DISPATCHABLE_DETAIL_TABLES]).toEqual(expect.arrayContaining(['tl_invoices', 'contract_invoices']))
    expect(DISPATCHABLE_DETAIL_TABLES).not.toContain('so_invoices')
  })
})

// ─── The routes consume the registry ───────────────────────────────────────────
// The cron and the webhook cannot export their tables (a Next.js route file may only export handlers), so
// "the registry is the single source" is only true if each route really reads it. These tests swap the
// registry's exports for a probe table and check the route follows: an inline copy of the tables inside a
// route would ignore the swap and fail here.

describe('the cron and the webhook take their per-type tables from the registry', () => {
  const PROBE = 'zz_probe_invoices'
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: null }

  /** In-memory stand-in for the admin client: really applies the filters and the writes. */
  function fakeAdmin(tables: Record<string, Row[]>) {
    class Query implements PromiseLike<Result> {
      private filters: Array<(row: Row) => boolean> = []
      private patch: Row | null = null
      private one = false
      constructor(private rows: Row[]) {}

      select() { return this }
      order() { return this }
      update(patch: Row) { this.patch = patch; return this }
      eq(column: string, value: unknown) { this.filters.push((r) => (r[column] ?? null) === value); return this }
      // SQL `col <> value` is NULL (not true) for a NULL column, so a NULL row never matches.
      neq(column: string, value: unknown) { this.filters.push((r) => r[column] != null && r[column] !== value); return this }
      // Only `not(column, 'is', null)` is used.
      not(column: string) { this.filters.push((r) => (r[column] ?? null) !== null); return this }
      in(column: string, values: readonly unknown[]) { this.filters.push((r) => values.includes(r[column])); return this }
      maybeSingle() { this.one = true; return this }

      then<R1 = Result, R2 = never>(
        onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
        onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
      ): PromiseLike<R1 | R2> {
        return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
      }

      private exec(): Result {
        const matched = this.rows.filter((r) => this.filters.every((f) => f(r)))
        if (this.patch) {
          for (const row of matched) Object.assign(row, this.patch)
          return { data: matched.map((r) => ({ id: r.id })), error: null }
        }
        return { data: this.one ? (matched[0] ?? null) : matched, error: null }
      }
    }
    return {
      from(table: string) {
        if (!(table in tables)) throw new Error(`fake admin: unexpected table "${table}"`)
        return new Query(tables[table])
      },
    }
  }

  /** Re-import the module graph with the registry's exports overridden. */
  function overrideRegistry(overrides: Partial<typeof import('../registry')>) {
    vi.resetModules()
    vi.doMock('@/lib/invoices/registry', async () => ({
      ...(await vi.importActual<typeof import('../registry')>('@/lib/invoices/registry')),
      ...overrides,
    }))
  }

  const hubRow = (o: Row): Row => ({
    id: 'hub-1', total_amount: 100, paid_amount: 0, payment_status: 'unpaid', detail_id: 'd-1', ...o,
  })
  const webhookRequest = () =>
    new Request('http://localhost/api/payments/dibsy/webhook', {
      method: 'POST',
      headers: { 'dibsy-signature': 'sig' },
      body: JSON.stringify({ resource: 'payment', id: 'pt_1' }),
    })
  /** A PAID Dibsy payment of 40 against hub-1 (total 100): a part payment, so the partial spelling is exercised. */
  const partPayment = () => ({ status: 'paid', amount: { value: '40.00' }, metadata: { hub_invoice_id: 'hub-1' } })

  afterEach(() => {
    vi.doUnmock('@/lib/invoices/registry')
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('the dispatch cron selects the registry\'s DISPATCHABLE_DETAIL_TABLES, not an inline list', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    h.admin = fakeAdmin({
      app_settings: [],
      invoices: [
        { id: 'hub-probe', detail_table: PROBE, dispatch_status: 'pending', invoice_id: 'P-1', customer_name: 'Probe' },
        { id: 'hub-tl', detail_table: 'tl_invoices', dispatch_status: 'pending', invoice_id: 'S-1', customer_name: 'Service' },
      ],
    })
    overrideRegistry({ DISPATCHABLE_DETAIL_TABLES: [PROBE] })

    const { GET } = await import('@/app/api/cron/dispatch-invoices/route')
    const res = await GET(new Request('http://localhost/api/cron/dispatch-invoices?dryRun=1', { headers: { 'x-cron-secret': 'secret' } }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { pending: Array<{ id: string }> }
    expect(body.pending.map((r) => r.id)).toEqual(['hub-probe'])
  })

  it('the Dibsy webhook settles the detail table the registry names, with the registry\'s settle metadata', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const tables = {
      invoices: [hubRow({ detail_table: PROBE })],
      [PROBE]: [{ id: 'd-1', payment_status: 'unpaid', paid_amount: 0 }],
    }
    h.admin = fakeAdmin(tables)
    h.payment = partPayment()
    overrideRegistry({ HUB_DETAIL_TABLES: { [PROBE]: { partialStatus: 'probe_partial', hasUpdatedAt: true } } })

    const { POST } = await import('@/app/api/payments/dibsy/webhook/route')
    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    // partialStatus and hasUpdatedAt both came from the registry entry.
    expect(tables[PROBE][0]).toMatchObject({ payment_status: 'probe_partial', paid_amount: 40 })
    expect(tables[PROBE][0]).toHaveProperty('updated_at')
  })

  it('the Dibsy webhook has no inline fallback: a detail table the registry does not list is left alone', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tables = {
      invoices: [hubRow({ detail_table: 'tl_invoices' })],
      tl_invoices: [{ id: 'd-1', payment_status: 'unpaid', paid_amount: 0 }],
    }
    h.admin = fakeAdmin(tables)
    h.payment = partPayment()
    overrideRegistry({ HUB_DETAIL_TABLES: { [PROBE]: { partialStatus: 'probe_partial', hasUpdatedAt: true } } })

    const { POST } = await import('@/app/api/payments/dibsy/webhook/route')
    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    expect(tables.tl_invoices[0]).toEqual({ id: 'd-1', payment_status: 'unpaid', paid_amount: 0 })
    expect(tables.invoices[0]).toMatchObject({ payment_status: 'partially_paid', paid_amount: 40 })
  })
})
