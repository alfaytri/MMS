// Customer payment-risk tiers — pure logic shared by the config, the Pending
// Payments cards, the order-booking header, and the contact-centre card.
// A tier is chosen by how long the customer's OLDEST unpaid order invoice has
// been outstanding. Tiers are configurable (app_settings.customer_risk_tiers);
// these defaults are the seed used when nothing is configured.

export interface RiskTier {
  id: string
  label: string
  /** Applies when the oldest unpaid invoice is at least this many days old. */
  min_days: number
  /** Free-form hex chosen by admin (any color). */
  color: string
  /** When true, a customer in this tier routes new orders through approval. */
  requires_approval: boolean
}

export const DEFAULT_RISK_TIERS: RiskTier[] = [
  { id: 'good',  label: 'Good',      min_days: 0,  color: '#639922', requires_approval: false },
  { id: 'watch', label: 'Watch',     min_days: 30, color: '#BA7517', requires_approval: false },
  { id: 'late',  label: 'Late',      min_days: 60, color: '#D85A30', requires_approval: false },
  { id: 'high',  label: 'High risk', min_days: 90, color: '#A32D2D', requires_approval: true  },
]

/** Whole days since `oldestPendingDate`; null when there is no pending invoice. */
export function daysOverdue(oldestPendingDate: string | null, now: Date = new Date()): number | null {
  if (!oldestPendingDate) return null
  const ms = now.getTime() - new Date(oldestPendingDate).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * The tier for a customer given the age of their oldest unpaid invoice:
 * the tier with the greatest `min_days` still ≤ the age. Null when there is
 * no pending invoice (customer is not classified / renders neutral).
 */
export function resolveRiskTier(
  oldestPendingDate: string | null,
  tiers: RiskTier[],
  now: Date = new Date(),
): RiskTier | null {
  const days = daysOverdue(oldestPendingDate, now)
  if (days === null) return null
  const sorted = [...tiers].sort((a, b) => a.min_days - b.min_days)
  let match: RiskTier | null = null
  for (const t of sorted) if (days >= t.min_days) match = t
  return match
}
