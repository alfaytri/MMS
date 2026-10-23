'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/** A team that handles at least one of the customer's currently-open jobs. */
export interface HandlingTeam {
  team_id:     string
  name_en:     string | null
  name_ar:     string | null
  phone:       string
  division_id: string | null
  open_orders: number
}

export type HandlingOrderRow = {
  id:     string
  status: string | null
  order_team_assignments: {
    team_id: string
    teams: {
      id:          string
      name_en:     string | null
      name_ar:     string | null
      phone:       string | null
      division_id: string | null
      deleted_at:  string | null
    } | null
  }[] | null
}

/**
 * Collapses a customer's open orders to the distinct teams handling them.
 * A team is included only if it has a contact number and isn't deleted; each
 * open order counts once per team even when it has several assignments to the
 * same team. Sorted by open-order count (desc), then name.
 */
export function dedupeHandlingTeams(rows: HandlingOrderRow[]): HandlingTeam[] {
  const byTeam = new Map<string, HandlingTeam>()
  for (const o of rows) {
    const countedHere = new Set<string>()
    for (const a of o.order_team_assignments ?? []) {
      const t = a.teams
      if (!t || !t.phone || t.deleted_at) continue
      if (countedHere.has(t.id)) continue
      countedHere.add(t.id)

      const existing = byTeam.get(t.id)
      if (existing) {
        existing.open_orders += 1
      } else {
        byTeam.set(t.id, {
          team_id:     t.id,
          name_en:     t.name_en,
          name_ar:     t.name_ar,
          phone:       t.phone,
          division_id: t.division_id,
          open_orders: 1,
        })
      }
    }
  }
  return [...byTeam.values()].sort(
    (a, b) => b.open_orders - a.open_orders || (a.name_en ?? '').localeCompare(b.name_en ?? ''),
  )
}

/**
 * Resolves the distinct teams handling a customer right now: the customer's
 * open orders (anything not completed/cancelled) → their team assignments →
 * the teams that have a contact number. Many orders handled by one team
 * collapse to a single entry with an open-order count.
 */
export function useHandlingTeams(customerId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['cc', 'handling-teams', customerId],
    enabled:  !!customerId,
    staleTime: 30_000,
    queryFn: async (): Promise<HandlingTeam[]> => {
      if (!customerId) return []

      const { data, error } = await supabase
        .from('orders')
        .select('id, status, order_team_assignments(team_id, teams(id, name_en, name_ar, phone, division_id, deleted_at))')
        .eq('customer_id', customerId)
        .not('status', 'in', '("completed","cancelled")')
      if (error) throw error

      return dedupeHandlingTeams((data ?? []) as unknown as HandlingOrderRow[])
    },
  })
}
