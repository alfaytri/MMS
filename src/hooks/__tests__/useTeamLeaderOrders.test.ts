import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

// The hook reads through the browser Supabase client's rpc(). Swap it for a spy that
// answers with `state.rows`, so the tests assert on the exact RPC the hook issues.
const mock = vi.hoisted(() => {
  const state: { rows: unknown[] } = { rows: [] }
  const rpc = vi.fn(async (_fn: string, _args: { p_team_id: string; p_from_date: string }) => ({
    data: state.rows,
    error: null,
  }))
  return { state, rpc }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: mock.rpc }),
}))

import { useTeamLeaderOrders } from '../useTeamLeaderOrders'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}
function makeWrapper(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
  return Wrapper
}

const RPC = 'get_team_leader_visits'

const visitRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  date: '2026-09-06',
  scheduled_time: '09:00',
  status: 'scheduled',
  type: 'order',
  source_id: 's1',
  source_type: 'order',
  team_id: 'team-1',
  customer_name: 'Ali',
  address: 'West Bay',
  services_json: [],
  team_ids: ['team-1'],
  other_teams_names: [],
  has_invoice: false,
  ...over,
})

beforeEach(() => {
  mock.rpc.mockClear()
  mock.state.rows = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTeamLeaderOrders - the window it loads', () => {
  it('asks the RPC for visits from the given fromDate, past or future', async () => {
    const client = makeClient()

    const past = renderHook(() => useTeamLeaderOrders('team-1', '2026-09-06'), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(past.result.current.isSuccess).toBe(true))
    expect(mock.rpc).toHaveBeenLastCalledWith(RPC, { p_team_id: 'team-1', p_from_date: '2026-09-06' })

    const future = renderHook(() => useTeamLeaderOrders('team-1', '2026-12-01'), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(future.result.current.isSuccess).toBe(true))
    expect(mock.rpc).toHaveBeenLastCalledWith(RPC, { p_team_id: 'team-1', p_from_date: '2026-12-01' })
  })

  it('still loads today-forward when no fromDate is given (existing callers are unchanged)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))

    const { result } = renderHook(() => useTeamLeaderOrders('team-1'), { wrapper: makeWrapper(makeClient()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc).toHaveBeenCalledWith(RPC, { p_team_id: 'team-1', p_from_date: '2026-10-21' })
  })

  it('does not call the RPC without a team', async () => {
    const { result } = renderHook(
      () => ({
        none: useTeamLeaderOrders(null, '2026-09-06'),
        missing: useTeamLeaderOrders(undefined),
      }),
      { wrapper: makeWrapper(makeClient()) },
    )
    // Disabled queries never leave the idle state, so give any stray fetch a tick to show itself.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mock.rpc).not.toHaveBeenCalled()
    expect(result.current.none.data).toBeUndefined()
    expect(result.current.missing.data).toBeUndefined()
  })

  it('stays idle while disabled and loads once enabled', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTeamLeaderOrders('team-1', '2026-09-06', { enabled }),
      { wrapper: makeWrapper(makeClient()), initialProps: { enabled: false } },
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false) // idle, not "loading": the page must not show a spinner for it

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc).toHaveBeenCalledWith(RPC, { p_team_id: 'team-1', p_from_date: '2026-09-06' })
  })

  it('is enabled by default and a disabled team still wins over enabled:true', async () => {
    const { result } = renderHook(
      () => ({
        on: useTeamLeaderOrders('team-1', '2026-09-06', {}),
        noTeam: useTeamLeaderOrders(null, '2026-09-06', { enabled: true }),
      }),
      { wrapper: makeWrapper(makeClient()) },
    )
    await waitFor(() => expect(result.current.on.isSuccess).toBe(true))

    expect(mock.rpc).toHaveBeenCalledTimes(1) // only the one that has a team
    expect(result.current.noTeam.data).toBeUndefined()
  })
})

describe('useTeamLeaderOrders - the rows it returns', () => {
  it('maps the RPC rows to visits, defaulting a null status and coercing has_invoice to a boolean', async () => {
    mock.state.rows = [
      visitRow({ id: 'a', status: null, has_invoice: null }),
      visitRow({ id: 'b', status: 'completed', has_invoice: true }),
    ]

    const { result } = renderHook(() => useTeamLeaderOrders('team-1', '2026-09-06'), {
      wrapper: makeWrapper(makeClient()),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toMatchObject([
      { id: 'a', date: '2026-09-06', status: 'scheduled', has_invoice: false },
      { id: 'b', date: '2026-09-06', status: 'completed', has_invoice: true },
    ])
  })
})

describe('queryKeys.teamLeader.orders - the cache contract', () => {
  it('is the 2-element team prefix when no fromDate is given (what the invalidations use)', () => {
    expect(queryKeys.teamLeader.orders('team-1')).toEqual(['tl-orders', 'team-1'])
    expect(queryKeys.teamLeader.orders(null)).toEqual(['tl-orders', null])
  })

  it('appends the fromDate, so each window is its own cache entry', () => {
    expect(queryKeys.teamLeader.orders('team-1', '2026-09-06')).toEqual(['tl-orders', 'team-1', '2026-09-06'])
    expect(queryKeys.teamLeader.orders('team-1', '2026-09-06')).not.toEqual(
      queryKeys.teamLeader.orders('team-1', '2026-09-21'),
    )
  })

  it('the hook caches each window under that key', async () => {
    mock.state.rows = [visitRow({ id: 'in-window' })]
    const client = makeClient()
    const { result } = renderHook(() => useTeamLeaderOrders('team-1', '2026-09-06'), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cached = client.getQueryData<{ id: string }[]>(queryKeys.teamLeader.orders('team-1', '2026-09-06'))
    expect(cached?.map((v) => v.id)).toEqual(['in-window'])
    expect(client.getQueryData(queryKeys.teamLeader.orders('team-1', '2026-09-21'))).toBeUndefined()
  })

  it('invalidating by team alone (useTlActions / TlInvoiceDialog) reaches every window of that team, and no other team', async () => {
    const client = makeClient()
    const { result } = renderHook(
      () => ({
        today: useTeamLeaderOrders('team-1', '2026-09-21'),
        older: useTeamLeaderOrders('team-1', '2026-09-06'),
        legacy: useTeamLeaderOrders('team-1'),
        other: useTeamLeaderOrders('team-2', '2026-09-21'),
      }),
      { wrapper: makeWrapper(client) },
    )
    await waitFor(() => {
      expect(result.current.today.isSuccess).toBe(true)
      expect(result.current.older.isSuccess).toBe(true)
      expect(result.current.legacy.isSuccess).toBe(true)
      expect(result.current.other.isSuccess).toBe(true)
    })
    mock.rpc.mockClear()

    // Exactly the call the mutations make: no fromDate.
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.teamLeader.orders('team-1') })
    })

    const refetched = mock.rpc.mock.calls.map(([, args]) => `${args.p_team_id}@${args.p_from_date}`).sort()
    expect(refetched).toHaveLength(3)
    expect(refetched).toEqual(expect.arrayContaining(['team-1@2026-09-21', 'team-1@2026-09-06']))
    expect(refetched.filter((c) => c.startsWith('team-1@'))).toHaveLength(3) // incl. the legacy today-forward one
    expect(refetched.some((c) => c.startsWith('team-2@'))).toBe(false)
  })
})
