import { createElement } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Only the edges are replaced: the Supabase client (an rpc() that applies the SAME filter
// as get_team_leader_visits - every source keeps scheduled_date >= p_from_date, ordered by
// date then time), the identity/GPS hooks, and the heavy children. The page itself and
// useTeamLeaderOrders are real, so these tests pin what the TL actually sees for a given
// date, end to end through the RPC window.
//
// The screen is a single date selector: it opens on today (today's visits + still-open
// visits missed in the last 30 days), and any other day the TL picks shows strictly that day.
const mock = vi.hoisted(() => {
  const db: { rows: Array<Record<string, unknown>> } = { rows: [] }
  const rpc = vi.fn(async (_fn: string, args: { p_team_id: string; p_from_date: string }) => ({
    data: db.rows
      .filter((r) => r.team_id === args.p_team_id && (r.date as string) >= args.p_from_date)
      .sort(
        (a, b) =>
          (a.date as string).localeCompare(b.date as string) ||
          (a.scheduled_time as string).localeCompare(b.scheduled_time as string),
      ),
    error: null,
  }))
  return { db, rpc }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: mock.rpc }),
}))

vi.mock('@/hooks/useTeamLeaderIdentity', () => {
  const identity = {
    teamId: 'team-1',
    isAdmin: false,
    isDivisionManager: false,
    profileId: 'profile-1',
    divisionIds: [] as string[],
  }
  const teams: never[] = []
  return {
    useTeamLeaderIdentity: () => ({ data: identity, isLoading: false }),
    useAllTeamsForSelect: () => ({ data: teams }),
  }
})

vi.mock('@/hooks/useGpsTracking', () => ({ useGpsTracking: vi.fn() }))

// Light stand-ins that expose exactly what the page hands them.
vi.mock('@/components/team-leader/TlHeader', async () => {
  const React = await import('react')
  type Props = {
    count: number
    selectedDate: string
    onSelectedDateChange: (d: string) => void
  }
  return {
    TlHeader: (p: Props) =>
      React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'count' }, String(p.count)),
        React.createElement('input', {
          'aria-label': 'Pick a date',
          value: p.selectedDate,
          onChange: (e: { target: { value: string } }) => p.onSelectedDateChange(e.target.value),
        }),
      ),
  }
})

vi.mock('@/components/team-leader/TlVisitList', async () => {
  const React = await import('react')
  return {
    TlVisitList: (p: { visits: Array<{ id: string }> }) =>
      React.createElement(
        'ul',
        { 'data-testid': 'visit-list' },
        p.visits.map((v) => React.createElement('li', { key: v.id }, v.id)),
      ),
  }
})

vi.mock('@/components/team-leader/OrderDetailDispatch', () => ({ OrderDetailDispatch: () => null }))
vi.mock('@/components/team-leader/TlInvoiceDialog', () => ({ TlInvoiceDialog: () => null }))
vi.mock('@/components/team-leader/ReviewWorkDialog', () => ({ ReviewWorkDialog: () => null }))

import TeamLeaderPage from '../page'

const TEAM = 'team-1'

// "Now" is Wed 21 Oct 2026 10:00 local. The today view looks back to 21 Sep 2026.
const rowOf = (id: string, date: string, scheduled_time: string, over: Record<string, unknown> = {}) => ({
  id,
  date,
  scheduled_time,
  status: 'scheduled',
  type: 'order',
  source_id: `src-${id}`,
  source_type: 'order',
  team_id: TEAM,
  order_id: `ORD-${id}`,
  customer_name: `Customer ${id}`,
  address: '',
  waze_link: null,
  services_json: [],
  customer_phone: null,
  location_phone: null,
  team_ids: [TEAM],
  other_teams_names: [],
  notes: null,
  has_invoice: false,
  ...over,
})

function seed() {
  mock.db.rows = [
    // Overdue and still open -> belong on the today list
    rowOf('overdue-in-progress', '2026-10-09', '09:00', { status: 'in-progress' }),
    rowOf('overdue-scheduled', '2026-10-16', '09:00'),
    // Overdue but already dealt with -> must not clutter today
    rowOf('overdue-completed', '2026-10-18', '09:00', { status: 'completed' }),
    rowOf('overdue-invoiced', '2026-10-15', '09:00', { status: 'completed', has_invoice: true }),
    // Today, in whatever state
    rowOf('today-scheduled', '2026-10-21', '08:00'),
    rowOf('today-completed', '2026-10-21', '11:00', { status: 'completed', has_invoice: true }),
    // Later
    rowOf('tomorrow-scheduled', '2026-10-22', '09:00'),
    // Older than the 30-day lookback: only reachable by picking its date
    rowOf('sep10-scheduled', '2026-09-10', '09:00'),
    rowOf('sep6-first', '2026-09-06', '08:00'),
    rowOf('sep6-second', '2026-09-06', '10:00', { status: 'completed' }),
  ]
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(createElement(QueryClientProvider, { client }, createElement(TeamLeaderPage)))
}

/** The ids on screen; empty while the page shows its spinner instead of the list. */
const listed = () =>
  screen.queryByTestId('visit-list')
    ? within(screen.getByTestId('visit-list')).queryAllByRole('listitem').map((li) => li.textContent)
    : []

const text = (testId: string) => screen.getByTestId(testId).textContent

const TODAY = '2026-10-21'
function pickDate(date: string) {
  fireEvent.change(screen.getByLabelText('Pick a date'), { target: { value: date } })
}
const fromDatesRequested = () => mock.rpc.mock.calls.map(([, args]) => args.p_from_date)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
  mock.rpc.mockClear()
  seed()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Team-leader page - opens on today', () => {
  it('lists today plus the visits missed in the last 30 days that are still open', async () => {
    renderPage()

    await waitFor(() =>
      expect(listed()).toEqual([
        'overdue-in-progress', // 9 Oct
        'overdue-scheduled', //   16 Oct
        'today-scheduled', //     today 08:00
        'today-completed', //     today 11:00 - a job finished today stays on the list
      ]),
    )
    // Not the already-completed / already-invoiced overdue ones, not tomorrow, not older than the lookback.
    expect(text('count')).toBe('4')
  })

  it('loads from the start of the overdue lookback, not just from today', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    expect(fromDatesRequested()).toEqual(['2026-09-21'])
    expect(mock.rpc).toHaveBeenCalledWith('get_team_leader_visits', { p_team_id: TEAM, p_from_date: '2026-09-21' })
  })

  it('does not fetch a second window until a day other than today is picked', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})

describe('Team-leader page - pick a date', () => {
  it('loads a past day older than the lookback when it is picked', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    pickDate('2026-09-06')

    await waitFor(() => expect(listed()).toEqual(['sep6-first', 'sep6-second']))
    expect(text('count')).toBe('2')
    expect(fromDatesRequested()).toContain('2026-09-06')
    expect(mock.rpc).toHaveBeenLastCalledWith('get_team_leader_visits', {
      p_team_id: TEAM,
      p_from_date: '2026-09-06',
    })

    // Another old day shows only its own visits.
    pickDate('2026-09-10')
    await waitFor(() => expect(listed()).toEqual(['sep10-scheduled']))
    expect(text('count')).toBe('1')
  })

  it('shows an empty day as empty rather than loading forever', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    pickDate('2026-09-08') // no visits that day

    await waitFor(() => expect(screen.queryByTestId('visit-list')).not.toBeNull())
    expect(listed()).toEqual([])
    expect(text('count')).toBe('0')
  })

  it('does not pull the whole history while a year is being typed (0002-, 0020-, 0202- before 2026-)', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    for (const halfTyped of ['0002-09-06', '0020-09-06', '0202-09-06']) pickDate(halfTyped)
    pickDate('2026-09-06')

    await waitFor(() => expect(listed()).toEqual(['sep6-first', 'sep6-second']))
    // Today's window, then the real date: nothing from year 2 / 20 / 202.
    expect(fromDatesRequested()).toEqual(['2026-09-21', '2026-09-06'])
  })

  it('shows tomorrow from the data already loaded, with no second request', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    pickDate('2026-10-22')

    await waitFor(() => expect(listed()).toEqual(['tomorrow-scheduled']))
    expect(text('count')).toBe('1')
    expect(mock.rpc).toHaveBeenCalledTimes(1) // no second request just to look at tomorrow
  })

  it('shows a recent past day, completed work included, without another request', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    pickDate('2026-10-18')

    // Completed-but-not-invoiced work: reachable here so its invoice can still be created.
    await waitFor(() => expect(listed()).toEqual(['overdue-completed']))
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })

  it('returns to the today list when today is picked again', async () => {
    renderPage()
    await waitFor(() => expect(listed()).not.toEqual([]))

    pickDate('2026-09-06')
    await waitFor(() => expect(listed()).toEqual(['sep6-first', 'sep6-second']))
    expect(text('count')).toBe('2')

    pickDate(TODAY)

    await waitFor(() =>
      expect(listed()).toEqual(['overdue-in-progress', 'overdue-scheduled', 'today-scheduled', 'today-completed']),
    )
    expect(text('count')).toBe('4')
  })
})
