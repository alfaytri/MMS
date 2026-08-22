import { useMemo } from 'react'
import type { OrderServiceDraft } from '@/types/orders'

interface ServiceNode {
  id: string
  parent_id: string | null
}

/**
 * Walk up the service tree from a leaf to the root, collecting all ancestor IDs.
 * Returns [leafId, parentId, grandparentId, ...rootId].
 */
function getAncestorIds(serviceId: string, tree: ServiceNode[]): string[] {
  const ids: string[] = [serviceId]
  let current = tree.find(s => s.id === serviceId)
  while (current?.parent_id) {
    ids.push(current.parent_id)
    current = tree.find(s => s.id === current!.parent_id)
  }
  return ids
}

/**
 * Given selected services, the full service tree, and a team→skills map,
 * returns the set of team IDs whose employees can handle at least one
 * of the selected services (union / OR logic).
 *
 * Skill matching is ancestor-aware: if an employee has a parent-level skill
 * (e.g. "Cleaning"), they qualify for any descendant sub-service.
 *
 * Returns an empty set when no services are selected (meaning "show all teams").
 */
export function useTeamServiceFilter(
  draftServices: OrderServiceDraft[],
  serviceTree: ServiceNode[] | undefined,
  teamSkills: Map<string, string[]>,
  assignedTeamIds: string[] = [],
): Set<string> {
  return useMemo(() => {
    if (draftServices.length === 0 || !serviceTree || serviceTree.length === 0) {
      return new Set<string>()
    }

    const matchableIds = new Set<string>()
    for (const draft of draftServices) {
      for (const id of getAncestorIds(draft.serviceId, serviceTree)) {
        matchableIds.add(id)
      }
    }

    const capable = new Set<string>()

    // Always include teams that already have assignments in this order
    for (const tid of assignedTeamIds) {
      capable.add(tid)
    }

    for (const [teamId, skillIds] of teamSkills) {
      if (skillIds.some(sid => matchableIds.has(sid))) {
        capable.add(teamId)
      }
    }

    return capable
  }, [draftServices, serviceTree, teamSkills, assignedTeamIds])
}
