import { createElement } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TlVisit } from '@/types/team-leader'

// TlOrderCard is heavy (dialogs, hooks); the list's own job is grouping + headers.
vi.mock('../TlOrderCard', async () => {
  const React = await import('react')
  return {
    TlOrderCard: (p: { visit: { id: string } }) =>
      React.createElement('div', { 'data-testid': `card-${p.visit.id}` }, p.visit.id),
  }
})

import { TlVisitList } from '../TlVisitList'

const visit = (id: string, date: string): TlVisit =>
  ({
    id,
    date,
    scheduled_time: '09:00',
    status: 'scheduled',
    type: 'order',
    source_id: `src-${id}`,
    source_type: 'order',
    team_id: 'team-1',
    order_id: `ORD-${id}`,
    customer_name: `Customer ${id}`,
    address: '',
    waze_link: null,
    services_json: [],
    customer_phone: null,
    location_phone: null,
    team_ids: ['team-1'],
    other_teams_names: [],
    notes: null,
    has_invoice: false,
  }) as unknown as TlVisit

const noop = () => {}
function renderList(visits: TlVisit[], overdueBefore?: string) {
  return render(
    createElement(TlVisitList, {
      visits,
      teamId: 'team-1',
      startedVisits: new Set<string>(),
      completedVisits: new Set<string>(),
      onStart: noop,
      onTapCard: noop,
      overdueBefore,
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0)) // Wed 21 Oct 2026
})
afterEach(() => vi.useRealTimers())

describe('TlVisitList overdue grouping', () => {
  it('labels an earlier-dated group "Overdue" when viewing today, and still labels today "Today"', () => {
    renderList([visit('late', '2026-10-09'), visit('now', '2026-10-21')], '2026-10-21')

    expect(screen.getByText(/overdue/i)).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    // the missed day is still identified so the TL knows which day it slipped from
    expect(screen.getByText(/oct 9/i)).toBeTruthy()
  })

  it('does not label past days "Overdue" when a specific day is being viewed (no overdueBefore)', () => {
    renderList([visit('late', '2026-10-09')]) // overdueBefore undefined

    expect(screen.queryByText(/overdue/i)).toBeNull()
    // shows the plain weekday header instead
    expect(screen.getByText(/friday, oct 9/i)).toBeTruthy()
  })

  it('shows the empty state when there are no visits', () => {
    renderList([])
    expect(screen.getByText(/no visits scheduled/i)).toBeTruthy()
  })
})
