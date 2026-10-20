import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { kindForDetailTable, type InvoiceType } from '@/lib/invoices/types'
import { matchRequiredPermission } from '@/lib/route-permissions'

// The hub is read through the browser Supabase client. Swap it for a chainable,
// awaitable query-builder spy: every builder call is recorded, and awaiting the
// builder resolves `state.result` (like a real PostgREST builder), so the tests
// assert on the exact query the hook builds - table, filters, ordering, cap.
const mock = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  type Result = { data: unknown; error: { message: string } | null }
  const calls: Call[] = []
  // A test may set a pending promise here to hold a query in flight.
  const state: { result: Result | Promise<Result> } = { result: { data: [], error: null } }
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'or', 'order', 'limit']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    })
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(state.result).then(resolve, reject)
  const from = vi.fn((_table: string) => builder)
  return { calls, state, from }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mock.from }),
}))

import {
  ALL_INVOICES_LIMIT,
  DETAIL_TABLE_FOR_TYPE,
  invoiceKind,
  remainingAmount,
  useAllInvoices,
  type AllInvoicesFilters,
} from '../useAllInvoices'

const callsTo = (method: string) => mock.calls.filter((c) => c.method === method).map((c) => c.args)

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
  return Wrapper
}

async function run(filters: AllInvoicesFilters) {
  const hook = renderHook(() => useAllInvoices(filters), { wrapper: makeWrapper() })
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  return hook.result
}

beforeEach(() => {
  mock.calls.length = 0
  mock.from.mockClear()
  mock.state.result = { data: [], error: null }
})

describe('useAllInvoices - the query it builds', () => {
  it('reads the hub table `invoices` and selects every column the page lists', async () => {
    await run({})

    expect(mock.from).toHaveBeenCalledWith('invoices')
    const [columns] = callsTo('select')[0] as [string]
    const selected = new Set(columns.split(',').map((c) => c.trim()))
    for (const col of [
      'id', 'invoice_id', 'detail_table', 'detail_id', 'customer_name',
      'total_amount', 'paid_amount', 'payment_status', 'dispatch_status',
      'dibsy_checkout_url', 'pdf_url', 'sent_at', 'created_at',
    ]) {
      expect(selected.has(col), `select list is missing ${col}`).toBe(true)
    }
  })

  it('with no filters applies no constraint, orders newest first and caps the page', async () => {
    await run({})

    expect(callsTo('eq')).toEqual([])
    expect(callsTo('or')).toEqual([])
    expect(callsTo('order')).toEqual([['created_at', { ascending: false }]])
    expect(callsTo('limit')).toEqual([[ALL_INVOICES_LIMIT]])
  })

  it('caps the page at the transactional-list limit from docs/supabase-budget.md (200)', () => {
    expect(ALL_INVOICES_LIMIT).toBeGreaterThan(0)
    expect(ALL_INVOICES_LIMIT).toBeLessThanOrEqual(200)
  })

  it.each([
    ['service', 'tl_invoices'],
    ['sales', 'so_invoices'],
    ['contract', 'contract_invoices'],
  ] as const)('type=%s filters detail_table to %s', async (type, detailTable) => {
    await run({ type })

    expect(callsTo('eq')).toEqual([['detail_table', detailTable]])
  })

  it('status filters payment_status', async () => {
    await run({ status: 'partially_paid' })

    expect(callsTo('eq')).toEqual([['payment_status', 'partially_paid']])
  })

  it('q searches invoice_id and customer_name case-insensitively, as a substring', async () => {
    await run({ q: 'ali' })

    expect(callsTo('or')).toEqual([
      ['invoice_id.ilike."%ali%",customer_name.ilike."%ali%"'],
    ])
  })

  it('trims q, and ignores a blank or whitespace-only q', async () => {
    await run({ q: '  ali ' })
    expect(callsTo('or')).toEqual([
      ['invoice_id.ilike."%ali%",customer_name.ilike."%ali%"'],
    ])

    mock.calls.length = 0
    await run({ q: '   ' })
    expect(callsTo('or')).toEqual([])
  })

  it('escapes LIKE wildcards and PostgREST reserved characters in q', async () => {
    // Typed by a user: a,b"c\d%e_f
    //  - LIKE layer:  \ % _ get a backslash so they match literally (not as wildcards)
    //  - quoted-value layer: \ and " get a backslash so the double-quoted value survives
    //    PostgREST's or=(...) parser (an unescaped comma or quote would 400 the request)
    await run({ q: 'a,b"c\\d%e_f' })

    const value = String.raw`"%a,b\"c\\\\d\\%e\\_f%"`
    expect(callsTo('or')).toEqual([[`invoice_id.ilike.${value},customer_name.ilike.${value}`]])
  })

  it('combines type, status and q', async () => {
    await run({ type: 'sales', status: 'overdue', q: 'x' })

    const eqs = callsTo('eq')
    expect(eqs).toHaveLength(2)
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['detail_table', 'so_invoices'],
        ['payment_status', 'overdue'],
      ]),
    )
    expect(callsTo('or')).toHaveLength(1)
  })

  it.each([
    ['type', { type: 'service' }, { type: 'contract' }, 'eq', [['detail_table', 'contract_invoices']]],
    ['status', { status: 'paid' }, { status: 'overdue' }, 'eq', [['payment_status', 'overdue']]],
    ['search', { q: 'ali' }, { q: 'bob' }, 'or', [['invoice_id.ilike."%bob%",customer_name.ilike."%bob%"']]],
  ] as const)('re-queries when the %s changes', async (_name, first, second, method, expected) => {
    const { result, rerender } = renderHook((f: AllInvoicesFilters) => useAllInvoices(f), {
      wrapper: makeWrapper(),
      initialProps: first as AllInvoicesFilters,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    mock.calls.length = 0
    rerender(second as AllInvoicesFilters)

    await waitFor(() => expect(callsTo(method)).toEqual(expected))
  })

  it('does not re-query when the search is only padded with spaces or emptied', async () => {
    const { result, rerender } = renderHook((f: AllInvoicesFilters) => useAllInvoices(f), {
      wrapper: makeWrapper(),
      initialProps: {} as AllInvoicesFilters,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    mock.calls.length = 0
    rerender({ q: '   ' })
    rerender({ q: '' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(callsTo('select')).toEqual([])
  })

  it('keeps the previous rows on screen while a new filter is loading', async () => {
    const row = (id: string) => ({
      id, invoice_id: id, detail_table: 'tl_invoices', detail_id: id, customer_name: null,
      total_amount: 10, paid_amount: 0, payment_status: 'unpaid', dispatch_status: 'sent',
      dibsy_checkout_url: null, pdf_url: null, sent_at: null, created_at: null,
    })
    mock.state.result = { data: [row('first')], error: null }
    const { result, rerender } = renderHook((f: AllInvoicesFilters) => useAllInvoices(f), {
      wrapper: makeWrapper(),
      initialProps: {} as AllInvoicesFilters,
    })
    await waitFor(() => expect(result.current.data?.map((r) => r.id)).toEqual(['first']))

    // Hold the next query in flight, then change the filter.
    let release!: (r: { data: unknown; error: null }) => void
    mock.state.result = new Promise((resolve) => { release = resolve })
    rerender({ status: 'paid' })

    await waitFor(() => expect(result.current.isFetching).toBe(true))
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data?.map((r) => r.id)).toEqual(['first'])

    release({ data: [row('second')], error: null })
    await waitFor(() => expect(result.current.data?.map((r) => r.id)).toEqual(['second']))
    expect(result.current.isPlaceholderData).toBe(false)
  })
})

describe('useAllInvoices - the result', () => {
  it('returns the hub rows with numeric amounts (a null amount reads as 0)', async () => {
    mock.state.result = {
      data: [
        {
          id: 'h1', invoice_id: 'INV-001', detail_table: 'tl_invoices', detail_id: 'd1',
          customer_name: 'Ali', total_amount: 150.5, paid_amount: 50,
          payment_status: 'partially_paid', dispatch_status: 'sent',
          dibsy_checkout_url: 'https://pay.example/h1', pdf_url: null,
          sent_at: '2026-10-01T08:00:00Z', created_at: '2026-10-01T07:00:00Z',
        },
        {
          id: 'h2', invoice_id: 'INV-002', detail_table: 'contract_invoices', detail_id: 'd2',
          customer_name: null, total_amount: null, paid_amount: null,
          payment_status: 'unpaid', dispatch_status: 'pending',
          dibsy_checkout_url: null, pdf_url: null, sent_at: null, created_at: null,
        },
      ],
      error: null,
    }

    const result = await run({})

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0]).toMatchObject({
      id: 'h1', invoice_id: 'INV-001', total_amount: 150.5, paid_amount: 50,
      dibsy_checkout_url: 'https://pay.example/h1', pdf_url: null,
    })
    expect(result.current.data?.[1]).toMatchObject({ id: 'h2', total_amount: 0, paid_amount: 0 })
  })

  it('returns an empty list when the hub has no rows', async () => {
    mock.state.result = { data: null, error: null }

    const result = await run({})

    expect(result.current.data).toEqual([])
  })

  it('surfaces a query error as the raw PostgREST error, not re-wrapped (code stays for Sentry / humanizeDbError)', async () => {
    const dbError = { code: '42501', message: 'permission denied for table invoices', details: null, hint: null }
    mock.state.result = { data: null, error: dbError }

    const { result } = renderHook(() => useAllInvoices({}), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(dbError)
  })
})

describe('DETAIL_TABLE_FOR_TYPE', () => {
  it('is the exact reverse of kindForDetailTable for every invoice type', () => {
    const types: InvoiceType[] = ['service', 'sales', 'contract']
    expect(Object.keys(DETAIL_TABLE_FOR_TYPE).sort()).toEqual([...types].sort())
    for (const type of types) {
      expect(kindForDetailTable(DETAIL_TABLE_FOR_TYPE[type])).toBe(type)
    }
  })
})

describe('invoiceKind', () => {
  it('derives the kind from the hub detail_table', () => {
    expect(invoiceKind('tl_invoices')).toBe('service')
    expect(invoiceKind('so_invoices')).toBe('sales')
    expect(invoiceKind('contract_invoices')).toBe('contract')
  })

  it('returns null - never throws - for a legacy row with no detail key or an unknown table', () => {
    expect(invoiceKind(null)).toBeNull()
    expect(invoiceKind('')).toBeNull()
    expect(invoiceKind('subscription_invoices')).toBeNull()
  })
})

describe('remainingAmount', () => {
  it('is total minus paid', () => {
    expect(remainingAmount(100, 40)).toBe(60)
    expect(remainingAmount(100, 0)).toBe(100)
  })

  it('is 0 once fully paid', () => {
    expect(remainingAmount(100, 100)).toBe(0)
  })

  it('never goes negative when the hub row is overpaid', () => {
    expect(remainingAmount(100, 120)).toBe(0)
    expect(remainingAmount(0, 25)).toBe(0)
  })

  it('rounds to the fils so float noise cannot leave a phantom balance or a negative', () => {
    expect(remainingAmount(0.3, 0.1 + 0.2)).toBe(0)
    expect(remainingAmount(100.1, 100)).toBe(0.1)
  })
})

describe('route guard', () => {
  it('/invoices/all inherits invoices.view from the /invoices prefix (no dedicated entry needed)', () => {
    expect(matchRequiredPermission('/invoices')).toBe('invoices.view')
    expect(matchRequiredPermission('/invoices/all')).toBe('invoices.view')
  })
})
