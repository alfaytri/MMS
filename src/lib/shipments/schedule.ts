// Pure resolvers over a shipment's ETD/ETA revision log. No I/O — unit-tested.

export type Leg = 'etd' | 'eta'
export type RevisionType = 'original' | 'updated' | 'actual'

export interface ScheduleRevision {
  leg: Leg
  revision_type: RevisionType
  date_value: string
  created_at: string
  reason?: string | null
}

const RT_ORDER: Record<RevisionType, number> = { original: 0, updated: 1, actual: 2 }

/** Current planned date for a leg = the newest (by created_at) non-actual revision; null if none. */
export function currentPlanned(revisions: ScheduleRevision[], leg: Leg): string | null {
  const planned = revisions.filter((r) => r.leg === leg && r.revision_type !== 'actual')
  if (planned.length === 0) return null
  return planned.reduce((a, b) => (a.created_at >= b.created_at ? a : b)).date_value
}

/** The 'actual' date for a leg, or null. */
export function actualDate(revisions: ScheduleRevision[], leg: Leg): string | null {
  return revisions.find((r) => r.leg === leg && r.revision_type === 'actual')?.date_value ?? null
}

/** A leg's revisions in display order: chronological, ties broken original → updated → actual. */
export function legHistory(revisions: ScheduleRevision[], leg: Leg): ScheduleRevision[] {
  return revisions
    .filter((r) => r.leg === leg)
    .sort((a, b) =>
      a.created_at < b.created_at ? -1
      : a.created_at > b.created_at ? 1
      : RT_ORDER[a.revision_type] - RT_ORDER[b.revision_type],
    )
}
