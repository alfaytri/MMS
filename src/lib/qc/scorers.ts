// src/lib/qc/scorers.ts
// Flatten a list of services (each maybe carrying a qc_items checklist) into the
// per-item QC scorers the dot-scorer UI renders. Shared by the team-leader QC
// dialog loader and the QA post-completion inspection scorer.
import type { QcItem } from '@/types/team-leader'

type RawService = Record<string, unknown>

/**
 * Returns per-item scorers when ANY service defines a qc_items checklist:
 * each checklist item becomes a scorer out of its max_score; a service without
 * a checklist keeps one flat 0–10 entry. Returns `undefined` when no service has
 * a checklist (callers can then fall back to a flat per-service list).
 */
export function buildQcScorers(rawServices: RawService[]): QcItem[] | undefined {
  const anyChecklist = rawServices.some(
    (s) => Array.isArray(s.qc_items) && (s.qc_items as unknown[]).length > 0,
  )
  if (!anyChecklist) return undefined

  return rawServices.flatMap((s) => {
    const name = (s.name as string) ?? 'Service'
    const list = Array.isArray(s.qc_items)
      ? (s.qc_items as Array<{ label?: string; max_score?: number }>)
      : []
    if (list.length === 0) {
      return [{ serviceId: String(s.id), serviceName: name, maxScore: 10 }]
    }
    return list.map((it) => ({
      serviceId: `${String(s.id)}::${String(it.label ?? '')}`,
      serviceName: `${name} — ${String(it.label ?? 'Item')}`,
      maxScore: Math.max(1, Number(it.max_score) || 10),
    }))
  })
}

/** Like buildQcScorers but always returns a list — services with no checklist
 *  get a single flat 0–10 scorer. Used where a scorer is always shown. */
export function buildQcScorersOrFlat(rawServices: RawService[]): QcItem[] {
  return (
    buildQcScorers(rawServices) ??
    rawServices.map((s) => ({
      serviceId: String(s.id),
      serviceName: (s.name as string) ?? 'Service',
      maxScore: 10,
    }))
  )
}
