import { describe, it, expect } from 'vitest'
import {
  OVERDUE_LOOKBACK_DAYS,
  overdueLookbackFrom,
  isTodayOrOverdueOpen,
  dateViewFromDate,
} from '../visitScope'
import type { TlVisit } from '@/types/team-leader'

// The rules work in the device's local calendar day (what the page always did with
// isToday / format(new Date())), so "now" is built in local time: the tests do not
// depend on the machine's timezone.
const NOW = new Date(2026, 9, 21, 10, 30, 0) // Wed 21 Oct 2026, 10:30

type Scope = Pick<TlVisit, 'date' | 'status' | 'has_invoice'>
const visit = (over: Partial<Scope> = {}): Scope => ({
  date: '2026-10-21',
  status: 'scheduled',
  has_invoice: false,
  ...over,
})

describe('isTodayOrOverdueOpen - the Today view', () => {
  it('keeps every visit dated today, whatever state it is in', () => {
    expect(isTodayOrOverdueOpen(visit(), NOW)).toBe(true)
    expect(isTodayOrOverdueOpen(visit({ status: 'in-progress' }), NOW)).toBe(true)
    // Done earlier today: the card stays (Review Work / Create Invoice live on it).
    expect(isTodayOrOverdueOpen(visit({ status: 'completed' }), NOW)).toBe(true)
    expect(isTodayOrOverdueOpen(visit({ status: 'completed', has_invoice: true }), NOW)).toBe(true)
  })

  it('surfaces a visit from an earlier day that was missed: not completed, not invoiced', () => {
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-20' }), NOW)).toBe(true) // yesterday
    expect(isTodayOrOverdueOpen(visit({ date: '2026-09-21' }), NOW)).toBe(true) // a month ago
  })

  it.each(['scheduled', 'in-progress', 'customer-unavailable', 'no-show'] as const)(
    'treats an earlier %s visit as work still to do',
    (status) => {
      expect(isTodayOrOverdueOpen(visit({ date: '2026-10-12', status }), NOW)).toBe(true)
    },
  )

  it('drops an earlier visit once it is completed', () => {
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-12', status: 'completed' }), NOW)).toBe(false)
  })

  it('drops an earlier visit that already has an invoice, whatever its status says', () => {
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-12', has_invoice: true }), NOW)).toBe(false)
    expect(
      isTodayOrOverdueOpen(visit({ date: '2026-10-12', status: 'completed', has_invoice: true }), NOW),
    ).toBe(false)
  })

  it('never shows a future visit in the Today view', () => {
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-22' }), NOW)).toBe(false) // tomorrow
    expect(isTodayOrOverdueOpen(visit({ date: '2027-01-01' }), NOW)).toBe(false)
  })

  it('rolls over at local midnight: a day is overdue from 00:00 the next day, today until 23:59', () => {
    const justAfterMidnight = new Date(2026, 9, 22, 0, 0, 1)
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-21' }), justAfterMidnight)).toBe(true) // now overdue
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-21', status: 'completed' }), justAfterMidnight)).toBe(false)
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-22', status: 'completed' }), justAfterMidnight)).toBe(true) // now today

    const lastMinute = new Date(2026, 9, 21, 23, 59, 59)
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-21', status: 'completed' }), lastMinute)).toBe(true)
    expect(isTodayOrOverdueOpen(visit({ date: '2026-10-22' }), lastMinute)).toBe(false)
  })
})

describe('overdueLookbackFrom', () => {
  it('looks back a bounded 30 days', () => {
    expect(OVERDUE_LOOKBACK_DAYS).toBe(30)
    expect(overdueLookbackFrom(NOW)).toBe('2026-09-21')
  })

  it('is a plain calendar date even across a month or year boundary', () => {
    expect(overdueLookbackFrom(new Date(2026, 0, 10, 23, 59))).toBe('2025-12-11')
    expect(overdueLookbackFrom(new Date(2026, 2, 1, 0, 0))).toBe('2026-01-30')
  })
})

describe('dateViewFromDate - what the pick-a-date view fetches from', () => {
  const LOOKBACK_FROM = '2026-09-21' // overdueLookbackFrom(NOW)

  it('reuses the Today fetch for any future date, so stepping through upcoming days costs no request', () => {
    expect(dateViewFromDate('2026-10-22', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('2027-03-01', NOW)).toBe(LOOKBACK_FROM)
  })

  it('reuses the Today fetch for today and for any day inside the overdue lookback', () => {
    expect(dateViewFromDate('2026-10-21', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('2026-10-10', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('2026-09-21', NOW)).toBe(LOOKBACK_FROM) // first day of the window
  })

  it('starts from the picked date when it is older than the lookback', () => {
    expect(dateViewFromDate('2026-09-20', NOW)).toBe('2026-09-20') // first day outside the window
    expect(dateViewFromDate('2026-09-06', NOW)).toBe('2026-09-06')
    expect(dateViewFromDate('2025-01-15', NOW)).toBe('2025-01-15')
  })

  it('never asks the RPC for a cleared or malformed date', () => {
    expect(dateViewFromDate('', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('2026-9-6', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('not a date', NOW)).toBe(LOOKBACK_FROM)
  })

  it('never fetches a whole history for a half-typed year (browsers fire 0002-, 0020-, 0202- before 2026-)', () => {
    // The RPC has no upper bound: from year 2 it would return every visit the team ever had.
    expect(dateViewFromDate('0002-09-06', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('0020-09-06', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('0202-09-06', NOW)).toBe(LOOKBACK_FROM)
    expect(dateViewFromDate('1999-12-31', NOW)).toBe(LOOKBACK_FROM)
    // ...while any plausible date still loads from itself (the floor is inclusive).
    expect(dateViewFromDate('2000-01-01', NOW)).toBe('2000-01-01')
    expect(dateViewFromDate('2025-01-15', NOW)).toBe('2025-01-15')
  })
})
