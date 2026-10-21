import { describe, it, expect } from 'vitest'
import { datesInDragRange, mergeVisitDates } from '../visitDateRange'

const d = (iso: string) => new Date(`${iso}T00:00:00`)

describe('datesInDragRange', () => {
  it('returns every day from the anchor to the hovered day, inclusive', () => {
    expect(datesInDragRange(d('2026-10-21'), d('2026-10-24'), d('2026-10-01')))
      .toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
  })

  it('works when the drag runs backwards', () => {
    // Dragging right-to-left is the same range; people drag both ways.
    expect(datesInDragRange(d('2026-10-24'), d('2026-10-21'), d('2026-10-01')))
      .toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
  })

  it('returns the single day when anchor and hover are the same', () => {
    expect(datesInDragRange(d('2026-10-21'), d('2026-10-21'), d('2026-10-01')))
      .toEqual(['2026-10-21'])
  })

  it('spans a month boundary, since two months are on screen at once', () => {
    expect(datesInDragRange(d('2026-10-30'), d('2026-11-02'), d('2026-10-01')))
      .toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('drops days before the minimum, so a drag cannot book the past', () => {
    expect(datesInDragRange(d('2026-10-18'), d('2026-10-22'), d('2026-10-21')))
      .toEqual(['2026-10-21', '2026-10-22'])
  })

  it('returns nothing when the whole range is in the past', () => {
    expect(datesInDragRange(d('2026-10-01'), d('2026-10-05'), d('2026-10-21'))).toEqual([])
  })

  it('returns nothing when either end is missing', () => {
    expect(datesInDragRange(null, d('2026-10-21'), d('2026-10-01'))).toEqual([])
    expect(datesInDragRange(d('2026-10-21'), null, d('2026-10-01'))).toEqual([])
  })
})

describe('mergeVisitDates', () => {
  it('adds the dragged range to what was already picked', () => {
    // A drag extends the selection; it does not replace it, so a clerk can
    // combine a run of days with odd dates picked one by one.
    expect(mergeVisitDates(['2026-10-28'], ['2026-10-21', '2026-10-22']))
      .toEqual(['2026-10-21', '2026-10-22', '2026-10-28'])
  })

  it('does not duplicate a day that was already selected', () => {
    expect(mergeVisitDates(['2026-10-21'], ['2026-10-21', '2026-10-22']))
      .toEqual(['2026-10-21', '2026-10-22'])
  })

  it('returns the existing selection unchanged when nothing was dragged', () => {
    expect(mergeVisitDates(['2026-10-21'], [])).toEqual(['2026-10-21'])
  })

  it('keeps the result sorted so the summary reads first to last', () => {
    expect(mergeVisitDates(['2026-11-02'], ['2026-10-30', '2026-10-31']))
      .toEqual(['2026-10-30', '2026-10-31', '2026-11-02'])
  })
})
