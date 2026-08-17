'use client'

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

/**
 * Report-filter state with a ONE-WAY sync from the top-nav division switcher.
 *
 * Whenever the top-nav active-division view (`useActiveDivision().viewDivisionIds`)
 * changes, the report's own `divisionIds` filter is reset to match — so picking
 * a division up top immediately scopes the report. The report's in-page division
 * selector can still narrow further, and that does NOT push back to the top-nav
 * (one-way only, top-nav → report).
 *
 * Drop-in replacement for `useState<ReportFilters>(makeInitial)`.
 */
export function useReportFilters(
  makeInitial: () => ReportFilters,
): readonly [ReportFilters, Dispatch<SetStateAction<ReportFilters>>] {
  const { viewDivisionIds } = useActiveDivision()

  // Seed the division filter FROM the top-nav on first render, so the report
  // already reflects it (no flash of "All divisions" before the effect fires).
  const [filters, setFilters] = useState<ReportFilters>(() => ({
    ...makeInitial(),
    divisionIds: Array.from(viewDivisionIds).sort(),
  }))

  // Stable content key: the Set reference may be recreated on unrelated renders,
  // so key the sync on the actual set of ids (empty string = "All").
  const navKey = useMemo(() => Array.from(viewDivisionIds).sort().join(','), [viewDivisionIds])

  useEffect(() => {
    const ids = navKey ? navKey.split(',') : []
    setFilters((f) => ({ ...f, divisionIds: ids }))
  }, [navKey])

  return [filters, setFilters] as const
}
