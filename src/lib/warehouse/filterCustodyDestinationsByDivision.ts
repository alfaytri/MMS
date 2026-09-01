import type { CustodyLocationRow } from '@/hooks/useCustodyLocations'

/**
 * Restrict picture-transfer custody destinations to the sender's divisions.
 *
 * Super-viewers (owner / accountant) see everything; everyone else sees only
 * locations whose division_id is in their division scope. A division-less
 * custody location is not a valid scoped destination, so it is hidden for
 * non-super-viewers. Mirrors the server-side is_division_member rule that the
 * custody RPCs (and create_transfer_v2's custody-destination guard) enforce.
 */
export function filterCustodyDestinationsByDivision(
  locations: CustodyLocationRow[],
  userDivisionIds: string[],
  isSuperViewer: boolean,
): CustodyLocationRow[] {
  if (isSuperViewer) return locations
  const scope = new Set(userDivisionIds)
  return locations.filter((l) => l.division_id != null && scope.has(l.division_id))
}
